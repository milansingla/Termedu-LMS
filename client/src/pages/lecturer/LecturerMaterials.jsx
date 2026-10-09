import { useState, useEffect, useCallback } from 'react';
import LecturerLayout from './LecturerLayout';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';

const TYPE_OPTS = [
  { value: 'pdf',   label: 'PDF Document',  icon: 'picture_as_pdf', color: 'text-red-500',    bg: 'bg-red-50' },
  { value: 'video', label: 'Video',          icon: 'play_circle',    color: 'text-blue-600',   bg: 'bg-blue-50' },
  { value: 'doc',   label: 'Word / Doc',     icon: 'description',    color: 'text-blue-500',   bg: 'bg-blue-50' },
  { value: 'image', label: 'Image',          icon: 'image',          color: 'text-green-500',  bg: 'bg-green-50' },
  { value: 'ppt',   label: 'Presentation',   icon: 'slideshow',      color: 'text-orange-500', bg: 'bg-orange-50' },
  { value: 'zip',   label: 'ZIP / Archive',  icon: 'folder_zip',     color: 'text-gray-500',   bg: 'bg-gray-100' },
  { value: 'other', label: 'Other',          icon: 'insert_drive_file', color: 'text-gray-400', bg: 'bg-gray-100' },
];

const PLAN_OPTS = [
  { value: 'all',     label: 'All Plans'    },
  { value: 'starter', label: 'Starter Plan' },
  { value: 'growth',  label: 'Growth Plan'  },
  { value: 'premium', label: 'Premium Plan' },
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

function TypeIcon({ type, size = 'md' }) {
  const t = TYPE_OPTS.find(o => o.value === type) || TYPE_OPTS[TYPE_OPTS.length - 1];
  const sz = size === 'sm' ? 'w-9 h-9 text-lg' : 'w-11 h-11 text-2xl';
  return (
    <div className={`${sz} rounded-xl flex-shrink-0 flex items-center justify-center ${t.bg}`}>
      <span className={`material-symbols-outlined ${t.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{t.icon}</span>
    </div>
  );
}

export default function LecturerMaterials() {
  const { currentUser } = useApp();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [toast, setToast]         = useState('');
  const [deleteId, setDeleteId]   = useState(null);
  const [search, setSearch]       = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiFetch('/api/data/materials?publishedOnly=false');
      setMaterials(all.filter(m => m.uploadedById === currentUser?.id));
    } catch { setMaterials([]); }
    setLoading(false);
  }, [currentUser?.id]);

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
    setEditing(m);
    setError('');
    setModal(true);
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
        uploadedBy: currentUser?.name || 'Lecturer',
        uploadedById: currentUser?.id,
        uploadedByRole: 'lecturer',
      };
      if (editing) {
        const updated = await apiFetch(`/api/data/materials/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMaterials(prev => prev.map(m => m.id === editing.id ? updated : m));
        showToast('Material updated successfully.');
      } else {
        const created = await apiFetch('/api/data/materials', { method: 'POST', body: JSON.stringify(payload) });
        setMaterials(prev => [created, ...prev]);
        showToast('Material added successfully.');
      }
      setModal(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (m) => {
    try {
      const updated = await apiFetch(`/api/data/materials/${m.id}`, {
        method: 'PATCH', body: JSON.stringify({ isPublished: !m.isPublished }),
      });
      setMaterials(prev => prev.map(x => x.id === m.id ? updated : x));
      showToast(updated.isPublished ? 'Published — students can see this.' : 'Unpublished — hidden from students.');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/api/data/materials/${id}`, { method: 'DELETE' });
      setMaterials(prev => prev.filter(m => m.id !== id));
      setDeleteId(null);
      showToast('Material deleted.');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const filtered = materials.filter(m =>
    !search ||
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    (m.subject || '').toLowerCase().includes(search.toLowerCase())
  );

  const published   = materials.filter(m => m.isPublished !== false).length;
  const unpublished = materials.length - published;

  return (
    <LecturerLayout title="Study Materials">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: materials.length, icon: 'folder', color: 'text-violet-600 bg-violet-50' },
          { label: 'Published', value: published, icon: 'visibility', color: 'text-green-600 bg-green-50' },
          { label: 'Hidden', value: unpublished, icon: 'visibility_off', color: 'text-gray-500 bg-gray-100' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
            </div>
            <div>
              <p className="text-lg font-extrabold leading-none">{s.value}</p>
              <p className="text-[10px] text-on-surface-variant font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none material-symbols-outlined text-outline text-base">search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search your materials…"
            className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl signature-gradient text-white font-bold text-sm shadow-md flex-shrink-0">
          <span className="material-symbols-outlined text-base">add</span>
          Add Material
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="material-symbols-outlined text-5xl text-outline/30">folder_open</span>
          <p className="font-bold text-on-surface-variant">
            {materials.length === 0 ? 'No materials yet' : 'No results found'}
          </p>
          <p className="text-xs text-on-surface-variant/60">
            {materials.length === 0 ? 'Click "Add Material" to upload your first resource.' : 'Try a different search.'}
          </p>
          {materials.length === 0 && (
            <button onClick={openAdd} className="mt-2 px-5 py-2.5 rounded-xl signature-gradient text-white font-bold text-sm shadow-md">
              Add Your First Material
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => {
            const pb = PLAN_BADGE[m.planKey] || PLAN_BADGE.all;
            return (
              <div key={m.id}
                className={`bg-surface-container-lowest rounded-2xl border shadow-sm p-4 transition-all ${m.isPublished === false ? 'border-outline-variant/10 opacity-70' : 'border-outline-variant/10'}`}>
                <div className="flex items-start gap-3">
                  <TypeIcon type={m.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm leading-snug">{m.title}</h3>
                        {m.subject && <p className="text-xs text-primary font-semibold mt-0.5">{m.subject}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${pb.cls}`}>{pb.label}</span>
                        {m.isPublished === false && (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">HIDDEN</span>
                        )}
                      </div>
                    </div>
                    {m.description && (
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{m.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-on-surface-variant/60">{fmtDate(m.createdAt)}</span>
                      {m.downloads > 0 && (
                        <span className="text-[10px] text-on-surface-variant/60 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">download</span>
                          {m.downloads} opens
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant/10">
                  <a href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-xs font-semibold hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                    Open
                  </a>
                  <button onClick={() => handleTogglePublish(m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${m.isPublished === false ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                    <span className="material-symbols-outlined text-[13px]">{m.isPublished === false ? 'visibility' : 'visibility_off'}</span>
                    {m.isPublished === false ? 'Publish' : 'Hide'}
                  </button>
                  <button onClick={() => openEdit(m)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-xs font-semibold hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-[13px]">edit</span>
                    Edit
                  </button>
                  <button onClick={() => setDeleteId(m.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors ml-auto">
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="signature-gradient px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                <div>
                  <h2 className="text-lg font-extrabold text-white font-headline">{editing ? 'Edit Material' : 'Add Study Material'}</h2>
                  <p className="text-white/60 text-xs">Add a study resource for your students</p>
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
                  placeholder="e.g. JavaScript Fundamentals — Week 1 Notes"
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
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5 block">Tags (comma separated)</label>
                  <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="notes, week1, html"
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
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
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
                <p className="text-xs text-on-surface-variant">This action cannot be undone.</p>
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
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[700] bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}
    </LecturerLayout>
  );
}
