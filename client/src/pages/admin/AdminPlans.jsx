import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';

const CORE_PLAN_KEYS = ['starter', 'growth', 'premium'];
const TEET_PLANS     = ['growth', 'premium'];

const PLAN_ACCENT = {
  starter: { card: 'border-slate-200',  badge: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  growth:  { card: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  premium: { card: 'border-pink-200',   badge: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-500'   },
};
const DEFAULT_ACCENT = { card: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' };

function normPlan(plan) { return (plan || '').toLowerCase().replace(/[^a-z]/g, ''); }
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'plan_' + Date.now();
}

export default function AdminPlans() {
  const { planConfigs, updatePlanConfig, addPlanConfig, removePlanConfig, appUsers } = useApp();
  const { courses: ctxCourses, updateCourse } = useCourses();
  const [expandedPicker, setExpandedPicker] = useState(null);

  const [editingKey, setEditingKey]     = useState(null);
  const [saved, setSaved]               = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [addModal, setAddModal]         = useState(false);
  const [form, setForm]                 = useState({});
  const [newFeature, setNewFeature]     = useState('');

  const planOrder = Object.keys(planConfigs).filter(k => k !== 'none');

  const openEdit = (key) => {
    const p = planConfigs[key];
    setForm({
      name: p.name || '',
      price: (p.price || '').replace('₹', '').replace(/,/g, ''),
      tagline: p.tagline || '',
      btnLabel: p.btnLabel || '',
      badge: p.badge || '',
      features: [...(p.features || [])],
      liveClasses: !!p.liveClasses,
      recordings: !!p.recordings,
      download: !!p.download,
      mentorAccess: !!p.mentorAccess,
    });
    setEditingKey(key);
  };

  const handleSave = () => {
    const priceNum = parseInt(form.price.replace(/[^\d]/g, ''), 10) || 0;
    updatePlanConfig(editingKey, {
      name: form.name.toUpperCase(),
      price: `₹${Number(priceNum).toLocaleString('en-IN')}`,
      priceNum,
      tagline: form.tagline,
      btnLabel: form.btnLabel,
      badge: form.badge || null,
      features: form.features,
      liveClasses: form.liveClasses,
      recordings: form.recordings,
      download: form.download,
      mentorAccess: form.mentorAccess,
    });
    setEditingKey(null);
    setSaved(editingKey);
    setTimeout(() => setSaved(null), 2500);
  };

  const removeFeature = (i) => setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));
  const addFeature = () => {
    if (!newFeature.trim()) return;
    setForm(f => ({ ...f, features: [...f.features, newFeature.trim()] }));
    setNewFeature('');
  };

  const [newPlan, setNewPlan] = useState({ name: '', price: '', tagline: '', btnLabel: '', badge: '', features: [], liveClasses: false, recordings: false, download: false, mentorAccess: false });
  const [newFeatureAdd, setNewFeatureAdd] = useState('');

  const handleAddPlan = () => {
    if (!newPlan.name.trim()) return;
    const key = slugify(newPlan.name);
    const priceNum = parseInt(newPlan.price.replace(/[^\d]/g, ''), 10) || 0;
    addPlanConfig(key, {
      name: newPlan.name.toUpperCase(),
      price: `₹${Number(priceNum).toLocaleString('en-IN')}`,
      priceNum,
      tagline: newPlan.tagline,
      btnLabel: newPlan.btnLabel || 'ENROLL NOW',
      badge: newPlan.badge || null,
      features: newPlan.features,
      liveClasses: newPlan.liveClasses,
      recordings: newPlan.recordings,
      download: newPlan.download,
      mentorAccess: newPlan.mentorAccess,
    });
    setAddModal(false);
    setNewPlan({ name: '', price: '', tagline: '', btnLabel: '', badge: '', features: [], liveClasses: false, recordings: false, download: false, mentorAccess: false });
    setSaved(key);
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 pt-2">

        {/* Header */}
        <section className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-primary font-semibold tracking-widest font-headline text-xs uppercase">Admin Panel</p>
            <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight mt-1">Pricing Plans</h1>
            <p className="text-on-surface-variant text-sm mt-1">All plan controls in one place — availability, TEET gate, features, pricing.</p>
          </div>
          <button onClick={() => setAddModal(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl signature-gradient text-white text-sm font-bold shadow-md flex-shrink-0">
            <span className="material-symbols-outlined text-sm">add</span>Add Plan
          </button>
        </section>

        {/* Save toast */}
        {saved && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <span className="material-symbols-outlined text-green-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p className="text-green-700 text-sm font-medium">Plan saved successfully.</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="space-y-5">
          {planOrder.map((key) => {
            const plan = planConfigs[key];
            if (!plan) return null;
            const accent    = PLAN_ACCENT[key] || DEFAULT_ACCENT;
            const isCore    = CORE_PLAN_KEYS.includes(key);
            const isTeetPlan = TEET_PLANS.includes(key);
            const teetRequired = plan.teetRequired !== undefined ? plan.teetRequired : isTeetPlan;

            const enrolledUsers = appUsers.filter(u => normPlan(u.plan) === key);
            const revenue       = enrolledUsers.length * (plan.priceNum || 0);
            const linkedCourses = (ctxCourses || []).filter(c => c.planKey === key);

            return (
              <div key={key} className={`bg-surface-container-lowest rounded-3xl border-2 ${accent.card} shadow-sm overflow-hidden`}>

                {/* Plan top banner when coming soon */}
                {plan.comingSoon && (
                  <div className="flex items-center justify-center gap-1.5 bg-amber-500/10 border-b border-amber-200 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-700">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                    Batch Opening Soon — visible to students
                  </div>
                )}

                <div className="p-6 space-y-5">

                  {/* Plan identity row */}
                  <div className="flex items-start gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-2 ${accent.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-extrabold text-on-surface tracking-wide">{plan.name}</h2>
                        {plan.badge && (
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${accent.badge}`}>{plan.badge}</span>
                        )}
                        {isCore && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Core</span>
                        )}
                      </div>
                      <p className="text-2xl font-extrabold text-primary mt-0.5">{plan.price}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{plan.tagline}</p>
                    </div>
                  </div>

                  {/* Enrollment stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-container rounded-2xl px-4 py-3 flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                      <div>
                        <p className="text-lg font-extrabold text-on-surface leading-none">{enrolledUsers.length}</p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">Students Enrolled</p>
                      </div>
                    </div>
                    <div className="bg-surface-container rounded-2xl px-4 py-3 flex items-center gap-3">
                      <span className="material-symbols-outlined text-green-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>currency_rupee</span>
                      <div>
                        <p className="text-lg font-extrabold text-on-surface leading-none">
                          {revenue >= 100000 ? `₹${(revenue/100000).toFixed(1)}L` : revenue >= 1000 ? `₹${(revenue/1000).toFixed(0)}k` : `₹${revenue}`}
                        </p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">Est. Revenue</p>
                      </div>
                    </div>
                  </div>

                  {/* Linked courses */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest">Linked Courses ({linkedCourses.length})</p>
                      <button
                        onClick={() => setExpandedPicker(expandedPicker === key ? null : key)}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:opacity-80 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-sm">{expandedPicker === key ? 'close' : 'add_circle'}</span>
                        {expandedPicker === key ? 'Done' : 'Assign'}
                      </button>
                    </div>

                    {/* Currently linked — show with remove button */}
                    {linkedCourses.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {linkedCourses.map(c => (
                          <div key={c.id} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-medium text-primary">
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
                            {c.title}
                            <button
                              onClick={() => updateCourse(c.id, { planKey: 'none' })}
                              className="w-4 h-4 rounded-full bg-primary/20 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors ml-0.5"
                            >
                              <span className="material-symbols-outlined text-[11px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !expandedPicker || expandedPicker !== key
                        ? <p className="text-xs text-on-surface-variant italic mb-2">No courses linked — tap Assign to add.</p>
                        : null
                    )}

                    {/* Picker: unlinked courses to assign */}
                    {expandedPicker === key && (() => {
                      const unlinked = (ctxCourses || []).filter(c => !c.isPlanProgram && (!c.planKey || c.planKey === 'none' || c.planKey !== key));
                      return unlinked.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic">All courses are already assigned to a plan.</p>
                      ) : (
                        <div className="bg-surface-container rounded-2xl p-3 space-y-1.5 mt-1">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Tap to assign:</p>
                          {unlinked.map(c => (
                            <button
                              key={c.id}
                              onClick={() => updateCourse(c.id, { planKey: key })}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-left transition-colors group"
                            >
                              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'} flex items-center justify-center flex-shrink-0`}>
                                <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-on-surface truncate">{c.title}</p>
                                {c.planKey && c.planKey !== 'none' && (
                                  <p className="text-[10px] text-amber-600 font-medium">Currently in {c.planKey}</p>
                                )}
                              </div>
                              <span className="material-symbols-outlined text-primary text-sm opacity-0 group-hover:opacity-100 transition-opacity">add_circle</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Features */}
                  <div>
                    <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Features ({(plan.features || []).length})</p>
                    <div className="flex flex-wrap gap-2">
                      {(plan.features || []).length === 0
                        ? <span className="text-xs text-on-surface-variant italic">No features listed</span>
                        : (plan.features || []).map((f, i) => (
                          <span key={i} className="text-xs bg-surface-container px-3 py-1.5 rounded-full text-on-surface-variant border border-outline-variant/20">{f}</span>
                        ))
                      }
                    </div>
                  </div>

                  {/* Access permissions */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Live Classes', value: plan.liveClasses, icon: 'live_tv' },
                      { label: 'Recordings',   value: plan.recordings,  icon: 'play_circle' },
                      { label: 'Downloads',    value: plan.download,    icon: 'download' },
                      { label: 'Mentor Access',value: plan.mentorAccess,icon: 'support_agent' },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${value ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-surface-container text-on-surface-variant border border-outline-variant/10'}`}>
                        <span className="material-symbols-outlined text-sm" style={value ? { fontVariationSettings: "'FILL' 1" } : {}}>{icon}</span>
                        {label}
                        <span className="ml-auto font-bold">{value ? '✓' : '✗'}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Action controls ── */}
                  <div className="pt-4 border-t border-outline-variant/20 space-y-2">

                    {/* Row 1: Coming Soon + TEET */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => updatePlanConfig(key, { comingSoon: !plan.comingSoon })}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          plan.comingSoon
                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                            : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${plan.comingSoon ? 1 : 0}` }}>hourglass_top</span>
                        {plan.comingSoon ? 'Coming Soon: ON' : 'Coming Soon: OFF'}
                      </button>

                      <button
                        onClick={() => updatePlanConfig(key, { teetRequired: !teetRequired })}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          teetRequired
                            ? 'bg-violet-500 text-white hover:bg-violet-600'
                            : 'bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${teetRequired ? 1 : 0}` }}>school</span>
                        {teetRequired ? 'TEET: Required' : 'TEET: Open'}
                      </button>
                    </div>

                    {/* Row 2: Edit + Delete */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(key)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>Edit Plan
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(key)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-error/10 text-error text-sm font-semibold hover:bg-error/20 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Edit Plan Modal ── */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-on-surface">Edit {planConfigs[editingKey]?.name}</h3>
              <button onClick={() => setEditingKey(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <PlanForm form={form} setForm={setForm} newFeature={newFeature} setNewFeature={setNewFeature} addFeature={addFeature} removeFeature={removeFeature} />
            <button onClick={handleSave} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold text-sm flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base">save</span>Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Add Plan Modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-on-surface">New Plan</h3>
              <button onClick={() => setAddModal(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <PlanForm
              form={newPlan}
              setForm={setNewPlan}
              newFeature={newFeatureAdd}
              setNewFeature={setNewFeatureAdd}
              addFeature={() => {
                if (!newFeatureAdd.trim()) return;
                setNewPlan(f => ({ ...f, features: [...f.features, newFeatureAdd.trim()] }));
                setNewFeatureAdd('');
              }}
              removeFeature={(i) => setNewPlan(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))}
            />
            <button onClick={handleAddPlan} disabled={!newPlan.name.trim()} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <span className="material-symbols-outlined text-base">add</span>Create Plan
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-error text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
            </div>
            <h3 className="font-headline font-bold text-lg">Delete Plan?</h3>
            <p className="text-sm text-on-surface-variant">
              This will permanently remove <span className="font-bold text-on-surface">"{planConfigs[deleteConfirm]?.name}"</span>.
              {CORE_PLAN_KEYS.includes(deleteConfirm) && (
                <span className="block mt-2 text-amber-600 font-semibold text-xs">⚠ This is a core plan. Students with this plan will lose access.</span>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={() => { removePlanConfig(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 py-3 rounded-2xl bg-error text-white font-bold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function PlanForm({ form, setForm, newFeature, setNewFeature, addFeature, removeFeature }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Plan Name *</label>
        <input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g., ELITE" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Price (₹)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
          <input type="number" value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Tagline</label>
        <input value={form.tagline || ''} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
          placeholder="Best for..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Button Label</label>
        <input value={form.btnLabel || ''} onChange={e => setForm(f => ({ ...f, btnLabel: e.target.value }))}
          placeholder="e.g., ENROLL NOW" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Badge <span className="normal-case text-slate-400">(optional)</span></label>
        <input value={form.badge || ''} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
          placeholder="e.g., POPULAR, BEST VALUE" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Features</label>
        <div className="space-y-2 mb-3">
          {(form.features || []).map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5">
              <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <span className="flex-1 text-sm text-slate-700">{f}</span>
              <button onClick={() => removeFeature(i)} className="text-slate-300 hover:text-red-400 transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newFeature} onChange={e => setNewFeature(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFeature()}
            placeholder="Add a feature..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <button onClick={addFeature} className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Add</button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Access Permissions</label>
        <div className="space-y-2">
          {[
            { key: 'liveClasses', label: 'Live Classes', icon: 'live_tv' },
            { key: 'recordings',  label: 'Recordings',   icon: 'play_circle' },
            { key: 'download',    label: 'Downloads',    icon: 'download' },
            { key: 'mentorAccess',label: 'Mentor Access',icon: 'support_agent' },
          ].map(({ key, label, icon }) => (
            <button key={key} onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${form[key] ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className="material-symbols-outlined text-base" style={form[key] ? { fontVariationSettings: "'FILL' 1" } : {}}>{icon}</span>
              {label}
              <div className={`ml-auto w-10 h-5 rounded-full transition-colors relative ${form[key] ? 'bg-primary' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form[key] ? 'left-5' : 'left-0.5'}`} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
