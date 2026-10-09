-- T.E.R.M. Edu — Supabase PostgreSQL schema
-- Run this once in your Supabase project's SQL editor.
-- All tables use text IDs matching the existing JSON data.

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'student',
  avatar      TEXT,
  phone       TEXT,
  plan        TEXT DEFAULT 'none',
  plans       JSONB DEFAULT '[]',
  status      TEXT DEFAULT 'active',
  joined      TEXT,
  password    TEXT,
  enrolled_courses JSONB DEFAULT '[]',
  progress    JSONB DEFAULT '{}',
  meta        JSONB DEFAULT '{}'
);

-- ── Courses ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Assignments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  data        JSONB NOT NULL
);

-- ── Submissions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  data           JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_asgn_student ON submissions(assignment_id, student_id);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  data        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_expires ON notifications(expires_at);

-- ── Live sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Tickets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Study materials ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  is_published BOOLEAN DEFAULT true,
  plan_key     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  data         JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS materials_plan ON materials(plan_key, is_published);

-- ── Categories ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Plan configs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_configs (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ── Projects (briefs) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Project submissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_submissions (
  id         TEXT PRIMARY KEY,
  brief_id   TEXT NOT NULL,
  student_id TEXT NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS proj_subs_brief_student ON project_submissions(brief_id, student_id);

-- ── Coming Soon ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coming_soon (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── TEET reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teet_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  status      TEXT DEFAULT 'in_progress',
  created_at  TIMESTAMPTZ DEFAULT now(),
  data        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS teet_reports_user ON teet_reports(user_id);
CREATE INDEX IF NOT EXISTS teet_reports_status ON teet_reports(status);

-- ── Leads ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Contacts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Auth tokens ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id);

-- ── FCM device tokens (push notifications — survives server restarts) ────
CREATE TABLE IF NOT EXISTS fcm_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fcm_tokens_user ON fcm_tokens(user_id);

-- ── Ratings (one row per user per course) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  course_id TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  stars     INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  PRIMARY KEY (course_id, user_id)
);

-- ── Q&A per lesson ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa (
  lesson_id TEXT PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '[]'
);

-- ── OTP Store (replaces in-memory Map) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_store (
  key    TEXT PRIMARY KEY,
  otp    TEXT NOT NULL,
  expiry BIGINT NOT NULL
);

-- ── Pending Signups (replaces in-memory Map) ───────────────────────────────
CREATE TABLE IF NOT EXISTS pending_signups (
  email    TEXT PRIMARY KEY,
  name     TEXT,
  phone    TEXT,
  password TEXT,
  expiry   BIGINT NOT NULL
);

-- ── API Settings (Daily.co, Gemini, SMTP — survive redeployments) ──────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
