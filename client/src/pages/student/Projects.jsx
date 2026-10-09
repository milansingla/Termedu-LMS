import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useApp } from '../../context/AppContext';
import { useProjects } from '../../context/ProjectContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { saveSeenIds, getSeenIds, NOTIF_SEEN_EVENT } from '../../utils/notifStorage';

// Reactive hook — re-reads seenIds from localStorage whenever NOTIF_SEEN_EVENT fires.
// This ensures the graded banner clears immediately after the auto-mark effect runs.
function useSeenIds() {
  const [seenIds, setSeenIds] = useState(() => getSeenIds());
  useEffect(() => {
    const refresh = () => setSeenIds(getSeenIds());
    window.addEventListener(NOTIF_SEEN_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NOTIF_SEEN_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return seenIds;
}

function formatDate(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return str; }
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const SESSION_GRADIENTS = [
  'from-violet-600 to-purple-700',
  'from-emerald-600 to-teal-700',
  'from-rose-600 to-pink-700',
  'from-blue-600 to-indigo-700',
  'from-amber-600 to-orange-700',
];
function getGradient(id) {
  const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return SESSION_GRADIENTS[hash % SESSION_GRADIENTS.length];
}

const TASK_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-teal-500 to-emerald-600',
  'from-fuchsia-500 to-pink-600',
  'from-orange-500 to-amber-600',
  'from-indigo-500 to-violet-600',
];
function getTaskGradient(id) {
  const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return TASK_GRADIENTS[hash % TASK_GRADIENTS.length];
}

const PLAN_ORDER = ['none', 'starter', 'growth', 'premium'];
function canAccess(userPlan, itemPlan) {
  const bp = itemPlan || 'free';
  if (bp === 'free') return true;
  if (!userPlan || userPlan === 'none') return false;
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(bp);
}

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, currentPlan } = useApp();
  const { briefs, submissions, submitProject, getSubmission, refreshProjects } = useProjects();
  const { sessions } = useLiveClass();

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // Auto-clear project-related notification badges when this page is visited.
  // Uses `submissions` directly so the effect re-fires as soon as submission
  // data arrives — avoids the stale-closure bug where graded badges persisted
  // because getSubmission's reference didn't change when submissions loaded.
  useEffect(() => {
    const uid = currentUser?.id || currentUser?.email;
    if (!uid || !briefs.length) return;
    const ids = [];
    briefs.forEach(b => {
      ids.push(`due_${b.id}`);
      const sub = (submissions || []).find(s => s.briefId === b.id && s.studentId === uid);
      if (sub?.marks != null) ids.push(`graded_${b.id}`);
    });
    if (ids.length) {
      saveSeenIds(ids);
      window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
    }
  }, [briefs, submissions, currentUser]);

  const [mainTab, setMainTab] = useState('projects');
  const [statusTab, setStatusTab] = useState('pending');
  const [submitModal, setSubmitModal] = useState(null);
  const [link, setLink] = useState('');
  const [desc, setDesc] = useState('');
  const [linkError, setLinkError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [gradedBannerDismissed, setGradedBannerDismissed] = useState(false);

  // Read ?openBrief=X from the URL (set by graded notification tap) and
  // auto-open the submission modal for that specific brief.
  const openBriefIdRef = useRef(new URLSearchParams(location.search).get('openBrief'));
  useEffect(() => {
    const briefId = openBriefIdRef.current;
    if (!briefId || !briefs.length) return;
    const brief = briefs.find(b => String(b.id) === String(briefId));
    if (!brief) return;
    const uid = currentUser?.id || currentUser?.email;
    const sub = (submissions || []).find(s => s.briefId === brief.id && s.studentId === uid);
    if (!sub) return;
    const isTask = brief.type === 'task';
    setMainTab(isTask ? 'tasks' : 'projects');
    setStatusTab('submitted');
    setViewModal({
      ...brief,
      session: sessions.find(s => s.id === brief.sessionId),
      submission: sub,
      itemType: brief.type || 'project',
    });
    setGradedBannerDismissed(true);
    openBriefIdRef.current = null; // run once
    navigate('/projects', { replace: true });
  }, [briefs, submissions, currentUser, sessions, navigate]);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };
  const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

  // Separate Projects and Tasks
  const projectBriefs = briefs.filter(b => !b.type || b.type === 'project');
  const taskBriefs    = briefs.filter(b => b.type === 'task');

  const isAccessible = (b) => canAccess(currentPlan, b.plan);
  const enrich = (b) => ({
    ...b,
    session: sessionMap[b.sessionId],
    submission: getSubmission(b.id, currentUser?.id || currentUser?.email),
    itemType: b.type || 'project',
    isLocked: !isAccessible(b),
  });

  const enrichedProjects = projectBriefs.map(enrich);
  const enrichedTasks    = taskBriefs.map(enrich);

  const accessibleProjects = enrichedProjects.filter(b => !b.isLocked);
  const accessibleTasks    = enrichedTasks.filter(b => !b.isLocked);
  const lockedProjects     = enrichedProjects.filter(b => b.isLocked);
  const lockedTasks        = enrichedTasks.filter(b => b.isLocked);

  const pendingProjects   = accessibleProjects.filter(b => !b.submission);
  const submittedProjects = accessibleProjects.filter(b => !!b.submission);
  const pendingTasks      = accessibleTasks.filter(b => !b.submission);
  const submittedTasks    = accessibleTasks.filter(b => !!b.submission);

  const currentList = mainTab === 'projects'
    ? (statusTab === 'pending' ? pendingProjects : submittedProjects)
    : (statusTab === 'pending' ? pendingTasks : submittedTasks);

  // Locked items shown only in pending tab for the current main tab
  const currentLocked = statusTab === 'pending'
    ? (mainTab === 'projects' ? lockedProjects : lockedTasks)
    : [];

  const totalLocked = lockedProjects.length + lockedTasks.length;
  const totalPending = pendingProjects.length + pendingTasks.length;
  const totalSubmitted = submittedProjects.length + submittedTasks.length;

  const openSubmit = (item) => {
    setSubmitModal(item);
    setLink(item.submission?.link || '');
    setDesc(item.submission?.description || '');
    setLinkError('');
  };

  const handleSubmit = async () => {
    if (!link.trim()) { setLinkError('Please add a link to your work.'); return; }
    try { new URL(link.trim()); } catch { setLinkError('Enter a valid URL (e.g. https://...)'); return; }
    setSubmitting(true);
    try {
      await submitProject({
        briefId: submitModal.id,
        studentId: currentUser?.id || currentUser?.email,
        studentName: currentUser?.name || 'Student',
        link: link.trim(),
        description: desc.trim(),
      });
      setSubmitModal(null);
      showToast('Submitted successfully!');
    } catch {
      showToast('Failed to submit. Try again.', false);
    } finally { setSubmitting(false); }
  };

  const seenIds = useSeenIds();
  const newlyGraded = [...accessibleProjects, ...accessibleTasks].filter(
    b => b.submission?.marks != null && !seenIds.has(`graded_${b.id}`)
  );

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar showBack={false} />

      <main className="pt-24 pb-32 px-4 max-w-4xl mx-auto space-y-5">

        <div>
          <h1 className="text-2xl font-extrabold font-headline">Projects & Tasks</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">Your assignments, briefs and tasks in one place</p>
        </div>

        {/* Grades banner */}
        {newlyGraded.length > 0 && !gradedBannerDismissed && (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-emerald-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>grade</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-900">
                {newlyGraded.length} submission{newlyGraded.length !== 1 ? 's' : ''} graded
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {newlyGraded.map(b => b.title).join(', ')} — tap View to see your scores
              </p>
            </div>
            <button
              onClick={() => {
                const hasGradedTasks = newlyGraded.some(b => b.itemType === 'task');
                setMainTab(hasGradedTasks ? 'tasks' : 'projects');
                setStatusTab('submitted');
                setGradedBannerDismissed(true);
                const ids = newlyGraded.map(b => `graded_${b.id}`);
                if (ids.length) {
                  saveSeenIds(ids);
                  window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
                }
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all">
              View
            </button>
          </div>
        )}

        {/* Upgrade banner */}
        {(!currentPlan || currentPlan === 'none') && totalLocked > 0 && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-violet-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-violet-900">{totalLocked} paid item{totalLocked !== 1 ? 's' : ''} locked</p>
              <p className="text-xs text-violet-700 mt-0.5">Upgrade a plan to unlock more projects and tasks.</p>
            </div>
            <button onClick={() => navigate('/pricing')}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-all">
              Upgrade
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Projects', value: accessibleProjects.length, icon: 'folder_open', color: 'text-violet-600' },
            { label: 'Tasks',    value: accessibleTasks.length,    icon: 'assignment',  color: 'text-blue-600' },
            { label: 'Pending',  value: pendingProjects.length + pendingTasks.length, icon: 'pending_actions', color: 'text-orange-500' },
            { label: 'Graded',   value: [...accessibleProjects,...accessibleTasks].filter(b => b.submission?.marks != null).length, icon: 'grade', color: 'text-emerald-600' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-surface-container-lowest rounded-2xl p-4 text-center shadow-sm">
              <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <p className="text-2xl font-bold font-headline mt-1">{value}</p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Main type tabs: Projects / Tasks */}
        <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
          {[
            { key: 'projects', label: 'Projects', count: accessibleProjects.length, icon: 'folder_open' },
            { key: 'tasks',    label: 'Tasks',    count: accessibleTasks.length,    icon: 'assignment' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setMainTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${mainTab === tab.key ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              <span className="material-symbols-outlined text-[16px]" style={mainTab === tab.key ? { fontVariationSettings: "'FILL' 1" } : {}}>{tab.icon}</span>
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mainTab === tab.key ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Status sub-tabs: Pending / Submitted */}
        <div className="flex gap-2">
          {[
            { key: 'pending',   label: 'Pending',   count: mainTab === 'projects' ? pendingProjects.length : pendingTasks.length },
            { key: 'submitted', label: 'Submitted',  count: mainTab === 'projects' ? submittedProjects.length : submittedTasks.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setStatusTab(tab.key)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${statusTab === tab.key ? 'signature-gradient text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusTab === tab.key ? 'bg-white/30 text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cards */}
        {currentList.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-10 text-center border border-dashed border-outline-variant/30 space-y-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block">
              {statusTab === 'pending' ? (mainTab === 'projects' ? 'folder_open' : 'assignment') : 'task_alt'}
            </span>
            <p className="font-semibold text-on-surface-variant text-sm">
              {statusTab === 'pending'
                ? `No pending ${mainTab === 'projects' ? 'projects' : 'tasks'} right now`
                : `No ${mainTab === 'projects' ? 'project' : 'task'} submissions yet`}
            </p>
            <p className="text-xs text-on-surface-variant/70">
              {statusTab === 'pending'
                ? mainTab === 'projects'
                  ? 'Project briefs from your live classes will appear here.'
                  : 'Tasks assigned by your lecturers will appear here.'
                : 'Submit your work and it will show up here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentList.map(item => {
              const overdue = !item.submission && isOverdue(item.dueDate);
              const isTask = item.itemType === 'task';
              const grad = isTask ? getTaskGradient(item.id) : getGradient(item.sessionId || item.id);
              const isPaid = item.plan && item.plan !== 'free';

              return (
                <div key={item.id} className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm">
                  {/* Banner */}
                  <div className={`bg-gradient-to-r ${grad} p-4 flex items-center gap-3`}>
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {isTask ? 'assignment' : (item.session?.isWorkshop ? 'cast_for_education' : 'live_tv')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">
                        {isTask ? 'Task' : 'Session'}
                      </p>
                      <p className="text-white font-bold text-sm truncate">
                        {isTask
                          ? (item.createdBy || 'Lecturer')
                          : (item.session?.title || item.sessionTitle || 'Live Session')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isPaid && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">
                          <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                          {item.plan}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-extrabold text-base leading-snug">{item.title}</h3>
                      {item.description && (
                        <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">{item.description}</p>
                      )}
                    </div>

                    {/* Tags */}
                    {item.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map(tag => (
                          <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/20">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      {item.dueDate && (
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-red-600' : 'text-on-surface-variant'}`}>
                          <span className="material-symbols-outlined text-sm">{overdue ? 'warning' : 'event'}</span>
                          {overdue ? 'Overdue · ' : 'Due · '}{formatDate(item.dueDate)}
                        </div>
                      )}
                      {item.totalMarks && !item.submission && (
                        <span className="text-xs text-on-surface-variant">Max: {item.totalMarks} marks</span>
                      )}
                      {item.submission && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          Submitted {formatDate(item.submission.submittedAt)}
                        </div>
                      )}
                    </div>

                    {/* Graded result */}
                    {item.submission?.marks != null && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>grade</span>
                          <p className="text-sm font-bold text-emerald-800">
                            Score: {item.submission.marks}{item.totalMarks ? `/${item.totalMarks}` : ''}
                          </p>
                        </div>
                        {item.submission.feedback && (
                          <p className="text-xs text-emerald-700 ml-6">{item.submission.feedback}</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      {item.submission ? (
                        <>
                          <button onClick={() => setViewModal(item)}
                            className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-all">
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            View Submission
                          </button>
                          {item.submission.marks == null && (
                            <button onClick={() => openSubmit(item)}
                              className="flex-1 py-2.5 rounded-xl border border-primary text-primary text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary-fixed transition-all">
                              <span className="material-symbols-outlined text-sm">edit</span>
                              Resubmit
                            </button>
                          )}
                        </>
                      ) : (
                        <button onClick={() => openSubmit(item)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                            overdue
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : 'signature-gradient text-white shadow-sm shadow-primary/20'
                          }`}>
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>upload</span>
                          {overdue ? 'Submit (Overdue)' : (isTask ? 'Submit Task' : 'Submit Project')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Locked items — visible as gated cards so students know what to unlock */}
        {currentLocked.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-on-surface-variant/60">lock</span>
              <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-wider">
                {currentLocked.length} locked — upgrade to access
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentLocked.map(item => {
                const isTask = item.itemType === 'task';
                const PLAN_LABELS = { starter: 'Starter', growth: 'Growth', premium: 'Premium' };
                return (
                  <div key={item.id} className="relative bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm opacity-70">
                    {/* Blurred banner */}
                    <div className={`bg-gradient-to-r ${isTask ? 'from-slate-400 to-slate-500' : 'from-slate-400 to-slate-500'} p-4 flex items-center gap-3`}>
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {isTask ? 'assignment' : 'folder_open'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">{isTask ? 'Task' : 'Project'}</p>
                        <p className="text-white font-bold text-sm truncate blur-sm select-none">Hidden until unlocked</p>
                      </div>
                      <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">
                        <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                        {PLAN_LABELS[item.plan] || item.plan}
                      </span>
                    </div>
                    {/* Locked overlay */}
                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="font-extrabold text-base leading-snug">{item.title}</h3>
                        {item.description && (
                          <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                      {item.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map(tag => (
                            <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/20">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <button onClick={() => navigate('/pricing')}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all active:scale-95">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>lock_open</span>
                        Unlock with {PLAN_LABELS[item.plan] || item.plan} Plan
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <BottomNav />

      {/* Submit modal */}
      {submitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline font-extrabold text-lg">
                  {submitModal.itemType === 'task' ? 'Submit Task' : 'Submit Project'}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">{submitModal.title}</p>
              </div>
              <button onClick={() => setSubmitModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-primary-fixed rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-sm mt-0.5">info</span>
              <p className="text-xs text-primary">
                Paste a link to your work — GitHub, Google Drive, Docs, Figma, deployed URL, or any shareable link.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant block mb-1">Submission Link *</label>
                <input
                  type="url"
                  value={link}
                  onChange={e => { setLink(e.target.value); setLinkError(''); }}
                  placeholder="https://..."
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20"
                />
                {linkError && <p className="text-red-500 text-xs mt-1">{linkError}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant block mb-1">Notes (optional)</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Any notes, challenges, or highlights about your submission…"
                  rows={3}
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none border border-outline-variant/20"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSubmitModal(null)}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-all">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-3 rounded-2xl signature-gradient text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                {submitting
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                  : <><span className="material-symbols-outlined text-sm">upload</span>Submit</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View submission modal */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-extrabold text-lg">Your Submission</h3>
              <button onClick={() => setViewModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-surface-container rounded-2xl p-4 space-y-1">
              <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">
                {viewModal.itemType === 'task' ? 'Task' : 'Project'}
              </p>
              <p className="font-bold text-sm">{viewModal.title}</p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1">Link</p>
                <a href={viewModal.submission?.link} target="_blank" rel="noopener noreferrer"
                  className="text-primary text-sm font-semibold break-all hover:underline flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  {viewModal.submission?.link}
                </a>
              </div>
              {viewModal.submission?.description && (
                <div>
                  <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-on-surface">{viewModal.submission.description}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mb-1">Submitted</p>
                <p className="text-sm">{formatDate(viewModal.submission?.submittedAt)}</p>
              </div>
              {viewModal.submission?.marks != null && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-1">
                  <p className="text-sm font-bold text-emerald-800">
                    Score: {viewModal.submission.marks}{viewModal.totalMarks ? `/${viewModal.totalMarks}` : ''}
                  </p>
                  {viewModal.submission.feedback && (
                    <p className="text-xs text-emerald-700">{viewModal.submission.feedback}</p>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setViewModal(null)}
              className="w-full py-3 rounded-2xl bg-surface-container text-on-surface text-sm font-bold">
              Close
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap ${toast.ok ? 'bg-on-surface text-surface' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
