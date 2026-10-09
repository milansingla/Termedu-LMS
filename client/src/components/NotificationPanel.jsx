import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useProjects } from '../context/ProjectContext';
import { useLiveClass } from '../context/LiveClassContext';
import { getSeenIds, saveSeenIds, NOTIF_SEEN_EVENT } from '../utils/notifStorage';


function normPlan(p) { return (p || '').toLowerCase().replace(/[^a-z]/g, ''); }
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return d; }
}

function buildNotifs({ role, plan, announcements, briefs, submissions, sessions, userId }) {
  const notifs = [];
  const now = Date.now();
  const studentPlan = plan === 'none' ? 'starter' : plan;

  (announcements || [])
    .filter(a => {
      if (!a.active) return false;
      if (a.planKey === 'all') return true;
      if (role !== 'student') return true;
      return normPlan(a.planKey) === studentPlan;
    })
    .forEach(a => notifs.push({
      id: `ann_${a.id}`,
      icon: a.icon || 'campaign',
      color: 'text-violet-600 bg-violet-50',
      title: a.title,
      subtitle: a.badge ? `${a.badge} · Announcement` : 'Announcement',
      route: null,
    }));

  if (role === 'student') {
    const in7 = now + 7 * 24 * 60 * 60 * 1000;

    // Due-soon — only show if student hasn't submitted yet
    (briefs || [])
      .filter(b => {
        if (!b.dueDate) return false;
        const due = new Date(b.dueDate).getTime();
        if (!(due > now && due <= in7)) return false;
        const bp = b.plan || 'free';
        if (bp !== 'free' && normPlan(bp) !== plan) return false;
        // Hide if already submitted
        if (userId && (submissions || []).some(s => s.briefId === b.id && s.studentId === userId)) return false;
        return true;
      })
      .forEach(b => notifs.push({
        id: `due_${b.id}`,
        icon: 'assignment_late',
        color: 'text-orange-500 bg-orange-50',
        title: `Due soon: ${b.title}`,
        subtitle: `Deadline: ${fmtDate(b.dueDate)} — tap to view`,
        route: '/projects',
      }));

    // Graded submissions — only show if graded within the last 30 days to
    // prevent old notifications flooding back if seenIds is ever cleared.
    if (userId) {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      (submissions || [])
        .filter(s => {
          if (s.studentId !== userId || s.marks == null) return false;
          // Recency guard: only surface recent gradings
          const gradedTs = new Date(s.updatedAt || s.submittedAt || 0).getTime();
          return gradedTs >= thirtyDaysAgo;
        })
        .forEach(s => {
          const brief = (briefs || []).find(b => b.id === s.briefId);
          if (!brief) return;
          notifs.push({
            id: `graded_${s.briefId}`,
            icon: 'grade',
            color: 'text-emerald-600 bg-emerald-50',
            title: `Graded: ${brief.title}`,
            subtitle: `Score: ${s.marks}${brief.totalMarks ? `/${brief.totalMarks}` : ''} — tap to view`,
            route: `/projects?openBrief=${s.briefId}`,
          });
        });
    }

    // Live sessions (classes & workshops) — filter by plan
    (sessions || [])
      .filter(s => {
        if (s.status !== 'live') return false;
        if (s.isMeeting) return false; // meetings handled separately below
        if (s.isWorkshop) return true;
        const sp = normPlan(s.plan || 'all');
        if (sp === 'all' || sp === '') return true;
        return sp === plan;
      })
      .forEach(s => notifs.push({
        id: `live_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'live_tv',
        color: 'text-red-600 bg-red-50',
        title: `Live Now: ${s.title}`,
        subtitle: s.isWorkshop ? 'Free workshop in progress — tap to join' : 'Class in progress — tap to join',
        route: '/live',
      }));

    // Upcoming scheduled sessions in the next 24h — filter by plan
    const in24 = now + 24 * 60 * 60 * 1000;
    (sessions || [])
      .filter(s => {
        if (s.status !== 'upcoming') return false;
        if (s.isMeeting) return false;
        if (s.isWorkshop) return true;
        const sp = normPlan(s.plan || 'all');
        if (sp === 'all' || sp === '') return true;
        return sp === plan;
      })
      .filter(s => {
        const dt = new Date(`${s.date}T${s.time}`).getTime();
        return dt > now && dt <= in24;
      })
      .forEach(s => notifs.push({
        id: `up_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'event',
        color: 'text-blue-600 bg-blue-50',
        title: `Upcoming: ${s.title}`,
        subtitle: `Starts at ${s.time} — tap to view`,
        route: '/live',
      }));
  }

  if (role === 'lecturer') {
    const ungraded = (submissions || []).filter(s => s.marks === null);
    if (ungraded.length > 0) {
      notifs.push({
        id: `ungraded_${ungraded.length}`,
        icon: 'rate_review',
        color: 'text-orange-500 bg-orange-50',
        title: `${ungraded.length} submission${ungraded.length > 1 ? 's' : ''} awaiting review`,
        subtitle: 'Tap to open Projects',
        route: '/lecturer/projects',
      });
    }

    const in24 = now + 24 * 60 * 60 * 1000;
    (sessions || [])
      .filter(s => !s.isMeeting && s.status === 'upcoming')
      .forEach(s => {
        const dt = new Date(`${s.date}T${s.time}`).getTime();
        if (dt > now && dt <= in24) {
          notifs.push({
            id: `upcoming_${s.id}`,
            icon: 'event',
            color: 'text-primary bg-primary-fixed/40',
            title: s.title,
            subtitle: `Starts at ${s.time} · ${fmtDate(s.date)} — tap to manage`,
            route: '/lecturer/live',
          });
        }
      });

    (sessions || []).filter(s => !s.isMeeting && s.status === 'live').forEach(s => notifs.push({
      id: `live_${s.id}`,
      icon: 'live_tv',
      color: 'text-red-600 bg-red-50',
      title: `Active Class: ${s.title}`,
      subtitle: 'Your class is live — tap to return',
      route: '/lecturer/live',
    }));
  }

  if (role === 'admin') {
    const ungraded = (submissions || []).filter(s => s.marks === null);
    if (ungraded.length > 0) {
      notifs.push({
        id: `ungraded_${ungraded.length}`,
        icon: 'rate_review',
        color: 'text-orange-500 bg-orange-50',
        title: `${ungraded.length} ungraded submission${ungraded.length > 1 ? 's' : ''}`,
        subtitle: 'Needs instructor review',
        route: null,
      });
    }
    (sessions || []).filter(s => s.status === 'live').forEach(s => notifs.push({
      id: `live_${s.id}`,
      icon: s.isMeeting ? 'groups' : s.isWorkshop ? 'cast_for_education' : 'live_tv',
      color: 'text-red-600 bg-red-50',
      title: `${s.isMeeting ? 'Meeting' : s.isWorkshop ? 'Workshop' : 'Class'} Live: ${s.title}`,
      subtitle: 'In progress — tap to monitor',
      route: '/admin/live',
    }));
  }

  return notifs;
}

export function useNotifCount() {
  const { currentUser, announcements } = useApp();
  const { briefs, submissions } = useProjects();
  const { sessions } = useLiveClass();

  const [seenIds, setSeenIds] = useState(() => getSeenIds());

  useEffect(() => {
    const onStorage = () => setSeenIds(getSeenIds());
    window.addEventListener('storage', onStorage);
    window.addEventListener(NOTIF_SEEN_EVENT, onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(NOTIF_SEEN_EVENT, onStorage);
    };
  }, []);

  const role = currentUser?.role;
  const plan = normPlan(currentUser?.plan);
  const userId = currentUser?.id || currentUser?.email;
  const notifs = buildNotifs({ role, plan, announcements, briefs, submissions, sessions, userId });
  return notifs.filter(n => !seenIds.has(n.id)).length;
}

export default function NotificationPanel({ open, onClose }) {
  const { currentUser, announcements } = useApp();
  const { briefs, submissions } = useProjects();
  const { sessions } = useLiveClass();
  const navigate = useNavigate();
  const panelRef = useRef(null);

  // Snapshot the seen IDs at the moment the panel opens — BEFORE we mark anything
  // as seen. This means only genuinely new notifications are visible on this open.
  // On the next open, the IDs we save now will be in the snapshot, so they're hidden.
  // Initialized from localStorage so previously-seen notifications are hidden on first open.
  const seenSnapshotRef = useRef(getSeenIds());

  const role = currentUser?.role;
  const plan = normPlan(currentUser?.plan);
  const userId = currentUser?.id || currentUser?.email;
  const allNotifs = buildNotifs({ role, plan, announcements, briefs, submissions, sessions, userId });

  // Only show notifications not already seen
  const notifs = allNotifs.filter(n => !seenSnapshotRef.current.has(n.id));

  useEffect(() => {
    if (open) {
      // Snapshot BEFORE saving so this open still shows unseen ones
      seenSnapshotRef.current = getSeenIds();
      const ids = allNotifs.map(n => n.id);
      saveSeenIds(ids);
      window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOutsideClick = useCallback((e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, handleOutsideClick]);

  const handleItemClick = (route) => {
    if (route) { onClose(); navigate(route); }
  };

  if (!open) return null;

  return (
    <div ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/20 z-[300] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
          <h3 className="font-bold text-sm">Notifications</h3>
        </div>
        <div className="flex items-center gap-2">
          {notifs.length > 0 && (
            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
              {notifs.length} item{notifs.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-sm text-on-surface-variant">close</span>
          </button>
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto divide-y divide-outline-variant/10">
        {notifs.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center px-4">
            <span className="material-symbols-outlined text-5xl text-outline/40">notifications_none</span>
            <p className="text-sm font-semibold text-on-surface-variant">You're all caught up!</p>
            <p className="text-xs text-on-surface-variant/60">No active notifications</p>
          </div>
        ) : (
          notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleItemClick(n.route)}
              className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${n.route ? 'cursor-pointer hover:bg-surface-container-low active:bg-surface-container' : ''}`}
            >
              <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center ${n.color}`}>
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{n.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{n.title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{n.subtitle}</p>
              </div>
              {n.route && (
                <span className="material-symbols-outlined text-sm text-outline flex-shrink-0 mt-0.5">chevron_right</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
