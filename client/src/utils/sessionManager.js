// ── Session Manager ────────────────────────────────────────────────────────────
// Four-tier session persistence — works for PC browsers AND Android WebView APK.
//
// Write order (all tiers written on every save):
//   1. IndexedDB         — most durable browser storage, survives tab close
//   2. localStorage      — fast sync reads on startup
//   3. cookie            — 365-day, survives some browser "clear on exit" policies
//   4. WebToApk bridge   — native Android SharedPreferences (APK only)
//
// Read order (async, first valid result wins):
//   1. localStorage 'lms_session_v2'  (our key, fast)
//   2. localStorage 'session'         (WebToApk injection key)
//   3. cookie       'lms_session'
//   4. IndexedDB                      (most durable, checked last because async)
//   5. WebToApk.getToken()            (APK native bridge)

const LS_KEY        = 'lms_session_v2';
const LS_BRIDGE_KEY = 'session';
const COOKIE_NAME   = 'lms_session';
const MAX_AGE       = 60 * 60 * 24 * 365; // 365 days in seconds
const IDB_DB        = 'lms_db';
const IDB_STORE     = 'session';
const IDB_KEY       = 'current';
const AUTH_TOKEN_KEY = 'lms_auth_token'; // raw server token for Android cookie restore

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCookie(name) {
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    window.WebToApk &&
    typeof window.WebToApk.saveToken === 'function'
  );
}

function isValid(obj) {
  return obj && typeof obj === 'object' && obj.id && obj.role;
}

function safeParse(raw) {
  if (!raw) return null;
  try { const p = JSON.parse(raw);                        if (isValid(p)) return p; } catch {}
  try { const p = JSON.parse(decodeURIComponent(raw));    if (isValid(p)) return p; } catch {}
  return null;
}

// ── IndexedDB helpers (async) ─────────────────────────────────────────────────

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess       = e => resolve(e.target.result);
    req.onerror         = e => reject(e.target.error);
  });
}

async function readIDB() {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = e => resolve(isValid(e.target.result) ? e.target.result : null);
      req.onerror   = ()  => resolve(null);
    });
  } catch { return null; }
}

async function writeIDB(user) {
  try {
    const db = await openIDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(user, IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  } catch {}
}

async function clearIDB() {
  try {
    const db = await openIDB();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
  } catch {}
}

// ── Persistent storage request (PC browsers) ──────────────────────────────────

function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save to every tier. Synchronous tiers run immediately; IndexedDB runs async
 * in the background. Call on login and on any session update.
 */
export function saveSession(user) {
  if (!isValid(user)) return;

  const raw     = JSON.stringify(user);
  const encoded = encodeURIComponent(raw);

  // IndexedDB (async, background)
  writeIDB(user);

  // localStorage — our key
  try { localStorage.setItem(LS_KEY, raw); } catch {}

  // 365-day cookie
  try {
    document.cookie =
      `${COOKIE_NAME}=${encoded};path=/;max-age=${MAX_AGE};SameSite=Lax`;
  } catch {}

  // WebToApk native bridge (APK only)
  try { if (hasBridge()) window.WebToApk.saveToken(encoded); } catch {}

  // Ask browser to never auto-evict this site's storage
  requestPersistentStorage();
}

/**
 * Async session load — checks all tiers in order.
 * Use this on app startup (in a useEffect) instead of loadSession().
 * Automatically syncs the found session back to all tiers.
 */
export async function loadSessionAsync() {
  let user = null;

  // 1 — localStorage (our key)
  if (!user) try { user = safeParse(localStorage.getItem(LS_KEY)); } catch {}

  // 2 — localStorage (WebToApk injection key)
  if (!user) try { user = safeParse(localStorage.getItem(LS_BRIDGE_KEY)); } catch {}

  // 3 — cookie
  if (!user) try { user = safeParse(getCookie(COOKIE_NAME)); } catch {}

  // 4 — IndexedDB (most durable, async)
  if (!user) user = await readIDB();

  // 5 — WebToApk native getToken (APK only)
  if (!user && hasBridge() && typeof window.WebToApk.getToken === 'function') {
    try { user = safeParse(window.WebToApk.getToken()); } catch {}
  }

  // Sync the found session back to all tiers
  if (user) saveSession(user);

  return user || null;
}

/**
 * Synchronous read (localStorage + cookie only). Used as the initial
 * useState value so the first render already has a user if possible.
 */
export function loadSession() {
  let user = null;
  if (!user) try { user = safeParse(localStorage.getItem(LS_KEY)); } catch {}
  if (!user) try { user = safeParse(localStorage.getItem(LS_BRIDGE_KEY)); } catch {}
  if (!user) try { user = safeParse(getCookie(COOKIE_NAME)); } catch {}
  return user || null;
}

/**
 * Wipe session from every tier. Call on explicit logout only.
 */
export async function clearSession() {
  try { if (hasBridge()) window.WebToApk.saveToken(''); } catch {}
  try { localStorage.removeItem(LS_KEY); } catch {}
  try { localStorage.removeItem(LS_BRIDGE_KEY); } catch {}
  try { document.cookie = `${COOKIE_NAME}=;path=/;max-age=0;SameSite=Lax`; } catch {}
  clearAuthToken();
  await clearIDB();
}

// ── Auth token helpers (for Android cookie restore) ───────────────────────────

/**
 * Save the raw server auth token to localStorage.
 * Called on every successful login so it survives WebView cookie loss.
 */
export function saveAuthToken(token) {
  if (!token || typeof token !== 'string') return;
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch {}
}

/**
 * Read the stored auth token from localStorage.
 */
export function loadAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || null; } catch { return null; }
}

/**
 * Remove the stored auth token. Called on logout and on failed restore.
 */
export function clearAuthToken() {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {}
}
