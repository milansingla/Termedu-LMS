import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { supabase } from './supabase.js';

// ── Firebase Admin SDK (FCM push notifications) ───────────────────────────────
import admin from 'firebase-admin';

// Firebase is initialised AFTER settings load so it can be sourced from Supabase.
// Call initFirebase() once settings are ready.
function initFirebase() {
  // Prefer Supabase-stored value; fall back to env var for the very first boot.
  const raw = getSetting('FIREBASE_SERVICE_ACCOUNT') || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('[Firebase] No FIREBASE_SERVICE_ACCOUNT found — push notifications disabled.');
    return;
  }
  try {
    if (admin.apps.length) return; // already initialised (e.g. hot reload)
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('[Firebase] Admin SDK initialised.');
  } catch (err) {
    console.error('[Firebase] Failed to initialise:', err.message);
  }
}

// ── FCM token registry ─────────────────────────────────────────────────────────
// Map<userId, Set<token>> — one user can have multiple devices
const userFcmTokens = new Map();
// Map<token, userId>       — reverse lookup for cleanup
const tokenUserMap  = new Map();
// Map<userId, timestamp>   — last heartbeat from the student's browser/app
const userHeartbeat = new Map();
// A user is "online" if they pinged within the last 45 seconds
const ONLINE_THRESHOLD_MS = 45_000;

function isUserOnline(userId) {
  const last = userHeartbeat.get(String(userId));
  return !!(last && Date.now() - last < ONLINE_THRESHOLD_MS);
}
function getUserTokens(userId) {
  return [...(userFcmTokens.get(String(userId)) || [])];
}
function allTokens() { return [...tokenUserMap.keys()]; }

const fcmPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
  : null;

function _removeStaleToken(token) {
  const uid = tokenUserMap.get(token);
  if (uid) { const s = userFcmTokens.get(uid); if (s) s.delete(token); }
  tokenUserMap.delete(token);
  if (fcmPool) {
    fcmPool.query('DELETE FROM fcm_tokens WHERE token = $1', [token])
      .catch(err => console.error('[FCM] DB delete error:', err.message));
  }
}

async function loadFcmTokensOnStartup() {
  if (!fcmPool) { console.warn('[FCM] DATABASE_URL not set — skipping token load.'); return; }
  try {
    // Ensure the table exists (safe to run on every startup)
    await fcmPool.query(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        token    TEXT PRIMARY KEY,
        user_id  TEXT NOT NULL,
        saved_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS fcm_tokens_user ON fcm_tokens(user_id);
    `);
    const { rows } = await fcmPool.query('SELECT token, user_id FROM fcm_tokens');
    for (const { token, user_id } of rows) {
      tokenUserMap.set(token, user_id);
      if (!userFcmTokens.has(user_id)) userFcmTokens.set(user_id, new Set());
      userFcmTokens.get(user_id).add(token);
    }
    console.log(`[FCM] Loaded ${tokenUserMap.size} device token(s) from database.`);
  } catch (err) {
    console.error('[FCM] Error loading tokens:', err.message);
  }
}

function persistFcmToken(token, userId) {
  if (!fcmPool) return;
  fcmPool.query(
    'INSERT INTO fcm_tokens (token, user_id) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET user_id = $2',
    [token, userId]
  ).catch(err => console.error('[FCM] Token persist error:', err.message));
}

// Send FCM push to a specific student — always fires, even if student is on the app.
// When the student is in the foreground, the in-app banner (AppContext polling) handles
// visibility; FCM still fires so the system notification appears after they leave the page.
async function sendSupportPush(userId, ticketId, replyText) {
  const tokens = getUserTokens(userId);
  if (!tokens.length) {
    console.log(`[FCM] No tokens for student ${userId} — cannot push.`);
    return;
  }
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + '…' : replyText;
  const message = {
    tokens,
    notification: { title: '💬 Support Reply', body: preview },
    data: { type: 'support', ticketId: String(ticketId || ''), navigateTo: '/support' },
    android: {
      priority: 'high',
      ttl: 86400000,
      notification: { sound: 'default', priority: 'high', visibility: 'public', defaultSound: true },
    },
  };
  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] Support push → user ${userId}: ✓${result.successCount} ✗${result.failureCount}`);
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || 'unknown';
        const msg  = r.error?.message || 'no message';
        console.error(`[FCM] SupportPush Token[${i}] FAILED — code: ${code} | msg: ${msg} | token(last12): ...${tokens[i].slice(-12)}`);
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          _removeStaleToken(tokens[i]);
        }
      }
    });
  } catch (err) {
    console.error('[FCM] Support push error:', err.message);
  }
}

// Send FCM push to ALL registered devices when a live session starts.
// Professional meetings are excluded — they are invite-only and notified separately.
async function sendLiveSessionPush(session) {
  if (session.isMeeting) return; // no broadcast push for professional meetings
  const tokens = allTokens();
  if (!tokens.length) {
    console.log('[FCM] No registered tokens — skipping live session push.');
    return;
  }
  const type    = session.isWorkshop ? 'Free Workshop' : 'Live Class';
  const title   = `🔴 ${type} Started`;
  const body    = session.title || 'A live session is now available — tap to join!';
  const message = {
    tokens,
    notification: { title, body },
    data: { type: 'live_session', sessionId: String(session.id || ''), navigateTo: '/live' },
    android: {
      priority: 'high',
      ttl: 3600000, // 1 hour — irrelevant after session ends
      notification: { sound: 'default', priority: 'high', visibility: 'public', defaultSound: true, color: '#6c63ff' },
    },
  };
  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] Live session push "${session.title}" — ✓${result.successCount} ✗${result.failureCount}`);
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || 'unknown';
        const msg  = r.error?.message || '';
        console.error(`[FCM] LivePush Token[${i}] FAILED — code: ${code} | msg: ${msg} | token(last12): ...${tokens[i].slice(-12)}`);
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          _removeStaleToken(tokens[i]);
        }
      }
    });
  } catch (err) {
    console.error('[FCM] Live session push error:', err.message);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Supabase DB helpers ────────────────────────────────────────────────────────

// Generic: read all rows from a JSONB-data table as plain objects
async function dbAll(table, filters = {}) {
  let q = supabase.from(table).select('data');
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => r.data);
}

// Generic: read one row's data by primary id
async function dbGet(table, id) {
  const { data, error } = await supabase.from(table).select('data').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

// Generic: insert a full record into a JSONB-data table
async function dbInsert(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select('data').single();
  if (error) throw error;
  return data.data;
}

// Generic: upsert (insert-or-replace) a full record
async function dbUpsert(table, row, conflict = 'id') {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict: conflict }).select('data').single();
  if (error) throw error;
  return data.data;
}

// Generic: delete by id
async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ── Row mappers: JS camelCase ↔ SQL snake_case ──────────────────────────────────

function rowToSession(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:            row.id,
    title:         d.title || '',
    description:   d.description || '',
    status:        d.status || 'upcoming',
    isWorkshop:    d.isWorkshop || false,
    isMeeting:     d.isMeeting || false,
    date:          d.date || null,
    time:          d.time || null,
    instructor:    d.instructor || 'T.E.R.M. Mentor',
    createdBy:     d.createdBy || null,
    plan:          d.plan || 'all',
    roomName:      d.roomName || null,
    roomUrl:       d.roomUrl || null,
    endedAt:       d.endedAt || null,
    tags:          d.tags || [],
    registrations: d.registrations || [],
  };
}

function sessionToRow(s) {
  return {
    id:   s.id,
    data: {
      title:         s.title || '',
      description:   s.description || '',
      status:        s.status || 'upcoming',
      isWorkshop:    s.isWorkshop || false,
      isMeeting:     s.isMeeting || false,
      date:          s.date || null,
      time:          s.time || null,
      instructor:    s.instructor || 'T.E.R.M. Mentor',
      createdBy:     s.createdBy || null,
      plan:          s.plan || 'all',
      roomName:      s.roomName || null,
      roomUrl:       s.roomUrl || null,
      endedAt:       s.endedAt || null,
      tags:          s.tags || [],
      registrations: s.registrations || [],
    },
  };
}

function rowToCourse(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:           row.id,
    title:        d.title        || row.title        || '',
    description:  d.description  || row.description  || '',
    instructor:   d.instructor   || row.instructor   || '',
    instructorId: d.instructorId || d.instructor_id  || row.instructor_id || null,
    category:     d.category     || row.category     || '',
    plan:         d.plan         || row.plan         || 'all',
    price:        d.price        ?? row.price        ?? 0,
    thumbnail:    d.thumbnail    || row.thumbnail    || null,
    published:    d.published    ?? row.published    ?? true,
    active:       d.published    ?? row.published    ?? true,
    rating:       Number(d.rating    ?? row.rating)  || 0,
    students:     Number(d.students  ?? row.students) || 0,
    tags:         d.tags         || row.tags         || [],
    modules:      d.modules      || row.modules      || [],
    planKey:      d.planKey      || d.plan_key       || null,
    gradient:     d.gradient     || null,
    gradientIcon: d.gradientIcon || d.gradient_icon  || null,
    level:        d.level        || null,
    sections:     d.sections     || d.modules        || [],
    duration:     d.duration     || null,
    lectures:     Number(d.lectures) || 0,
    badge:        d.badge        || null,
    badgeColor:   d.badgeColor   || null,
    isPlanProgram: d.isPlanProgram ?? (typeof row.id === 'string' && row.id.startsWith('plan_')) ?? false,
  };
}

function courseToRow(c) {
  return {
    id:   c.id,
    data: {
      title:        c.title        || '',
      description:  c.description  || '',
      instructor:   c.instructor   || '',
      instructorId: c.instructorId || null,
      category:     c.category     || '',
      plan:         c.plan         || 'all',
      price:        c.price        || 0,
      thumbnail:    c.thumbnail    || null,
      published:    c.published    ?? c.active ?? true,
      rating:       Number(c.rating)   || 0,
      students:     Number(c.students) || 0,
      tags:         c.tags         || [],
      modules:      c.modules      || [],
      planKey:      c.planKey      || null,
      gradient:     c.gradient     || null,
      gradientIcon: c.gradientIcon || null,
      level:        c.level        || null,
      sections:     c.sections     || null,
      duration:     c.duration     || null,
      lectures:     Number(c.lectures) || 0,
      badge:        c.badge        || null,
      badgeColor:   c.badgeColor   || null,
      isPlanProgram: c.isPlanProgram ?? false,
    },
  };
}

function rowToCategory(row) {
  if (!row) return null;
  const d = row.data || {};
  return { id: row.id, name: d.name || row.name || '', icon: d.icon || row.icon || 'category' };
}

function rowToAssignment(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:          row.id,
    title:       d.title       || row.title       || '',
    description: d.description || row.description || '',
    planKey:     d.planKey     || d.plan_key      || row.plan_key || 'all',
    dueDate:     d.dueDate     || d.due_date      || row.due_date || null,
    totalMarks:  d.totalMarks  ?? d.total_marks   ?? row.total_marks ?? 100,
    createdBy:   d.createdBy   || d.created_by    || row.created_by || 'T.E.R.M. Instructor',
    createdAt:   d.createdAt   || row.created_at  || null,
  };
}

function assignmentToRow(a) {
  return {
    id:         a.id,
    created_at: a.createdAt || new Date().toISOString(),
    data: {
      id:          a.id,
      title:       a.title       || '',
      description: a.description || '',
      planKey:     a.planKey     || 'all',
      dueDate:     a.dueDate     || null,
      totalMarks:  a.totalMarks  ?? 100,
      createdBy:   a.createdBy   || 'T.E.R.M. Instructor',
      createdAt:   a.createdAt   || new Date().toISOString(),
    },
  };
}

function rowToNotification(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:        row.id,
    title:     d.title     || row.title     || '',
    message:   d.message   || row.message   || '',
    type:      d.type      || row.type      || 'info',
    active:    d.active    !== undefined ? d.active !== false   : (row.active !== false),
    readBy:    d.readBy    || d.read_by     || row.read_by      || [],
    expiresAt: d.expiresAt || row.expires_at || null,
    createdAt: d.createdAt || row.created_at || null,
    icon:      d.icon      || null,
    size:      d.size      || null,
    badge:     d.badge     || null,
    subtitle:  d.subtitle  || null,
    ctaLabel:  d.ctaLabel  || null,
    ctaLink:   d.ctaLink   || null,
    planKey:   d.planKey   || null,
    thumbnail: d.thumbnail || null,
    startDate: d.startDate || null,
    notifOnly: d.notifOnly || false,
  };
}

function rowToMaterial(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:          row.id,
    title:       d.title       || row.title       || '',
    fileUrl:     d.fileUrl     || d.file_url      || row.file_url     || '',
    fileType:    d.fileType    || d.file_type     || row.file_type    || 'pdf',
    description: d.description || row.description || '',
    downloads:   d.downloads   ?? row.downloads   ?? 0,
    isPublished: d.isPublished !== undefined ? d.isPublished !== false : (d.is_published !== false && row.is_published !== false),
    planKey:     d.planKey     || d.plan_key      || row.plan_key     || null,
    createdAt:   d.createdAt   || row.created_at  || null,
  };
}

function rowToTicket(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:        row.id,
    userId:    d.userId    || d.user_id    || null,
    user:      d.user      || d.userName   || d.user_name    || null,
    email:     d.email     || d.userEmail  || d.user_email   || null,
    subject:   d.subject   || '',
    status:    d.status    || 'open',
    priority:  d.priority  || 'medium',
    unread:    d.unread    ?? false,
    lastMsg:   d.lastMsg   || null,
    lastMsgAt: d.lastMsgAt || null,
    messages:  Array.isArray(d.messages) ? d.messages : [],
    createdAt: d.createdAt || null,
  };
}

function rowToLead(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:         row.id,
    courseName: d.courseName || d.course_name || row.course_name || null,
    userEmail:  d.userEmail  || d.user_email  || row.user_email  || null,
    userName:   d.userName   || d.user_name   || row.user_name   || null,
    source:     d.source     || row.source    || 'whatsapp_cta',
    timestamp:  d.timestamp  || row.timestamp || null,
  };
}

function rowToComingSoon(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:          row.id,
    title:       d.title || row.title || '',
    description: d.description || row.description || '',
    category:    d.category || row.category || '',
    icon:        d.icon || row.icon || 'star',
    launchDate:  d.launchDate || d.launch_date || row.launch_date || null,
    launchTime:  d.launchTime || d.launch_time || row.launch_time || null,
    tags:        d.tags || row.tags || [],
    visible:     d.visible !== undefined ? d.visible !== false : (row.visible !== false),
    color:       d.color || row.color || 'violet',
    plan:        d.plan || row.plan || 'all',
    createdAt:   d.createdAt || row.created_at || null,
  };
}

function comingSoonToRow(item) {
  return {
    id:   item.id,
    data: {
      title:       item.title || '',
      description: item.description || '',
      category:    item.category || '',
      icon:        item.icon || 'star',
      launchDate:  item.launchDate || null,
      launchTime:  item.launchTime || null,
      tags:        item.tags || [],
      visible:     item.visible !== false,
      color:       item.color || 'violet',
      plan:        item.plan || 'all',
      createdAt:   item.createdAt || null,
    },
  };
}

function rowToProject(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:           row.id,
    type:         d.type         || row.type         || 'project',
    title:        d.title        || row.title        || '',
    description:  d.description  || row.description  || '',
    difficulty:   d.difficulty   || row.difficulty   || 'beginner',
    tags:         d.tags         || row.tags         || [],
    requirements: d.requirements || row.requirements || [],
    sessionId:    d.sessionId    ?? row.session_id   ?? null,
    sessionTitle: d.sessionTitle || row.session_title|| '',
    isWorkshop:   d.isWorkshop   ?? row.is_workshop  ?? false,
    dueDate:      d.dueDate      || row.due_date     || null,
    plan:         d.plan         || row.plan         || 'free',
    totalMarks:   d.totalMarks   ?? row.total_marks  ?? null,
    createdBy:    d.createdBy    || row.created_by   || '',
    lecturerId:   d.lecturerId   || row.lecturer_id  || null,
    createdAt:    d.createdAt    || row.created_at   || null,
  };
}

function rowToSubmission(row) {
  if (!row) return null;
  const d = row.data || {};
  return {
    id:          row.id,
    briefId:     row.brief_id  || d.briefId     || null,
    studentId:   row.student_id || d.studentId  || null,
    studentName: d.studentName || null,
    status:      d.status      || 'pending',
    link:        d.link        || d.fileUrl     || null,
    fileUrl:     d.link        || d.fileUrl     || null,
    description: d.description || d.notes       || '',
    notes:       d.description || d.notes       || '',
    marks:       d.marks       ?? d.grade       ?? null,
    grade:       d.marks       ?? d.grade       ?? null,
    feedback:    d.feedback    || null,
    submittedAt: d.submittedAt || null,
    updatedAt:   d.updatedAt   || null,
  };
}

// ── Settings store (Supabase-backed, survives deployments) ────────────────────
// Supabase URL + service key must remain as Replit secrets (needed to connect).
// Everything else (Daily, Gemini, SMTP) lives in the `settings` table.
const MANAGED_SETTINGS = [
  'DAILY_API_KEY', 'DAILY_DOMAIN',
  'GEMINI_API_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
];
const SENSITIVE_SETTINGS = new Set(['DAILY_API_KEY', 'GEMINI_API_KEY', 'SMTP_PASS']);

const settingsCache = new Map();

function getSetting(key) {
  return settingsCache.get(key) || process.env[key] || '';
}

async function loadSettingsFromSupabase() {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        console.warn('[Settings] ⚠️  "settings" table not found in Supabase.');
        console.warn('[Settings]    Run this SQL in the Supabase SQL Editor:');
        console.warn('[Settings]    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
        console.warn('[Settings]    Then re-run: node server/create-settings-table.js');
      } else {
        console.error('[Settings] Load error:', error.message);
      }
      return;
    }
    for (const { key, value } of (data || [])) {
      if (value) {
        settingsCache.set(key, value);
        if (!process.env[key]) process.env[key] = value;
      }
    }
    console.log(`[Settings] Loaded ${settingsCache.size} setting(s) from Supabase.`);
  } catch (err) {
    console.error('[Settings] Error loading settings:', err.message);
  }
}

async function saveSettings(pairs) {
  const rows = Object.entries(pairs)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ key, value: String(value) }));
  for (const { key, value } of rows) {
    settingsCache.set(key, value);
    process.env[key] = value;
  }
  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
  if (error) console.error('[Settings] Save error:', error.message);
  reinitMailer(); // reapply SMTP if credentials changed
}

// ── Users helpers ──────────────────────────────────────────────────────────────

function rowToUser(row) {
  if (!row) return null;
  return {
    id:              row.id,
    email:           row.email,
    name:            row.name,
    role:            row.role,
    avatar:          row.avatar,
    phone:           row.phone,
    plan:            row.plan,
    plans:           row.plans || [],
    status:          row.status,
    joined:          row.joined,
    password:        row.password,
    enrolledCourses: row.enrolled_courses || [],
    progress:        row.progress || {},
    ...(row.meta || {}),
  };
}

function userToRow(u) {
  const { enrolledCourses, progress, password, id, email, name, role, avatar, phone, plan, plans, status, joined, ...rest } = u;
  return {
    id,
    email,
    name,
    role:            role || 'student',
    avatar:          avatar || null,
    phone:           phone || null,
    plan:            plan || 'none',
    plans:           plans || [],
    status:          status || 'active',
    joined:          joined || null,
    password:        password || null,
    enrolled_courses: enrolledCourses || [],
    progress:        progress || {},
    meta:            rest,
  };
}

async function getUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return (data || []).map(rowToUser);
}

async function getUserById(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return rowToUser(data);
}

async function getUserByEmail(email) {
  const { data, error } = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
  if (error) throw error;
  return rowToUser(data);
}

async function upsertUser(u) {
  const row = userToRow(u);
  const { data, error } = await supabase.from('users').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return rowToUser(data);
}

async function updateUserFields(id, fields) {
  const row = {};
  if ('name'      in fields) row.name            = fields.name;
  if ('avatar'    in fields) row.avatar          = fields.avatar;
  if ('email'     in fields) row.email           = fields.email;
  if ('password'  in fields) row.password        = fields.password;
  if ('plan'      in fields) row.plan            = fields.plan;
  if ('plans'     in fields) row.plans           = fields.plans;
  if ('status'    in fields) row.status          = fields.status;
  if ('role'      in fields) row.role            = fields.role;
  if ('phone'     in fields) row.phone           = fields.phone;
  if ('joined'    in fields) row.joined          = fields.joined;
  if ('enrolledCourses' in fields) row.enrolled_courses = fields.enrolledCourses;
  if ('progress'  in fields) row.progress        = fields.progress;
  // any extra fields go into meta via jsonb merge
  const { data, error } = await supabase.from('users').update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return rowToUser(data);
}

// ── Safe user (remove password) ───────────────────────────────────────────────
function safeUser(u) {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
}

// ── Server-side auth token helpers ────────────────────────────────────────────
// In-memory Map for O(1) lookups — persisted to Supabase async (fire-and-forget)
const TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

const tokenMap = new Map(); // token -> { userId, expiresAt }

async function loadTokensOnStartup() {
  try {
    const { data, error } = await supabase.from('auth_tokens').select('token,user_id,expires_at');
    if (error) { console.error('[Auth] Failed to load tokens:', error.message); return; }
    const now = Date.now();
    for (const { token, user_id, expires_at } of data || []) {
      if (expires_at > now) tokenMap.set(token, { userId: user_id, expiresAt: expires_at });
    }
    console.log(`[Auth] Loaded ${tokenMap.size} active token(s) from Supabase.`);
  } catch (err) {
    console.error('[Auth] Error loading tokens:', err.message);
  }
}

function createAuthToken(userId) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + TOKEN_MAX_AGE_MS;
  const now = Date.now();
  for (const [t, e] of tokenMap) { if (e.expiresAt <= now) tokenMap.delete(t); }
  tokenMap.set(token, { userId, expiresAt });
  // Persist to Supabase async — don't await on hot path
  supabase.from('auth_tokens').insert({ token, user_id: userId, expires_at: expiresAt })
    .then(({ error }) => { if (error) console.error('[Auth] Token persist error:', error.message); })
    .catch(() => {});
  return token;
}

function validateAuthToken(token) {
  if (!token) return null;
  const entry = tokenMap.get(token);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

function deleteAuthToken(token) {
  if (!token) return;
  tokenMap.delete(token);
  supabase.from('auth_tokens').delete().eq('token', token)
    .then(({ error }) => { if (error) console.error('[Auth] Token delete error:', error.message); })
    .catch(() => {});
}

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE_SECS = 365 * 24 * 60 * 60;

function setAuthCookie(res, token) {
  let cookie = `auth_token=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECS}; HttpOnly; SameSite=Lax`;
  if (IS_PROD) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  let cookie = `auth_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  if (IS_PROD) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(c => {
      const i = c.indexOf('=');
      if (i < 0) return [c.trim(), ''];
      return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    }).filter(([k]) => k)
  );
}

// ── Safe filename ──────────────────────────────────────────────────────────────
function sanitizeFilename(id) {
  if (!id || typeof id !== 'string') return '_invalid_';
  return id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
}

// ── Validate numeric ID params ─────────────────────────────────────────────────
function parseNumericId(str) {
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return n;
}

// ── Basic email format check ───────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ── Auth middleware ────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const userId = validateAuthToken(cookies.auth_token);
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    const user = await getUserById(userId);
    if (!user || user.status === 'inactive') return res.status(401).json({ error: 'Authentication required.' });
    req.userId = userId;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function debugAuthInfo(req) {
  const cookies = parseCookies(req);
  const hasToken = !!cookies.auth_token;
  const userId = hasToken ? validateAuthToken(cookies.auth_token) : null;
  const user = userId ? await getUserById(userId).catch(() => null) : null;
  return { hasToken, userId, email: user?.email, role: user?.role };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      const currentRole = req.user?.role || 'unknown';
      return res.status(403).json({
        error: `Forbidden. Required: ${roles.join(' or ')}. Your role: ${currentRole}.`,
      });
    }
    next();
  };
}

// ── Email transport (nodemailer — settings-backed, reinitialised on change) ────
let mailer = null;

function isSmtpConfigured() {
  return !!(getSetting('SMTP_HOST') && getSetting('SMTP_USER') && getSetting('SMTP_PASS'));
}

function reinitMailer() {
  if (!isSmtpConfigured()) { mailer = null; return; }
  const smtpPort = parseInt(getSetting('SMTP_PORT') || '465', 10);
  const smtpSecure = smtpPort === 465 || getSetting('SMTP_SECURE') === 'true';
  mailer = nodemailer.createTransport({
    host:     getSetting('SMTP_HOST'),
    port:     smtpPort,
    secure:   smtpSecure,
    auth: { user: getSetting('SMTP_USER'), pass: getSetting('SMTP_PASS') },
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
    connectionTimeout: 15000,
    greetingTimeout:   15000,
    socketTimeout:     30000,
  });
}

function getFromAddress() {
  return getSetting('SMTP_FROM') || getSetting('SMTP_USER') || 'noreply@termedu.in';
}

// Legacy alias used in a few endpoint responses
function isSmtpReady() { return isSmtpConfigured(); }
const BRAND_NAME   = 'T.E.R.M. Edu';
const LOGO_PATH    = path.join(__dirname, 'public', 'term-icon.png');

const EMAIL_LOGO_HEADER = `
  <div style="text-align:center;margin-bottom:24px">
    <img src="cid:termlogo" alt="T.E.R.M. Edu"
      style="width:72px;height:72px;border-radius:18px;object-fit:cover;display:inline-block;box-shadow:0 4px 16px rgba(91,33,182,0.25)" />
    <div style="margin-top:10px;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#5b21b6;text-transform:uppercase">T.E.R.M. Edu</div>
  </div>`;

async function sendEmail({ to, subject, html, text }) {
  if (!mailer) reinitMailer(); // lazy init if settings were loaded after module start
  if (!mailer) {
    console.log(`\n📧 [EMAIL - SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n${text || ''}\n`);
    return;
  }
  const attachments = [];
  if (fs.existsSync(LOGO_PATH)) {
    attachments.push({ filename: 'term-icon.png', path: LOGO_PATH, cid: 'termlogo' });
  }
  try {
    await mailer.sendMail({ from: `"${BRAND_NAME}" <${getFromAddress()}>`, to, subject, html, text, attachments });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] SMTP error sending to ${to}: ${err.message}`);
    console.log(`\n📧 [EMAIL FALLBACK LOG]\nTo: ${to}\nSubject: ${subject}\n${text || ''}\n`);
    throw err;
  }
}

// ── OTP store (Supabase-backed, TTL 10 min) ───────────────────────────────────
const OTP_TTL = 10 * 60 * 1000;

// In-memory fallbacks (used when Supabase tables don't exist yet)
const otpMemStore = new Map();
const pendingSignupMemStore = new Map();

// Prune expired OTPs and pending signups every 5 minutes
setInterval(async () => {
  const now = Date.now();
  // Prune in-memory stores
  for (const [k, v] of otpMemStore) if (now > v.expiry) otpMemStore.delete(k);
  for (const [k, v] of pendingSignupMemStore) if (now > v.expiry) pendingSignupMemStore.delete(k);
  // Prune Supabase tables (silently ignore errors — tables may not exist yet)
  try { await supabase.from('otp_store').delete().lt('expiry', now); } catch {}
  try { await supabase.from('pending_signups').delete().lt('expiry', now); } catch {}
}, 5 * 60 * 1000).unref();

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function storeOtp(purpose, email, otp) {
  const key = `${purpose}:${email.toLowerCase().trim()}`;
  const expiry = Date.now() + OTP_TTL;
  // Always store in memory as the primary source
  otpMemStore.set(key, { otp, expiry });
  // Also persist to Supabase if the table exists (best-effort)
  const { error } = await supabase.from('otp_store').upsert({ key, otp, expiry }, { onConflict: 'key' });
  if (error) console.warn('[OTP] Supabase store failed (table may not exist yet), using memory fallback:', error.message);
}

async function verifyOtp(purpose, email, otp) {
  const key = `${purpose}:${email.toLowerCase().trim()}`;
  const otpStr = String(otp).trim(); // normalise: number or string, strip whitespace
  const now = Date.now();

  // Try Supabase first
  const { data, error } = await supabase.from('otp_store').select('otp,expiry').eq('key', key).maybeSingle();
  if (!error && data) {
    if (now > data.expiry) { try { await supabase.from('otp_store').delete().eq('key', key); } catch {} otpMemStore.delete(key); return false; }
    const match = String(data.otp).trim() === otpStr;
    console.log(`[OTP] Supabase verify key=${key} stored=${data.otp} provided=${otpStr} match=${match}`);
    if (!match) return false;
    try { await supabase.from('otp_store').delete().eq('key', key); } catch {}
    otpMemStore.delete(key);
    return true;
  }

  // Fall back to in-memory store
  if (error) console.warn('[OTP] Supabase verify failed, using memory fallback:', error.message);
  const mem = otpMemStore.get(key);
  if (!mem) { console.warn(`[OTP] Memory fallback: key=${key} not found`); return false; }
  if (now > mem.expiry) { otpMemStore.delete(key); console.warn(`[OTP] Memory fallback: key=${key} expired`); return false; }
  const memMatch = String(mem.otp).trim() === otpStr;
  console.log(`[OTP] Memory verify key=${key} stored=${mem.otp} provided=${otpStr} match=${memMatch}`);
  if (!memMatch) return false;
  otpMemStore.delete(key);
  return true;
}

async function storePendingSignup(email, payload) {
  const entry = { email, ...payload, expiry: Date.now() + OTP_TTL };
  // Always store in memory as primary
  pendingSignupMemStore.set(email, entry);
  // Persist to Supabase if available (best-effort)
  const { error } = await supabase.from('pending_signups').upsert(entry, { onConflict: 'email' });
  if (error) console.warn('[Signup] Supabase store failed (table may not exist yet), using memory fallback:', error.message);
}

async function getPendingSignup(email) {
  const now = Date.now();

  // Try Supabase first
  const { data, error } = await supabase.from('pending_signups').select('*').eq('email', email).maybeSingle();
  if (!error && data) {
    if (now > data.expiry) { try { await supabase.from('pending_signups').delete().eq('email', email); } catch {} pendingSignupMemStore.delete(email); return null; }
    return data;
  }

  // Fall back to in-memory store
  if (error) console.warn('[Signup] Supabase read failed, using memory fallback:', error.message);
  const mem = pendingSignupMemStore.get(email);
  if (!mem) return null;
  if (now > mem.expiry) { pendingSignupMemStore.delete(email); return null; }
  return mem;
}

async function deletePendingSignup(email) {
  pendingSignupMemStore.delete(email);
  try { await supabase.from('pending_signups').delete().eq('email', email); } catch {}
}

function welcomeEmailHtml({ name, email, password, role, plan }) {
  const planLabel = plan && plan !== 'none' ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;
  const roleLabel = role === 'lecturer' ? 'Lecturer' : role === 'admin' ? 'Admin' : 'Student';
  const passRow = password
    ? `<tr><td style="padding:6px 0;color:#888;font-size:13px">Password</td><td style="padding:6px 0;font-weight:700;color:#1e0a3c;font-size:13px;letter-spacing:0.5px">${password}</td></tr>`
    : `<tr><td colspan="2" style="padding:6px 0;color:#888;font-size:12px">No password set yet — click the button below to set your password and log in.</td></tr>`;
  const ctaButton = password
    ? `<a href="https://app.termedu.in/login" style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;letter-spacing:0.3px">Login to T.E.R.M. Edu →</a>`
    : `<a href="https://app.termedu.in/login" style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;letter-spacing:0.3px">Set Your Password &amp; Login →</a>
       <p style="color:#888;font-size:12px;margin:10px 0 0">Click the button above, then use <strong>Forgot Password</strong> with your email to set a new password.</p>`;
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f9f5ff;border-radius:16px">
    ${EMAIL_LOGO_HEADER}
    <h2 style="color:#1e0a3c;font-size:20px;margin:0 0 6px;text-align:center">Welcome to T.E.R.M. Edu! 🎉</h2>
    <p style="color:#555;font-size:14px;margin:0 0 24px;text-align:center">Hi <strong>${name}</strong>, your account has been created. Here are your login details:</p>
    <div style="background:#ffffff;border:1px solid #e9d5ff;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#888;font-size:13px">Email</td><td style="padding:6px 0;font-weight:700;color:#1e0a3c;font-size:13px">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px">Role</td><td style="padding:6px 0;font-weight:700;color:#5b21b6;font-size:13px">${roleLabel}${planLabel ? ` — ${planLabel} Plan` : ''}</td></tr>
        ${passRow}
      </table>
    </div>
    <div style="text-align:center;margin-bottom:24px">
      ${ctaButton}
    </div>
    <p style="color:#888;font-size:12px;margin:0;text-align:center">If you did not expect this account, please contact your administrator.</p>
    <p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
  </div>`;
}

function otpEmailHtml(otp, purpose) {
  const purposeLabel = purpose === 'login' ? 'sign in' : purpose === 'signup' ? 'verify your email and complete sign-up' : 'reset your password';
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f9f5ff;border-radius:16px">
    ${EMAIL_LOGO_HEADER}
    <h2 style="color:#1e0a3c;font-size:20px;margin:0 0 8px;text-align:center">Your One-Time Password</h2>
    <p style="color:#555;font-size:14px;margin:0 0 24px;text-align:center">Use the OTP below to ${purposeLabel}. It expires in <strong>10 minutes</strong>.</p>
    <div style="background:#ffffff;border:2px dashed #7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
      <span style="font-size:40px;font-weight:900;letter-spacing:0px;color:#5b21b6">${otp}</span>
    </div>
    <p style="color:#888;font-size:12px;margin:0;text-align:center">If you did not request this, please ignore this email. Do not share this OTP with anyone.</p>
    <p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
  </div>`;
}

function gradeEmailHtml({ name, briefTitle, marks, totalMarks, feedback, briefId }) {
  const pct = totalMarks ? Math.round((marks / totalMarks) * 100) : null;
  const scoreBar = totalMarks
    ? `<div style="background:#e9d5ff;border-radius:99px;height:10px;margin:8px 0 16px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#5b21b6,#7c3aed);height:10px;width:${pct}%;border-radius:99px"></div>
       </div>`
    : '';
  const feedbackRow = feedback
    ? `<div style="background:#f5f0ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px 16px;margin-top:16px">
        <p style="color:#5b21b6;font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px">Lecturer Feedback</p>
        <p style="color:#1e0a3c;font-size:13px;margin:0;line-height:1.6">${feedback}</p>
       </div>`
    : '';
  const viewBtn = briefId
    ? `<div style="text-align:center;margin-top:24px">
        <a href="https://app.termedu.in/projects?openBrief=${briefId}" style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;letter-spacing:0.3px">View My Score →</a>
       </div>`
    : '';
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f9f5ff;border-radius:16px">
    ${EMAIL_LOGO_HEADER}
    <h2 style="color:#1e0a3c;font-size:20px;margin:0 0 6px;text-align:center">Your submission has been graded! 🎉</h2>
    <p style="color:#555;font-size:14px;margin:0 0 24px;text-align:center">Hi <strong>${name}</strong>, your lecturer has reviewed your submission.</p>
    <div style="background:#ffffff;border:1px solid #e9d5ff;border-radius:12px;padding:20px 24px;margin-bottom:16px">
      <p style="color:#888;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px">Brief / Task</p>
      <p style="color:#1e0a3c;font-size:15px;font-weight:700;margin:0 0 16px">${briefTitle}</p>
      <p style="color:#888;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px">Score</p>
      <p style="color:#5b21b6;font-size:28px;font-weight:900;margin:0">${marks}${totalMarks ? ` <span style="color:#aaa;font-size:16px;font-weight:400">/ ${totalMarks}</span>` : ''} ${pct != null ? `<span style="font-size:14px;color:#7c3aed;font-weight:700">(${pct}%)</span>` : ''}</p>
      ${scoreBar}
      ${feedbackRow}
    </div>
    ${viewBtn}
    <p style="color:#bbb;font-size:11px;margin:24px 0 0;text-align:center">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
  </div>`;
}

// ── Default seeds ──────────────────────────────────────────────────────────────
const DEFAULT_PLAN_CONFIGS = {
  starter: {
    name: 'STARTER', price: '₹9,999', priceNum: 9999,
    tagline: 'Self-paced recorded courses', btnLabel: 'Get Started',
    badge: null, liveClasses: false, recordings: true, download: true, mentorAccess: false,
    features: ['Full recorded course library', 'Lifetime content access', 'Certificate of completion', 'Community forum access', 'Course workbooks & resources'],
  },
  growth: {
    name: 'GROWTH', price: '₹24,999', priceNum: 24999,
    tagline: 'Live + recorded with mentor support', btnLabel: 'Level Up', badge: 'POPULAR',
    liveClasses: true, recordings: true, download: true, mentorAccess: true,
    features: ['Everything in Starter', 'Weekly live classes', '1-on-1 mentor sessions', 'Doubt-clearing sessions', 'Project feedback & review', 'Priority support'],
  },
  premium: {
    name: 'PREMIUM', price: '₹49,999', priceNum: 49999,
    tagline: 'Full program + guaranteed internship', btnLabel: 'Go Premium', badge: 'BEST VALUE',
    liveClasses: true, recordings: true, download: true, mentorAccess: true,
    features: ['Everything in Growth', 'Guaranteed internship', 'Resume preparation', 'Mock interviews', 'Industry expert sessions', 'Job placement support', 'LinkedIn profile review'],
  },
};

const DEFAULT_COURSES = [
  { id: 'plan_starter', isPlanProgram: true, planKey: 'starter', title: 'STARTER Program', description: 'Get started with curated recorded courses. Access lifetime content, build your portfolio, and earn a completion certificate — all at your own pace.', instructor: 'Admin', level: 'Beginner', gradient: 'from-[#1a0533] via-[#2d1060] to-[#0d0d1a]', gradientIcon: 'menu_book', thumbnail: null, sections: [] },
  { id: 'plan_growth', isPlanProgram: true, planKey: 'growth', title: 'GROWTH Program', description: 'Everything in Starter plus real-time live classes, 1-on-1 mentor sessions, doubt clearing, and structured project feedback.', instructor: 'Admin', level: 'Intermediate', gradient: 'from-[#3b0082] via-[#5b21b6] to-[#0f1940]', gradientIcon: 'live_tv', thumbnail: null, sections: [] },
  { id: 'plan_premium', isPlanProgram: true, planKey: 'premium', title: 'PREMIUM Program', description: 'Everything in Growth plus a guaranteed internship, resume prep, mock interviews, and direct industry exposure.', instructor: 'Admin', level: 'Advanced', gradient: 'from-[#1a0020] via-[#4a0e6e] to-[#1a1040]', gradientIcon: 'diamond', thumbnail: null, sections: [] },
  { id: 'demo1', title: 'Web Development Bootcamp', description: 'Full-stack web development from scratch — HTML, CSS, JavaScript, React, Node.js.', instructor: 'Admin', level: 'Beginner', price: 4999, gradient: 'from-[#3b0082] via-[#5b21b6] to-[#0f1940]', gradientIcon: 'code', sections: [{ id: 'sec1', title: 'Getting Started', lessons: [{ id: 'l1', title: 'Introduction & Course Overview', videoUrl: '', videoId: 'ysEN5RaKOlA', videoType: 'youtube', duration: '12:00', description: 'Welcome to the course.' }, { id: 'l2', title: 'Setting Up Your Environment', videoUrl: '', videoId: 'HDcFrMZU6V0', videoType: 'youtube', duration: '18:30', description: 'Install Node, VS Code and essential tools.' }] }, { id: 'sec2', title: 'HTML & CSS Fundamentals', lessons: [{ id: 'l3', title: 'HTML Structure & Semantics', videoUrl: '', videoId: 'salY_Sm6mv4', videoType: 'youtube', duration: '22:15', description: 'Learn HTML document structure.' }] }] },
];

const DEFAULT_CATEGORIES = [
  { id: 'starter',    name: 'Starter',    icon: 'menu_book'    },
  { id: 'growth',     name: 'Growth',     icon: 'trending_up'  },
  { id: 'premium',    name: 'Premium',    icon: 'diamond'      },
  { id: 'live',       name: 'Live',       icon: 'live_tv'      },
  { id: 'mentorship', name: 'Mentorship', icon: 'support_agent'},
  { id: 'career',     name: 'Career',     icon: 'work'         },
];

const DEFAULT_ASSIGNMENTS = [
  { id: 'asgn_1', title: 'Portfolio Project — Module 1 Submission', description: 'Create a basic portfolio showcasing the skills learned in Module 1. Include a personal intro, 2 projects, and a contact section. Submit as PDF.', planKey: 'starter', dueDate: '2026-04-28', totalMarks: 50, createdBy: 'T.E.R.M. Instructor', createdAt: '2026-03-20T10:00:00' },
  { id: 'asgn_2', title: 'Live Session Reflection & Notes', description: 'Write a 1-page reflection on the live session. Summarise key learnings, questions raised, and your personal action points. Submit PDF or DOC.', planKey: 'growth', dueDate: '2026-04-25', totalMarks: 30, createdBy: 'T.E.R.M. Instructor', createdAt: '2026-03-19T09:00:00' },
  { id: 'asgn_3', title: 'Career Goal & Resume Draft', description: 'Submit your updated resume and a 500-word career goal statement. Attach both as a single PDF.', planKey: 'premium', dueDate: '2026-05-01', totalMarks: 100, createdBy: 'T.E.R.M. Instructor', createdAt: '2026-03-18T14:00:00' },
];

// ── Notification helpers ───────────────────────────────────────────────────────
function isNotifExpired(item) {
  if (!item.expiresAt) return false;
  return new Date(item.expiresAt).getTime() < Date.now();
}

async function pruneExpiredNotifications() {
  try {
    const { error } = await supabase.from('notifications')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);
    if (!error) console.log(`[Notif GC] Pruned expired notifications at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[Notif GC] Cleanup error:', err.message);
  }
}

// ── Bootstrap — seed defaults into Supabase if tables are empty ───────────────
async function seedDefaultsIfEmpty() {
  // Courses
  const { count: courseCount } = await supabase.from('courses').select('id', { count: 'exact', head: true });
  if (courseCount === 0) {
    for (const c of DEFAULT_COURSES) {
      await supabase.from('courses').upsert(courseToRow(c), { onConflict: 'id' });
    }
    console.log('[Seed] Courses seeded.');
  }

  // Categories
  const { count: catCount } = await supabase.from('categories').select('id', { count: 'exact', head: true });
  if (catCount === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await supabase.from('categories').upsert({ id: c.id, name: c.name, icon: c.icon || 'category' }, { onConflict: 'id' });
    }
    console.log('[Seed] Categories seeded.');
  }

  // Plan configs
  const { count: pcCount } = await supabase.from('plan_configs').select('key', { count: 'exact', head: true });
  if (pcCount === 0) {
    for (const [key, value] of Object.entries(DEFAULT_PLAN_CONFIGS)) {
      await supabase.from('plan_configs').upsert({ key, value }, { onConflict: 'key' });
    }
    console.log('[Seed] Plan configs seeded.');
  }

  // Assignments
  const { count: asgnCount } = await supabase.from('assignments').select('id', { count: 'exact', head: true });
  if (asgnCount === 0) {
    for (const a of DEFAULT_ASSIGNMENTS) {
      await supabase.from('assignments').upsert(assignmentToRow(a), { onConflict: 'id' });
    }
    console.log('[Seed] Assignments seeded.');
  }
}

// ── Load settings + tokens + seed defaults on startup ─────────────────────────
await loadSettingsFromSupabase();

// If FIREBASE_SERVICE_ACCOUNT is in env but not yet in Supabase, persist it now
// so future restarts never need the env var again.
if (!settingsCache.has('FIREBASE_SERVICE_ACCOUNT') && process.env.FIREBASE_SERVICE_ACCOUNT) {
  await saveSettings({ FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT });
  console.log('[Firebase] Service account key migrated from env var → Supabase settings.');
}

initFirebase();           // uses Supabase-stored key (or env var on first boot)
reinitMailer();           // initialise SMTP with settings loaded from Supabase
await loadTokensOnStartup();
await loadFcmTokensOnStartup();
await seedDefaultsIfEmpty();
pruneExpiredNotifications();
setInterval(pruneExpiredNotifications, 30 * 60 * 1000);
console.log('[Server] Supabase-backed data layer ready.');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(compression());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://c.daily.co", "https://www.youtube.com", "https://s.ytimg.com", "https://*.ytimg.com"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:         ["'self'", "data:", "blob:", "https:"],
      connectSrc:     ["'self'",
                       "https://generativelanguage.googleapis.com",
                       "https://*.daily.co", "wss://*.daily.co", "wss://*.wss.daily.co", "https://api.daily.co",
                       "https://*.ingest.sentry.io",
                       "https://www.youtube.com", "https://*.youtube.com", "https://*.ytimg.com", "https://*.googlevideo.com"],
      workerSrc:      ["'self'", "blob:", "https://c.daily.co"],
      frameSrc:       ["https://*.daily.co", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://*.youtube.com"],
      mediaSrc:       ["'self'", "blob:", "https://*.daily.co", "https://*.youtube.com", "https://*.googlevideo.com"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy:            { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : false)
  : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: '20mb' }));

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function sanitizeObject(obj) {
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object') {
    const clean = Object.create(null);
    for (const [k, v] of Object.entries(obj)) {
      if (!DANGEROUS_KEYS.has(k)) clean[k] = sanitizeObject(v);
    }
    return Object.assign({}, clean);
  }
  return obj;
}
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = sanitizeObject(req.body);
  next();
});

const isProd = process.env.NODE_ENV === 'production';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 500 : 0,
  skip: () => !isProd,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 0,
  skip: () => !isProd,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later.' },
});

app.use('/api', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

// ── Auth ────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive. Contact support.' });

    let valid = false;
    if (user.password && user.password.startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = user.password === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await updateUserFields(user.id, { password: hashed });
        user.password = hashed;
      }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.json({ ...safeUser(user), _token: token });
  } catch (err) { next(err); }
});

app.post('/api/auth/send-login-otp', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive.' });

    let valid = false;
    if (user.password && user.password.startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = user.password === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await updateUserFields(user.id, { password: hashed });
      }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const otp = generateOtp();
    await storeOtp('login', user.email, otp);
    await sendEmail({
      to: user.email,
      subject: `${otp} is your T.E.R.M. Edu sign-in OTP`,
      html: otpEmailHtml(otp, 'login'),
      text: `Your T.E.R.M. Edu sign-in OTP is: ${otp}\nThis expires in 10 minutes. Do not share it with anyone.`,
    });
    res.json({ ok: true, smtpConfigured: isSmtpConfigured(), maskedEmail: user.email.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) { next(err); }
});

app.post('/api/auth/verify-login-otp', authLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    if (!await verifyOtp('login', email, otp)) return res.status(401).json({ error: 'Incorrect or expired OTP. Please try again.' });
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.json({ ...safeUser(user), _token: token });
  } catch (err) { next(err); }
});

app.post('/api/auth/send-forgot-otp', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: 'No account found with this email address.' });
    const otp = generateOtp();
    await storeOtp('forgot', user.email, otp);
    await sendEmail({
      to: user.email,
      subject: `${otp} is your T.E.R.M. Edu password-reset OTP`,
      html: otpEmailHtml(otp, 'forgot'),
      text: `Your T.E.R.M. Edu password-reset OTP is: ${otp}\nThis expires in 10 minutes. Do not share it with anyone.`,
    });
    res.json({ ok: true, smtpConfigured: isSmtpConfigured(), maskedEmail: user.email.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) { next(err); }
});

app.post('/api/auth/verify-forgot-otp', authLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    if (!await verifyOtp('forgot', email, otp)) return res.status(401).json({ error: 'Incorrect or expired OTP. Please try again.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/login-password-only', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive. Contact support.' });
    let valid = false;
    if (user.password && user.password.startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = user.password === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await updateUserFields(user.id, { password: hashed });
      }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.json({ ...safeUser(user), _token: token });
  } catch (err) { next(err); }
});

app.post('/api/auth/send-login-otp-emailonly', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: 'No account found with this email.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive.' });
    const otp = generateOtp();
    await storeOtp('login', user.email, otp);
    await sendEmail({
      to: user.email,
      subject: `${otp} is your T.E.R.M. Edu sign-in OTP`,
      html: otpEmailHtml(otp, 'login'),
      text: `Your T.E.R.M. Edu sign-in OTP is: ${otp}\nThis expires in 10 minutes. Do not share it with anyone.`,
    });
    res.json({ ok: true, smtpConfigured: isSmtpConfigured(), maskedEmail: user.email.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) { next(err); }
});

app.post('/api/auth/send-signup-otp', authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format.' });
    if (name.trim().length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const normalizedEmail = email.toLowerCase().trim();
    const exists = await getUserByEmail(normalizedEmail);
    if (exists) return res.status(409).json({ error: 'This email is already registered.' });
    const otp = generateOtp();
    await storeOtp('signup', normalizedEmail, otp);
    await storePendingSignup(normalizedEmail, { name: name.trim(), phone: phone ? phone.trim() : null, password });
    await sendEmail({
      to: email,
      subject: `${otp} is your T.E.R.M. Edu sign-up OTP`,
      html: otpEmailHtml(otp, 'signup'),
      text: `Your T.E.R.M. Edu sign-up OTP is: ${otp}\nThis expires in 10 minutes. Do not share it with anyone.`,
    });
    res.json({ ok: true, smtpConfigured: isSmtpConfigured(), maskedEmail: normalizedEmail.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) { next(err); }
});

app.post('/api/auth/verify-signup-otp', authLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    const normalizedEmail = email.toLowerCase().trim();
    if (!await verifyOtp('signup', normalizedEmail, otp)) return res.status(401).json({ error: 'Incorrect or expired OTP. Please try again.' });
    const pending = await getPendingSignup(normalizedEmail);
    if (!pending) {
      return res.status(400).json({ error: 'Sign-up session expired. Please start again.' });
    }
    await deletePendingSignup(normalizedEmail);
    const exists = await getUserByEmail(normalizedEmail);
    if (exists) return res.status(409).json({ error: 'This email is already registered.' });
    const hashed = await bcrypt.hash(pending.password, 10);
    const user = await upsertUser({
      id: `u${Date.now()}`,
      name: pending.name,
      email: normalizedEmail,
      phone: pending.phone,
      password: hashed,
      role: 'student',
      plan: 'none',
      plans: [],
      status: 'active',
      joined: new Date().toISOString().split('T')[0],
      avatar: null,
      enrolledCourses: [],
      progress: {},
    });
    const token = createAuthToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({ ...safeUser(user), _token: token });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const userId = validateAuthToken(cookies.auth_token);
    if (!userId) return res.status(401).json({ error: 'Not authenticated.' });
    const user = await getUserById(userId);
    if (!user) { deleteAuthToken(cookies.auth_token); return res.status(401).json({ error: 'User not found.' }); }
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive.' });
    const RENEW_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;
    const currentEntry = tokenMap.get(cookies.auth_token);
    if (currentEntry && (currentEntry.expiresAt - Date.now()) < RENEW_THRESHOLD_MS) {
      deleteAuthToken(cookies.auth_token);
      const newToken = createAuthToken(user.id);
      setAuthCookie(res, newToken);
      return res.json({ ...safeUser(user), _token: newToken });
    }
    res.json(safeUser(user));
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    if (cookies.auth_token) deleteAuthToken(cookies.auth_token);
    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/restore', authLimiter, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'No token provided.' });
    const userId = validateAuthToken(token);
    if (!userId) return res.status(401).json({ error: 'Token invalid or expired.' });
    const user = await getUserById(userId);
    if (!user) { deleteAuthToken(token); return res.status(401).json({ error: 'User not found.' }); }
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive.' });
    setAuthCookie(res, token);
    res.json({ ...safeUser(user), _token: token });
  } catch (err) { next(err); }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'email, otp and newPassword are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!await verifyOtp('forgot', email, otp)) return res.status(401).json({ error: 'Incorrect or expired OTP.' });
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await updateUserFields(user.id, { password: hashed });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/send-email-change-otp', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'newEmail is required.' });
    const normalizedEmail = newEmail.toLowerCase().trim();
    const conflict = await getUserByEmail(normalizedEmail);
    if (conflict && conflict.id !== userId) return res.status(409).json({ error: 'This email is already in use by another account.' });
    const otp = generateOtp();
    await storeOtp('email-change', normalizedEmail, otp);
    await sendEmail({
      to: normalizedEmail,
      subject: `${otp} — verify your new T.E.R.M. Edu email`,
      html: otpEmailHtml(otp, 'email change'),
      text: `Your T.E.R.M. Edu email-change OTP is: ${otp}\nThis expires in 10 minutes. Do not share it with anyone.`,
    });
    res.json({ ok: true, maskedEmail: normalizedEmail.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) { next(err); }
});

app.post('/api/auth/verify-email-change', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { newEmail, otp } = req.body;
    if (!newEmail || !otp) return res.status(400).json({ error: 'newEmail and otp are required.' });
    const normalizedEmail = newEmail.toLowerCase().trim();
    if (!await verifyOtp('email-change', normalizedEmail, otp)) return res.status(401).json({ error: 'Incorrect or expired OTP. Please try again.' });
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const updated = await updateUserFields(userId, { email: normalizedEmail });
    res.json(safeUser(updated));
  } catch (err) { next(err); }
});

app.patch('/api/user/profile', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { name, avatar } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be blank.' });
    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (avatar !== undefined) fields.avatar = avatar || null;
    const updated = await updateUserFields(userId, fields);
    res.json(safeUser(updated));
  } catch (err) { next(err); }
});

// ── Users ──────────────────────────────────────────────────────────────────────
app.get('/api/data/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const users = await getUsers();
    res.json(users.map(safeUser));
  } catch (err) { next(err); }
});

app.put('/api/data/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    for (const u of req.body) {
      const existing = await getUserById(u.id);
      const merged = { ...u, password: existing?.password || u.password };
      await upsertUser(merged);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/data/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { email, password, name, role, plan, sendWelcome } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Name and email are required.' });
    const exists = await getUserByEmail(email.toLowerCase().trim());
    if (exists) return res.status(409).json({ error: 'Email already registered.' });
    const plainPassword = password || null;
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    // Strip sendWelcome so it isn't persisted in the user record
    const { sendWelcome: _sw, ...userFields } = req.body;
    const user = await upsertUser({
      id: `u${Date.now()}`,
      ...userFields,
      email: email.toLowerCase().trim(),
      password: hashed,
      enrolledCourses: [],
      progress: {},
    });
    // Send welcome email (fire-and-forget — don't fail the request if email fails)
    if (sendWelcome !== false) {
      sendEmail({
        to: email.toLowerCase().trim(),
        subject: `Welcome to T.E.R.M. Edu — Your Account is Ready`,
        html: welcomeEmailHtml({ name, email: email.toLowerCase().trim(), password: plainPassword, role: role || 'student', plan: plan || 'none' }),
        text: `Hi ${name},\n\nYour T.E.R.M. Edu account has been created.\nEmail: ${email}\n${plainPassword ? `Password: ${plainPassword}\n` : 'No password set — use Forgot Password to set one.\n'}\n${plainPassword ? 'Login at' : 'Set your password at'}: https://app.termedu.in/login`,
      }).catch(() => {});
    }
    res.status(201).json(safeUser(user));
  } catch (err) { next(err); }
});

app.patch('/api/data/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const user = await getUserById(req.params.id) || await getUserByEmail(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const updates = { ...req.body };
    if (updates.password && !updates.password.startsWith('$2')) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const updated = await upsertUser({ ...user, ...updates });
    res.json(safeUser(updated));
  } catch (err) { next(err); }
});

app.delete('/api/data/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Courses ────────────────────────────────────────────────────────────────────
app.get('/api/data/courses', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('courses').select('*');
    if (error) throw error;
    res.json((data || []).map(rowToCourse));
  } catch (err) { next(err); }
});

app.put('/api/data/courses', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    if (req.body.length === 0) return res.status(400).json({ error: 'Payload must contain at least one course. Use DELETE /api/data/courses/:id to remove individual courses.' });
    for (const c of req.body) {
      await supabase.from('courses').upsert(courseToRow(c), { onConflict: 'id' });
    }
    // Remove any courses not in the new list — use parameterised individual deletes to avoid injection
    const keepIds = new Set(req.body.map(c => c.id));
    const { data: existing } = await supabase.from('courses').select('id');
    const toDelete = (existing || []).map(r => r.id).filter(id => !keepIds.has(id));
    for (const id of toDelete) {
      await supabase.from('courses').delete().eq('id', id);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Per-course patch — merges req.body into existing data, then upserts ──────────
app.patch('/api/data/courses/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase.from('courses').select('*').eq('id', id).single();
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    const existingData = existing?.data || {};
    const merged = { ...existingData, ...req.body };
    const { error: upsertErr } = await supabase.from('courses').upsert({ id, data: merged }, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Per-course delete ─────────────────────────────────────────────────────────
app.delete('/api/data/courses/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Plan configs ───────────────────────────────────────────────────────────────
app.get('/api/data/plan-configs', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('plan_configs').select('key,value');
    if (error) throw error;
    if (!data || data.length === 0) return res.json(DEFAULT_PLAN_CONFIGS);
    const obj = {};
    for (const { key, value } of data) obj[key] = value;
    res.json(obj);
  } catch (err) { next(err); }
});

app.put('/api/data/plan-configs', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Expected object.' });
    for (const [key, value] of Object.entries(req.body)) {
      await supabase.from('plan_configs').upsert({ key, value }, { onConflict: 'key' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Categories ─────────────────────────────────────────────────────────────────
app.get('/api/data/categories', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) throw error;
    res.json(data && data.length ? data.map(rowToCategory) : DEFAULT_CATEGORIES);
  } catch (err) { next(err); }
});

app.put('/api/data/categories', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    for (const c of req.body) {
      await supabase.from('categories').upsert({
        id: c.id,
        data: { id: c.id, name: c.name || '', icon: c.icon || 'category' },
      }, { onConflict: 'id' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Support tickets ────────────────────────────────────────────────────────────
app.get('/api/data/tickets', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('tickets').select('*').order('id', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(rowToTicket));
  } catch (err) { next(err); }
});

app.put('/api/data/tickets', requireAuth, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    for (const t of req.body) {
      await supabase.from('tickets').upsert({
        id:   t.id,
        data: {
          userId:    t.userId    || null,
          user:      t.user      || t.userName  || null,
          email:     t.email     || t.userEmail || null,
          subject:   t.subject   || '',
          status:    t.status    || 'open',
          priority:  t.priority  || 'medium',
          unread:    t.unread    ?? false,
          lastMsg:   t.lastMsg   || null,
          lastMsgAt: t.lastMsgAt || null,
          messages:  Array.isArray(t.messages) ? t.messages : [],
          createdAt: t.createdAt || new Date().toISOString(),
        },
      }, { onConflict: 'id' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Lesson Q&A ─────────────────────────────────────────────────────────────────
app.get('/api/data/qa/:lessonId', async (req, res, next) => {
  try {
    const key = `qa_${req.params.lessonId}`;
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data) return res.json([]);
    try { res.json(JSON.parse(data.value)); } catch { res.json([]); }
  } catch (err) { next(err); }
});

app.put('/api/data/qa/:lessonId', requireAuth, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    const key = `qa_${req.params.lessonId}`;
    const { error } = await supabase.from('settings').upsert({ key, value: JSON.stringify(req.body) }, { onConflict: 'key' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Assignments ────────────────────────────────────────────────────────────────
app.get('/api/data/assignments', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data && data.length ? data.map(rowToAssignment) : DEFAULT_ASSIGNMENTS);
  } catch (err) { next(err); }
});

app.put('/api/data/assignments', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    for (const a of req.body) {
      await supabase.from('assignments').upsert(assignmentToRow(a), { onConflict: 'id' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/data/assignments', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { title, planKey } = req.body;
    if (!title || !planKey) return res.status(400).json({ error: 'title and planKey are required.' });
    const item = { id: `asgn_${Date.now()}`, createdAt: new Date().toISOString(), ...req.body };
    await supabase.from('assignments').insert(assignmentToRow(item));
    res.status(201).json(rowToAssignment(assignmentToRow(item)));
  } catch (err) { next(err); }
});

app.patch('/api/data/assignments/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('assignments').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Assignment not found.' });
    const updated = { ...rowToAssignment(existing), ...req.body };
    await supabase.from('assignments').update(assignmentToRow(updated)).eq('id', req.params.id);
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/data/assignments/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { error } = await supabase.from('assignments').delete().eq('id', req.params.id);
    if (error) return res.status(404).json({ error: 'Assignment not found.' });
    // Also delete related submissions
    await supabase.from('submissions').delete().eq('assignment_id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Submissions (assignment) ───────────────────────────────────────────────────
function rowToAsgSubmission(row) {
  if (!row) return null;
  return {
    id:           row.id,
    assignmentId: row.assignment_id,
    studentId:    row.student_id,
    status:       row.status || 'submitted',
    fileUrl:      row.file_url || null,
    marks:        row.marks != null ? Number(row.marks) : null,
    feedback:     row.feedback || null,
    submittedAt:  row.submitted_at || null,
    updatedAt:    row.updated_at || null,
  };
}

app.get('/api/data/submissions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(rowToAsgSubmission));
  } catch (err) { next(err); }
});

app.put('/api/data/submissions', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    for (const s of req.body) {
      await supabase.from('submissions').upsert({
        id:            s.id,
        assignment_id: s.assignmentId,
        student_id:    s.studentId,
        status:        s.status || 'submitted',
        file_url:      s.fileUrl || null,
        marks:         s.marks != null ? Number(s.marks) : null,
        feedback:      s.feedback || null,
        submitted_at:  s.submittedAt || new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'id' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/data/submissions', requireAuth, async (req, res, next) => {
  try {
    const { assignmentId, studentId } = req.body;
    if (!assignmentId || !studentId) return res.status(400).json({ error: 'assignmentId and studentId are required.' });
    const now = new Date().toISOString();
    const { data: existing } = await supabase.from('submissions').select('*')
      .eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle();
    if (existing) {
      const current = rowToAsgSubmission(existing);
      const updated = { ...current, ...req.body, id: current.id, submittedAt: now };
      await supabase.from('submissions').update({
        status:       updated.status || 'submitted',
        file_url:     updated.fileUrl || null,
        submitted_at: now,
        updated_at:   now,
      }).eq('assignment_id', assignmentId).eq('student_id', studentId);
      return res.json(updated);
    }
    const item = { id: `sub_${Date.now()}`, submittedAt: now, marks: null, feedback: null, ...req.body };
    await supabase.from('submissions').insert({
      id:            item.id,
      assignment_id: assignmentId,
      student_id:    studentId,
      status:        item.status || 'submitted',
      file_url:      item.fileUrl || null,
      marks:         null,
      feedback:      null,
      submitted_at:  now,
      updated_at:    now,
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

app.patch('/api/data/submissions/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('submissions').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Submission not found.' });
    const current = rowToAsgSubmission(existing);
    const updated = { ...current, ...req.body };
    await supabase.from('submissions').update({
      status:    updated.status || 'submitted',
      file_url:  updated.fileUrl || null,
      marks:     updated.marks != null ? Number(updated.marks) : null,
      feedback:  updated.feedback || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    res.json(updated);

    // ── Send grade notification email ─────────────────────────────────────────
    const newMarks = req.body.marks ?? req.body.grade;
    if (newMarks != null) {
      try {
        const studentId    = existing.student_id;
        const assignmentId = existing.assignment_id;
        const [{ data: userRows }, { data: asgRows }] = await Promise.all([
          supabase.from('users').select('data').or(`email.eq.${studentId},id.eq.${studentId}`).limit(1),
          supabase.from('live_sessions').select('data').eq('id', assignmentId).limit(1),
        ]);
        const userData  = userRows?.[0]?.data || {};
        const asgData   = asgRows?.[0]?.data  || {};
        const studentEmail = userData.email || studentId;
        const studentName  = userData.name  || userData.displayName || 'Student';
        const briefTitle   = asgData.title  || assignmentId || 'Assignment';
        const totalMarks   = asgData.totalMarks ?? null;
        if (isValidEmail(studentEmail)) {
          await sendEmail({
            to:      studentEmail,
            subject: `Your submission for "${briefTitle}" has been graded`,
            html:    gradeEmailHtml({ name: studentName, briefTitle, marks: newMarks, totalMarks, feedback: updated.feedback || null, briefId: null }),
            text:    `Hi ${studentName},\n\nYour submission for "${briefTitle}" has been graded.\n\nScore: ${newMarks}${totalMarks ? ` / ${totalMarks}` : ''}${updated.feedback ? `\n\nFeedback: ${updated.feedback}` : ''}\n`,
          }).catch(e => console.error('[Email] Grade notification failed:', e.message));
        }
      } catch (mailErr) {
        console.error('[Email] Grade lookup error:', mailErr.message);
      }
    }
  } catch (err) { next(err); }
});

// ── Notifications / Announcements ─────────────────────────────────────────────
app.get('/api/data/notifications', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const now = Date.now();
    const notifs = (data || [])
      .filter(row => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .map(rowToNotification);
    res.json(notifs);
  } catch (err) { next(err); }
});

app.post('/api/data/notifications', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { title, message, ttlHours } = req.body;
    if (!title && !message) return res.status(400).json({ error: 'Notification requires title or message.' });
    const now = new Date();
    const ttl = ttlHours != null ? Number(ttlHours) : null;
    const expiresAt = (ttl && ttl > 0) ? new Date(now.getTime() + ttl * 60 * 60 * 1000).toISOString() : null;
    const { ttlHours: _drop, ...rest } = req.body;
    const item = {
      id: `notif_${Date.now()}`,
      createdAt: now.toISOString(),
      active: true,
      readBy: [],
      ...rest,
      ...(expiresAt ? { expiresAt } : {}),
    };
    await supabase.from('notifications').insert({
      id:         item.id,
      created_at: item.createdAt,
      expires_at: expiresAt,
      data: {
        ...item,
        id:        item.id,
        active:    true,
        readBy:    [],
        expiresAt: expiresAt || null,
        createdAt: item.createdAt,
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

app.patch('/api/data/notifications/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('notifications').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Notification not found.' });
    const current = rowToNotification(existing);
    const updated = { ...current, ...req.body };
    const newData = {
      ...(existing.data || {}),
      title:     updated.title     ?? '',
      message:   updated.message   ?? '',
      type:      updated.type      ?? 'info',
      active:    updated.active    !== false,
      readBy:    updated.readBy    || [],
      expiresAt: updated.expiresAt || null,
      createdAt: updated.createdAt || current.createdAt || null,
      badge:     updated.badge     ?? null,
      subtitle:  updated.subtitle  ?? null,
      startDate: updated.startDate ?? null,
      ctaLabel:  updated.ctaLabel  ?? null,
      ctaLink:   updated.ctaLink   ?? null,
      icon:      updated.icon      ?? null,
      thumbnail: updated.thumbnail ?? null,
      size:      updated.size      ?? null,
      planKey:   updated.planKey   ?? null,
      notifOnly: updated.notifOnly ?? false,
    };
    await supabase.from('notifications').update({
      data:       newData,
      expires_at: updated.expiresAt || null,
    }).eq('id', req.params.id);
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/data/notifications/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    await supabase.from('notifications').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Study Materials ────────────────────────────────────────────────────────────
app.get('/api/data/materials', async (req, res, next) => {
  try {
    const { plan, publishedOnly } = req.query;
    const { data, error } = await supabase.from('materials').select('*');
    if (error) throw error;
    let materials = (data || []).map(rowToMaterial);
    if (publishedOnly !== 'false') materials = materials.filter(m => m.isPublished !== false);
    if (plan && plan !== 'admin') {
      materials = materials.filter(m => !m.planKey || m.planKey === 'all' || m.planKey === plan);
    }
    res.json(materials);
  } catch (err) { next(err); }
});

app.post('/api/data/materials', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { title, fileUrl } = req.body;
    if (!title || !fileUrl) return res.status(400).json({ error: 'title and fileUrl are required.' });
    const item = { id: `mat_${Date.now()}`, createdAt: new Date().toISOString(), isPublished: true, downloads: 0, ...req.body };
    await supabase.from('materials').insert({
      id:   item.id,
      data: {
        id:          item.id,
        title:       item.title       || '',
        fileUrl:     item.fileUrl     || '',
        fileType:    item.fileType    || 'pdf',
        description: item.description || '',
        downloads:   item.downloads   || 0,
        isPublished: item.isPublished !== false,
        planKey:     item.planKey     || null,
        createdAt:   item.createdAt,
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

app.patch('/api/data/materials/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('materials').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Material not found.' });
    const current = rowToMaterial(existing);
    const updated = { ...current, ...req.body };
    await supabase.from('materials').update({
      data: {
        ...(existing.data || {}),
        title:       updated.title       || '',
        fileUrl:     updated.fileUrl     || '',
        fileType:    updated.fileType    || 'pdf',
        description: updated.description || '',
        downloads:   updated.downloads   || 0,
        isPublished: updated.isPublished !== false,
        planKey:     updated.planKey     || null,
      },
    }).eq('id', req.params.id);
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/data/materials/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    await supabase.from('materials').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Ratings per course ─────────────────────────────────────────────────────────
app.get('/api/data/ratings/:courseId', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('ratings').select('user_id,stars').eq('course_id', req.params.courseId);
    if (error) throw error;
    const ratings = {};
    for (const { user_id, stars } of data || []) ratings[user_id] = stars;
    const values = Object.values(ratings);
    const count = values.length;
    const avg = count ? +(values.reduce((s, v) => s + v, 0) / count).toFixed(1) : 0;
    res.json({ ratings, avg, count });
  } catch (err) { next(err); }
});

app.post('/api/data/ratings/:courseId', async (req, res, next) => {
  try {
    const { userId, stars } = req.body;
    if (!userId || !stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'Invalid rating. Stars must be 1–5.' });
    await supabase.from('ratings').upsert(
      { course_id: req.params.courseId, user_id: userId, stars: Number(stars) },
      { onConflict: 'course_id,user_id' }
    );
    const { data } = await supabase.from('ratings').select('stars').eq('course_id', req.params.courseId);
    const values = (data || []).map(r => r.stars);
    const count = values.length;
    const avg = +(values.reduce((s, v) => s + v, 0) / count).toFixed(1);
    const ratings = {};
    for (const r of data || []) ratings[r.user_id] = r.stars;
    // Update rating on course record
    await supabase.from('courses').update({ rating: avg, students: count }).eq('id', req.params.courseId);
    res.json({ ratings, avg, count });
  } catch (err) { next(err); }
});

// ── Q&A per lesson ─────────────────────────────────────────────────────────────
app.get('/api/data/qa/:lessonId', async (req, res, next) => {
  try {
    const safeId = sanitizeFilename(req.params.lessonId);
    const { data, error } = await supabase.from('qa').select('data').eq('lesson_id', safeId).maybeSingle();
    if (error) throw error;
    res.json(data ? data.data : []);
  } catch (err) { next(err); }
});

app.put('/api/data/qa/:lessonId', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array.' });
    const safeId = sanitizeFilename(req.params.lessonId);
    await supabase.from('qa').upsert({ lesson_id: safeId, data: req.body }, { onConflict: 'lesson_id' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Live sessions ──────────────────────────────────────────────────────────────
app.get('/api/sessions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('live_sessions').select('*');
    if (error) throw error;
    res.json((data || []).map(rowToSession));
  } catch (err) { next(err); }
});

app.post('/api/sessions', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const {
      title, roomName, date, time, startTime, endTime, courseId, courseIds,
      isWorkshop, isMeeting, plan, status, instructor, description, tags,
      registrations, createdBy,
    } = req.body;
    if (!title || typeof title !== 'string' || !title.trim())
      return res.status(400).json({ error: 'title is required and must be a non-empty string.' });
    if (date !== undefined && typeof date !== 'string')
      return res.status(400).json({ error: 'date must be a string.' });
    if (startTime !== undefined && typeof startTime !== 'string')
      return res.status(400).json({ error: 'startTime must be a string.' });
    if (endTime !== undefined && typeof endTime !== 'string')
      return res.status(400).json({ error: 'endTime must be a string.' });
    if (courseId !== undefined && typeof courseId !== 'string')
      return res.status(400).json({ error: 'courseId must be a string.' });
    if (courseIds !== undefined && !Array.isArray(courseIds))
      return res.status(400).json({ error: 'courseIds must be an array.' });

    const session = {
      title:         title.trim().slice(0, 200),
      roomName:      roomName ? String(roomName).trim().slice(0, 200) : null,
      date:          date || null,
      time:          time || null,
      startTime:     startTime || null,
      endTime:       endTime || null,
      courseId:      courseId || null,
      courseIds:     Array.isArray(courseIds) ? courseIds : [],
      isWorkshop:    isWorkshop === true,
      isMeeting:     isMeeting === true,
      plan:          plan || 'all',
      status:        status || 'upcoming',
      instructor:    instructor || 'T.E.R.M. Mentor',
      description:   description || '',
      tags:          Array.isArray(tags) ? tags : [],
      registrations: Array.isArray(registrations) ? registrations : [],
      createdBy:     createdBy || null,
    };
    const { data: dataCol } = sessionToRow(session);
    const newId = Date.now();
    const { data: inserted, error } = await supabase
      .from('live_sessions')
      .insert({ id: newId, data: dataCol })
      .select()
      .single();
    if (error) {
      console.error('[Sessions] Insert error:', error.message, error);
      throw error;
    }
    const saved = rowToSession(inserted);
    // If created already-live (e.g. "Start Now"), push to all devices
    if (req.body.status === 'live') {
      sendLiveSessionPush(saved).catch(() => {});
    }
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

app.patch('/api/sessions/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const id = parseNumericId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid session ID.' });
    const { data: existing, error: fetchErr } = await supabase.from('live_sessions').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Session not found.' });
    const prev = rowToSession(existing);
    const updated = { ...prev, ...req.body };
    const { data: dataCol } = sessionToRow(updated);
    await supabase.from('live_sessions').update({ data: dataCol }).eq('id', id);
    // Fire FCM push when a session transitions from non-live → live
    if (req.body.status === 'live' && prev.status !== 'live') {
      sendLiveSessionPush(updated).catch(() => {});
    }
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/sessions/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const id = parseNumericId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid session ID.' });
    await supabase.from('live_sessions').delete().eq('id', id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

app.post('/api/sessions/:id/register', async (req, res, next) => {
  try {
    const id = parseNumericId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid session ID.' });
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { data: existing, error: fetchErr } = await supabase.from('live_sessions').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Session not found.' });
    const session = rowToSession(existing);
    const registrations = session.registrations || [];
    if (!registrations.includes(userId)) {
      const newRegs = [...registrations, userId];
      const updatedSession = { ...session, registrations: newRegs };
      const { data: dataCol } = sessionToRow(updatedSession);
      await supabase.from('live_sessions').update({ data: dataCol }).eq('id', id);
      return res.json(updatedSession);
    }
    res.json(session);
  } catch (err) { next(err); }
});

// ── Projects (briefs) ──────────────────────────────────────────────────────────
app.get('/api/projects', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('projects').select('*');
    if (error) throw error;
    res.json((data || []).map(rowToProject));
  } catch (err) { next(err); }
});

app.post('/api/projects', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const item = { id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), ...req.body };
    await supabase.from('projects').insert({
      id:   item.id,
      data: {
        id:           item.id,
        type:         item.type         || 'project',
        title:        item.title        || '',
        description:  item.description  || '',
        difficulty:   item.difficulty   || 'beginner',
        tags:         item.tags         || [],
        requirements: item.requirements || [],
        sessionId:    item.sessionId    ?? null,
        sessionTitle: item.sessionTitle || '',
        isWorkshop:   item.isWorkshop   ?? false,
        dueDate:      item.dueDate      || null,
        plan:         item.plan         || 'free',
        totalMarks:   item.totalMarks   ?? null,
        createdBy:    item.createdBy    || '',
        lecturerId:   item.lecturerId   || null,
        createdAt:    item.createdAt,
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

app.patch('/api/projects/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('projects').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Project not found.' });
    const updated = { ...rowToProject(existing), ...req.body };
    await supabase.from('projects').update({
      data: {
        ...(existing.data || {}),
        type:         updated.type         || 'project',
        title:        updated.title        || '',
        description:  updated.description  || '',
        difficulty:   updated.difficulty   || 'beginner',
        tags:         updated.tags         || [],
        requirements: updated.requirements || [],
        sessionId:    updated.sessionId    ?? null,
        sessionTitle: updated.sessionTitle || '',
        isWorkshop:   updated.isWorkshop   ?? false,
        dueDate:      updated.dueDate      || null,
        plan:         updated.plan         || 'free',
        totalMarks:   updated.totalMarks   ?? null,
        createdBy:    updated.createdBy    || '',
        lecturerId:   updated.lecturerId   || null,
        createdAt:    updated.createdAt    || null,
      },
    }).eq('id', req.params.id);
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/projects/:id', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    await supabase.from('projects').delete().eq('id', req.params.id);
    await supabase.from('project_submissions').delete().eq('brief_id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Project Submissions ────────────────────────────────────────────────────────
app.get('/api/project-submissions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('project_submissions').select('*');
    if (error) throw error;
    res.json((data || []).map(rowToSubmission));
  } catch (err) { next(err); }
});

app.post('/api/project-submissions', requireAuth, async (req, res, next) => {
  try {
    const { briefId } = req.body;
    const studentId = req.userId;
    if (!briefId) return res.status(400).json({ error: 'briefId is required.' });
    const now = new Date().toISOString();
    const dataPayload = {
      briefId,
      studentId,
      studentName:  req.body.studentName  || null,
      status:       req.body.status       || 'pending',
      link:         req.body.link         || req.body.fileUrl || null,
      description:  req.body.description  || req.body.notes   || '',
      marks:        null,
      feedback:     null,
      submittedAt:  now,
      updatedAt:    now,
    };
    // Check for existing submission
    const { data: existingRow } = await supabase.from('project_submissions').select('*')
      .eq('brief_id', briefId).eq('student_id', studentId).maybeSingle();
    if (existingRow) {
      const updatedData = { ...(existingRow.data || {}), ...dataPayload, updatedAt: now };
      const { error: updErr } = await supabase.from('project_submissions')
        .update({ data: updatedData })
        .eq('brief_id', briefId).eq('student_id', studentId);
      if (updErr) { console.error('[Submissions] Update error:', updErr.message); return next(updErr); }
      return res.json({ ...rowToSubmission({ ...existingRow, data: updatedData }) });
    }
    const newId = `projsub_${Date.now()}`;
    const { data: inserted, error: insertErr } = await supabase
      .from('project_submissions')
      .insert({ id: newId, brief_id: briefId, student_id: studentId, data: dataPayload })
      .select()
      .single();
    if (insertErr) {
      console.error('[Submissions] Insert error:', insertErr.message, insertErr);
      return next(insertErr);
    }
    res.status(201).json(rowToSubmission(inserted));
  } catch (err) { next(err); }
});

app.patch('/api/project-submissions/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('project_submissions').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Submission not found.' });
    const isOwner = existing.student_id === req.userId;
    const isPrivileged = ['admin', 'lecturer'].includes(req.user?.role);
    if (!isOwner && !isPrivileged) return res.status(403).json({ error: 'You can only update your own submissions.' });
    if ((req.body.marks !== undefined || req.body.grade !== undefined || req.body.feedback !== undefined) && !isPrivileged) {
      return res.status(403).json({ error: 'Only lecturers and admins can grade submissions.' });
    }
    const now = new Date().toISOString();
    const prevData = existing.data || {};
    const patch = {
      ...prevData,
      ...(req.body.status      !== undefined && { status:      req.body.status }),
      ...(req.body.marks       !== undefined && { marks:       req.body.marks }),
      ...(req.body.grade       !== undefined && { marks:       req.body.grade }),
      ...(req.body.feedback    !== undefined && { feedback:    req.body.feedback }),
      ...(req.body.link        !== undefined && { link:        req.body.link }),
      ...(req.body.fileUrl     !== undefined && { link:        req.body.fileUrl }),
      ...(req.body.description !== undefined && { description: req.body.description }),
      ...(req.body.notes       !== undefined && { description: req.body.notes }),
      updatedAt: now,
    };
    const { error: updErr } = await supabase.from('project_submissions').update({ data: patch }).eq('id', req.params.id);
    if (updErr) { console.error('[Submissions] Patch error:', updErr.message); return next(updErr); }
    const result = rowToSubmission({ ...existing, data: patch });
    res.json(result);

    // ── Send grade notification email ─────────────────────────────────────────
    const newMarks = req.body.marks ?? req.body.grade;
    if (newMarks != null) {
      try {
        const studentId = existing.student_id || (existing.data || {}).studentId;
        const briefId   = existing.brief_id   || (existing.data || {}).briefId;
        const [{ data: userRows }, { data: briefRows }] = await Promise.all([
          supabase.from('users').select('data').or(`email.eq.${studentId},id.eq.${studentId}`).limit(1),
          supabase.from('projects').select('data').eq('id', briefId).limit(1),
        ]);
        const userRow  = userRows?.[0];
        const briefRow = briefRows?.[0];
        const userData = userRow?.data || {};
        const briefData = briefRow?.data || {};
        const studentEmail = userData.email || studentId;
        const studentName  = userData.name  || userData.displayName || 'Student';
        const briefTitle   = briefData.title || briefId || 'Brief';
        const totalMarks   = briefData.totalMarks ?? null;
        if (isValidEmail(studentEmail)) {
          await sendEmail({
            to:      studentEmail,
            subject: `Your submission for "${briefTitle}" has been graded`,
            html:    gradeEmailHtml({ name: studentName, briefTitle, marks: newMarks, totalMarks, feedback: patch.feedback || null, briefId }),
            text:    `Hi ${studentName},\n\nYour submission for "${briefTitle}" has been graded.\n\nScore: ${newMarks}${totalMarks ? ` / ${totalMarks}` : ''}${patch.feedback ? `\n\nFeedback: ${patch.feedback}` : ''}\n\nView it at: https://app.termedu.in/projects?openBrief=${briefId}\n`,
          }).catch(e => console.error('[Email] Grade notification failed:', e.message));
        }
      } catch (mailErr) {
        console.error('[Email] Grade lookup error:', mailErr.message);
      }
    }
  } catch (err) { next(err); }
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ── WhatsApp Leads ─────────────────────────────────────────────────────────────
app.post('/api/leads', contactLimiter, async (req, res, next) => {
  try {
    const { courseName, userEmail, userName } = req.body;
    if (!courseName) return res.status(400).json({ error: 'courseName is required' });
    const entry = {
      id: Date.now(),
      courseName: String(courseName).slice(0, 200),
      userEmail: userEmail ? String(userEmail).slice(0, 200) : null,
      userName:  userName  ? String(userName).slice(0, 200)  : null,
      timestamp: new Date().toISOString(),
      source: 'whatsapp_cta',
    };
    await supabase.from('leads').insert({
      id:          entry.id,
      course_name: entry.courseName || null,
      user_email:  entry.userEmail || null,
      user_name:   entry.userName || null,
      source:      entry.source || 'whatsapp_cta',
      timestamp:   entry.timestamp,
    });
    res.json({ ok: true, id: entry.id });
  } catch (err) { next(err); }
});

app.get('/api/leads', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('leads').select('*').order('timestamp', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(rowToLead));
  } catch (err) { next(err); }
});

// ── Post-Class Results Email ────────────────────────────────────────────────────
app.post('/api/class-results-email', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, results, sessionTitle } = req.body;
    if (!Array.isArray(results) || results.length === 0) return res.json({ ok: true, message: 'No polls to report' });

    // Resolve session title from DB if not provided
    let title = sessionTitle || 'Live Class';
    if (sessionId) {
      const { data: sess } = await supabase.from('live_sessions').select('data').eq('id', sessionId).maybeSingle();
      if (sess?.data?.title) title = sess.data.title;
      else if (sess?.data?.roomName) title = sess.data.roomName;
    }

    // Compute overall (cumulative) scores across all quizzes
    const quizResults = results.filter(r => r.isQuiz && Array.isArray(r.leaderboard) && r.leaderboard.length > 0);
    const overallMap = {};
    quizResults.forEach(r => {
      r.leaderboard.forEach(e => {
        if (!overallMap[e.name]) overallMap[e.name] = 0;
        if (e.correct === true) overallMap[e.name] += 10;
      });
    });
    const maxPossible = quizResults.length * 10;
    const overallRanked = Object.entries(overallMap)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);

    // Build overall leaderboard HTML
    const buildOverallHtml = (studentName) => {
      if (quizResults.length < 1 || overallRanked.length === 0) return '';
      const studentScore = studentName ? (overallMap[Object.keys(overallMap).find(k => k.toLowerCase().trim() === studentName.toLowerCase().trim())] || 0) : null;
      const studentRank = studentName ? overallRanked.findIndex(e => e.name?.toLowerCase().trim() === studentName.toLowerCase().trim()) + 1 : 0;
      const medal = studentRank === 1 ? '🥇' : studentRank === 2 ? '🥈' : studentRank === 3 ? '🥉' : `#${studentRank}`;
      const scorePct = maxPossible > 0 ? Math.round((studentScore / maxPossible) * 100) : 0;
      const scoreBg = scorePct >= 70 ? '#d1fae5' : scorePct >= 40 ? '#fef3c7' : '#fee2e2';
      const scoreColor = scorePct >= 70 ? '#059669' : scorePct >= 40 ? '#d97706' : '#dc2626';
      const rows = overallRanked.slice(0, 10).map((e, i) => {
        const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const isMe = studentName && e.name?.toLowerCase().trim() === studentName?.toLowerCase().trim();
        return `<tr style="${isMe ? 'background:#ede9fe;' : ''}">
          <td style="padding:6px 10px;font-size:13px">${m}</td>
          <td style="padding:6px 10px;font-size:13px;${isMe ? 'font-weight:700;color:#6366f1' : 'color:#374151'}">${e.name || 'Unknown'}</td>
          <td style="padding:6px 10px;font-size:13px;font-weight:700;text-align:right;color:${e.score === maxPossible ? '#059669' : '#374151'}">${e.score}/${maxPossible}</td>
        </tr>`;
      }).join('');
      return `<div style="margin-bottom:28px;padding:20px;background:#fefce8;border-radius:14px;border:1px solid #fbbf24">
        <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">🏆 Overall Score — ${quizResults.length} Quiz${quizResults.length !== 1 ? 'zes' : ''}</div>
        ${studentScore !== null ? `<div style="margin-bottom:14px;padding:12px 16px;background:${scoreBg};border-radius:10px;border-left:4px solid ${scoreColor};display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">${medal}</span>
          <div>
            <div style="font-size:18px;font-weight:800;color:${scoreColor}">${studentScore} / ${maxPossible} pts</div>
            <div style="font-size:12px;color:#475569">Rank ${medal} · ${scorePct}% correct</div>
          </div>
        </div>` : ''}
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07)">
          ${rows}
          ${overallRanked.length > 10 ? `<tr><td colspan="3" style="padding:6px;text-align:center;font-size:11px;color:#94a3b8">+${overallRanked.length - 10} more</td></tr>` : ''}
        </table>
      </div>`;
    };

    // Build shared results HTML (polls + quiz answers)
    const buildResultsHtml = (results, studentName = null) => results.map((r, ri) => {
      const totalVotes = r.totalVotes || Object.values(r.votes || {}).reduce((a, b) => a + b, 0);

      // Personalised rank badge for this student in this quiz
      let personalBadge = '';
      if (r.isQuiz && Array.isArray(r.leaderboard) && studentName) {
        const entry = r.leaderboard.find(e => e.name && e.name.toLowerCase().trim() === studentName.toLowerCase().trim());
        if (entry) {
          const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
          const color = entry.correct ? '#10b981' : '#ef4444';
          const bg    = entry.correct ? '#d1fae5' : '#fee2e2';
          const label = entry.correct ? '✓ Correct' : '✗ Incorrect';
          const speed = entry.reactionMs && entry.correct ? ` · answered in ${(entry.reactionMs / 1000).toFixed(1)}s` : '';
          personalBadge = `<div style="margin-bottom:10px;padding:10px 14px;background:${bg};border-radius:10px;border-left:4px solid ${color};display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">${medal}</span>
            <div>
              <div style="font-weight:700;color:${color}">${label}</div>
              <div style="font-size:12px;color:#475569">Your rank: <strong>${medal}</strong> out of ${r.leaderboard.length}${speed}</div>
            </div>
          </div>`;
        }
      }

      const optionsHtml = (r.options || []).map((opt, idx) => {
        const votes = r.votes?.[idx] || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isCorrect = r.isQuiz && r.correctOption === idx;
        return `<div style="padding:8px 12px;margin:4px 0;background:${isCorrect ? '#d1fae5' : '#f1f5f9'};border-radius:8px;border-left:3px solid ${isCorrect ? '#10b981' : '#cbd5e1'}">
          ${isCorrect ? '<strong>✓ </strong>' : ''}${opt} &mdash; <strong>${pct}%</strong> (${votes} vote${votes !== 1 ? 's' : ''})
        </div>`;
      }).join('');

      // Leaderboard snippet (quiz only)
      let leaderboardHtml = '';
      if (r.isQuiz && Array.isArray(r.leaderboard) && r.leaderboard.length > 0) {
        const rows = r.leaderboard.slice(0, 10).map(e => {
          const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`;
          const nameStyle = studentName && e.name?.toLowerCase?.() === studentName?.toLowerCase?.() ? 'font-weight:700;color:#6366f1' : 'color:#374151';
          const speedStr = e.reactionMs && e.correct ? ` (${(e.reactionMs / 1000).toFixed(1)}s)` : '';
          return `<tr>
            <td style="padding:5px 8px;font-size:13px">${medal}</td>
            <td style="padding:5px 8px;font-size:13px;${nameStyle}">${e.name || 'Unknown'}${speedStr}</td>
            <td style="padding:5px 8px;text-align:center">${e.correct ? '✅' : '❌'}</td>
          </tr>`;
        }).join('');
        leaderboardHtml = `<div style="margin-top:12px">
          <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Leaderboard</div>
          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden">
            ${rows}
          </table>
          ${r.leaderboard.length > 10 ? `<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:4px">+${r.leaderboard.length - 10} more</p>` : ''}
        </div>`;
      }

      return `<div style="margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
        <div style="font-size:11px;color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">${r.isQuiz ? `Quiz ${ri + 1}` : `Poll ${ri + 1}`}</div>
        <div style="font-weight:600;margin-bottom:10px">${r.question}</div>
        ${personalBadge}
        ${optionsHtml}
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">${totalVotes} response${totalVotes !== 1 ? 's' : ''}</div>
        ${leaderboardHtml}
      </div>`;
    }).join('');

    // Determine which students should receive this email.
    // Priority: students who registered for the session → students on the session's plan → all students.
    let students = [];
    let filterDesc = 'all students';

    if (sessionId) {
      const { data: sessRow } = await supabase.from('live_sessions').select('data').eq('id', sessionId).maybeSingle();
      const sessData = sessRow?.data || {};
      const registrations = Array.isArray(sessData.registrations) ? sessData.registrations : [];
      const sessionPlan = sessData.plan || 'all';

      if (registrations.length > 0) {
        // Email only registered students
        const { data: regStudents } = await supabase.from('users')
          .select('email, name')
          .eq('role', 'student')
          .eq('status', 'active')
          .in('id', registrations);
        students = regStudents || [];
        filterDesc = `${students.length} registered student(s)`;
      } else if (sessionPlan && sessionPlan !== 'all') {
        // Email students on the matching plan
        const { data: planStudents } = await supabase.from('users')
          .select('email, name')
          .eq('role', 'student')
          .eq('status', 'active')
          .eq('plan', sessionPlan);
        students = planStudents || [];
        filterDesc = `${students.length} student(s) on plan "${sessionPlan}"`;
      }
    }

    if (students.length === 0) {
      // Fallback: all active students (capped at 500 to avoid runaway sends)
      const { data: allStudents } = await supabase.from('users')
        .select('email, name')
        .eq('role', 'student')
        .eq('status', 'active')
        .limit(500);
      students = allStudents || [];
      filterDesc = `all active students (up to 500)`;
    }

    if (!students.length) return res.json({ ok: true, sent: 0, message: 'No eligible students found' });

    // Send in batches of 10 with a 300 ms pause between batches to avoid SMTP rate limits
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 300;
    let sent = 0;

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(s => {
        const resultsHtml = buildResultsHtml(results, s.name);
        const overallHtml = buildOverallHtml(s.name);
        const emailHtml = `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
          ${EMAIL_LOGO_HEADER}
          <h2 style="font-size:20px;font-weight:700;text-align:center;margin-bottom:4px">Class Summary</h2>
          <p style="text-align:center;color:#64748b;font-size:14px;margin-bottom:24px">${title}</p>
          <p style="font-size:14px;color:#475569;margin-bottom:20px">Hi ${s.name || 'there'}, here are your results from today's live class:</p>
          ${overallHtml}
          ${resultsHtml}
          <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:32px">T.E.R.M. Edu — Stop Studying. Start Building.</p>
        </div>`;
        return sendEmail({
          to: s.email,
          subject: `Your Class Results: ${title}`,
          html: emailHtml,
          text: `Your class results from "${title}" — ${results.length} poll/quiz${results.length !== 1 ? 's' : ''} completed.`,
        }).then(() => { sent++; })
          .catch(err => console.error(`[ClassResults] Failed to email ${s.email}:`, err.message));
      }));
      if (i + BATCH_SIZE < students.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    console.log(`[ClassResults] Emailed ${sent}/${students.length} (${filterDesc}) for session ${sessionId || 'unknown'}`);
    res.json({ ok: true, sent });
  } catch (err) { next(err); }
});

// ── Contact Form ───────────────────────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    const entry = {
      id: `c${Date.now()}`,
      name: name.trim().slice(0, 100),
      email: email.trim().toLowerCase().slice(0, 200),
      subject: subject ? subject.trim().slice(0, 200) : '',
      message: message.trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
    };
    await supabase.from('contacts').insert({
      id:         entry.id,
      name:       entry.name,
      email:      entry.email,
      subject:    entry.subject,
      message:    entry.message,
      created_at: entry.createdAt,
    });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Support AI Auto-Reply ──────────────────────────────────────────────────────
app.post('/api/support/ai-reply', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required.' });

    const apiKey = getSetting('GEMINI_API_KEY');
    if (!apiKey) {
      return res.json({ reply: "Thanks for reaching out! Our support team has received your message and will get back to you shortly." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const systemPrompt = `You are a friendly, helpful support assistant for TERM Edu — an online learning management platform.
Your job is to respond to student support messages in a warm, concise, and professional tone.
Keep replies to 2-3 sentences maximum. If you cannot resolve something, let them know a human support agent will follow up.
Topics you can help with: course access, assignments, live classes, payments/plans, account issues, technical problems.
Do not make up specific details about courses, schedules, or pricing — keep answers general if unsure.
Always end with an encouraging note. Reply in plain text only, no markdown.`;

    const chatHistory = history.slice(-6).map(m => ({
      role: m.from === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood! I am ready to assist TERM Edu students.' }] },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message.trim().slice(0, 500));
    const reply = result.response.text().trim();
    res.json({ reply });
  } catch (err) { next(err); }
});

// ── Coming Soon ────────────────────────────────────────────────────────────────
app.get('/api/coming-soon', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('coming_soon').select('*');
    if (error) throw error;
    res.json((data || []).map(rowToComingSoon));
  } catch (err) { next(err); }
});

app.post('/api/coming-soon', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const item = { id: Date.now(), ...req.body, createdAt: new Date().toISOString() };
    await supabase.from('coming_soon').insert(comingSoonToRow(item));
    res.status(201).json(rowToComingSoon(comingSoonToRow(item)));
  } catch (err) { next(err); }
});

app.put('/api/coming-soon/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseNumericId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid ID.' });
    const { data: existing, error: fetchErr } = await supabase.from('coming_soon').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Item not found.' });
    const current = rowToComingSoon(existing);
    const { title, description, category, icon, launchDate, launchTime, tags, visible, color, plan } = req.body;
    const updated = { ...current, title, description, category, icon, launchDate, launchTime, tags, visible, color, plan };
    await supabase.from('coming_soon').update(comingSoonToRow(updated)).eq('id', id);
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/coming-soon/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseNumericId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid ID.' });
    await supabase.from('coming_soon').delete().eq('id', id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Daily.co ───────────────────────────────────────────────────────────────────
const DAILY_BASE = 'https://api.daily.co/v1';
const getDailyHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getSetting('DAILY_API_KEY')}`,
});

app.post('/api/create-room', async (req, res, next) => {
  try {
    const { roomName, expiryMinutes = 120 } = req.body;
    if (!roomName) return res.status(400).json({ error: 'roomName is required.' });
    const exp = Math.floor(Date.now() / 1000) + expiryMinutes * 60;
    const response = await fetch(`${DAILY_BASE}/rooms`, {
      method: 'POST', headers: getDailyHeaders(),
      body: JSON.stringify({ name: roomName, privacy: 'private', properties: { exp, enable_chat: true, enable_screenshare: true, start_video_off: false, start_audio_off: true, max_participants: 200, enable_recording: 'cloud' } }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    const roomUrl = data.url || `https://${getSetting('DAILY_DOMAIN')}/${data.name}`;
    res.json({ room: data, url: roomUrl });
  } catch (err) { next(err); }
});

app.get('/api/rooms', async (req, res, next) => {
  try {
    const response = await fetch(`${DAILY_BASE}/rooms`, { headers: getDailyHeaders() });
    res.json(await response.json());
  } catch (err) { next(err); }
});

app.get('/api/rooms/:roomName', async (req, res, next) => {
  try {
    const response = await fetch(`${DAILY_BASE}/rooms/${req.params.roomName}`, { headers: getDailyHeaders() });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) { next(err); }
});

app.delete('/api/rooms/:roomName', async (req, res, next) => {
  try {
    const response = await fetch(`${DAILY_BASE}/rooms/${req.params.roomName}`, { method: 'DELETE', headers: getDailyHeaders() });
    if (response.status === 404) return res.json({ deleted: true });
    if (!response.ok) return res.status(response.status).json(await response.json());
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

app.post('/api/get-token', async (req, res, next) => {
  try {
    const { roomName, isOwner = false, userName, userId } = req.body;
    if (!roomName) return res.status(400).json({ error: 'roomName is required.' });
    const exp = Math.floor(Date.now() / 1000) + 120 * 60;
    const tokenProps = { properties: { room_name: roomName, user_name: userName || 'Guest', user_id: userId || 'guest', is_owner: isOwner, exp, enable_screenshare: true, start_audio_off: !isOwner, start_video_off: !isOwner } };
    const response = await fetch(`${DAILY_BASE}/meeting-tokens`, { method: 'POST', headers: getDailyHeaders(), body: JSON.stringify(tokenProps) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    const DAILY_DOMAIN = getSetting('DAILY_DOMAIN');
    const domainIsFullUrl = DAILY_DOMAIN && DAILY_DOMAIN.includes('.');
    const roomUrl = domainIsFullUrl ? `https://${DAILY_DOMAIN}/${roomName}` : `https://${DAILY_DOMAIN}.daily.co/${roomName}`;
    res.json({ token: data.token, roomUrl });
  } catch (err) { next(err); }
});

app.post('/api/upload-recording', requireAuth, express.raw({ type: 'video/*', limit: '500mb' }), async (req, res, next) => {
  try {
    const filename = (req.headers['x-filename'] || `recording-${Date.now()}.webm`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(__dirname, 'public', 'recordings');
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), req.body);
    console.log(`[Recording] Saved: ${filename} (${Math.round(req.body.length / 1024 / 1024 * 10) / 10} MB)`);
    res.json({ ok: true, filename, url: `/recordings/${filename}` });
  } catch (err) { next(err); }
});

app.get('/api/recordings', requireAuth, async (req, res, next) => {
  try {
    const dir = path.join(__dirname, 'public', 'recordings');
    await fs.promises.mkdir(dir, { recursive: true });
    const files = await fs.promises.readdir(dir);
    const list = await Promise.all(files.filter(f => f.endsWith('.webm')).map(async f => {
      const stat = await fs.promises.stat(path.join(dir, f));
      return { filename: f, url: `/recordings/${f}`, size: stat.size, createdAt: stat.birthtime };
    }));
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (err) { next(err); }
});

app.post('/api/mute-all', async (req, res, next) => {
  try {
    await fetch(`${DAILY_BASE}/rooms/${req.body.roomName}/eject`, { method: 'POST', headers: getDailyHeaders(), body: JSON.stringify({ eject: false }) });
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.post('/api/remove-participant', async (req, res, next) => {
  try {
    const { roomName, sessionId } = req.body;
    const response = await fetch(`${DAILY_BASE}/rooms/${roomName}/eject`, { method: 'POST', headers: getDailyHeaders(), body: JSON.stringify({ ids: [sessionId] }) });
    res.json(await response.json());
  } catch (err) { next(err); }
});

app.get('/api/participants/:roomName', async (req, res, next) => {
  try {
    const response = await fetch(`${DAILY_BASE}/rooms/${req.params.roomName}/presence`, { headers: getDailyHeaders() });
    res.json(await response.json());
  } catch (err) { next(err); }
});

// ── TEET Interview (Gemini-powered) ───────────────────────────────────────────
// In-memory cache for active sessions — flushed to Supabase on every update.
// Keys are evicted after 4 hours to prevent unbounded growth.
const interviewSessions = new Map();
const INTERVIEW_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function _cacheInterviewSession(id, session) {
  interviewSessions.set(id, { session, cachedAt: Date.now() });
}

function _evictStaleInterviewSessions() {
  const cutoff = Date.now() - INTERVIEW_SESSION_TTL_MS;
  for (const [id, entry] of interviewSessions) {
    if (entry.cachedAt < cutoff) interviewSessions.delete(id);
  }
}
setInterval(_evictStaleInterviewSessions, 30 * 60 * 1000); // run every 30 min

async function getInterviewSession(id) {
  if (!id) return null;
  const cached = interviewSessions.get(id);
  if (cached && Date.now() - cached.cachedAt < INTERVIEW_SESSION_TTL_MS) return cached.session;
  const { data } = await supabase.from('teet_reports').select('data').eq('id', id).maybeSingle();
  const session = data?.data || null;
  if (session) _cacheInterviewSession(id, session);
  return session;
}

const INTERVIEW_SYSTEM_PROMPT = `You are Priya, a professional and encouraging AI examiner for T.E.R.M. Edu, conducting the TEET (Term Education Entrance Test) — a voice-powered oral entrance examination to assess whether a student is ready for T.E.R.M. Edu's entrepreneurship programme.

PHASE 1 — REGISTRATION (first 3 turns, do not skip):
Turn 1: Greet the student warmly in Indian English. Introduce yourself as the TEET examiner. Ask for their full name.
Turn 2: Ask for their email address (explain you will send the result there).
Turn 3: Ask for their WhatsApp or phone number (for follow-up support).

PHASE 2 — EXAMINATION (6 core questions, with follow-ups as needed):
Ask EXACTLY these 6 core questions in order (reword naturally):
Q1. Entrepreneurship Mindset: "What does entrepreneurship mean to you, and what qualities make a successful entrepreneur?"
Q2. Business Idea: "Do you have a business idea or a problem you want to solve? Please describe it."
Q3. Market Awareness: "Who would be your target customers, and how would you reach them?"
Q4. Financial Thinking: "How would you generate revenue or make money from your idea?"
Q5. Problem-Solving: "Tell me about a real challenge you have faced and how you handled it."
Q6. Commitment & Vision: "How many hours per week can you commit to learning, and where do you see yourself in two years?"

FOLLOW-UP RULES:
- After each answer, judge: is it specific, thoughtful, and complete?
- If YES — move to the next question.
- If NO (vague, very brief, off-topic) — ask ONE focused follow-up like "Can you give a specific example?" before moving on.
- Follow-ups do NOT count as core questions.
- If answers are consistently weak, add one 7th question on the weakest area.
- Never move on until you are satisfied with the answer.

ANSWER INTEGRITY & GIBBERISH DETECTION:
- Carefully check every student response. If the answer is: random letters (e.g. "asdfgh", "jjjjj", "qwerty"), pure nonsense, profanity, abuse, spam, emojis only, one-word non-answers ("yes", "no", "idk", "ok", "lol") without any elaboration, completely off-topic, or clearly not a genuine attempt — treat it as an INVALID answer.
- 1st invalid answer on a question: Say warmly but firmly: "I understand this might feel challenging, but this is a formal examination and your responses are being evaluated. Could you please give me a proper, thoughtful answer? Let me ask once more — [repeat the question]."
- 2nd invalid answer on the same question: Say with a clear warning: "I need to be transparent with you — repeated non-answers will result in zero marks for this section, which may affect your overall result. I am giving you one final opportunity to answer properly. [repeat the question]"
- 3rd invalid answer (or if student refuses): Say: "Noted. I will move on. This question has been marked accordingly." Then award 0 marks for that topic and proceed to the next question.
- NEVER be rude or unkind, but ALWAYS be firm and maintain examination standards.
- Award 0 marks for any question where the student gave gibberish or refused to answer after two warnings.
- If a student uses abusive language or profanity at any point: immediately say "I'm afraid I cannot continue the examination if abusive language is used. Please maintain a respectful tone. I'll give you a moment to compose yourself." Then repeat the question once more before considering it invalid.

SCORING (internal, never reveal mid-exam):
Entrepreneurship Mindset:    /20
Business Idea Clarity:       /20
Market & Customer Awareness: /15
Financial Thinking:          /15
Problem-Solving Ability:     /15
Commitment & Communication:  /15
TOTAL:                       /100

PASS = 60 or above. FAIL = below 60.

FINAL MESSAGE (say ONLY when all questions are done and you are satisfied):
Speak: "Our examination is now complete. Thank you so much for your time, [Name]. Here is your result."
Then on new lines output EXACTLY (no extra text between these lines):

SCORE: [total out of 100]
TOPIC_SCORES: Mindset=[score]/20, Business=[score]/20, Market=[score]/15, Finance=[score]/15, Problem=[score]/15, Commitment=[score]/15
RESULT: PASS or FAIL
ASSESSMENT: [2-3 honest, encouraging sentences on strengths and areas to improve]
RECOMMENDATION: [1 sentence — PASS: confirm readiness and suggest Growth or Premium plan; FAIL: be kind, specify what to practise, invite retake]

Make sure TOPIC_SCORES adds up to the same number as SCORE. Each topic score must reflect the student's actual performance in that area.

RULES:
- Keep every spoken response 2-3 sentences max (responses are spoken aloud).
- Ask only ONE question per turn.
- Be warm, professional, and use Indian English.
- NEVER reveal the score or marking scheme during the exam.
- ONLY produce SCORE/RESULT/ASSESSMENT/RECOMMENDATION in the very final message.`;

// ── TEET helpers ───────────────────────────────────────────────────────────────
async function upsertTeetReport(session) {
  await supabase.from('teet_reports').upsert({
    id:         session.id,
    user_id:    session.userId || null,
    status:     session.status || 'in_progress',
    name:       session.name || null,
    email:      session.email || null,
    phone:      session.phone || null,
    score:      session.score != null ? String(session.score) : null,
    created_at: session.createdAt || new Date().toISOString(),
    data:       session,
  }, { onConflict: 'id' });
}

async function getTeetAttemptStatus(userId) {
  const { data: reports } = await supabase.from('teet_reports').select('data')
    .eq('user_id', userId).eq('status', 'completed');
  return (reports || []).map(r => r.data);
}

function checkTeetLock(completedReports) {
  const MAX_ATTEMPTS = 2;
  const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  const hasPassed = completedReports.some(r => r.passed === true);
  const allFails = completedReports
    .filter(r => r.passed === false)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  let windowStart = new Date(0);
  let cycling = true;
  while (cycling) {
    const windowFails = allFails.filter(r => new Date(r.completedAt) >= windowStart);
    if (windowFails.length >= MAX_ATTEMPTS) {
      const triggerFail = windowFails[MAX_ATTEMPTS - 1];
      const unlocksAt = new Date(new Date(triggerFail.completedAt).getTime() + COOLDOWN_MS);
      if (unlocksAt > new Date()) {
        return { blocked: true, unlocksAt: unlocksAt.toISOString(), attemptsUsed: MAX_ATTEMPTS, hasPassed };
      }
      windowStart = unlocksAt;
    } else { cycling = false; }
  }
  const currentFails = allFails.filter(r => new Date(r.completedAt) >= windowStart);
  return { blocked: false, attemptsUsed: currentFails.length, attemptsLeft: Math.max(0, MAX_ATTEMPTS - currentFails.length), hasPassed };
}

app.get('/api/teet/attempt-status', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const reports = await getTeetAttemptStatus(userId);
    res.json(checkTeetLock(reports));
  } catch (err) { next(err); }
});

app.post('/api/interviews', async (req, res) => {
  const id = crypto.randomUUID();
  const { studentName = '', studentEmail = '', studentPhone = '', userId = null } = req.body || {};

  if (userId) {
    const reports = await getTeetAttemptStatus(userId).catch(() => []);
    const lockStatus = checkTeetLock(reports);
    if (lockStatus.blocked) {
      return res.status(403).json({ error: 'exam_locked', unlocksAt: lockStatus.unlocksAt });
    }
    if (lockStatus.attemptsUsed >= 2) {
      return res.status(403).json({ error: 'exam_locked' });
    }
  }

  const session = {
    id, status: 'in_progress',
    createdAt: new Date().toISOString(),
    messages: [],
    userId,
    studentName, studentEmail, studentPhone,
    score: null, passed: null, resultLabel: 'IN PROGRESS',
    assessment: '', recommendation: '',
  };
  _cacheInterviewSession(id, session);
  await upsertTeetReport(session);
  res.json([{ id }]);
});

app.post('/api/interview-chat', async (req, res, next) => {
  try {
    const { messages = [], interviewId, action } = req.body;

    const session = await getInterviewSession(interviewId);
    let effectiveSystemPrompt = INTERVIEW_SYSTEM_PROMPT;
    if (session?.studentName && session?.studentEmail) {
      effectiveSystemPrompt = INTERVIEW_SYSTEM_PROMPT.replace(
        `PHASE 1 — REGISTRATION (first 3 turns, do not skip):
Turn 1: Greet the student warmly in Indian English. Introduce yourself as the TEET examiner. Ask for their full name.
Turn 2: Ask for their email address (explain you will send the result there).
Turn 3: Ask for their WhatsApp or phone number (for follow-up support).`,
        `PHASE 1 — REGISTRATION: SKIPPED (student details already provided by the system).
Student Name: ${session.studentName}
Student Email: ${session.studentEmail}${session.studentPhone ? `\nStudent Phone: ${session.studentPhone}` : ''}
Greet the student warmly by their first name and proceed directly to PHASE 2.`
      );
    }

    const extractContacts = (msgList) => {
      const userMsgs = msgList.filter(m => m.role === 'user').map(m => m.content || '');
      const allText = userMsgs.join(' ');
      const emailMatch = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const phoneMatch = allText.match(/(?:\+91[\s-]?)?[6-9]\d{9}|\d{10}/);
      let rawName = userMsgs[0] ? userMsgs[0].trim() : '';
      rawName = rawName.replace(/^(my name is|i am|i'm|this is|it's|its)\s+/i, '').replace(/[.,!?].*$/, '').trim();
      const name = rawName.split(/\s+/).slice(0, 4).join(' ');
      return { studentName: name || 'Unknown', studentEmail: emailMatch ? emailMatch[0] : '', studentPhone: phoneMatch ? phoneMatch[0] : '' };
    };

    if (action === 'evaluate') {
      const { studentEmail: passedEmail } = req.body;
      const evalSession = await getInterviewSession(interviewId);
      if (interviewId && evalSession) {
        const session = evalSession;
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        session.messages = messages;

        const lastAI = [...messages].reverse().find(m => m.role === 'assistant');
        const finalText = lastAI?.content || '';

        const scoreMatch = finalText.match(/SCORE:\s*(\d+)/i);
        session.score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

        const topicM = finalText.match(/TOPIC_SCORES:[\s\S]*?Mindset=(\d+)[\s\S]*?Business=(\d+)[\s\S]*?Market=(\d+)[\s\S]*?Finance=(\d+)[\s\S]*?Problem=(\d+)[\s\S]*?Commitment=(\d+)/i);
        session.topicScores = topicM ? {
          mindset: parseInt(topicM[1], 10), business: parseInt(topicM[2], 10),
          market: parseInt(topicM[3], 10), finance: parseInt(topicM[4], 10),
          problem: parseInt(topicM[5], 10), commitment: parseInt(topicM[6], 10),
        } : null;

        const resultMatch = finalText.match(/RESULT:\s*(PASS|FAIL)/i);
        session.passed = resultMatch ? resultMatch[1].toUpperCase() === 'PASS' : null;
        session.resultLabel = resultMatch ? resultMatch[1].toUpperCase() : 'UNKNOWN';

        const assessMatch = finalText.match(/ASSESSMENT:\s*(.+?)(?=RECOMMENDATION:|$)/is);
        session.assessment = assessMatch ? assessMatch[1].trim() : '';
        const recMatch = finalText.match(/RECOMMENDATION:\s*(.+?)$/is);
        session.recommendation = recMatch ? recMatch[1].trim() : '';

        const extracted = extractContacts(messages);
        if (!session.studentName) session.studentName = extracted.studentName;
        if (!session.studentEmail) session.studentEmail = extracted.studentEmail;
        if (!session.studentPhone) session.studentPhone = extracted.studentPhone;
        if (passedEmail) session.studentEmail = passedEmail;
        await upsertTeetReport(session);

        if (session.studentEmail) {
          const s = session;
          const topicRows = s.topicScores ? `
            <tr><td style="padding:4px 8px;color:#555">Entrepreneurship Mindset</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.mindset}/20</td></tr>
            <tr><td style="padding:4px 8px;color:#555">Business Idea Clarity</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.business}/20</td></tr>
            <tr><td style="padding:4px 8px;color:#555">Market Awareness</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.market}/15</td></tr>
            <tr><td style="padding:4px 8px;color:#555">Financial Thinking</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.finance}/15</td></tr>
            <tr><td style="padding:4px 8px;color:#555">Problem-Solving</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.problem}/15</td></tr>
            <tr><td style="padding:4px 8px;color:#555">Commitment & Communication</td><td style="padding:4px 8px;font-weight:700;text-align:right">${s.topicScores.commitment}/15</td></tr>
          ` : '';
          const passColor = s.passed ? '#059669' : '#dc2626';
          const passLabel = s.passed ? 'PASSED' : 'FAILED';
          const resultHtml = `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 24px;background:#f9f5ff;border-radius:16px">
            ${EMAIL_LOGO_HEADER}
            <h2 style="color:#1e0a3c;font-size:20px;margin:0 0 4px">Your TEET Examination Results</h2>
            <p style="color:#666;font-size:14px;margin:0 0 24px">Dear ${s.studentName || 'Student'}, here is your official TEET result.</p>
            <div style="background:${s.passed ? '#d1fae5' : '#fee2e2'};border:2px solid ${passColor};border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:36px;font-weight:900;color:${passColor}">${s.score ?? '—'}<span style="font-size:16px;font-weight:400;color:#999">/100</span></p>
              <p style="margin:0;font-size:18px;font-weight:900;color:${passColor};letter-spacing:2px">${passLabel}</p>
              <p style="margin:8px 0 0;font-size:12px;color:#777">Pass threshold: 60/100</p>
            </div>
            ${topicRows ? `
            <h3 style="color:#1e0a3c;font-size:14px;margin:0 0 8px">Score Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-bottom:20px">
              <tbody>${topicRows}</tbody>
            </table>` : ''}
            ${s.assessment ? `
            <h3 style="color:#1e0a3c;font-size:14px;margin:0 0 6px">Assessment</h3>
            <p style="color:#444;font-size:13px;line-height:1.6;margin:0 0 20px;background:#fff;padding:12px 16px;border-radius:8px;border-left:3px solid #7c3aed">${s.assessment}</p>
            ` : ''}
            ${s.recommendation ? `
            <h3 style="color:#1e0a3c;font-size:14px;margin:0 0 6px">Recommendation</h3>
            <p style="color:#444;font-size:13px;line-height:1.6;margin:0 0 24px;background:#fff;padding:12px 16px;border-radius:8px;border-left:3px solid #d97706">${s.recommendation}</p>
            ` : ''}
            <p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center">&copy; ${new Date().getFullYear()} T.E.R.M. Edu. All rights reserved.</p>
          </div>`;
          const plainResult = `Your TEET Result — ${passLabel}\nScore: ${s.score ?? '—'}/100\n\n${s.assessment ? `Assessment: ${s.assessment}\n\n` : ''}${s.recommendation ? `Recommendation: ${s.recommendation}` : ''}`;
          sendEmail({
            to: session.studentEmail,
            subject: `Your TEET Result: ${passLabel} (${s.score ?? '—'}/100) — T.E.R.M. Edu`,
            html: resultHtml, text: plainResult,
          }).catch(err => console.error('[TEET] Failed to send result email:', err));
        }
      }
      return res.json({ ok: true });
    }

    const MODELS = [
      'gemma-3n-e4b-it', 'gemma-3-4b-it', 'gemma-3-27b-it',
      'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash',
    ];
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const tryGenerate = async (modelName) => {
      const genAI = new GoogleGenerativeAI(getSetting('GEMINI_API_KEY'));
      const isGemma = modelName.startsWith('gemma');
      const hasPreInfo = !!(session?.studentName && session?.studentEmail);
      const beginMsg = hasPreInfo
        ? 'Begin the examination now. The student details are already provided — skip Phase 1 and greet the student by first name, then start Phase 2.'
        : "Begin the examination now. Introduce yourself as Priya and ask for the candidate's full name.";
      const model = isGemma
        ? genAI.getGenerativeModel({ model: modelName })
        : genAI.getGenerativeModel({ model: modelName, systemInstruction: effectiveSystemPrompt });
      if (messages.length === 0) {
        if (isGemma) {
          const result = await model.generateContent(`${effectiveSystemPrompt}\n\n---\n${beginMsg}`);
          return result.response.text();
        }
        const result = await model.generateContent(beginMsg);
        return result.response.text();
      }
      let history = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      if (isGemma) {
        history = [
          { role: 'user', parts: [{ text: `${effectiveSystemPrompt}\n\n---\n${beginMsg}` }] },
          { role: 'model', parts: [{ text: 'Understood. I am Priya, the T.E.R.M. Edu examiner. I will follow all instructions precisely.' }] },
          ...history,
        ];
      } else if (history.length > 0 && history[0].role === 'model') {
        history = [{ role: 'user', parts: [{ text: 'Please begin the examination.' }] }, ...history];
      }
      const lastMsg = messages[messages.length - 1];
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMsg.content);
      return result.response.text();
    };

    let responseText;
    let lastErr;

    const tryAllModels = async () => {
      for (const modelName of MODELS) {
        try { return await tryGenerate(modelName); }
        catch (err) {
          lastErr = err;
          const msg = err?.message || '';
          const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests') || msg.includes('RESOURCE_EXHAUSTED');
          const isTransient = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded');
          if (is429) { console.warn(`[TEET] ${modelName} quota hit — trying next…`); continue; }
          if (isTransient) { console.warn(`[TEET] ${modelName} unavailable — trying next…`); continue; }
          throw err;
        }
      }
      return null;
    };

    responseText = await tryAllModels();
    if (!responseText) {
      console.warn('[TEET] All models quota-limited — waiting 35s…');
      await sleep(35000);
      responseText = await tryAllModels();
    }
    if (!responseText) {
      const msg = lastErr?.message || '';
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      if (is429) return res.status(429).json({ error: 'quota', message: 'quota' });
      throw lastErr;
    }

    const activeSession = await getInterviewSession(interviewId);
    if (interviewId && activeSession) {
      activeSession.messages = [...messages, { role: 'assistant', content: responseText }];
      const extracted = extractContacts(activeSession.messages);
      if (!activeSession.studentName)  activeSession.studentName  = extracted.studentName;
      if (!activeSession.studentEmail) activeSession.studentEmail = extracted.studentEmail;
      if (!activeSession.studentPhone) activeSession.studentPhone = extracted.studentPhone;
      await upsertTeetReport(activeSession);
    }

    res.json({ content: responseText });
  } catch (err) { next(err); }
});

app.post('/api/interview-chat-stream', async (req, res) => {
  const { messages = [], interviewId } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} };

  const session = await getInterviewSession(interviewId);
  let effectiveSystemPrompt = INTERVIEW_SYSTEM_PROMPT;
  if (session?.studentName && session?.studentEmail) {
    effectiveSystemPrompt = INTERVIEW_SYSTEM_PROMPT.replace(
      `PHASE 1 — REGISTRATION (first 3 turns, do not skip):
Turn 1: Greet the student warmly in Indian English. Introduce yourself as the TEET examiner. Ask for their full name.
Turn 2: Ask for their email address (explain you will send the result there).
Turn 3: Ask for their WhatsApp or phone number (for follow-up support).`,
      `PHASE 1 — REGISTRATION: SKIPPED (student details already provided by the system).
Student Name: ${session.studentName}
Student Email: ${session.studentEmail}${session.studentPhone ? `\nStudent Phone: ${session.studentPhone}` : ''}
Greet the student warmly by their first name and proceed directly to PHASE 2.`
    );
  }

  const extractContacts = (msgList) => {
    const userMsgs = msgList.filter(m => m.role === 'user').map(m => m.content || '');
    const allText = userMsgs.join(' ');
    const emailMatch = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const phoneMatch = allText.match(/(?:\+91[\s-]?)?[6-9]\d{9}|\d{10}/);
    let rawName = userMsgs[0] ? userMsgs[0].trim() : '';
    rawName = rawName.replace(/^(my name is|i am|i'm|this is|it's|its)\s+/i, '').replace(/[.,!?].*$/, '').trim();
    const name = rawName.split(/\s+/).slice(0, 4).join(' ');
    return { studentName: name || 'Unknown', studentEmail: emailMatch?.[0] || '', studentPhone: phoneMatch?.[0] || '' };
  };

  const MODELS = [
    'gemma-3n-e4b-it', 'gemma-3-4b-it', 'gemma-3-27b-it',
    'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash',
  ];

  for (const modelName of MODELS) {
    try {
      const genAI = new GoogleGenerativeAI(getSetting('GEMINI_API_KEY'));
      const isGemma = modelName.startsWith('gemma');
      const hasPreInfo = !!(session?.studentName && session?.studentEmail);
      const beginMsg = hasPreInfo
        ? 'Begin the examination now. The student details are already provided — skip Phase 1 and greet the student by first name, then start Phase 2.'
        : "Begin the examination now. Introduce yourself as Priya and ask for the candidate's full name.";
      const model = isGemma
        ? genAI.getGenerativeModel({ model: modelName })
        : genAI.getGenerativeModel({ model: modelName, systemInstruction: effectiveSystemPrompt });

      let streamResult;
      if (messages.length === 0) {
        const prompt = isGemma ? `${effectiveSystemPrompt}\n\n---\n${beginMsg}` : beginMsg;
        streamResult = await model.generateContentStream(prompt);
      } else {
        let history = messages.slice(0, -1).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
        if (isGemma) {
          history = [
            { role: 'user', parts: [{ text: `${effectiveSystemPrompt}\n\n---\n${beginMsg}` }] },
            { role: 'model', parts: [{ text: 'Understood. I am Priya, the T.E.R.M. Edu examiner. I will follow all instructions precisely.' }] },
            ...history,
          ];
        } else if (history.length > 0 && history[0].role === 'model') {
          history = [{ role: 'user', parts: [{ text: 'Please begin the examination.' }] }, ...history];
        }
        const chat = model.startChat({ history });
        const lastMsg = messages[messages.length - 1];
        streamResult = await chat.sendMessageStream(lastMsg.content);
      }

      let fullText = '';
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) { fullText += text; send({ text }); }
      }

      if (interviewId && session) {
        session.messages = [...messages, { role: 'assistant', content: fullText }];
        const extracted = extractContacts(session.messages);
        if (!session.studentName)  session.studentName  = extracted.studentName;
        if (!session.studentEmail) session.studentEmail = extracted.studentEmail;
        if (!session.studentPhone) session.studentPhone = extracted.studentPhone;
        await upsertTeetReport(session);
      }

      send({ done: true, fullText });
      res.end();
      return;
    } catch (err) {
      const msg = err?.message || '';
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      const isBusy = msg.includes('503') || msg.includes('overloaded');
      if (is429 || isBusy) { console.warn(`[TEET Stream] ${modelName} quota/busy — trying next…`); continue; }
      send({ error: err.message || 'AI error' });
      res.end();
      return;
    }
  }
  send({ error: 'quota' });
  res.end();
});

app.all('/api/interviews/:id/abandon', async (req, res, next) => {
  if (!['POST','PATCH'].includes(req.method)) return next();
  try {
    const { id } = req.params;
    const session = await getInterviewSession(id);
    if (session && session.status === 'in_progress') {
      session.status = 'abandoned';
      session.abandonedAt = new Date().toISOString();
      session.resultLabel = 'EXITED';
      await upsertTeetReport(session);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/teet-reports', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000;
    const now = Date.now();
    const { data, error } = await supabase.from('teet_reports').select('data').order('created_at', { ascending: false });
    if (error) throw error;
    const all = (data || []).map(r => r.data);
    const normalised = all.map(r => {
      if (r.status === 'in_progress') {
        const age = now - new Date(r.createdAt).getTime();
        if (age > STALE_THRESHOLD_MS) {
          return { ...r, status: 'abandoned', resultLabel: 'EXITED', abandonedAt: r.createdAt };
        }
      }
      return r;
    });
    const real = normalised.filter(r =>
      r.status === 'completed' || r.status === 'abandoned' ||
      (Array.isArray(r.messages) && r.messages.some(m => m.role === 'user'))
    );
    res.json(real);
  } catch (err) { next(err); }
});

app.get('/api/teet-passed', async (req, res, next) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.json({ passed: false });
    const { data } = await supabase.from('teet_reports').select('data').eq('status', 'completed');
    const reports = (data || []).map(r => r.data);
    const passed = reports.some(r => r.passed === true && (r.studentEmail || '').toLowerCase().trim() === email);
    const best = reports
      .filter(r => (r.studentEmail || '').toLowerCase().trim() === email && r.passed)
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    res.json({ passed, score: best?.score ?? null });
  } catch (err) { next(err); }
});

app.get('/api/my-teet-report', async (req, res, next) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.json(null);
    const { data } = await supabase.from('teet_reports').select('data').neq('status', 'in_progress').order('created_at', { ascending: false });
    const reports = (data || []).map(r => r.data);
    const mine = reports.filter(r => (r.studentEmail || '').toLowerCase().trim() === email)
      .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
    res.json(mine[0] || null);
  } catch (err) { next(err); }
});

app.post('/api/teet-reports/:id/summary', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { data: row, error } = await supabase.from('teet_reports').select('data').eq('id', req.params.id).single();
    if (error || !row) return res.status(404).json({ error: 'Report not found' });
    const report = row.data;

    const messages = (report.messages || []).filter(m => m.content && m.role);
    const transcript = messages.map(m =>
      `${m.role === 'assistant' ? 'Priya (Examiner)' : 'Student'}: ${m.content}`
    ).join('\n\n');

    const summaryPrompt = `You are an academic administrator reviewing a TEET (Term Education Entrance Test) interview transcript.

Below is the full interview transcript between Priya (AI examiner) and a student named ${report.studentName || 'Unknown'}.
The student scored ${report.score ?? 'N/A'}/100 and the result is: ${report.resultLabel || 'UNKNOWN'}.

TRANSCRIPT:
${transcript}

Write a concise evaluation report (200-300 words) for the admin/teacher covering:
1. OVERVIEW: A 2-sentence summary of who the candidate is and how they performed
2. STRENGTHS: 2-3 key strengths demonstrated in the interview
3. WEAKNESSES: 2-3 areas of concern or improvement needed
4. SUBJECT MATTER: How well did they understand entrepreneurship, their business idea, and financial thinking?
5. RECOMMENDATION: Should this student be admitted? If yes, which plan (Starter/Growth/Premium)? Why?

Use plain paragraph format (no markdown). Be honest, constructive, and professional.`;

    const genAI = new GoogleGenerativeAI(getSetting('GEMINI_API_KEY'));
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(summaryPrompt);
    const summary = result.response.text();

    const updated = { ...report, adminSummary: summary, summaryGeneratedAt: new Date().toISOString() };
    await upsertTeetReport(updated);
    res.json({ summary });
  } catch (err) { next(err); }
});

// ── FCM: Heartbeat — student pings every 30s to mark themselves "online" ──────
app.post('/api/heartbeat', async (req, res) => {
  const { userId } = req.body || {};
  if (userId) userHeartbeat.set(String(userId), Date.now());
  res.json({ ok: true });
});

// ── FCM: Save device token — called by Android app on startup ─────────────────
// No auth required; pass userId so we can target notifications to a specific user
app.post('/api/fcm/save-token', async (req, res, next) => {
  try {
    const { token, userId } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'token is required' });
    const uid = String(userId || 'anonymous');
    tokenUserMap.set(token, uid);
    if (!userFcmTokens.has(uid)) userFcmTokens.set(uid, new Set());
    userFcmTokens.get(uid).add(token);
    persistFcmToken(token, uid);
    console.log(`[FCM] Token saved for user ${uid}. Total tokens: ${tokenUserMap.size}`);
    res.json({ success: true, totalTokens: tokenUserMap.size });
  } catch (err) { next(err); }
});

// ── FCM: Admin/Lecturer manual broadcast to all registered devices ─────────────
app.post('/api/fcm/send', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { title, body, color } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'title and body are required' });
    const tokens = allTokens();
    if (!tokens.length) {
      return res.json({ success: true, sent: 0, failed: 0, message: 'No devices registered yet' });
    }
    const accentColor = /^#[0-9A-Fa-f]{6}$/.test(color || '') ? color : '#6c63ff';
    const message = {
      tokens,
      notification: { title, body },
      data: { type: 'broadcast', navigateTo: '/' },
      android: {
        priority: 'high',
        ttl: 86400000,
        notification: { sound: 'default', priority: 'high', visibility: 'public', defaultSound: true, color: accentColor },
      },
    };
    const result = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] Broadcast — "${title}" | ✓${result.successCount} ✗${result.failureCount}`);
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || 'unknown';
        const msg  = r.error?.message || 'no message';
        console.error(`[FCM] Token[${i}] FAILED — code: ${code} | msg: ${msg} | token(last12): ...${tokens[i].slice(-12)}`);
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          _removeStaleToken(tokens[i]);
        }
      }
    });
    res.json({ success: true, sent: result.successCount, failed: result.failureCount });
  } catch (err) { next(err); }
});

// ── FCM: Support reply push — called by admin after replying to a ticket ───────
// Always fires FCM. If the student is on the app, the in-app banner (client polling)
// shows immediately; FCM push ensures they see it in the notification shade too.
app.post('/api/support/notify-reply', requireAuth, requireRole('admin', 'lecturer'), async (req, res, next) => {
  try {
    const { userId, ticketId, replyText } = req.body;
    if (!userId || !replyText) return res.status(400).json({ ok: false, message: 'userId and replyText required' });
    const online = isUserOnline(userId);
    // Fire-and-forget — don't await to keep response fast
    sendSupportPush(userId, ticketId, replyText).catch(() => {});
    res.json({ ok: true, pushed: true, online });
  } catch (err) { next(err); }
});

// ── Admin: Settings (API keys stored in Supabase) ─────────────────────────────
app.get('/api/admin/settings', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;
    // Merge DB values with process.env fallbacks for managed keys; mask sensitive ones
    const result = {};
    for (const key of MANAGED_SETTINGS) {
      const dbRow = (data || []).find(r => r.key === key);
      const rawVal = dbRow?.value || process.env[key] || '';
      result[key] = SENSITIVE_SETTINGS.has(key) && rawVal
        ? rawVal.slice(0, 4) + '****' + rawVal.slice(-4)  // mask: show first 4 + last 4
        : rawVal;
    }
    res.json(result);
  } catch (err) { next(err); }
});

app.put('/api/admin/settings', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const allowed = {};
    for (const key of MANAGED_SETTINGS) {
      if (key in body && body[key] !== null && body[key] !== undefined) {
        // Don't overwrite sensitive keys if the user sent back a masked value
        const val = String(body[key]).trim();
        if (val && !val.includes('****')) allowed[key] = val;
      }
    }
    if (Object.keys(allowed).length === 0) return res.json({ ok: true, updated: 0 });
    await saveSettings(allowed);
    res.json({ ok: true, updated: Object.keys(allowed).length, keys: Object.keys(allowed) });
  } catch (err) { next(err); }
});

// ── SPA fallback ───────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Error]', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});
