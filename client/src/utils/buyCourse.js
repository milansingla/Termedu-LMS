const WHATSAPP_LINK = 'https://wa.link/wd50xe';

let _lastClickTime = 0;
const DEBOUNCE_MS = 3000;

export function buildWhatsAppUrl(_courseName) {
  return WHATSAPP_LINK;
}

export async function trackLead({ courseName, userEmail, userName }) {
  try {
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseName, userEmail, userName }),
    });
  } catch {
    console.warn('[buyCourse] Lead tracking failed (offline?)');
  }
}

export function buyCourse({ courseName, userEmail, userName, onOpen } = {}) {
  const now = Date.now();
  if (now - _lastClickTime < DEBOUNCE_MS) return false;
  _lastClickTime = now;

  trackLead({ courseName, userEmail, userName });
  const url = buildWhatsAppUrl(courseName);
  window.open(url, '_blank', 'noopener,noreferrer');
  if (onOpen) onOpen();
  return true;
}
