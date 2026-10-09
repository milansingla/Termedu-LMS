/**
 * T.E.R.M. Edu — Supabase seed script
 * Run once:  node server/migrate.js
 * Reads all existing JSON files and inserts them into Supabase.
 * Safe to re-run: uses upsert (insert-or-replace) everywhere.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = path.join(__dirname, 'data');
const QA_DIR      = path.join(DATA_DIR, 'qa');
const RATINGS_DIR = path.join(DATA_DIR, 'ratings');

function readJSON(file, def = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}

async function run() {
  console.log('[Migrate] Starting…');

  // ── Users ──────────────────────────────────────────────────────────────────
  const users = readJSON(path.join(DATA_DIR, 'users.json'), []);
  for (const u of users) {
    const { password, enrolledCourses, progress, ...rest } = u;
    const { error } = await supabase.from('users').upsert({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role || 'student',
      avatar: u.avatar || null,
      phone: u.phone || null,
      plan: u.plan || 'none',
      plans: u.plans || [],
      status: u.status || 'active',
      joined: u.joined || null,
      password: u.password || null,
      enrolled_courses: u.enrolledCourses || [],
      progress: u.progress || {},
      meta: {},
    }, { onConflict: 'id' });
    if (error) console.error(`[Users] ${u.email}:`, error.message);
    else console.log(`[Users] ✓ ${u.email}`);
  }

  // ── Courses ────────────────────────────────────────────────────────────────
  const courses = readJSON(path.join(DATA_DIR, 'courses.json'), []);
  for (const c of courses) {
    const { error } = await supabase.from('courses').upsert({ id: c.id, data: c }, { onConflict: 'id' });
    if (error) console.error(`[Courses] ${c.id}:`, error.message);
    else console.log(`[Courses] ✓ ${c.id}`);
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  const assignments = readJSON(path.join(DATA_DIR, 'assignments.json'), []);
  for (const a of assignments) {
    const { error } = await supabase.from('assignments').upsert({
      id: a.id,
      created_at: a.createdAt || new Date().toISOString(),
      data: a,
    }, { onConflict: 'id' });
    if (error) console.error(`[Assignments] ${a.id}:`, error.message);
    else console.log(`[Assignments] ✓ ${a.id}`);
  }

  // ── Submissions ────────────────────────────────────────────────────────────
  const submissions = readJSON(path.join(DATA_DIR, 'submissions.json'), []);
  for (const s of submissions) {
    const { error } = await supabase.from('submissions').upsert({
      id: s.id,
      assignment_id: s.assignmentId,
      student_id: s.studentId,
      submitted_at: s.submittedAt || new Date().toISOString(),
      data: s,
    }, { onConflict: 'id' });
    if (error) console.error(`[Submissions] ${s.id}:`, error.message);
    else console.log(`[Submissions] ✓ ${s.id}`);
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifications = readJSON(path.join(DATA_DIR, 'notifications.json'), []);
  for (const n of notifications) {
    const { error } = await supabase.from('notifications').upsert({
      id: n.id,
      created_at: n.createdAt || new Date().toISOString(),
      expires_at: n.expiresAt || null,
      data: n,
    }, { onConflict: 'id' });
    if (error) console.error(`[Notifications] ${n.id}:`, error.message);
    else console.log(`[Notifications] ✓ ${n.id}`);
  }

  // ── Live sessions ──────────────────────────────────────────────────────────
  const sessions = readJSON(path.join(DATA_DIR, 'sessions.json'), []);
  for (const s of sessions) {
    const { error } = await supabase.from('live_sessions').upsert({ id: s.id, data: s }, { onConflict: 'id' });
    if (error) console.error(`[Sessions] ${s.id}:`, error.message);
    else console.log(`[Sessions] ✓ ${s.id}`);
  }

  // ── Tickets ────────────────────────────────────────────────────────────────
  const tickets = readJSON(path.join(DATA_DIR, 'tickets.json'), []);
  for (const t of tickets) {
    const { error } = await supabase.from('tickets').upsert({ id: t.id, data: t }, { onConflict: 'id' });
    if (error) console.error(`[Tickets] ${t.id}:`, error.message);
    else console.log(`[Tickets] ✓ ${t.id}`);
  }

  // ── Materials ──────────────────────────────────────────────────────────────
  const materials = readJSON(path.join(DATA_DIR, 'materials.json'), []);
  for (const m of materials) {
    const { error } = await supabase.from('materials').upsert({
      id: m.id,
      is_published: m.isPublished !== false,
      plan_key: m.planKey || null,
      created_at: m.createdAt || new Date().toISOString(),
      data: m,
    }, { onConflict: 'id' });
    if (error) console.error(`[Materials] ${m.id}:`, error.message);
    else console.log(`[Materials] ✓ ${m.id}`);
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  const DEFAULT_CATEGORIES = [
    { id: 'starter',    name: 'Starter',    icon: 'menu_book'    },
    { id: 'growth',     name: 'Growth',     icon: 'trending_up'  },
    { id: 'premium',    name: 'Premium',    icon: 'diamond'      },
    { id: 'live',       name: 'Live',       icon: 'live_tv'      },
    { id: 'mentorship', name: 'Mentorship', icon: 'support_agent'},
    { id: 'career',     name: 'Career',     icon: 'work'         },
  ];
  const categories = readJSON(path.join(DATA_DIR, 'categories.json'), DEFAULT_CATEGORIES);
  for (const c of categories) {
    const { error } = await supabase.from('categories').upsert({ id: c.id, data: c }, { onConflict: 'id' });
    if (error) console.error(`[Categories] ${c.id}:`, error.message);
    else console.log(`[Categories] ✓ ${c.id}`);
  }

  // ── Plan configs ───────────────────────────────────────────────────────────
  const planConfigs = readJSON(path.join(DATA_DIR, 'planConfigs.json'), {});
  for (const [key, value] of Object.entries(planConfigs)) {
    const { error } = await supabase.from('plan_configs').upsert({ key, value }, { onConflict: 'key' });
    if (error) console.error(`[PlanConfigs] ${key}:`, error.message);
    else console.log(`[PlanConfigs] ✓ ${key}`);
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const projects = readJSON(path.join(DATA_DIR, 'projects.json'), []);
  for (const p of projects) {
    const { error } = await supabase.from('projects').upsert({ id: p.id, data: p }, { onConflict: 'id' });
    if (error) console.error(`[Projects] ${p.id}:`, error.message);
    else console.log(`[Projects] ✓ ${p.id}`);
  }

  // ── Project submissions ────────────────────────────────────────────────────
  const projSubs = readJSON(path.join(DATA_DIR, 'projectSubmissions.json'), []);
  for (const s of projSubs) {
    const { error } = await supabase.from('project_submissions').upsert({
      id: s.id,
      brief_id: s.briefId,
      student_id: s.studentId,
      data: s,
    }, { onConflict: 'id' });
    if (error) console.error(`[ProjSubs] ${s.id}:`, error.message);
    else console.log(`[ProjSubs] ✓ ${s.id}`);
  }

  // ── Coming Soon ────────────────────────────────────────────────────────────
  const comingSoon = readJSON(path.join(DATA_DIR, 'comingSoon.json'), []);
  for (const item of comingSoon) {
    const { error } = await supabase.from('coming_soon').upsert({ id: item.id, data: item }, { onConflict: 'id' });
    if (error) console.error(`[ComingSoon] ${item.id}:`, error.message);
    else console.log(`[ComingSoon] ✓ ${item.id}`);
  }

  // ── TEET reports ───────────────────────────────────────────────────────────
  const teetReports = readJSON(path.join(DATA_DIR, 'teetReports.json'), []);
  for (const r of teetReports) {
    const { error } = await supabase.from('teet_reports').upsert({
      id: r.id,
      user_id: r.userId || null,
      status: r.status || 'in_progress',
      created_at: r.createdAt || new Date().toISOString(),
      data: r,
    }, { onConflict: 'id' });
    if (error) console.error(`[TEET] ${r.id}:`, error.message);
    else console.log(`[TEET] ✓ ${r.id}`);
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  const leads = readJSON(path.join(DATA_DIR, 'leads.json'), []);
  for (const l of leads) {
    const { error } = await supabase.from('leads').upsert({ id: l.id, data: l }, { onConflict: 'id' });
    if (error) console.error(`[Leads] ${l.id}:`, error.message);
    else console.log(`[Leads] ✓ ${l.id}`);
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  const contacts = readJSON(path.join(DATA_DIR, 'contacts.json'), []);
  for (const c of contacts) {
    const { error } = await supabase.from('contacts').upsert({ id: c.id, data: c }, { onConflict: 'id' });
    if (error) console.error(`[Contacts] ${c.id}:`, error.message);
    else console.log(`[Contacts] ✓ ${c.id}`);
  }

  // ── Ratings ────────────────────────────────────────────────────────────────
  if (fs.existsSync(RATINGS_DIR)) {
    for (const file of fs.readdirSync(RATINGS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const courseId = file.replace('.json', '');
      const ratings = readJSON(path.join(RATINGS_DIR, file), {});
      for (const [userId, stars] of Object.entries(ratings)) {
        const { error } = await supabase.from('ratings').upsert(
          { course_id: courseId, user_id: userId, stars: Number(stars) },
          { onConflict: 'course_id,user_id' }
        );
        if (error) console.error(`[Ratings] ${courseId}/${userId}:`, error.message);
      }
      console.log(`[Ratings] ✓ ${courseId}`);
    }
  }

  // ── Q&A ────────────────────────────────────────────────────────────────────
  if (fs.existsSync(QA_DIR)) {
    for (const file of fs.readdirSync(QA_DIR)) {
      if (!file.endsWith('.json')) continue;
      const lessonId = file.replace('.json', '');
      const data = readJSON(path.join(QA_DIR, file), []);
      const { error } = await supabase.from('qa').upsert({ lesson_id: lessonId, data }, { onConflict: 'lesson_id' });
      if (error) console.error(`[QA] ${lessonId}:`, error.message);
      else console.log(`[QA] ✓ ${lessonId}`);
    }
  }

  // ── Auth tokens ────────────────────────────────────────────────────────────
  const tokenFile = path.join(DATA_DIR, 'authTokens.json');
  if (fs.existsSync(tokenFile)) {
    const tokens = readJSON(tokenFile, []);
    const now = Date.now();
    for (const { token, userId, expiresAt } of tokens) {
      if (!token || expiresAt <= now) continue;
      const { error } = await supabase.from('auth_tokens').upsert(
        { token, user_id: userId, expires_at: expiresAt },
        { onConflict: 'token' }
      );
      if (error) console.error(`[Tokens] ${userId}:`, error.message);
    }
    console.log(`[Tokens] ✓ ${tokens.length} token(s)`);
  }

  console.log('[Migrate] Done!');
}

run().catch(err => { console.error('[Migrate] Fatal:', err); process.exit(1); });
