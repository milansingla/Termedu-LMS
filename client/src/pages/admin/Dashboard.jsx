import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { SkeletonAdminCard, SkeletonTableRow } from '../../components/Skeleton';
import SendNotifModal from '../../components/SendNotifModal';

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function escapeCell(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows) {
  return rows.map(r => r.map(escapeCell).join(',')).join('\n');
}
function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PLAN_OPTS = [
  { value: 'starter', label: 'Starter Plan' },
  { value: 'growth',  label: 'Growth Plan'  },
  { value: 'premium', label: 'Premium Plan' },
  { value: 'all',     label: 'All Plans'    },
];
const ICON_OPTS = ['rocket_launch','school','live_tv','star','bolt','celebration','groups','workspace_premium','emoji_events','local_fire_department'];
const ANN_GRADIENT = {
  starter: 'from-slate-700 to-slate-500',
  growth:  'from-violet-700 to-purple-500',
  premium: 'from-pink-700 to-rose-500',
  all:     'from-indigo-700 to-blue-500',
};

function compressImage(file, maxW = 800, maxH = 450, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxW) { height = (height * maxW) / width; width = maxW; }
        if (height > maxH) { width = (width * maxH) / height; height = maxH; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const BLANK_FORM = { planKey: 'growth', badge: 'NEW BATCH', title: '', subtitle: '', startDate: '', ctaLabel: 'Register Now', ctaLink: '', icon: 'rocket_launch', thumbnail: null, size: 'medium' };

// ─── helpers ─────────────────────────────────────────────────────────────────
function normalizePlan(plan) {
  return (plan || '').toLowerCase().replace(/[^a-z]/g, '');
}

function computeMonthlyRevenue(users, planConfigs) {
  return users.reduce((sum, u) => {
    const config = planConfigs[normalizePlan(u.plan)];
    return sum + (config?.priceNum || 0);
  }, 0);
}

/** Parse user.joined which can be "2025-01-04" or "4 Jan, 2025" or "4 Jan 2025" */
function parseJoinedDate(joined) {
  if (!joined) return null;
  const s = String(joined).trim();
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  // "4 Jan 2025" or "4 Jan, 2025"
  const d = new Date(s.replace(',', ''));
  return isNaN(d.getTime()) ? null : d;
}

/** Build last-7-days revenue from actual user join dates */
function buildWeeklyRevenue(users, planConfigs) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { date: d, label: SHORT_DAYS[d.getDay()], revenue: 0, isToday: i === 6 };
  });

  users.forEach(u => {
    const d = parseJoinedDate(u.joined);
    if (!d) return;
    const price = planConfigs[normalizePlan(u.plan)]?.priceNum || 0;
    if (!price) return;
    days.forEach(day => {
      const start = new Date(day.date); start.setHours(0, 0, 0, 0);
      const end   = new Date(day.date); end.setHours(23, 59, 59, 999);
      if (d >= start && d <= end) day.revenue += price;
    });
  });

  const max = Math.max(...days.map(d => d.revenue), 1);
  return days.map(d => ({ ...d, pct: Math.max(Math.round((d.revenue / max) * 85), d.revenue > 0 ? 8 : 4) }));
}

function fmtRevenue(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000)   return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000)     return `₹${(val / 1000).toFixed(1)}k`;
  return `₹${val}`;
}

const PLAN_COLOR = {
  starter: 'bg-slate-50 text-slate-600',
  growth:  'bg-purple-50 text-purple-700',
  premium: 'bg-pink-50 text-pink-700',
  none:    'bg-surface-container text-on-surface-variant',
};

// ─── SVG Revenue Chart ────────────────────────────────────────────────────────
function RevenueChart({ data, fmtRevenue }) {
  const [hovered, setHovered] = useState(null);
  const svgRef = useRef(null);

  const W = 560, H = 140;
  const padL = 52, padR = 16, padT = 18, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const yTicks = [0, Math.round(maxRev / 2), maxRev];

  const pts = data.map((d, i) => ({
    x: padL + (i / (data.length - 1)) * chartW,
    y: padT + chartH - (d.revenue / maxRev) * chartH,
    ...d,
  }));

  // Smooth bezier curve path
  function smoothPath(points) {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cp1x = points[i].x + (points[i + 1].x - points[i].x) * 0.4;
      const cp1y = points[i].y;
      const cp2x = points[i].x + (points[i + 1].x - points[i].x) * 0.6;
      const cp2y = points[i + 1].y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }
    return d;
  }

  const linePath = smoothPath(pts);
  const areaPath = linePath
    + ` L ${pts[pts.length - 1].x} ${padT + chartH}`
    + ` L ${pts[0].x} ${padT + chartH} Z`;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = padT + chartH - (tick / maxRev) * chartH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4 3" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end"
                fontSize="9" fill="currentColor" opacity="0.45" fontFamily="Inter,sans-serif">
                {tick === 0 ? '₹0' : fmtRevenue(tick)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#revenueGrad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#7c3aed" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Vertical hover line */}
        {hovered !== null && (
          <line
            x1={pts[hovered].x} y1={padT}
            x2={pts[hovered].x} y2={padT + chartH}
            stroke="#7c3aed" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 2"
          />
        )}

        {/* Dots + hit areas + X labels */}
        {pts.map((p, i) => (
          <g key={i}>
            {/* X-axis label */}
            <text
              x={p.x} y={H - 4} textAnchor="middle"
              fontSize="9.5" fontFamily="Inter,sans-serif" fontWeight={p.isToday ? '700' : '500'}
              fill="currentColor" opacity={p.isToday ? 0.85 : 0.45}
            >
              {p.label}
            </text>

            {/* Dot */}
            {p.revenue > 0 && (
              <>
                <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : 3.5}
                  fill={p.isToday ? '#7c3aed' : '#a78bfa'}
                  stroke="white" strokeWidth="2"
                  style={{ transition: 'r 0.15s' }}
                />
              </>
            )}

            {/* Today marker dot (even if 0) */}
            {p.isToday && p.revenue === 0 && (
              <circle cx={p.x} cy={p.y} r={3.5}
                fill="#7c3aed" stroke="white" strokeWidth="2" opacity="0.5" />
            )}

            {/* Invisible hit area */}
            <rect
              x={p.x - (chartW / (data.length - 1)) / 2}
              y={padT} width={chartW / (data.length - 1)} height={chartH + padB}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}
            />
          </g>
        ))}
      </svg>

      {/* Floating tooltip */}
      {hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl shadow-xl whitespace-nowrap"
          style={{
            left: `${(pts[hovered].x / W) * 100}%`,
            top: `${((pts[hovered].y - 10) / H) * 100}%`,
          }}
        >
          <span className="text-violet-300">{pts[hovered].label}</span>
          &nbsp;·&nbsp;
          {pts[hovered].revenue > 0 ? fmtRevenue(pts[hovered].revenue) : 'No signups'}
        </div>
      )}
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout, announcements, addAnnouncement, updateAnnouncement, removeAnnouncement, toggleAnnouncement, appUsers, planConfigs, dataReady } = useApp();
  const { courses: ctxCourses, totalLessons, coursesLoading } = useCourses();
  const { sessions, sessionsLoading } = useLiveClass();

  const isLoading = !dataReady || coursesLoading || sessionsLoading;

  // ── Real metrics ────────────────────────────────────────────────────────────
  const students     = appUsers.filter(u => u.role === 'student');
  const activeUsers  = appUsers.filter(u => u.status === 'active');
  const monthlyRev   = computeMonthlyRevenue(appUsers, planConfigs);
  const weeklyData   = buildWeeklyRevenue(appUsers, planConfigs);
  const activeCourses = ctxCourses.filter(c => totalLessons(c) > 0 || c.isPlanProgram);
  const liveSessions  = sessions.length;

  // Recent users — real, sorted newest first (show up to 5)
  const recentUsers = [...appUsers]
    .reverse()
    .slice(0, 5);

  // Top courses — plan programs first, then others by lesson count
  const topCourses = [
    ...ctxCourses.filter(c => c.isPlanProgram && totalLessons(c) > 0),
    ...ctxCourses.filter(c => !c.isPlanProgram && totalLessons(c) > 0),
  ].slice(0, 5);

  // ── Export state ────────────────────────────────────────────────────────────
  const [exportModal, setExportModal]   = useState(false);
  const [exportDone, setExportDone]     = useState('');
  const [notifModal, setNotifModal]     = useState(false);

  const today = () => new Date().toISOString().split('T')[0];

  const exportStudents = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Role', 'Plans', 'Status', 'Joined'],
      ...appUsers.map(u => [
        u.name, u.email, u.phone || '', u.role,
        (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).join('+') || 'none',
        u.status || 'active', u.joined || '',
      ]),
    ];
    downloadCSV(toCSV(rows), `students_${today()}.csv`);
    setExportDone('students');
    setTimeout(() => setExportDone(''), 2500);
  };

  const exportRevenue = () => {
    const planKeys = ['starter', 'growth', 'premium'];
    const summary = planKeys.map(k => {
      const count = appUsers.filter(u => (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).includes(k)).length;
      const price = planConfigs[k]?.priceNum || 0;
      return [k.toUpperCase(), String(count), `₹${price}`, `₹${count * price}`];
    });
    const total = planKeys.reduce((s, k) => {
      const count = appUsers.filter(u => (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).includes(k)).length;
      return s + count * (planConfigs[k]?.priceNum || 0);
    }, 0);
    const rows = [
      [`T.E.R.M. Edu — Revenue Report (${today()})`],
      [],
      ['Plan', 'Students', 'Price Per Seat', 'Total'],
      ...summary,
      [],
      ['TOTAL MONTHLY REVENUE', '', '', `₹${total}`],
    ];
    downloadCSV(toCSV(rows), `revenue_${today()}.csv`);
    setExportDone('revenue');
    setTimeout(() => setExportDone(''), 2500);
  };

  const exportCourses = () => {
    const rows = [
      ['Course Title', 'Plan', 'Lessons', 'Type', 'ID'],
      ...ctxCourses.map(c => [
        c.title, c.planKey || 'none',
        String(totalLessons(c)),
        c.isPlanProgram ? 'Plan Program' : 'Course',
        String(c.id),
      ]),
    ];
    downloadCSV(toCSV(rows), `courses_${today()}.csv`);
    setExportDone('courses');
    setTimeout(() => setExportDone(''), 2500);
  };

  const exportFull = () => {
    const planKeys = ['starter', 'growth', 'premium'];
    const rows = [
      [`T.E.R.M. Edu — Full Admin Report (${today()})`],
      [],
      ['=== USERS ==='],
      ['Name', 'Email', 'Phone', 'Role', 'Plans', 'Status', 'Joined'],
      ...appUsers.map(u => [
        u.name, u.email, u.phone || '', u.role,
        (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).join('+') || 'none',
        u.status || 'active', u.joined || '',
      ]),
      [],
      ['=== REVENUE ==='],
      ['Plan', 'Students', 'Price Per Seat', 'Total'],
      ...planKeys.map(k => {
        const count = appUsers.filter(u => (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).includes(k)).length;
        const price = planConfigs[k]?.priceNum || 0;
        return [k.toUpperCase(), String(count), `₹${price}`, `₹${count * price}`];
      }),
      ['TOTAL', '', '', `₹${planKeys.reduce((s, k) => { const c = appUsers.filter(u => (Array.isArray(u.plans) ? u.plans : u.plan ? [u.plan] : []).includes(k)).length; return s + c * (planConfigs[k]?.priceNum || 0); }, 0)}`],
      [],
      ['=== COURSES ==='],
      ['Course Title', 'Plan', 'Lessons', 'Type'],
      ...ctxCourses.map(c => [c.title, c.planKey || 'none', String(totalLessons(c)), c.isPlanProgram ? 'Plan Program' : 'Course']),
    ];
    downloadCSV(toCSV(rows), `full_report_${today()}.csv`);
    setExportDone('full');
    setTimeout(() => setExportDone(''), 2500);
  };

  // ── Announcement state ──────────────────────────────────────────────────────
  const [annModal, setAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState(null);
  const [annForm, setAnnForm] = useState(BLANK_FORM);
  const [deleteAnn, setDeleteAnn] = useState(null);
  const [annSaved, setAnnSaved] = useState(false);
  const [carouselMs, setCarouselMs] = useState(() => {
    try { return parseInt(localStorage.getItem('lms_carousel_ms') || '4500', 10); } catch { return 4500; }
  });
  const setCarouselSpeed = (ms) => {
    setCarouselMs(ms);
    try { localStorage.setItem('lms_carousel_ms', String(ms)); } catch {}
  };

  const openAdd = () => { setAnnForm(BLANK_FORM); setEditingAnn(null); setAnnModal(true); };
  const openEdit = (ann) => {
    setAnnForm({ planKey: ann.planKey || 'growth', badge: ann.badge || '', title: ann.title || '', subtitle: ann.subtitle || '', startDate: ann.startDate || '', ctaLabel: ann.ctaLabel || 'Register Now', ctaLink: ann.ctaLink || '', icon: ann.icon || 'rocket_launch', thumbnail: ann.thumbnail || null, size: ann.size || 'medium' });
    setEditingAnn(ann.id);
    setAnnModal(true);
  };
  const handleSaveAnn = () => {
    if (!annForm.title.trim()) return;
    editingAnn ? updateAnnouncement(editingAnn, annForm) : addAnnouncement(annForm);
    setAnnModal(false);
    setAnnSaved(true);
    setTimeout(() => setAnnSaved(false), 2500);
  };
  const handleThumb = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAnnForm(f => ({ ...f, thumbnail: null }));
    const dataUrl = await compressImage(file);
    setAnnForm(f => ({ ...f, thumbnail: dataUrl }));
  };

  // ── Plan badge for user ─────────────────────────────────────────────────────
  const planBadge = (plan) => {
    const k = normalizePlan(plan);
    return PLAN_COLOR[k] || PLAN_COLOR.none;
  };

  const roleBadge = (role) =>
    role === 'admin' ? 'bg-red-100 text-red-600' :
    role === 'lecturer' ? 'bg-secondary-container/30 text-secondary' :
    'bg-primary-fixed text-primary';

  return (
    <AdminLayout>
      <div className="space-y-8 pt-2">

        {/* Welcome */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-primary font-semibold tracking-widest font-headline text-xs uppercase">Administration Overview</p>
            <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight mt-1">Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap self-start">
            <button
              onClick={() => setNotifModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 hover:scale-[1.02] transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              Send Notification
            </button>
            <button
              onClick={() => setExportModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm signature-gradient text-white shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export Report
            </button>
          </div>
        </section>

        {/* Metric Cards — real data */}
        {isLoading ? (
          <section className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonAdminCard key={i} />)}
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-4">
            {[
              {
                label: 'Total Students',
                value: students.length.toLocaleString(),
                sub: `${activeUsers.filter(u => u.role === 'student').length} active`,
                icon: 'group',
                iconBg: 'bg-primary-fixed text-primary',
              },
              {
                label: 'Active Courses',
                value: activeCourses.length,
                sub: `${ctxCourses.filter(c => c.isPlanProgram).length} programs`,
                icon: 'menu_book',
                iconBg: 'bg-secondary-container text-secondary',
              },
              {
                label: 'Monthly Revenue',
                value: fmtRevenue(monthlyRev),
                sub: `${appUsers.filter(u => normalizePlan(u.plan) !== 'none').length} enrolled`,
                icon: 'currency_rupee',
                iconBg: 'bg-green-100 text-green-600',
              },
              {
                label: 'Live Sessions',
                value: liveSessions,
                sub: `${sessions.filter(s => s.status === 'live').length} live now`,
                icon: 'live_tv',
                iconBg: 'bg-primary-fixed text-primary',
              },
            ].map(({ label, value, sub, icon, iconBg }) => (
              <div key={label} className="bg-surface-container-lowest p-5 rounded-3xl flex flex-col gap-3 shadow-sm">
                <div className={`p-2.5 rounded-2xl w-fit ${iconBg}`}>
                  <span className="material-symbols-outlined text-[20px]">{icon}</span>
                </div>
                <div>
                  <p className="text-on-surface-variant font-medium text-xs">{label}</p>
                  <p className="text-2xl font-extrabold font-headline text-on-surface">{value}</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Batch Announcements ── */}
        <section className="bg-surface-container-lowest rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-6 pb-3">
            <div>
              <h3 className="font-headline font-bold text-lg">Batch Announcements</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Control what students see on their home screen</p>
            </div>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white font-bold text-sm shadow">
              <span className="material-symbols-outlined text-sm">add</span>New
            </button>
          </div>

          {/* Rotation Speed */}
          <div className="flex items-center gap-3 px-6 pb-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
              <span className="material-symbols-outlined text-sm">timer</span>
              Auto-rotate:
            </div>
            {[{ label: '3 sec', ms: 3000 }, { label: '5 sec', ms: 5000 }, { label: '8 sec', ms: 8000 }, { label: '12 sec', ms: 12000 }].map(opt => (
              <button
                key={opt.ms}
                onClick={() => setCarouselSpeed(opt.ms)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${carouselMs === opt.ms ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {annSaved && (
            <div className="mx-6 mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-2.5">
              <span className="material-symbols-outlined text-green-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="text-green-700 text-sm font-medium">Announcement saved!</p>
            </div>
          )}

          <div className="divide-y divide-outline-variant/10">
            {(announcements || []).length === 0 && (
              <div className="px-6 py-10 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-2">campaign</span>
                <p className="text-sm">No announcements yet. Add one above.</p>
              </div>
            )}
            {(announcements || []).map(ann => {
              const gradient = ANN_GRADIENT[ann.planKey] || ANN_GRADIENT.all;
              const isExpired = ann.expiresAt && new Date(ann.expiresAt).getTime() <= Date.now();
              return (
                <div key={ann.id} className={`px-6 py-4 flex items-center gap-4 ${isExpired ? 'opacity-60' : ''}`}>
                  <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                    {ann.thumbnail
                      ? <img src={ann.thumbnail} alt="" className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{ann.icon || 'campaign'}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {ann.badge && <span className="text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{ann.badge}</span>}
                      {isExpired
                        ? <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Expired</span>
                        : <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${ann.active ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'}`}>
                            {ann.active ? 'Live' : 'Hidden'}
                          </span>
                      }
                    </div>
                    <p className="font-bold text-sm truncate">{ann.title}</p>
                    {ann.startDate && <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1"><span className="material-symbols-outlined text-xs">calendar_today</span>{ann.startDate}</p>}
                    {ann.expiresAt && !isExpired && (
                      <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">timer</span>
                        Expires {new Date(ann.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                    )}
                    <p className="text-xs text-on-surface-variant capitalize mt-0.5">{(PLAN_OPTS.find(p => p.value === ann.planKey) || {}).label || ann.planKey}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => toggleAnnouncement(ann.id)}
                      className={`p-2 rounded-xl text-sm font-medium transition-all ${ann.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{ann.active ? 'visibility' : 'visibility_off'}</span>
                    </button>
                    <button onClick={() => openEdit(ann)} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button onClick={() => setDeleteAnn(ann.id)} className="p-2 rounded-xl bg-error/10 text-error hover:bg-error/20 transition-all">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Weekly Revenue — real daily signups × plan price */}
        <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-headline font-bold text-lg">Weekly Revenue</h3>
            <span className="text-xs text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">Last 7 days</span>
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-extrabold font-headline text-on-surface">
              {fmtRevenue(weeklyData.reduce((s, d) => s + d.revenue, 0))}
            </span>
            <span className="text-xs text-on-surface-variant">this week · {appUsers.filter(u => normalizePlan(u.plan) !== 'none').length} paid students</span>
          </div>

          {/* SVG area chart */}
          <RevenueChart data={weeklyData} fmtRevenue={fmtRevenue} />

          {/* Plan breakdown */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['starter', 'growth', 'premium'].map(k => {
              const count = appUsers.filter(u => normalizePlan(u.plan) === k).length;
              const price = planConfigs[k]?.priceNum || 0;
              return (
                <div key={k} className="bg-surface-container p-3 rounded-xl text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant capitalize">{k}</p>
                  <p className="font-bold text-sm mt-0.5">{count} <span className="font-normal text-[10px] text-on-surface-variant">users</span></p>
                  <p className="text-[11px] text-primary font-semibold">{fmtRevenue(count * price)}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top Courses — real ctx courses */}
        <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline font-bold text-lg">Top Courses</h3>
            <button onClick={() => navigate('/admin/courses')} className="text-primary text-xs font-bold uppercase tracking-wider">Manage</button>
          </div>
          {topCourses.length === 0 ? (
            <div className="text-center py-6 text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl opacity-30 mb-1">video_library</span>
              <p className="text-sm">No courses with content yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topCourses.map((c, i) => {
                const planKey = c.isPlanProgram ? c.planKey : (c.planKey || 'none');
                const studentCount = appUsers.filter(u => normalizePlan(u.plan) === planKey || (planKey === 'none' && normalizePlan(u.plan) !== 'none')).length;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-500' : 'text-on-surface-variant'}`}>#{i + 1}</span>
                    <div className={`w-10 h-10 rounded-xl flex-shrink-0 bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-white/70 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{c.title}</p>
                      <p className="text-xs text-on-surface-variant">{totalLessons(c)} lessons · {studentCount} students</p>
                    </div>
                    {c.isPlanProgram && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${planBadge(c.planKey)}`}>{c.planKey}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Users — real appUsers */}
        <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline font-bold text-lg">Recent Users</h3>
            <button onClick={() => navigate('/admin/users')} className="text-primary text-xs font-bold uppercase tracking-wider">View All</button>
          </div>
          {recentUsers.length === 0 ? (
            <div className="text-center py-6 text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl opacity-30 mb-1">group</span>
              <p className="text-sm">No users yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-4 p-3 rounded-2xl hover:bg-surface-container-low transition-colors cursor-pointer"
                  onClick={() => navigate('/admin/users')}
                >
                  <div className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{(u.name || '?')[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{u.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{u.email} · {u.joined || 'Recently'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <section>
          <h3 className="font-headline font-bold text-lg mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Add Course',    icon: 'add_circle',        color: 'signature-gradient text-white', to: '/admin/courses' },
              { label: 'Manage Users',  icon: 'group',             color: 'bg-secondary-container/20 text-secondary', to: '/admin/users' },
              { label: 'TEET Reports',  icon: 'psychology',        color: 'bg-violet-50 text-violet-700', to: '/admin/teet' },
              { label: 'Go Live Now',   icon: 'live_tv',           color: 'bg-red-50 text-red-600', to: '/admin/live' },
              { label: 'Coming Soon',   icon: 'hourglass_top',     color: 'bg-amber-50 text-amber-700', to: '/admin/coming-soon' },
              { label: 'Projects',      icon: 'folder_open',       color: 'bg-emerald-50 text-emerald-700', to: '/admin/projects' },
              { label: 'Manage Plans',  icon: 'workspace_premium', color: 'bg-pink-50 text-pink-700', to: '/admin/plans' },
              { label: 'View Support',  icon: 'support_agent',     color: 'bg-surface-container text-on-surface', to: '/admin/support' },
            ].map(({ label, icon, color, to }) => (
              <button key={label} onClick={() => navigate(to)} className={`flex flex-col items-center gap-2 p-4 rounded-2xl font-semibold text-sm transition-all hover:opacity-80 active:scale-[0.97] ${color}`}>
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Logout */}
        <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center gap-4 px-5 py-4 bg-surface-container-lowest rounded-2xl border border-error/20 text-error hover:bg-error/5 transition-colors shadow-sm">
          <span className="material-symbols-outlined">logout</span>
          <span className="font-bold text-sm">Log Out</span>
        </button>
      </div>

      {/* ── Add / Edit Announcement Modal ── */}
      {annModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">{editingAnn ? 'Edit Announcement' : 'New Announcement'}</h3>
              <button onClick={() => setAnnModal(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Live Preview — size-aware, thumbnail replaces gradient */}
            <div
              className={`relative overflow-hidden rounded-2xl text-white ${annForm.thumbnail ? 'bg-gray-900' : `bg-gradient-to-br ${ANN_GRADIENT[annForm.planKey] || ANN_GRADIENT.all}`}`}
              style={{ aspectRatio: annForm.size === 'small' ? '21/8' : annForm.size === 'large' ? '16/9' : '16/7' }}
            >
              {annForm.thumbnail && (
                <>
                  <img src={annForm.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/20 pointer-events-none" />
                </>
              )}
              <div className="relative z-10 space-y-2 p-5">
                {annForm.badge && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-[9px] uppercase font-bold tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{annForm.badge}
                  </div>
                )}
                <p className="font-extrabold text-base leading-tight">{annForm.title || 'Announcement Title'}</p>
                {annForm.startDate && <p className="text-xs text-white/80 flex items-center gap-1"><span className="material-symbols-outlined text-xs">calendar_today</span>{annForm.startDate}</p>}
                {annForm.subtitle && <p className="text-white/70 text-xs leading-relaxed">{annForm.subtitle}</p>}
                <button className="mt-1 px-4 py-1.5 rounded-lg bg-white text-gray-900 font-bold text-xs">{annForm.ctaLabel || 'Register Now'}</button>
              </div>
              {!annForm.thumbnail && (
                <div className="absolute bottom-0 right-4 opacity-15 pointer-events-none">
                  <span className="material-symbols-outlined text-[80px]" style={{ fontVariationSettings: "'FILL' 1" }}>{annForm.icon || 'rocket_launch'}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Thumbnail */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Thumbnail Image</label>
                <div className="flex items-center gap-3">
                  {annForm.thumbnail
                    ? <img src={annForm.thumbnail} alt="" className="w-16 h-10 rounded-xl object-cover border border-slate-200" />
                    : <div className="w-16 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                        <span className="material-symbols-outlined text-sm">image</span>
                      </div>
                  }
                  <label className="flex-1 cursor-pointer px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary/40 text-center text-xs text-slate-500 hover:text-primary transition-colors">
                    {annForm.thumbnail ? 'Change Image' : 'Upload Image'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleThumb} />
                  </label>
                  {annForm.thumbnail && (
                    <button onClick={() => setAnnForm(f => ({ ...f, thumbnail: null }))} className="p-2 text-error hover:bg-red-50 rounded-xl">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Target Plan</label>
                <select value={annForm.planKey} onChange={e => setAnnForm(f => ({ ...f, planKey: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  {PLAN_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Badge Text</label>
                <input value={annForm.badge} onChange={e => setAnnForm(f => ({ ...f, badge: e.target.value }))} placeholder="NEW BATCH" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Title *</label>
                <input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="New Growth Batch Starting This Monday" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Start Date</label>
                <input value={annForm.startDate} onChange={e => setAnnForm(f => ({ ...f, startDate: e.target.value }))} placeholder="Monday, March 25" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
                <textarea rows={3} value={annForm.subtitle} onChange={e => setAnnForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="Join our live mentor-led bootcamp..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Button Label</label>
                <input value={annForm.ctaLabel} onChange={e => setAnnForm(f => ({ ...f, ctaLabel: e.target.value }))} placeholder="Register Now" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Button Link <span className="normal-case text-slate-400 font-normal">(e.g. /live, /courses)</span></label>
                <input value={annForm.ctaLink} onChange={e => setAnnForm(f => ({ ...f, ctaLink: e.target.value }))} placeholder="/live" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Background Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {ICON_OPTS.map(ic => (
                    <button key={ic} onClick={() => setAnnForm(f => ({ ...f, icon: ic }))}
                      className={`p-2.5 rounded-xl border-2 transition-all ${annForm.icon === ic ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'}`}>
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Banner Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Banner Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'small',  label: 'Small',  px: 28 },
                    { value: 'medium', label: 'Medium', px: 44 },
                    { value: 'large',  label: 'Large',  px: 60 },
                  ].map(s => (
                    <button
                      key={s.value}
                      onClick={() => setAnnForm(f => ({ ...f, size: s.value }))}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${annForm.size === s.value ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div
                        className={`w-full rounded-lg bg-gradient-to-br ${ANN_GRADIENT[annForm.planKey] || ANN_GRADIENT.all}`}
                        style={{ height: s.px }}
                      />
                      <span className="text-xs font-semibold text-slate-600">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setAnnModal(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm">Cancel</button>
              <button onClick={handleSaveAnn} disabled={!annForm.title.trim()} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm disabled:opacity-50">
                {editingAnn ? 'Save Changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Report Modal ── */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-5">
          <div className="bg-surface rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-outline-variant/10">
              <div>
                <h3 className="text-lg font-extrabold font-headline">Export Report</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Downloads as CSV — opens in Excel / Sheets</p>
              </div>
              <button onClick={() => setExportModal(false)} className="p-2 rounded-full hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <div className="p-4 space-y-2">
              {[
                {
                  key: 'students',
                  icon: 'group',
                  label: 'Students Report',
                  desc: `All ${appUsers.length} users — name, email, plan, status`,
                  color: 'bg-primary/10 text-primary',
                  fn: exportStudents,
                },
                {
                  key: 'revenue',
                  icon: 'currency_rupee',
                  label: 'Revenue Report',
                  desc: 'Plan breakdown — enrollments & total revenue',
                  color: 'bg-green-100 text-green-700',
                  fn: exportRevenue,
                },
                {
                  key: 'courses',
                  icon: 'menu_book',
                  label: 'Courses Report',
                  desc: `${ctxCourses.length} courses — title, plan, lesson count`,
                  color: 'bg-secondary-container/30 text-secondary',
                  fn: exportCourses,
                },
                {
                  key: 'full',
                  icon: 'summarize',
                  label: 'Full Report',
                  desc: 'Everything combined in one file',
                  color: 'signature-gradient text-white',
                  fn: exportFull,
                },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={opt.fn}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container active:scale-[0.98] transition-all text-left"
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${opt.color}`}>
                    <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-xs text-on-surface-variant truncate">{opt.desc}</p>
                  </div>
                  {exportDone === opt.key ? (
                    <span className="material-symbols-outlined text-green-500 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  ) : (
                    <span className="material-symbols-outlined text-on-surface-variant text-xl flex-shrink-0">download</span>
                  )}
                </button>
              ))}
            </div>

            <div className="px-6 pb-5">
              <p className="text-[10px] text-on-surface-variant text-center">Files are generated locally from live data — nothing is sent to an external server.</p>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteAnn && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Delete Announcement?</h3>
            <p className="text-sm text-on-surface-variant">This will remove it from the student home screen immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAnn(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-semibold text-sm">Cancel</button>
              <button onClick={() => { removeAnnouncement(deleteAnn); setDeleteAnn(null); }} className="flex-1 py-3 rounded-2xl bg-error text-white font-bold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Notification Modal — admin only, FCM push toggle included */}
      <SendNotifModal open={notifModal} onClose={() => setNotifModal(false)} senderType="admin" />
    </AdminLayout>
  );
}
