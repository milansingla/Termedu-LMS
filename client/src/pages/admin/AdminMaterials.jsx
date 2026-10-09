import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { apiFetch } from '../../lib/api';

const TYPE_OPTS = [
  { value: 'pdf',   label: 'PDF',          icon: 'picture_as_pdf',    color: 'text-red-500',    bg: 'bg-red-50' },
  { value: 'video', label: 'Video',         icon: 'play_circle',       color: 'text-blue-600',   bg: 'bg-blue-50' },
  { value: 'doc',   label: 'Doc',           icon: 'description',       color: 'text-blue-500',   bg: 'bg-blue-50' },
  { value: 'image', label: 'Image',         icon: 'image',             color: 'text-green-500',  bg: 'bg-green-50' },
  { value: 'ppt',   label: 'PPT',           icon: 'slideshow',         color: 'text-orange-500', bg: 'bg-orange-50' },
  { value: 'zip',   label: 'ZIP',           icon: 'folder_zip',        color: 'text-gray-500',   bg: 'bg-gray-100' },
  { value: 'other', label: 'Other',         icon: 'insert_drive_file', color: 'text-gray-400',   bg: 'bg-gray-100' },
];

const PLAN_OPTS = [
  { value: 'all',     label: 'All Plans' },
  { value: 'starter', label: 'Starter'   },
  { value: 'growth',  label: 'Growth'    },
  { value: 'premium', label: 'Premium'   },
];

const PLAN_BADGE = {
  all:     { label: 'All Plans', cls: 'bg-gray-100 text-gray-600' },
  starter: { label: 'Starter',   cls: 'bg-slate-100 text-slate-600' },
  growth:  { label: 'Growth',    cls: 'bg-purple-100 text-purple-700' },
  premium: { label: 'Premium',   cls: 'bg-pink-100 text-pink-700' },
};

const BLANK = { title: '', subject: '', type: 'pdf', fileUrl: '', description: '', planKey: 'all', tags: '', allowPreview: true, allowDownload: true };

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}

function TypeIcon({ type }) {
  const t = TYPE_OPTS.find(o => o.value === type) || TYPE_OPTS[TYPE_OPTS.length - 1];
  return (
    <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${t.bg}`}>
      <span className={`material-symbols-outlined text-lg ${t.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{t.icon}</span>
    </div>
  );
}

export default function AdminMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({ ...BLANK });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 4000 : 2200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setMaterials(await apiFetch('/api/data/materials?publishedOnly=false')); }
    catch { setMaterials([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ ...BLANK }); setEditing(null); setError(''); setModal(true); };
  const openEdit = (m) => {
    setForm({
      title: m.title || '', subject: m.subject || '', type: m.type || 'pdf',
      fileUrl: m.fileUrl || '', description: m.description || '',
      planKey: m.planKey || 'all', tags: (m.tags || []).join(', '),
      allowPreview: m.allowPreview !== false,
      allowDownload: m.allowDownload !== false,
    });
    setEditing(m); setError(''); setModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Title is required.');
    if (!form.fileUrl.trim()) return setError('Resource link is required.');
    setSaving(true); setError('');
    try {
      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim() || undefined,
        type: form.type,
        fileUrl: form.fileUrl.trim(),
        description: form.description.trim() || undefined,
        planKey: form.planKey,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        allowPreview: form.allowPreview,
        allowDownload: form.allowDownload,
        uploadedBy: 'Admin',
        uploadedByRole: 'admin',
      };
      if (editing) {
        const updated = await apiFetch(`/api/data/materials/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMaterials(prev => prev.map(m => m.id === editing.id ? updated : m));
        showToast('Material updated.');
      } else {
        const created = await apiFetch('/api/data/materials', { method: 'POST', body: JSON.stringify(payload) });
        setMaterials(prev => [created, ...prev]);
        showToast('Material added.');
      }
      setModal(false);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        setModal(false);
        showToast('Access denied — please log out and log back in as admin.', 'error');
      } else {
        setError(msg);
      }
    }
    setSaving(false);
  };

  const handleToggle = async (m) => {
    try {
      const updated = await apiFetch(`/api/data/materials/${m.id}`, {
        method: 'PATCH', body: JSON.stringify({ isPublished: !m.isPublished }),
      });
      setMaterials(prev => prev.map(x => x.id === m.id ? updated : x));
      showToast(updated.isPublished ? 'Published.' : 'Hidden from students.');
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        showToast('Access denied — please log out and log back in as admin.', 'error');
      } else {
        showToast('Error: ' + msg, 'error');
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/api/data/materials/${id}`, { method: 'DELETE' });
      setMaterials(prev => prev.filter(m => m.id !== id));
      setDeleteId(null);
      showToast('Deleted.');
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        showToast('Access denied — please log out and log back in as admin.', 'error');
      } else {
        showToast('Error: ' + msg, 'error');
      }
    }
  };

  const filtered = materials.filter(m => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase()) &&
        !(m.subject || '').toLowerCase().includes(search.toLowerCase()) &&
        !(m.uploadedBy || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && (m.type || 'other') !== filterType) return false;
    if (filterPlan !== 'all' && (m.planKey || 'all') !== filterPlan) return false;
    if (filterStatus === 'published' && m.isPublished === false) return false;
    if (filterStatus === 'hidden' && m.isPublished !== false) return false;
    return true;
  });

  const published   = materials.filter(m => m.isPublished !== false).length;
  const totalOpens  = materials.reduce((s, m) => s + (m.downloads || 0), 0);
  const subjects    = Array.from(new Set(materials.map(m => m.subject).filter(Boolean)));

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Study Materials</h1>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl signature-gradient text-white font-bold text-sm shadow-md">
            <span className="material-symbols-outlined text-base">add</span>
            Add Material
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',       value: materials.length, icon: 'folder',          color: 'text-violet-600 bg-violet-50' },
            { label: 'Published',   value: published,        icon: 'visibility',      color: 'text-green-600 bg-green-50' },
            { label: 'Hidden',      value: materials.length - published, icon: 'visibility_off', color: 'text-gray-500 bg-gray-100' },
            { label: 'Total Opens', value: totalOpens,       icon: 'download',        color: 'text-blue-600 bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
              </div>
              <div>
                <p className="text-xl font-extrabold leading-none">{s.value}</p>
                <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-4 space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none material-symbols-outlined text-outline text-base">search</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, subject or uploader…"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-xs font-semibold focus:outline-none">
              <option value="all">All Types</option>
              {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              className="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-xs font-semibold focus:outline-none">
              <option value="all">All Plans</option>
              {PLAN_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-xs font-semibold focus:outline-none">
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
            <span className="text-xs text-on-surface-variant self-center ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Materials list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="material-symbols-outlined text-5xl text-outline/30">folder_open</span>
            <p className="font-bold text-on-surface-variant">
              {materials.length === 0 ? 'No materials yet' : 'No results for this filter'}
            </p>
            <p className="text-xs text-on-surface-variant/60">
              {materials.length === 0 ? 'Add the first study material using the button above.' : 'Try clearing the filters.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10 overflow-hidden">
            {filtered.map(m => {
              const pb = PLAN_BADGE[m.planKey] || PLAN_BADGE.all;
              const typeInfo = TYPE_OPTS.find(o => o.value === m.type) || TYPE_OPTS[TYPE_OPTS.length - 1];
              return (
                <div key={m.id} className={`p-4 flex items-start gap-3 ${m.isPublished === false ? 'opacity-60' : ''}`}>
                  <TypeIcon type={m.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm">{m.title}</h3>
                        {m.subject && <p className="text-xs text-primary font-semibold">{m.subject}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${pb.cls}`}>{pb.label}</span>
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                          {typeInfo.label}
                        </span>
                        {m.isPublished === false && (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">HIDDEN</span>
                        )}
                      </div>
                    </div>
                    {m.description && <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{m.description}</p>}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[10px] text-on-surface-variant/60">
                        By {m.uploadedBy || 'Unknown'} ({m.uploadedByRole || 'admin'}) · {fmtDate(m.createdAt)}
                      </span>
                      {m.downloads > 0 && (
                        <span className="text-[10px] text-on-surface-variant/60 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">download</span>
                          {m.downloads} opens
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <a href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-semibold hover:bg-surface-container-high transition-colors">
                        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                        Open
                      </a>
                      <button onClick={() => handleToggle(m)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${m.isPublished === false ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                        <span className="material-symbols-outlined text-[12px]">{m.isPublished === false ? 'visibility' : 'visibility_off'}</span>
                        {m.isPublished === false ? 'Publish' : 'Hide'}
                      </button>
                      <button onClick={() => openEdit(m)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-semibold hover:bg-surface-container-high transition-colors">
                        <span className="material-symbols-outlined text-[12px]">edit</span>
                        Edit
                      </button>
                      <button onClick={() => setDeleteId(m.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] font-semibold hover:bg-red-100 transition-colors">
                        <span className="material-symbols-outlined text-[12px]">delete</span>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="signature-gradient px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                <div>
                  <h2 className="text-lg font-extrabold text-white font-headline">{editing ? 'Edit Material' : 'Add Study Material'}</h2>
                  <p className="text-white/60 text-xs">Add a study resource for students</p>
                </div>
              </div>
              <button onClick={() => setModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
                <span className="material-symbols-outlined text-white text-base">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-red-500 text-base">error</span>
                  <p className="text-red-700 text-sm font-semibold">{error}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. React Hooks — Complete Reference Guide"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Subject</label>
                  <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g. Web Development"
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">File Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Resource Link *</label>
                <input value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))}
                  placeholder="Paste the shareable file link here"
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="text-[10px] text-on-surface-variant/50 mt-1.5">
                  Paste a shareable link to your file. Make sure it is set to "Anyone with the link" can view.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of what this material covers…"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Visible To</label>
                  <select value={form.planKey} onChange={e => setForm(f => ({ ...f, planKey: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {PLAN_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Tags</label>
                  <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="notes, react, week3"
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 space-y-3">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Student Permissions</p>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Allow Preview</p>
                    <p className="text-[11px] text-on-surface-variant/70">Students can view this file inline</p>
                  </div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, allowPreview: !f.allowPreview }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.allowPreview ? 'bg-primary' : 'bg-outline/30'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.allowPreview ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Allow Download</p>
                    <p className="text-[11px] text-on-surface-variant/70">Students can download this file</p>
                  </div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, allowDownload: !f.allowDownload }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.allowDownload ? 'bg-primary' : 'bg-outline/30'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.allowDownload ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-outline-variant/10 flex-shrink-0">
              <button onClick={() => setModal(false)}
                className="flex-1 py-3 rounded-2xl border border-outline-variant/30 text-on-surface-variant font-semibold text-sm hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {saving
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
                  : <><span className="material-symbols-outlined text-base">save</span>{editing ? 'Save Changes' : 'Add Material'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
              </div>
              <div>
                <p className="font-bold text-base">Delete Material?</p>
                <p className="text-xs text-on-surface-variant">Students will immediately lose access.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl border border-outline-variant/30 font-semibold text-sm hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[700] text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl whitespace-nowrap ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
          {toast.msg}
        </div>
      )}
    </AdminLayout>
  );
}
