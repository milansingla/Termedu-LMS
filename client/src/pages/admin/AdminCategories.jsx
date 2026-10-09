import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';

const ICON_OPTIONS = [
  'menu_book','trending_up','diamond','live_tv','support_agent','work',
  'school','code','psychology','science','palette','music_note',
  'fitness_center','language','calculate','biotech','architecture','brush',
  'computer','devices','edit','engineering','explore','face',
  'flash_on','groups','handshake','hub','insights','lightbulb',
  'local_fire_department','military_tech','person','rocket_launch','settings',
  'sports_esports','star','thumb_up','verified','workspace_premium',
];

function genId() {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminCategories() {
  const { categories, updateCategories } = useApp();
  const [cats, setCats] = useState(() =>
    categories.length ? categories.map(c => ({ ...c })) : []
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('menu_book');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('menu_book');
  const [showNewIconPicker, setShowNewIconPicker] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const isDirty = JSON.stringify(cats) !== JSON.stringify(categories);

  const handleSave = async () => {
    setSaving(true);
    updateCategories(cats);
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const startEdit = (cat) => {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setShowIconPicker(false);
    setAdding(false);
  };

  const commitEdit = () => {
    if (!editName.trim()) return;
    setCats(prev => prev.map(c => c.id === editId ? { ...c, name: editName.trim(), icon: editIcon } : c));
    setEditId(null);
    setShowIconPicker(false);
  };

  const cancelEdit = () => { setEditId(null); setShowIconPicker(false); };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setCats(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  };

  const moveDown = (idx) => {
    setCats(prev => {
      if (idx === prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  };

  const confirmDelete = (id) => setDeleteId(id);
  const doDelete = () => {
    setCats(prev => prev.filter(c => c.id !== deleteId));
    setDeleteId(null);
    if (editId === deleteId) setEditId(null);
  };

  const addCategory = () => {
    if (!newName.trim()) return;
    setCats(prev => [...prev, { id: genId(), name: newName.trim(), icon: newIcon }]);
    setNewName('');
    setNewIcon('menu_book');
    setAdding(false);
    setShowNewIconPicker(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-xl py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold font-headline">Browse Categories</h1>
            <p className="text-xs text-on-surface-variant mt-0.5">Manage the category chips shown on the student home screen.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
              saved ? 'bg-green-500 text-white' :
              isDirty ? 'signature-gradient text-white shadow-md' :
              'bg-surface-container-high text-on-surface-variant opacity-50 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {saved ? 'check_circle' : saving ? 'sync' : 'save'}
            </span>
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Category list */}
        <div className="space-y-2">
          {cats.map((cat, idx) => (
            <div key={cat.id} className={`bg-surface-container rounded-2xl border transition-all ${editId === cat.id ? 'border-primary/40 shadow-sm' : 'border-outline-variant/20'}`}>
              {editId === cat.id ? (
                /* ─── Edit row ─── */
                <div className="p-4 space-y-3">
                  <div className="flex gap-3 items-center">
                    <button
                      onClick={() => setShowIconPicker(v => !v)}
                      className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border-2 border-primary/30 active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{editIcon}</span>
                    </button>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder="Category name"
                      className="flex-1 bg-surface-container-high rounded-xl px-4 py-2.5 text-sm font-semibold outline-none border border-outline-variant/30 focus:border-primary"
                      autoFocus
                    />
                  </div>
                  {showIconPicker && (
                    <div className="grid grid-cols-8 gap-1.5 p-3 bg-surface-container-high rounded-xl border border-outline-variant/20 max-h-40 overflow-y-auto">
                      {ICON_OPTIONS.map(ic => (
                        <button key={ic} onClick={() => { setEditIcon(ic); setShowIconPicker(false); }}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${editIcon === ic ? 'bg-primary text-white' : 'hover:bg-primary/10 text-on-surface-variant'}`}
                          title={ic}
                        >
                          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{ic}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={commitEdit} className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 transition-transform">Done</button>
                    <button onClick={cancelEdit} className="flex-1 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-sm font-bold active:scale-95 transition-transform">Cancel</button>
                  </div>
                </div>
              ) : (
                /* ─── Display row ─── */
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                  </div>
                  <span className="flex-1 font-semibold text-sm">{cat.name}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                    </button>
                    <button onClick={() => moveDown(idx)} disabled={idx === cats.length - 1}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                    </button>
                    <button onClick={() => startEdit(cat)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button onClick={() => confirmDelete(cat.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new category */}
        {adding ? (
          <div className="bg-surface-container rounded-2xl border border-primary/30 p-4 space-y-3">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">New Category</p>
            <div className="flex gap-3 items-center">
              <button
                onClick={() => setShowNewIconPicker(v => !v)}
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border-2 border-primary/30 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{newIcon}</span>
              </button>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') { setAdding(false); setShowNewIconPicker(false); } }}
                placeholder="Category name"
                className="flex-1 bg-surface-container-high rounded-xl px-4 py-2.5 text-sm font-semibold outline-none border border-outline-variant/30 focus:border-primary"
                autoFocus
              />
            </div>
            {showNewIconPicker && (
              <div className="grid grid-cols-8 gap-1.5 p-3 bg-surface-container-high rounded-xl border border-outline-variant/20 max-h-40 overflow-y-auto">
                {ICON_OPTIONS.map(ic => (
                  <button key={ic} onClick={() => { setNewIcon(ic); setShowNewIconPicker(false); }}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${newIcon === ic ? 'bg-primary text-white' : 'hover:bg-primary/10 text-on-surface-variant'}`}
                    title={ic}
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{ic}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={addCategory} className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 transition-transform">Add</button>
              <button onClick={() => { setAdding(false); setShowNewIconPicker(false); }} className="flex-1 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-sm font-bold active:scale-95 transition-transform">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold text-sm hover:bg-primary/5 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Add Category
          </button>
        )}

        {/* Delete confirmation modal */}
        {deleteId && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-6">
            <div className="bg-surface rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-red-500 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
              </div>
              <div className="text-center space-y-1">
                <p className="font-extrabold text-lg">Delete category?</p>
                <p className="text-sm text-on-surface-variant">
                  "{cats.find(c => c.id === deleteId)?.name}" will be removed from the home screen.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-3 rounded-2xl bg-surface-container font-bold text-sm active:scale-95 transition-transform">Cancel</button>
                <button onClick={doDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-transform">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
