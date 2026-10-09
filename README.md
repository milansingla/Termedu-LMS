# T.E.R.M. Edu — Learning Management System

> **Stop Studying. Start Building.** — A full-stack entrepreneurship LMS with live classes, self-paced courses, an AI-powered entrance exam, projects and mentorship.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)

This repository contains the web platform (client + API) that powers [termedu.in](https://termedu.in). The companion mobile app lives in [Termedu-Android-App](https://github.com/milansingla/Termedu-Android-App).

---

## Features

### Students
- Course catalogue, course detail pages and a video player with progress tracking
- Live classes via Daily.co with in-call controls
- **TEET** — AI-assisted entrance examination with automated reports (Google Gemini)
- Assignments, project submissions and downloadable materials
- Support chat with push notifications (Firebase Cloud Messaging)
- Plans & pricing, OTP-based sign-up and login

### Lecturers
- Dedicated dashboard for courses, materials and students
- Schedule and host live sessions, review projects, answer support tickets

### Administrators
- Manage users, courses, categories, plans, projects and materials
- Bulk user import from Excel
- TEET results and reports, "coming soon" content, live session control
- Runtime settings panel for third-party keys (Daily.co, Gemini, SMTP, Firebase) — no redeploy needed

### Platform
- Role-based access (student / lecturer / admin) with session management
- Security hardening with Helmet, rate limiting and bcrypt password hashing
- Offline banner, error boundaries, skeleton loaders and code-split routes
- SEO-ready: sitemaps, Open Graph metadata, `robots.txt` and `llms.txt`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS 4 |
| Backend | Node.js 20, Express 4 |
| Database | Supabase (PostgreSQL) |
| Live video | Daily.co |
| AI | Google Gemini |
| Notifications | Firebase Cloud Messaging, Nodemailer (SMTP) |
| Deployment | PM2, Nginx, Let's Encrypt |

---

## Architecture

```
┌──────────────────────┐        ┌──────────────────────────┐
│  React SPA (client)  │  /api  │  Express API (server)    │
│  Vite build ─────────┼───────▶│  serves API + static SPA │
└──────────────────────┘        └────────────┬─────────────┘
                                             │
              ┌──────────────┬───────────────┼──────────────┬─────────────┐
              ▼              ▼               ▼              ▼             ▼
          Supabase       Daily.co        Gemini AI        Firebase       SMTP
         (Postgres)    (live video)     (TEET, chat)       (FCM)        (email)
```

In production the client is built into `server/public` and served by Express, so a single Node process handles everything behind Nginx.

---

## Project Structure

```
Termedu-LMS/
├── client/                  # React single-page application
│   ├── public/              # Static assets, sitemaps, manifest
│   └── src/
│       ├── pages/
│       │   ├── student/     # Student-facing screens
│       │   ├── lecturer/    # Lecturer dashboard
│       │   └── admin/       # Admin console
│       ├── components/      # Shared UI components
│       ├── context/         # React context providers (state)
│       ├── services/        # External service clients (Daily.co)
│       ├── lib/ utils/ hooks/
│       └── App.jsx          # Routes
├── server/                  # Express API
│   ├── index.js             # API routes, auth, integrations
│   ├── supabase.js          # Supabase client
│   ├── db.js                # Direct Postgres pool
│   ├── migrate.js           # One-off data seeding script
│   └── database/            # SQL schema & migrations
├── deploy/                  # Nginx & VPS config templates
├── docs/                    # Deployment guide
└── .github/workflows/       # CI
```

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/milansingla/Termedu-LMS.git
cd Termedu-LMS
npm install            # installs client and server dependencies
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in at least `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `server/.env`.

### 3. Set up the database

Run [`server/database/schema.sql`](server/database/schema.sql) in the Supabase SQL editor.

### 4. Run in development

```bash
npm run dev:server     # API on http://localhost:8080
npm run dev:client     # App on http://localhost:5000 (proxies /api to the server)
```

### 5. Production build

```bash
npm run build          # builds the client into server/public
npm start              # serves API + client on PORT (default 8080)
```

For full VM deployment with PM2, Nginx and HTTPS, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key (server only) |
| `PORT` | | API port (default `8080`) |
| `ALLOWED_ORIGIN` | | Allowed CORS origin(s) |
| `DATABASE_URL` | | Direct Postgres URI (used for FCM tokens) |
| `FIREBASE_SERVICE_ACCOUNT` | | Firebase service account JSON |
| `GEMINI_API_KEY`, `DAILY_API_KEY`, `DAILY_DOMAIN`, `SMTP_*` | | Integrations — usually managed from **Admin → Settings** |

See [`server/.env.example`](server/.env.example) for the full list.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev:client` | Start the Vite dev server |
| `npm run dev:server` | Start the API with file watching |
| `npm run build` | Build the client into `server/public` |
| `npm start` | Start the production server |
| `npm run lint` | Lint the client |
| `npm run db:migrate` | Seed Supabase from legacy JSON data |

---

## Security

Production credentials are stored separately in a private location and are not part of this repository.

Secrets are never committed. Keep `.env` files and Firebase service-account JSON out of version control (already covered by `.gitignore`), and never expose the Supabase `service_role` key to the browser.

---

## Author

**Milan Singla** — [@milansingla](https://github.com/milansingla)

© T.E.R.M. Edu. All rights reserved.
