/**
 * PostgreSQL data layer — uses Replit's built-in DATABASE_URL.
 * Auto-creates all tables on startup (safe to run multiple times).
 */
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

// ── Schema ─────────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS courses (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  data        JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  data           JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_asgn_student ON submissions(assignment_id, student_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  data        JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  is_published BOOLEAN DEFAULT true,
  plan_key     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  data         JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_configs (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS project_submissions (
  id         TEXT PRIMARY KEY,
  brief_id   TEXT NOT NULL,
  student_id TEXT NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS proj_subs_brief_student ON project_submissions(brief_id, student_id);

CREATE TABLE IF NOT EXISTS coming_soon (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS teet_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  status      TEXT DEFAULT 'in_progress',
  created_at  TIMESTAMPTZ DEFAULT now(),
  data        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS teet_reports_user ON teet_reports(user_id);

CREATE TABLE IF NOT EXISTS leads (
  id   BIGINT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS ratings (
  course_id TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  stars     INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS qa (
  lesson_id TEXT PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
  token    TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fcm_tokens_user ON fcm_tokens(user_id);
`;

export async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[DB] Schema initialised.');
  } finally {
    client.release();
  }
}

// ── Generic query helper ───────────────────────────────────────────────────────
export async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ── JSONB-table helpers ────────────────────────────────────────────────────────

export async function dbAll(table, whereClause = '', params = []) {
  const sql = `SELECT data FROM ${table}${whereClause} ORDER BY id`;
  const rows = await query(sql, params);
  return rows.map(r => r.data);
}

export async function dbGet(table, id) {
  const rows = await query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
  return rows[0]?.data ?? null;
}

export async function dbInsertData(table, id, data) {
  await query(
    `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
    [id, JSON.stringify(data)]
  );
  return data;
}

export async function dbUpdateData(table, id, data) {
  await query(`UPDATE ${table} SET data = $1 WHERE id = $2`, [JSON.stringify(data), id]);
  return data;
}

export async function dbDelete(table, id) {
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}
