const SEEN_KEY = 'lms_notif_seen_ids';
const TS_KEY   = 'lms_notif_last_seen';

export const NOTIF_SEEN_EVENT = 'lms-notif-seen';

export function getSeenIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}

export function saveSeenIds(ids) {
  try {
    const existing = getSeenIds();
    ids.forEach(id => existing.add(id));
    // Prune if the list has grown very large (>500 entries) to prevent localStorage bloat.
    let arr = [...existing];
    if (arr.length > 500) arr = arr.slice(-400);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    localStorage.setItem(TS_KEY, String(Date.now()));
  } catch {}
}
