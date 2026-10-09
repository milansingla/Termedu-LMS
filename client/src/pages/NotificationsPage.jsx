import { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useProjects } from '../context/ProjectContext';
import { useLiveClass } from '../context/LiveClassContext';
import { saveSeenIds, NOTIF_SEEN_EVENT } from '../utils/notifStorage';
import BottomNav from '../components/BottomNav';

const LS_SEEN_KEY  = 'lms_notif_last_seen';
const LS_NOTIF_KEY = 'lms_notif_seen_ids';

function filterExpired(notifs) {
  const now = Date.now();
  return (notifs || []).filter(n => !n.expiresAt || new Date(n.expiresAt).getTime() > now);
}

function getLastSeen() {
  try { return Number(localStorage.getItem(LS_SEEN_KEY)) || 0; } catch { return 0; }
}
function markSeen() {
  try { localStorage.setItem(LS_SEEN_KEY, String(Date.now())); } catch {}
}
function getSeenIdsSnapshot() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_NOTIF_KEY) || '[]')); } catch { return new Set(); }
}

function normPlan(p) { return (p || '').toLowerCase().replace(/[^a-z]/g, ''); }
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}
function fmtTime(t) {
  try {
    const [h, m] = t.split(':');
    const d = new Date(); d.setHours(+h, +m);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return t; }
}

function Section({ title, icon, color, items, emptyMsg }) {
  if (items.length === 0 && !emptyMsg) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={`material-symbols-outlined text-base ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{title}</h2>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="material-symbols-outlined text-outline/40 text-lg">check_circle</span>
            <p className="text-sm text-on-surface-variant">{emptyMsg}</p>
          </div>
        ) : (
          items.map((item, i) => (
            <NotifItem key={item.id} item={item} last={i === items.length - 1} />
          ))
        )}
      </div>
    </div>
  );
}

function NotifItem({ item, last }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => item.route && navigate(item.route)}
      disabled={!item.route}
      className={`w-full flex items-start gap-4 px-5 py-4 text-left transition-colors ${!last ? 'border-b border-outline-variant/10' : ''} ${item.route ? 'hover:bg-surface-container-low active:bg-surface-container' : 'cursor-default'}`}
    >
      <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${item.iconBg}`}>
        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm leading-snug">{item.title}</p>
          {item.isNew && (
            <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">NEW</span>
          )}
          {item.badge && (
            <span className="bg-primary/10 text-primary text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none uppercase">{item.badge}</span>
          )}
        </div>
        {item.body && <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed line-clamp-3">{item.body}</p>}
        {item.meta && <p className="text-[11px] text-on-surface-variant/60 mt-1 font-medium">{item.meta}</p>}
      </div>
      {item.route && (
        <span className="material-symbols-outlined text-sm text-outline flex-shrink-0 mt-1">chevron_right</span>
      )}
    </button>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { currentUser, announcements } = useApp();
  const { briefs: assignments, submissions } = useProjects();
  const { sessions } = useLiveClass();

  const role = currentUser?.role;
  const plan = normPlan(currentUser?.plan);
  const userId = currentUser?.id || currentUser?.email;
  const now = Date.now();
  const lastSeen = useMemo(() => getLastSeen(), []);

  // Snapshot seen IDs ONCE on mount, before this visit's saveSeenIds calls.
  // Graded notifications already in this snapshot are filtered out of the list —
  // they've been seen in a prior session and should not reappear after re-login.
  const seenSnapshot = useRef(getSeenIdsSnapshot());

  useEffect(() => { markSeen(); }, []);

  const liveRoute  = role === 'student' ? '/live' : role === 'lecturer' ? '/lecturer/live' : '/admin/live';
  const assignRoute = role === 'student' ? '/projects' : role === 'lecturer' ? '/lecturer/projects' : null;

  const adminNotifs = filterExpired(announcements)
    .filter(a => {
      if (!a.active) return false;
      if (a.planKey === 'all') return true;
      if (role !== 'student') return true;
      return normPlan(a.planKey) === plan;
    })
    .map(a => ({
      id: `ann_${a.id}`,
      icon: a.icon || 'campaign',
      iconBg: a.type === 'lecturer' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600',
      title: a.title,
      body: a.subtitle || a.message || null,
      badge: a.badge || null,
      meta: a.createdBy ? `From ${a.createdBy}` : (a.type === 'lecturer' ? 'Lecturer Notification' : 'Admin Notification'),
      route: null,
      isNew: a.createdAt ? new Date(a.createdAt).getTime() > lastSeen : false,
    }));

  const autoNotifs = [];

  if (role === 'student') {
    const in7 = now + 7 * 24 * 60 * 60 * 1000;

    // Due-soon — exclude already-submitted briefs
    (assignments || [])
      .filter(a => {
        if (!a.dueDate) return false;
        const due = new Date(a.dueDate).getTime();
        if (!(due > now && due <= in7)) return false;
        const bp = a.plan || 'free';
        if (bp !== 'free' && normPlan(bp) !== plan) return false;
        // Hide if already submitted
        if (userId && (submissions || []).some(s => s.briefId === a.id && s.studentId === userId)) return false;
        return true;
      })
      .forEach(a => autoNotifs.push({
        id: `due_${a.id}`,
        icon: 'assignment_late',
        iconBg: 'bg-orange-50 text-orange-500',
        title: `Due soon: ${a.title}`,
        body: a.description || null,
        meta: `Deadline: ${fmtDate(a.dueDate)}${a.totalMarks ? ` · ${a.totalMarks} marks` : ''}`,
        route: assignRoute,
      }));

    // Graded submissions — only show ones that aren't already seen AND graded within 30 days
    if (userId) {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      (submissions || [])
        .filter(s => {
          if (s.studentId !== userId || s.marks == null) return false;
          if (seenSnapshot.current.has(`graded_${s.briefId}`)) return false;
          const gradedTs = new Date(s.updatedAt || s.submittedAt || 0).getTime();
          return gradedTs >= thirtyDaysAgo;
        })
        .forEach(s => {
          const brief = (assignments || []).find(b => b.id === s.briefId);
          if (!brief) return;
          autoNotifs.push({
            id: `graded_${s.briefId}`,
            icon: 'grade',
            iconBg: 'bg-emerald-50 text-emerald-600',
            title: `Graded: ${brief.title}`,
            body: s.feedback || null,
            meta: `Score: ${s.marks}${brief.totalMarks ? `/${brief.totalMarks}` : ''} — tap to view your result`,
            route: `/projects?openBrief=${s.briefId}`,
            isNew: s.gradedAt ? new Date(s.gradedAt).getTime() > lastSeen : false,
          });
        });
    }

    // Live sessions — exclude meetings, filter by student plan
    (sessions || [])
      .filter(s => {
        if (s.status !== 'live') return false;
        if (s.isMeeting) return false; // professional meetings hidden from students
        if (s.isWorkshop) return true; // free workshops for all students
        const sp = normPlan(s.plan || 'all');
        if (sp === 'all' || sp === '') return true;
        return sp === plan;
      })
      .forEach(s => autoNotifs.push({
        id: `live_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'live_tv',
        iconBg: 'bg-red-50 text-red-600',
        title: `Live Now: ${s.title}`,
        body: `Hosted by ${s.instructor || 'Instructor'}`,
        meta: s.isWorkshop ? 'Free workshop — join now' : 'Class is currently in progress — join now',
        route: liveRoute,
      }));

    // Upcoming sessions in next 24h — exclude meetings, filter by plan
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
        return dt > now && dt <= now + 24 * 60 * 60 * 1000;
      })
      .forEach(s => autoNotifs.push({
        id: `up_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'event',
        iconBg: 'bg-blue-50 text-blue-600',
        title: `Upcoming: ${s.title}`,
        body: `Hosted by ${s.instructor || 'Instructor'}`,
        meta: `Today at ${fmtTime(s.time)}${s.isWorkshop ? ' · Free Workshop' : ''}`,
        route: liveRoute,
      }));
  }

  const lecturerNotifs = [];

  if (role === 'lecturer' || role === 'admin') {
    const ungraded = (submissions || []).filter(s => s.marks === null);
    if (ungraded.length > 0) {
      lecturerNotifs.push({
        id: 'ungraded',
        icon: 'rate_review',
        iconBg: 'bg-orange-50 text-orange-500',
        title: `${ungraded.length} submission${ungraded.length > 1 ? 's' : ''} awaiting review`,
        body: ungraded.slice(0, 2).map(s => s.studentName).join(', ') + (ungraded.length > 2 ? ` +${ungraded.length - 2} more` : ''),
        meta: 'Tap to open grading panel',
        route: role === 'lecturer' ? '/lecturer/students' : null,
      });
    }

    const in24 = now + 24 * 60 * 60 * 1000;
    (sessions || [])
      .filter(s => {
        if (s.isMeeting) return false;
        if (s.status !== 'upcoming') return false;
        const dt = new Date(`${s.date}T${s.time}`).getTime();
        return dt > now && dt <= in24;
      })
      .forEach(s => lecturerNotifs.push({
        id: `up_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'event',
        iconBg: 'bg-blue-50 text-blue-600',
        title: s.title,
        body: s.isWorkshop ? 'Free workshop starting soon' : 'Scheduled class starting soon',
        meta: `${fmtDate(s.date)} at ${fmtTime(s.time)}`,
        route: liveRoute,
      }));

    (sessions || [])
      .filter(s => !s.isMeeting && s.status === 'live')
      .forEach(s => lecturerNotifs.push({
        id: `live_${s.id}`,
        icon: s.isWorkshop ? 'cast_for_education' : 'live_tv',
        iconBg: 'bg-red-50 text-red-600',
        title: `${s.isWorkshop ? 'Workshop' : 'Class'} Live: ${s.title}`,
        body: `Hosted by ${s.instructor || 'You'}`,
        meta: 'Currently live — tap to return',
        route: liveRoute,
      }));
  }

  const totalCount = adminNotifs.length + autoNotifs.length + lecturerNotifs.length;

  // Keep a ref that always holds the CURRENT list of visible notification IDs.
  // This avoids stale-closure problems in async effects.
  const visibleIdsRef = useRef([]);
  visibleIdsRef.current = [...adminNotifs, ...autoNotifs, ...lecturerNotifs].map(n => n.id);

  // Save IDs immediately whenever data arrives (handles fast back-taps).
  useEffect(() => {
    if (visibleIdsRef.current.length === 0) return;
    saveSeenIds(visibleIdsRef.current);
    window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
  }, [totalCount]);

  // ALSO save on unmount — this is the guaranteed fallback.
  // When the user taps back, cleanup runs before the component is removed,
  // so the badge is cleared even if data arrived just before they navigated away.
  useEffect(() => {
    return () => {
      if (visibleIdsRef.current.length > 0) {
        saveSeenIds(visibleIdsRef.current);
        window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
      }
    };
  }, []);

  return (
    <>
    <BottomNav />
    <div className="bg-background min-h-screen text-on-surface md:ml-64 pb-24 md:pb-0">
      <header className="sticky top-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/10 px-5 py-4 flex items-center gap-4 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-extrabold text-lg font-headline leading-tight">Notifications</h1>
          <p className="text-xs text-on-surface-variant">{totalCount === 0 ? 'All caught up' : `${totalCount} active alert${totalCount !== 1 ? 's' : ''}`}</p>
        </div>
        {totalCount > 0 && (
          <span className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
            {totalCount}
          </span>
        )}
      </header>

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-surface-container-low flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-outline/40">notifications_none</span>
          </div>
          <div>
            <p className="text-lg font-bold font-headline">You're all caught up!</p>
            <p className="text-sm text-on-surface-variant mt-1">No active notifications right now. Check back later.</p>
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 max-w-2xl mx-auto space-y-6 pb-24">

          {adminNotifs.length > 0 && (
            <Section
              title={role === 'student' ? 'From Admin & Lecturers' : 'Sent Notifications'}
              icon="admin_panel_settings"
              color="text-violet-600"
              items={adminNotifs}
              emptyMsg={null}
            />
          )}

          {autoNotifs.length > 0 && (
            <Section
              title="Automated Alerts"
              icon="smart_toy"
              color="text-blue-600"
              items={autoNotifs}
              emptyMsg={null}
            />
          )}

          {lecturerNotifs.length > 0 && (
            <Section
              title={role === 'admin' ? 'System Alerts' : 'Teaching Alerts'}
              icon="school"
              color="text-orange-500"
              items={lecturerNotifs}
              emptyMsg={null}
            />
          )}

        </div>
      )}
    </div>
    </>
  );
}
