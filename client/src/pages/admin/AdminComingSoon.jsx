import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useComingSoon } from '../../context/ComingSoonContext';

const CATEGORIES = ['Course', 'Feature', 'Event', 'Workshop', 'Tool', 'Update'];

const PLAN_OPTIONS = [
  { key: 'all',     label: 'All Plans', icon: 'public',            badge: 'bg-green-100 text-green-700' },
  { key: 'starter', label: 'Starter',   icon: 'school',            badge: 'bg-slate-100 text-slate-700' },
  { key: 'growth',  label: 'Growth',    icon: 'trending_up',       badge: 'bg-purple-100 text-purple-700' },
  { key: 'premium', label: 'Premium',   icon: 'workspace_premium', badge: 'bg-pink-100 text-pink-700' },
];
const ICONS = [
  'rocket_launch', 'school', 'live_tv', 'star', 'bolt', 'celebration',
  'groups', 'workspace_premium', 'emoji_events', 'local_fire_department',
  'auto_awesome', 'lightbulb', 'code', 'devices', 'psychology',
  'build', 'science', 'terminal', 'videocam', 'campaign',
];

const CAT_COLOR = {
  Course:   'bg-violet-100 text-violet-700',
  Feature:  'bg-blue-100 text-blue-700',
  Event:    'bg-emerald-100 text-emerald-700',
  Workshop: 'bg-amber-100 text-amber-700',
  Tool:     'bg-cyan-100 text-cyan-700',
  Update:   'bg-rose-100 text-rose-700',
};

function formatLaunch(date, time) {
  if (!date) return '—';
  const d = new Date(`${date}T${time || '00:00'}`);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function countdown(date, time) {
  if (!date) return null;
  const target = new Date(`${date}T${time || '00:00'}`);
  const diff = target - Date.now();
  if (diff <= 0) return 'Launched';
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const EMPTY = {
  title: '', description: '', category: 'Course', icon: 'rocket_launch',
  launchDate: '', launchTime: '', tags: '', visible: true, color: 'violet', plan: 'all',
};

const COLOR_OPTIONS = [
  { key: 'violet', label: 'Violet', from: 'from-violet-600', to: 'to-purple-500' },
  { key: 'blue',   label: 'Blue',   from: 'from-blue-600',   to: 'to-cyan-500' },
  { key: 'rose',   label: 'Rose',   from: 'from-rose-600',   to: 'to-pink-500' },
  { key: 'amber',  label: 'Amber',  from: 'from-amber-500',  to: 'to-orange-400' },
  { key: 'emerald',label: 'Green',  from: 'from-emerald-600',to: 'to-teal-500' },
  { key: 'slate',  label: 'Slate',  from: 'from-slate-700',  to: 'to-slate-500' },
];

const GRAD = {
  violet:  'from-violet-600 to-purple-500',
  blue:    'from-blue-600 to-cyan-500',
  rose:    'from-rose-600 to-pink-500',
  amber:   'from-amber-500 to-orange-400',
  emerald: 'from-emerald-600 to-teal-500',
  slate:   'from-slate-700 to-slate-500',
};

export default function AdminComingSoon() {
  const { items, loading, addItem, updateItem, deleteItem, toggleVisible } = useComingSoon();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterCat, setFilterCat] = useState('all');

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title || '',
      description: item.description || '',
      category: item.category || 'Course',
      icon: item.icon || 'rocket_launch',
      launchDate: item.launchDate || '',
      launchTime: item.launchTime || '',
      tags: (item.tags || []).join(', '),
      visible: item.visible !== false,
      color: item.color || 'violet',
      plan: item.plan || 'all',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    if (editing) await updateItem(editing.id, payload);
    else await addItem(payload);
    setSaving(false);
    closeModal();
  };

  const handleDelete = async (id) => {
    await deleteItem(id);
    setConfirmDelete(null);
  };

  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat);
  const visible   = items.filter(i => i.visible).length;
  const launched  = items.filter(i => i.launchDate && new Date(`${i.launchDate}T${i.launchTime || '00:00'}`) <= new Date()).length;

  return (
    <AdminLayout>
      <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Coming Soon</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Announce upcoming courses, features &amp; events</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl signature-gradient text-white font-bold shadow-md hover:opacity-90 transition-all text-sm flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Item
          </button>
        </div>

        {/* Stats — 3 compact cards, stack on tiny screens */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: 'Total',   value: items.length, icon: 'list_alt',      color: 'text-primary' },
            { label: 'Visible', value: visible,       icon: 'visibility',   color: 'text-emerald-600' },
            { label: 'Live',    value: launched,      icon: 'rocket_launch', color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-outline-variant/10 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <span className={`material-symbols-outlined text-xl sm:text-2xl ${s.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
              <div>
                <p className="text-xl font-bold text-on-surface leading-none">{s.value}</p>
                <p className="text-[10px] sm:text-[11px] text-on-surface-variant mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter — horizontally scrollable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {['all', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all capitalize flex-shrink-0 ${
                filterCat === c ? 'signature-gradient text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        {/* Items list */}
        {loading ? (
          <div className="text-center text-on-surface-variant py-20 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl opacity-30">hourglass_empty</span>
            <p className="text-sm">No coming soon items yet.</p>
            <button onClick={openAdd} className="text-primary text-sm font-semibold hover:underline">+ Add one</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const cd = countdown(item.launchDate, item.launchTime);
              const grad = GRAD[item.color] || GRAD.violet;
              const planOpt = PLAN_OPTIONS.find(o => o.key === (item.plan || 'all'));
              return (
                <div key={item.id}
                  className={`relative overflow-hidden rounded-2xl bg-white border border-outline-variant/10 shadow-sm flex items-stretch ${!item.visible ? 'opacity-60' : ''}`}>
                  {/* Color strip */}
                  <div className={`w-1.5 flex-shrink-0 bg-gradient-to-b ${grad} rounded-l-2xl`} />

                  {/* Main content — full-width stacking layout */}
                  <div className="flex-1 p-3 sm:p-4 min-w-0">
                    {/* Top row: icon + title + badges */}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <span className="material-symbols-outlined text-white text-[20px] sm:text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon || 'rocket_launch'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-on-surface leading-tight">{item.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAT_COLOR[item.category] || 'bg-gray-100 text-gray-600'}`}>
                            {item.category}
                          </span>
                          {planOpt && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${planOpt.badge}`}>
                              <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>{planOpt.icon}</span>
                              {planOpt.label}
                            </span>
                          )}
                          {!item.visible && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Hidden</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-on-surface-variant mt-2 line-clamp-2">{item.description}</p>
                    )}

                    {/* Date + countdown + tags */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {item.launchDate && (
                        <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                          <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                          {formatLaunch(item.launchDate, item.launchTime)}
                        </span>
                      )}
                      {cd && (
                        <span className={`text-[11px] font-bold ${cd === 'Launched' ? 'text-emerald-600' : 'text-primary'}`}>
                          {cd === 'Launched' ? '✓ Launched' : `⏱ ${cd} left`}
                        </span>
                      )}
                      {item.tags?.slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>

                    {/* Action row — always horizontal, sits below content */}
                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-outline-variant/10">
                      <button onClick={() => toggleVisible(item.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          item.visible ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-on-surface-variant bg-surface-container hover:bg-surface-container-high'
                        }`}>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: `'FILL' ${item.visible ? 1 : 0}` }}>
                          {item.visible ? 'visibility' : 'visibility_off'}
                        </span>
                        {item.visible ? 'Visible' : 'Hidden'}
                      </button>
                      <button onClick={() => openEdit(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary-fixed/20 hover:bg-primary-fixed/40 transition-all">
                        <span className="material-symbols-outlined text-[15px]">edit</span>
                        Edit
                      </button>
                      <button onClick={() => setConfirmDelete(item.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all ml-auto">
                        <span className="material-symbols-outlined text-[15px]">delete</span>
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
              <h2 className="text-base font-bold text-on-surface">{editing ? 'Edit Item' : 'Add Coming Soon Item'}</h2>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-surface-container transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Advanced React Course"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Brief description shown to students…"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>

              {/* Category + Icon */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Icon</label>
                  <select value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {ICONS.map(ic => <option key={ic} value={ic}>{ic.replaceAll('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              {/* Launch Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Launch Date *</label>
                  <input type="date" value={form.launchDate} onChange={e => setForm(f => ({ ...f, launchDate: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Launch Time</label>
                  <input type="time" value={form.launchTime} onChange={e => setForm(f => ({ ...f, launchTime: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2">Card Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c.key} onClick={() => setForm(f => ({ ...f, color: c.key }))}
                      title={c.label}
                      className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c.from} ${c.to} transition-all ${form.color === c.key ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'}`} />
                  ))}
                </div>
              </div>

              {/* Plan */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2">Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLAN_OPTIONS.map(p => (
                    <button key={p.key} type="button"
                      onClick={() => setForm(f => ({ ...f, plan: p.key }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        form.plan === p.key
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-outline-variant/30 bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}>
                      <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: `'FILL' ${form.plan === p.key ? 1 : 0}` }}>{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Tags <span className="font-normal">(comma-separated)</span></label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="React, UI Design, Beginner…"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Visibility */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))} className="sr-only peer" />
                  <div className="w-10 h-6 rounded-full bg-outline-variant/40 peer-checked:bg-primary transition-all" />
                  <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-all peer-checked:translate-x-4" />
                </div>
                <span className="text-sm font-medium text-on-surface">Visible to students</span>
              </label>

              {/* Live preview */}
              <div>
                <p className="text-xs font-semibold text-on-surface-variant mb-2">Preview</p>
                <div className={`rounded-2xl p-4 bg-gradient-to-br ${GRAD[form.color] || GRAD.violet} text-white flex items-center gap-3 shadow-md`}>
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{form.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{form.title || 'Item title'}</p>
                    <p className="text-xs text-white/80 truncate">{form.description || 'Description appears here'}</p>
                    {form.launchDate && (
                      <p className="text-[10px] text-white/70 mt-0.5">🗓 {formatLaunch(form.launchDate, form.launchTime)}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/20">{form.category}</span>
                    {form.plan !== 'all' && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/30 capitalize">{form.plan}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-outline-variant/10 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.launchDate}
                className="flex-1 py-2.5 rounded-xl signature-gradient text-white text-sm font-bold disabled:opacity-50 transition-all">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500">delete</span>
              </div>
              <div>
                <p className="font-bold text-on-surface">Delete item?</p>
                <p className="text-xs text-on-surface-variant">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold hover:bg-surface-container transition-all">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
