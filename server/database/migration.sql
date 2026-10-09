-- ============================================================
-- T.E.R.M. Edu — Full Supabase Schema Migration
-- Run this in your Supabase SQL Editor (once)
-- ============================================================

-- ── live_sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
  id            BIGINT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'upcoming',
  is_workshop   BOOLEAN NOT NULL DEFAULT false,
  is_meeting    BOOLEAN NOT NULL DEFAULT false,
  date          TEXT,
  time          TEXT,
  instructor    TEXT DEFAULT 'T.E.R.M. Mentor',
  created_by    TEXT,
  plan          TEXT NOT NULL DEFAULT 'all',
  room_name     TEXT,
  room_url      TEXT,
  ended_at      TEXT,
  tags          JSONB NOT NULL DEFAULT '[]',
  registrations JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- If table already existed with old data JSONB column, migrate & drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='live_sessions' AND column_name='data'
  ) THEN
    ALTER TABLE live_sessions
      ADD COLUMN IF NOT EXISTS title         TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description   TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'upcoming',
      ADD COLUMN IF NOT EXISTS is_workshop   BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_meeting    BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS date          TEXT,
      ADD COLUMN IF NOT EXISTS time          TEXT,
      ADD COLUMN IF NOT EXISTS instructor    TEXT DEFAULT 'T.E.R.M. Mentor',
      ADD COLUMN IF NOT EXISTS created_by    TEXT,
      ADD COLUMN IF NOT EXISTS plan          TEXT DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS room_name     TEXT,
      ADD COLUMN IF NOT EXISTS room_url      TEXT,
      ADD COLUMN IF NOT EXISTS ended_at      TEXT,
      ADD COLUMN IF NOT EXISTS tags          JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS registrations JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();

    UPDATE live_sessions SET
      title         = COALESCE(data->>'title', ''),
      description   = COALESCE(data->>'description', ''),
      status        = COALESCE(data->>'status', 'upcoming'),
      is_workshop   = COALESCE((data->>'isWorkshop')::boolean, false),
      is_meeting    = COALESCE((data->>'isMeeting')::boolean, false),
      date          = data->>'date',
      time          = data->>'time',
      instructor    = COALESCE(data->>'instructor', 'T.E.R.M. Mentor'),
      created_by    = data->>'createdBy',
      plan          = COALESCE(data->>'plan', 'all'),
      room_name     = data->>'roomName',
      room_url      = data->>'roomUrl',
      ended_at      = data->>'endedAt',
      tags          = COALESCE(data->'tags', '[]'),
      registrations = COALESCE(data->'registrations', '[]')
    WHERE data IS NOT NULL;

    ALTER TABLE live_sessions DROP COLUMN data;
  END IF;
END $$;

-- ── courses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT DEFAULT '',
  instructor    TEXT DEFAULT '',
  instructor_id TEXT,
  category      TEXT DEFAULT '',
  plan          TEXT NOT NULL DEFAULT 'all',
  price         DECIMAL DEFAULT 0,
  thumbnail     TEXT,
  published     BOOLEAN DEFAULT false,
  rating        DECIMAL DEFAULT 0,
  students      INT DEFAULT 0,
  tags          JSONB NOT NULL DEFAULT '[]',
  modules       JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='courses' AND column_name='data'
  ) THEN
    ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS title         TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description   TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS instructor    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS instructor_id TEXT,
      ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS plan          TEXT DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS price         DECIMAL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS thumbnail     TEXT,
      ADD COLUMN IF NOT EXISTS published     BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS rating        DECIMAL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS students      INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tags          JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS modules       JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();

    UPDATE courses SET
      title         = COALESCE(data->>'title', ''),
      description   = COALESCE(data->>'description', ''),
      instructor    = COALESCE(data->>'instructor', ''),
      instructor_id = data->>'instructorId',
      category      = COALESCE(data->>'category', ''),
      plan          = COALESCE(data->>'plan', 'all'),
      price         = COALESCE((data->>'price')::decimal, 0),
      thumbnail     = data->>'thumbnail',
      published     = COALESCE((data->>'published')::boolean, false),
      rating        = COALESCE((data->>'rating')::decimal, 0),
      students      = COALESCE((data->>'students')::int, 0),
      tags          = COALESCE(data->'tags', '[]'),
      modules       = COALESCE(data->'modules', '[]')
    WHERE data IS NOT NULL;

    ALTER TABLE courses DROP COLUMN data;
  END IF;
END $$;

-- ── categories ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  icon TEXT DEFAULT 'category'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='categories' AND column_name='data'
  ) THEN
    ALTER TABLE categories
      ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'category';

    UPDATE categories SET
      name = COALESCE(data->>'name', ''),
      icon = COALESCE(data->>'icon', 'category')
    WHERE data IS NOT NULL;

    ALTER TABLE categories DROP COLUMN data;
  END IF;
END $$;

-- ── assignments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  plan_key    TEXT NOT NULL DEFAULT 'all',
  due_date    TEXT,
  total_marks INT DEFAULT 100,
  created_by  TEXT DEFAULT 'T.E.R.M. Instructor',
  created_at  TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='assignments' AND column_name='data'
  ) THEN
    ALTER TABLE assignments
      ADD COLUMN IF NOT EXISTS title       TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS plan_key    TEXT DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS due_date    TEXT,
      ADD COLUMN IF NOT EXISTS total_marks INT DEFAULT 100,
      ADD COLUMN IF NOT EXISTS created_by  TEXT DEFAULT 'T.E.R.M. Instructor';

    UPDATE assignments SET
      title       = COALESCE(data->>'title', ''),
      description = COALESCE(data->>'description', ''),
      plan_key    = COALESCE(data->>'planKey', 'all'),
      due_date    = data->>'dueDate',
      total_marks = COALESCE((data->>'totalMarks')::int, 100),
      created_by  = COALESCE(data->>'createdBy', 'T.E.R.M. Instructor')
    WHERE data IS NOT NULL;

    ALTER TABLE assignments DROP COLUMN data;
  END IF;
END $$;

-- ── notifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  title      TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  type       TEXT DEFAULT 'info',
  active     BOOLEAN DEFAULT true,
  read_by    JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notifications' AND column_name='data'
  ) THEN
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS title   TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS type    TEXT DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS active  BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]';

    UPDATE notifications SET
      title   = COALESCE(data->>'title', ''),
      message = COALESCE(data->>'message', ''),
      type    = COALESCE(data->>'type', 'info'),
      active  = COALESCE((data->>'active')::boolean, true),
      read_by = COALESCE(data->'readBy', '[]')
    WHERE data IS NOT NULL;

    ALTER TABLE notifications DROP COLUMN data;
  END IF;
END $$;

-- ── materials ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  file_url     TEXT DEFAULT '',
  file_type    TEXT DEFAULT 'pdf',
  description  TEXT DEFAULT '',
  downloads    INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  plan_key     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='materials' AND column_name='data'
  ) THEN
    ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS title       TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS file_url    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS file_type   TEXT DEFAULT 'pdf',
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS downloads   INT DEFAULT 0;

    UPDATE materials SET
      title       = COALESCE(data->>'title', ''),
      file_url    = COALESCE(data->>'fileUrl', ''),
      file_type   = COALESCE(data->>'fileType', 'pdf'),
      description = COALESCE(data->>'description', ''),
      downloads   = COALESCE((data->>'downloads')::int, 0)
    WHERE data IS NOT NULL;

    ALTER TABLE materials DROP COLUMN data;
  END IF;
END $$;

-- ── tickets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  user_name  TEXT,
  user_email TEXT,
  subject    TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  status     TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tickets' AND column_name='data'
  ) THEN
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS user_id    TEXT,
      ADD COLUMN IF NOT EXISTS user_name  TEXT,
      ADD COLUMN IF NOT EXISTS user_email TEXT,
      ADD COLUMN IF NOT EXISTS subject    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS message    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

    UPDATE tickets SET
      user_id    = data->>'userId',
      user_name  = data->>'userName',
      user_email = data->>'userEmail',
      subject    = COALESCE(data->>'subject', ''),
      message    = COALESCE(data->>'message', ''),
      status     = COALESCE(data->>'status', 'open'),
      created_at = COALESCE((data->>'createdAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE tickets DROP COLUMN data;
  END IF;
END $$;

-- ── leads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  course_name TEXT,
  user_email  TEXT,
  user_name   TEXT,
  source      TEXT DEFAULT 'whatsapp_cta',
  timestamp   TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='data'
  ) THEN
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS course_name TEXT,
      ADD COLUMN IF NOT EXISTS user_email  TEXT,
      ADD COLUMN IF NOT EXISTS user_name   TEXT,
      ADD COLUMN IF NOT EXISTS source      TEXT DEFAULT 'whatsapp_cta',
      ADD COLUMN IF NOT EXISTS timestamp   TIMESTAMPTZ DEFAULT now();

    UPDATE leads SET
      course_name = data->>'courseName',
      user_email  = data->>'userEmail',
      user_name   = data->>'userName',
      source      = COALESCE(data->>'source', 'whatsapp_cta'),
      timestamp   = COALESCE((data->>'timestamp')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE leads DROP COLUMN data;
  END IF;
END $$;

-- ── submissions (assignment submissions) ──────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id    TEXT NOT NULL,
  status        TEXT DEFAULT 'submitted',
  file_url      TEXT,
  marks         DECIMAL,
  feedback      TEXT,
  submitted_at  TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='submissions' AND column_name='data'
  ) THEN
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS status      TEXT DEFAULT 'submitted',
      ADD COLUMN IF NOT EXISTS file_url    TEXT,
      ADD COLUMN IF NOT EXISTS marks       DECIMAL,
      ADD COLUMN IF NOT EXISTS feedback    TEXT,
      ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

    UPDATE submissions SET
      status    = COALESCE(data->>'status', 'submitted'),
      file_url  = data->>'fileUrl',
      marks     = CASE WHEN data->>'marks' IS NOT NULL THEN (data->>'marks')::decimal ELSE NULL END,
      feedback  = data->>'feedback',
      updated_at = COALESCE((data->>'updatedAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE submissions DROP COLUMN data;
  END IF;
END $$;

-- ── contacts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  subject    TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='contacts' AND column_name='data'
  ) THEN
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS name       TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS email      TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS subject    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS message    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

    UPDATE contacts SET
      name       = COALESCE(data->>'name', ''),
      email      = COALESCE(data->>'email', ''),
      subject    = COALESCE(data->>'subject', ''),
      message    = COALESCE(data->>'message', ''),
      created_at = COALESCE((data->>'createdAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE contacts DROP COLUMN data;
  END IF;
END $$;

-- ── coming_soon ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coming_soon (
  id          BIGINT PRIMARY KEY,
  title       TEXT DEFAULT '',
  description TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  icon        TEXT DEFAULT 'star',
  launch_date TEXT,
  launch_time TEXT,
  tags        JSONB NOT NULL DEFAULT '[]',
  visible     BOOLEAN DEFAULT true,
  color       TEXT DEFAULT 'violet',
  plan        TEXT DEFAULT 'all',
  created_at  TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='coming_soon' AND column_name='data'
  ) THEN
    ALTER TABLE coming_soon
      ADD COLUMN IF NOT EXISTS title       TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS category    TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS icon        TEXT DEFAULT 'star',
      ADD COLUMN IF NOT EXISTS launch_date TEXT,
      ADD COLUMN IF NOT EXISTS launch_time TEXT,
      ADD COLUMN IF NOT EXISTS tags        JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS visible     BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS color       TEXT DEFAULT 'violet',
      ADD COLUMN IF NOT EXISTS plan        TEXT DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();

    UPDATE coming_soon SET
      title       = COALESCE(data->>'title', ''),
      description = COALESCE(data->>'description', ''),
      category    = COALESCE(data->>'category', ''),
      icon        = COALESCE(data->>'icon', 'star'),
      launch_date = data->>'launchDate',
      launch_time = data->>'launchTime',
      tags        = COALESCE(data->'tags', '[]'),
      visible     = COALESCE((data->>'visible')::boolean, true),
      color       = COALESCE(data->>'color', 'violet'),
      plan        = COALESCE(data->>'plan', 'all'),
      created_at  = COALESCE((data->>'createdAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE coming_soon DROP COLUMN data;
  END IF;
END $$;

-- ── projects ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  title        TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  difficulty   TEXT DEFAULT 'beginner',
  tags         JSONB NOT NULL DEFAULT '[]',
  requirements JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='projects' AND column_name='data'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS title        TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description  TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS difficulty   TEXT DEFAULT 'beginner',
      ADD COLUMN IF NOT EXISTS tags         JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();

    UPDATE projects SET
      title        = COALESCE(data->>'title', ''),
      description  = COALESCE(data->>'description', ''),
      difficulty   = COALESCE(data->>'difficulty', 'beginner'),
      tags         = COALESCE(data->'tags', '[]'),
      requirements = COALESCE(data->'requirements', '[]'),
      created_at   = COALESCE((data->>'createdAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE projects DROP COLUMN data;
  END IF;
END $$;

-- ── project_submissions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS project_submissions (
  id           TEXT PRIMARY KEY,
  brief_id     TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  notes        TEXT DEFAULT '',
  file_url     TEXT,
  grade        TEXT,
  feedback     TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_submissions' AND column_name='data'
  ) THEN
    ALTER TABLE project_submissions
      ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS notes        TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS file_url     TEXT,
      ADD COLUMN IF NOT EXISTS grade        TEXT,
      ADD COLUMN IF NOT EXISTS feedback     TEXT,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

    UPDATE project_submissions SET
      status       = COALESCE(data->>'status', 'pending'),
      notes        = COALESCE(data->>'notes', ''),
      file_url     = data->>'fileUrl',
      grade        = data->>'grade',
      feedback     = data->>'feedback',
      submitted_at = COALESCE((data->>'submittedAt')::timestamptz, now()),
      updated_at   = COALESCE((data->>'updatedAt')::timestamptz, now())
    WHERE data IS NOT NULL;

    ALTER TABLE project_submissions DROP COLUMN data;
  END IF;
END $$;

-- ── teet_reports (keep data JSONB — complex nested structure) ─
CREATE TABLE IF NOT EXISTS teet_reports (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'in_progress',
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  score      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  data       JSONB
);

-- ── qa (keep data JSONB — flexible lesson Q&A structure) ──
CREATE TABLE IF NOT EXISTS qa (
  lesson_id TEXT PRIMARY KEY,
  data      JSONB
);

-- ── Ensure other standard tables exist ────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT UNIQUE,
  name             TEXT,
  role             TEXT DEFAULT 'student',
  avatar           TEXT,
  phone            TEXT,
  plan             TEXT DEFAULT 'none',
  plans            JSONB DEFAULT '[]',
  status           TEXT DEFAULT 'active',
  joined           TEXT,
  password         TEXT,
  enrolled_courses JSONB DEFAULT '[]',
  progress         JSONB DEFAULT '{}',
  meta             JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_store (
  key    TEXT PRIMARY KEY,
  otp    TEXT NOT NULL,
  expiry BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_signups (
  email  TEXT PRIMARY KEY,
  data   JSONB,
  expiry BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  course_id TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  stars     INT NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS plan_configs (
  key   TEXT PRIMARY KEY,
  value JSONB
);
