import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';
import BulkImportModal from './BulkImportModal';

export default function AdminUsers() {
  const { appUsers, addAppUser, updateAppUser, toggleAppUserStatus, removeAppUser, planConfigs } = useApp();
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', password: '', role: 'student', plans: [] });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [showInvitePass, setShowInvitePass] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const PLAN_OPTIONS = [
    { key: 'starter', label: 'Starter',  icon: 'bolt',        color: 'bg-teal-50 text-teal-700 border-teal-300' },
    { key: 'growth',  label: 'Growth',   icon: 'trending_up', color: 'bg-blue-50 text-blue-700 border-blue-300' },
    { key: 'premium', label: 'Premium',  icon: 'workspace_premium', color: 'bg-violet-50 text-violet-700 border-violet-300' },
  ];
  const PLAN_ORDER = ['starter', 'growth', 'premium'];
  const getHighestPlan = (plans) => PLAN_ORDER.filter(p => plans.includes(p)).pop() || 'none';

  const getUserPlans = (u) => Array.isArray(u?.plans) ? u.plans : (u?.plan && u.plan !== 'none' ? [u.plan] : []);

  const togglePlan = (key) => setEditUser(prev => {
    const current = getUserPlans(prev);
    const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    return { ...prev, plans: updated, plan: getHighestPlan(updated) };
  });

  const filtered = appUsers.filter(u => {
    const matchRole = filter === 'all' || u.role === filter;
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const saveUserEdit = () => {
    updateAppUser(editUser.id, editUser);
    setEditUser(null);
    showToast('User updated successfully');
  };

  const addInvite = async () => {
    if (!invite.name.trim() || !invite.email.trim()) return;
    setInviteLoading(true);
    setInviteError('');
    try {
      const payload = {
        name: invite.name.trim(),
        email: invite.email.trim().toLowerCase(),
        role: invite.role,
        plans: invite.plans,
        plan: ['starter','growth','premium'].filter(p => invite.plans.includes(p)).pop() || 'none',
        status: 'active',
        joined: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
      if (invite.password.trim()) payload.password = invite.password.trim();
      const res = await fetch('/api/data/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || 'Failed to create user'); setInviteLoading(false); return; }
      /* Add to local state without exposing password */
      addAppUser({ ...payload, id: data.id, password: undefined });
      setInvite({ name: '', email: '', password: '', role: 'student', plans: [] });
      setShowInvitePass(false);
      setInviteModal(false);
      showToast('User created successfully');
    } catch (e) {
      setInviteError('Network error — please try again');
    } finally {
      setInviteLoading(false);
    }
  };

  const toggleInvitePlan = (key) => setInvite(prev => {
    const plans = prev.plans.includes(key) ? prev.plans.filter(k => k !== key) : [...prev.plans, key];
    return { ...prev, plans };
  });

  const roleBadge = (role) =>
    role === 'admin' ? 'bg-red-100 text-red-600' :
    role === 'lecturer' ? 'bg-secondary-container/30 text-secondary' :
    'bg-primary-fixed text-primary';

  const planBadge = (plan) =>
    plan === 'PREMIUM' || plan?.toLowerCase() === 'premium' ? 'bg-violet-100 text-violet-700' :
    plan === 'GROWTH' || plan?.toLowerCase() === 'growth' ? 'bg-blue-50 text-blue-600' :
    plan === 'STARTER' || plan?.toLowerCase() === 'starter' ? 'bg-teal-50 text-teal-600' :
    'bg-surface-container text-on-surface-variant';

  const activeUsers = appUsers.filter(u => u.status === 'active');

  return (
    <AdminLayout>
      <div className="space-y-5 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Users</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container text-on-surface-variant font-semibold text-sm hover:bg-surface-container-high transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Bulk Import
            </button>
            <button onClick={() => { setInvite({ name: '', email: '', password: '', role: 'student', plans: [] }); setInviteError(''); setShowInvitePass(false); setInviteModal(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95">
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add User
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Users', value: appUsers.length, color: 'text-on-surface' },
            { label: 'Active', value: activeUsers.length, color: 'text-green-600' },
            { label: 'Lecturers', value: appUsers.filter(u => u.role === 'lecturer').length, color: 'text-secondary' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
              <p className={`text-2xl font-bold font-headline ${color}`}>{value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." className="w-full pl-10 pr-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {['all', 'student', 'lecturer', 'admin'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-all ${filter === f ? 'signature-gradient text-white shadow' : 'bg-surface-container text-on-surface-variant'}`}>{f}</button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(u => (
            <div key={u.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">{(u.name || '?')[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{u.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'}`}>{u.status}</span>
                    {getUserPlans(u).length > 0
                      ? getUserPlans(u).map(p => (
                          <span key={p} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${planBadge(p)}`}>{p.toUpperCase()}</span>
                        ))
                      : null
                    }
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">Joined: {u.joined}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => setEditUser({ ...u })} className="px-3 py-1 rounded-lg bg-surface-container text-on-surface-variant text-xs font-bold">Edit</button>
                  <button onClick={() => { toggleAppUserStatus(u.id); showToast('User status updated'); }} className={`px-3 py-1 rounded-lg text-xs font-bold ${u.status === 'active' ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary'}`}>
                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                  <button onClick={() => setDeleteConfirm(u)} className="px-3 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-bold border border-red-200">Delete</button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-2">person_search</span>
              <p className="text-sm">No users found</p>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 bg-on-surface text-surface text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold">{toast}</div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Edit User</h3>
              <button onClick={() => setEditUser(null)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Name</label>
                <input value={editUser.name} onChange={e => setEditUser(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Email</label>
                <input value={editUser.email} onChange={e => setEditUser(p => ({ ...p, email: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Role</label>
                <select value={editUser.role} onChange={e => setEditUser(p => ({ ...p, role: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option value="student">Student</option>
                  <option value="lecturer">Lecturer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <div className="mb-2">
                  <label className="text-sm font-semibold text-on-surface-variant block">Assign Plans</label>
                  <p className="text-[11px] text-on-surface-variant/60">Tap to toggle plans on or off. Multiple plans can be active.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {PLAN_OPTIONS.map(p => {
                    const activePlans = getUserPlans(editUser);
                    const active = activePlans.includes(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => togglePlan(p.key)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${active ? `${p.color} shadow-sm` : 'bg-surface-container border-outline-variant text-on-surface-variant hover:border-outline'}`}
                      >
                        <span className={`material-symbols-outlined text-[20px] ${active ? '' : 'text-outline'}`}>{p.icon}</span>
                        <p className={`text-sm font-bold flex-1 ${active ? '' : 'text-on-surface-variant'}`}>{p.label}</p>
                        <span className={`material-symbols-outlined text-[20px] transition-all ${active ? '' : 'text-outline/40'}`}>
                          {active ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button onClick={saveUserEdit} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">Save Changes</button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-red-600">delete</span>
              </div>
              <div>
                <h3 className="font-bold text-lg text-on-surface">Delete User</h3>
                <p className="text-sm text-on-surface-variant">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-2xl p-4">
              <p className="text-sm font-semibold text-red-800">{deleteConfirm.name}</p>
              <p className="text-xs text-red-600">{deleteConfirm.email}</p>
            </div>
            <p className="text-sm text-on-surface-variant">Are you sure you want to permanently delete this user and all their data?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-bold text-sm">Cancel</button>
              <button
                onClick={() => { removeAppUser(deleteConfirm.id); setDeleteConfirm(null); showToast('User deleted'); }}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline font-bold text-xl">Add User</h3>
                <p className="text-xs text-slate-400 mt-0.5">Create an account directly — user can log in immediately</p>
              </div>
              <button onClick={() => { setInviteModal(false); setInviteError(''); }} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>

            {inviteError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <span className="material-symbols-outlined text-red-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                <p className="text-sm text-red-700 font-medium">{inviteError}</p>
              </div>
            )}

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Full Name *</label>
                <input
                  value={invite.name}
                  onChange={e => setInvite(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Rahul Sharma"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Email *</label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={e => { setInvite(p => ({ ...p, email: e.target.value })); setInviteError(''); }}
                  placeholder="user@email.com"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Password</label>
                <p className="text-[10px] text-slate-400 mb-1">Leave blank to let the user set their own via OTP login</p>
                <div className="relative">
                  <input
                    type={showInvitePass ? 'text' : 'password'}
                    value={invite.password}
                    onChange={e => setInvite(p => ({ ...p, password: e.target.value }))}
                    placeholder="Set a login password"
                    className="w-full px-4 py-3 pr-12 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInvitePass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-[20px]">{showInvitePass ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Role</label>
                <div className="flex gap-2 mt-1">
                  {['student', 'lecturer', 'admin'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInvite(p => ({ ...p, role: r, plans: r !== 'student' ? [] : p.plans }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold capitalize transition-all ${invite.role === r ? 'signature-gradient text-white shadow' : 'bg-surface-container text-on-surface-variant'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plans — only shown for students */}
              {invite.role === 'student' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Assign Plans</label>
                  <p className="text-[10px] text-slate-400 mb-2">Tap to toggle — multiple plans can be active</p>
                  <div className="flex flex-col gap-2">
                    {PLAN_OPTIONS.map(p => {
                      const active = invite.plans.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => toggleInvitePlan(p.key)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${active ? `${p.color} shadow-sm` : 'bg-surface-container border-outline-variant text-on-surface-variant hover:border-outline'}`}
                        >
                          <span className={`material-symbols-outlined text-[20px] ${active ? '' : 'text-outline'}`}>{p.icon}</span>
                          <p className={`text-sm font-bold flex-1 ${active ? '' : 'text-on-surface-variant'}`}>{p.label}</p>
                          <span className={`material-symbols-outlined text-[20px] transition-all ${active ? '' : 'text-outline/40'}`}>
                            {active ? 'check_box' : 'check_box_outline_blank'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <p className="flex items-center gap-2 text-[11px] text-violet-600 bg-violet-50 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
              A welcome email with login credentials will be sent to this user.
            </p>

            <button
              onClick={addInvite}
              disabled={!invite.name.trim() || !invite.email.trim() || inviteLoading}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {inviteLoading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating…</>
                : <><span className="material-symbols-outlined text-[18px]">person_add</span>Create User</>
              }
            </button>
          </div>
        </div>
      )}
      {bulkModal && (
        <BulkImportModal
          onClose={() => setBulkModal(false)}
          onImported={(createdUsers) => {
            createdUsers.forEach(u => addAppUser({ ...u, password: undefined }));
            showToast(`${createdUsers.length} user${createdUsers.length !== 1 ? 's' : ''} imported`);
          }}
        />
      )}
    </AdminLayout>
  );
}
