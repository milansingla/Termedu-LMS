import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { useProjects } from '../../context/ProjectContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { useApp } from '../../context/AppContext';

function formatDate(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return str; }
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const TYPE_META = {
  project: { label: 'Project',  icon: 'folder_open', color: 'bg-violet-100 text-violet-700' },
  task:    { label: 'Task',     icon: 'assignment',  color: 'bg-blue-100 text-blue-700' },
};
const PLAN_META = {
  free:    { label: 'Free',    color: 'bg-slate-100 text-slate-600',   icon: 'lock_open' },
  starter: { label: 'Starter', color: 'bg-blue-100 text-blue-700',     icon: 'workspace_premium' },
  growth:  { label: 'Growth',  color: 'bg-violet-100 text-violet-700', icon: 'workspace_premium' },
  premium: { label: 'Premium', color: 'bg-amber-100 text-amber-700',   icon: 'stars' },
};
function TypeBadge({ type }) {
  const m = TYPE_META[type] || TYPE_META.project;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${m.color}`}>
      <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
      {m.label}
    </span>
  );
}
function PlanBadge({ plan }) {
  const m = PLAN_META[plan] || PLAN_META.free;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${m.color}`}>
      <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
      {m.label}
    </span>
  );
}

const EMPTY_FORM = { type: 'project', sessionId: '', title: '', description: '', dueDate: '', plan: 'free', totalMarks: '' };

export default function AdminProjects() {
  const { currentUser } = useApp();
  const { briefs, submissions, addBrief, deleteBrief, gradeSubmission, getSubmissionsForBrief, refreshProjects } = useProjects();
  const { sessions } = useLiveClass();

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  const [filterType, setFilterType] = useState('all');
  const [filterLecturer, setFilterLecturer] = useState('all');
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewBrief, setViewBrief] = useState(null);
  const [gradeModal, setGradeModal] = useState(null);
  const [gradeForm, setGradeForm] = useState({ marks: '', feedback: '' });
  const [grading, setGrading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), type === 'error' ? 4000 : 2500); };
  const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

  // Admin sees ALL briefs
  const enriched = briefs.map(b => ({
    ...b,
    session: sessionMap[b.sessionId],
    subs: getSubmissionsForBrief(b.id),
    itemType: b.type || 'project',
  }));

  const lecturers = [...new Set(briefs.map(b => b.createdBy).filter(Boolean))];

  const filtered = enriched
    .filter(b => filterType === 'all' || b.itemType === filterType)
    .filter(b => filterLecturer === 'all' || b.createdBy === filterLecturer);

  const totalSubs = submissions.length;
  const gradedSubs = submissions.filter(s => s.marks !== null && s.marks !== undefined).length;
  const projCount = enriched.filter(b => b.itemType === 'project').length;
  const taskCount = enriched.filter(b => b.itemType === 'task').length;

  const handleAdd = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.type === 'project' && !form.sessionId) { setFormError('Please select a linked session.'); return; }
    setSaving(true); setFormError('');
    try {
      const session = form.sessionId ? sessionMap[Number(form.sessionId)] : null;
      await addBrief({
        type: form.type,
        sessionId: session ? Number(form.sessionId) : null,
        sessionTitle: session?.title || '',
        isWorkshop: session?.isWorkshop || false,
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        plan: form.plan || 'free',
        totalMarks: form.totalMarks ? Number(form.totalMarks) : null,
        createdBy: currentUser?.name || 'Admin',
        lecturerId: currentUser?.id,
      });
      setForm(EMPTY_FORM);
      setAddModal(false);
      showToast(`${form.type === 'task' ? 'Task' : 'Project brief'} created`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        setAddModal(false);
        showToast('Access denied — please log out and log back in as admin.', 'error');
      } else {
        setFormError(msg || 'Failed to create. Try again.');
      }
    } finally { setSaving(false); }
  };

  const handleGrade = async () => {
    if (gradeForm.marks === '') return;
    setGrading(true);
    try {
      await gradeSubmission(gradeModal.id, { marks: Number(gradeForm.marks), feedback: gradeForm.feedback });
      setGradeModal(null);
      showToast('Submission graded ✓');
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        setGradeModal(null);
        showToast('Access denied — please log out and log back in as admin.', 'error');
      } else {
        showToast('Grading failed. Try again.', 'error');
      }
    } finally { setGrading(false); }
  };

  const viewSubs = viewBrief ? getSubmissionsForBrief(viewBrief.id) : [];

  return (
    <AdminLayout>
      <div className="space-y-6 pt-2">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Projects & Tasks</h1>
            <p className="text-xs text-on-surface-variant mt-0.5">Manage all project briefs and tasks across all lecturers.</p>
          </div>
          <button onClick={() => { setForm(EMPTY_FORM); setFormError(''); setAddModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create New
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Projects',    value: projCount,   color: 'text-violet-600',  bg: 'bg-violet-50',  icon: 'folder_open' },
            { label: 'Tasks',       value: taskCount,   color: 'text-blue-600',    bg: 'bg-blue-50',    icon: 'assignment' },
            { label: 'Submissions', value: totalSubs,   color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'upload_file' },
            { label: 'Graded',      value: gradedSubs,  color: 'text-amber-600',   bg: 'bg-amber-50',   icon: 'grade' },
          ].map(({ label, value, color, bg, icon }) => (
            <div key={label} className={`${bg} p-4 rounded-2xl shadow-sm text-center`}>
              <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <p className={`text-2xl font-bold font-headline mt-0.5 ${color}`}>{value}</p>
              <p className="text-[10px] text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Type filter */}
          <div className="flex gap-1.5">
            {[
              { key: 'all',     label: `All (${enriched.length})` },
              { key: 'project', label: `Projects (${projCount})` },
              { key: 'task',    label: `Tasks (${taskCount})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterType(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === key ? 'signature-gradient text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Lecturer filter */}
          {lecturers.length > 1 && (
            <select value={filterLecturer} onChange={e => setFilterLecturer(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-container text-on-surface-variant border border-outline-variant/20 focus:outline-none">
              <option value="all">All Lecturers</option>
              {lecturers.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-10 text-center border border-dashed border-outline-variant/30 space-y-2">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 block">folder_open</span>
              <p className="text-on-surface-variant text-sm font-semibold">No items found</p>
              <p className="text-xs text-on-surface-variant/70">Create a new project brief or task to get started.</p>
            </div>
          ) : filtered.map(item => (
            <div key={item.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${item.itemType === 'task' ? 'bg-blue-50' : 'bg-primary-fixed'}`}>
                  <span className={`material-symbols-outlined text-sm ${item.itemType === 'task' ? 'text-blue-600' : 'text-primary'}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {item.itemType === 'task' ? 'assignment' : 'folder_open'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm leading-tight">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <TypeBadge type={item.itemType} />
                    <PlanBadge plan={item.plan || 'free'} />
                    {item.createdBy && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                        {item.createdBy}
                      </span>
                    )}
                    {item.session && (
                      <span className="text-[10px] text-on-surface-variant truncate">
                        {item.session.isWorkshop ? '📣' : '🔴'} {item.session.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {item.dueDate && (
                      <span className={`text-[10px] font-medium ${isOverdue(item.dueDate) ? 'text-red-500' : 'text-on-surface-variant'}`}>
                        Due: {formatDate(item.dueDate)}{isOverdue(item.dueDate) ? ' ⚠' : ''}
                      </span>
                    )}
                    {item.totalMarks && (
                      <span className="text-[10px] text-on-surface-variant">Max: {item.totalMarks} marks</span>
                    )}
                    <span className={`text-[10px] font-semibold ${item.subs.length > 0 ? 'text-emerald-600' : 'text-on-surface-variant/60'}`}>
                      {item.subs.length} submission{item.subs.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-amber-600 font-medium">
                      {item.subs.filter(s => s.marks !== null).length} graded
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => setViewBrief(item)}
                    className="px-3 py-1.5 rounded-lg bg-primary-fixed text-primary text-xs font-bold hover:bg-primary/10 transition-all">
                    View
                  </button>
                  <button onClick={() => setDeleteConfirm(item)}
                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-all">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-on-surface text-surface'}`}>{toast.msg}</div>
      )}

      {/* ── Create Modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Create New</h3>
              <button onClick={() => { setAddModal(false); setFormError(''); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Type selector */}
            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-2">Type *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'project', label: 'Project Brief', sub: 'Linked to a session', icon: 'folder_open' },
                  { key: 'task',    label: 'Task',          sub: 'Standalone assignment', icon: 'assignment' },
                ].map(({ key, label, sub, icon }) => (
                  <button key={key} onClick={() => setForm(p => ({ ...p, type: key, sessionId: key === 'task' ? '' : p.sessionId }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${form.type === key ? 'border-primary bg-primary-fixed' : 'border-outline-variant/30 hover:border-primary/30'}`}>
                    <span className={`material-symbols-outlined text-xl ${form.type === key ? 'text-primary' : 'text-on-surface-variant'}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                    <p className={`text-xs font-bold mt-1 ${form.type === key ? 'text-primary' : ''}`}>{label}</p>
                    <p className="text-[10px] text-on-surface-variant/70">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.type === 'project' && (
              <div>
                <label className="text-sm font-semibold text-on-surface-variant block mb-1">Linked Session *</label>
                <select value={form.sessionId} onChange={e => setForm(p => ({ ...p, sessionId: e.target.value }))}
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20 appearance-none">
                  <option value="">Select a session…</option>
                  <optgroup label="Workshops (Free)">
                    {sessions.filter(s => s.isWorkshop).map(s => (
                      <option key={s.id} value={s.id}>[Workshop] {s.title}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Live Classes">
                    {sessions.filter(s => !s.isWorkshop).map(s => (
                      <option key={s.id} value={s.id}>[{s.status}] {s.title}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1">Access Plan *</label>
              <div className="grid grid-cols-4 gap-1.5">
                {['free','starter','growth','premium'].map(p => (
                  <button key={p} onClick={() => setForm(prev => ({ ...prev, plan: p }))}
                    className={`py-2 rounded-xl text-xs font-bold capitalize transition-all border-2 ${form.plan === p ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1">Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Build a portfolio website"
                className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20" />
            </div>

            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1">Description / Instructions</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Describe what students need to do…"
                className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant block mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant block mb-1">Total Marks</label>
                <input type="number" min="1" value={form.totalMarks} onChange={e => setForm(p => ({ ...p, totalMarks: e.target.value }))}
                  placeholder="e.g. 100"
                  className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20" />
              </div>
            </div>

            {formError && <p className="text-red-500 text-xs font-semibold">{formError}</p>}

            <button onClick={handleAdd} disabled={saving}
              className="w-full py-3.5 rounded-xl signature-gradient text-white font-bold text-sm hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-60">
              {saving ? 'Creating…' : `Create ${form.type === 'task' ? 'Task' : 'Project Brief'}`}
            </button>
          </div>
        </div>
      )}

      {/* ── View Submissions Modal ── */}
      {viewBrief && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 space-y-5 mb-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge type={viewBrief.itemType} />
                  <PlanBadge plan={viewBrief.plan || 'free'} />
                  {viewBrief.createdBy && (
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      by {viewBrief.createdBy}
                    </span>
                  )}
                </div>
                <h3 className="font-headline font-bold text-xl">{viewBrief.title}</h3>
                {viewBrief.description && <p className="text-sm text-on-surface-variant mt-1">{viewBrief.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant flex-wrap">
                  {viewBrief.dueDate && <span>Due: {formatDate(viewBrief.dueDate)}</span>}
                  {viewBrief.totalMarks && <span>Total: {viewBrief.totalMarks} marks</span>}
                  {viewBrief.session && <span>{viewBrief.session.isWorkshop ? '📣' : '🔴'} {viewBrief.session.title}</span>}
                </div>
              </div>
              <button onClick={() => setViewBrief(null)} className="p-2 rounded-full hover:bg-slate-100 flex-shrink-0">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-sm">Submissions ({viewSubs.length})</p>
                <span className="text-xs text-on-surface-variant">{viewSubs.filter(s => s.marks !== null).length} graded</span>
              </div>
              {viewSubs.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-6 text-center">
                  <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 block">inbox</span>
                  <p className="text-sm text-on-surface-variant mt-2">No submissions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewSubs.map(sub => (
                    <div key={sub.id} className="bg-slate-50 rounded-2xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{sub.studentName || 'Student'}</p>
                          <p className="text-[11px] text-on-surface-variant">{formatDate(sub.submittedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {sub.marks !== null && sub.marks !== undefined ? (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {sub.marks}{viewBrief.totalMarks ? `/${viewBrief.totalMarks}` : ''} marks
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">Pending</span>
                          )}
                          <button onClick={() => { setGradeModal(sub); setGradeForm({ marks: sub.marks ?? '', feedback: sub.feedback || '' }); }}
                            className="px-3 py-1 rounded-lg bg-primary-fixed text-primary text-xs font-bold hover:bg-primary/10 transition-all">
                            {sub.marks !== null ? 'Edit Grade' : 'Grade'}
                          </button>
                        </div>
                      </div>
                      {sub.link && (
                        <a href={sub.link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                          <span className="material-symbols-outlined text-sm">link</span>
                          View Submission
                        </a>
                      )}
                      {sub.description && <p className="text-xs text-on-surface-variant">{sub.description}</p>}
                      {sub.feedback && (
                        <div className="bg-white rounded-xl px-3 py-2 text-xs text-on-surface-variant border border-outline-variant/20">
                          <span className="font-semibold text-on-surface">Feedback: </span>{sub.feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Grade Modal ── */}
      {gradeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-lg">Grade Submission</h3>
              <button onClick={() => setGradeModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">{gradeModal.studentName}</span>
              {viewBrief?.totalMarks && ` — max ${viewBrief.totalMarks} marks`}
            </p>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1">
                Marks {viewBrief?.totalMarks ? `(out of ${viewBrief.totalMarks})` : ''} *
              </label>
              <input type="number" min="0" max={viewBrief?.totalMarks || undefined}
                value={gradeForm.marks} onChange={e => setGradeForm(p => ({ ...p, marks: e.target.value }))}
                placeholder="Enter marks"
                className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20" />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1">Feedback (optional)</label>
              <textarea value={gradeForm.feedback} onChange={e => setGradeForm(p => ({ ...p, feedback: e.target.value }))}
                rows={3} placeholder="Leave feedback for the student…"
                className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20 resize-none" />
            </div>
            <button onClick={handleGrade} disabled={grading || gradeForm.marks === ''}
              className="w-full py-3.5 rounded-xl signature-gradient text-white font-bold text-sm hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-60">
              {grading ? 'Saving…' : 'Save Grade'}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500 block" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
            <p className="font-bold">Delete "{deleteConfirm.title}"?</p>
            <p className="text-sm text-on-surface-variant">This will also remove all student submissions for this item.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="py-3 rounded-xl bg-surface-container font-semibold text-sm">Cancel</button>
              <button onClick={async () => { try { await deleteBrief(deleteConfirm.id); setDeleteConfirm(null); showToast('Deleted'); } catch (e) { setDeleteConfirm(null); const msg = e.message || ''; if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) showToast('Access denied — please log out and log back in as admin.', 'error'); else showToast('Delete failed. Try again.', 'error'); } }}
                className="py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
