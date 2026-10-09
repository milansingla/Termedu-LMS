import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';

const FIELD_GROUPS = [
  {
    title: 'Daily.co (Live Video)',
    icon: 'live_tv',
    color: 'blue',
    fields: [
      { key: 'DAILY_API_KEY',  label: 'API Key',  type: 'password', placeholder: 'e.g. b6e7e212...' },
      { key: 'DAILY_DOMAIN',   label: 'Domain',   type: 'text',     placeholder: 'e.g. worker.daily.co' },
    ],
  },
  {
    title: 'Gemini AI (TEET Examiner)',
    icon: 'psychology',
    color: 'violet',
    fields: [
      { key: 'GEMINI_API_KEY', label: 'API Key', type: 'password', placeholder: 'e.g. AIzaSy...' },
    ],
  },
  {
    title: 'SMTP Email',
    icon: 'mail',
    color: 'green',
    fields: [
      { key: 'SMTP_HOST',   label: 'Host',       type: 'text',     placeholder: 'e.g. smtp.hostinger.com' },
      { key: 'SMTP_PORT',   label: 'Port',       type: 'text',     placeholder: 'e.g. 465' },
      { key: 'SMTP_SECURE', label: 'Secure',     type: 'text',     placeholder: 'true or false' },
      { key: 'SMTP_USER',   label: 'Username',   type: 'text',     placeholder: 'e.g. contact@termedu.in' },
      { key: 'SMTP_PASS',   label: 'Password',   type: 'password', placeholder: 'SMTP password' },
      { key: 'SMTP_FROM',   label: 'From Name/Email', type: 'text', placeholder: 'e.g. contact@termedu.in' },
    ],
  },
];

const colorMap = {
  blue:   { badge: 'bg-blue-100 text-blue-700',   icon: 'text-blue-600',   border: 'border-blue-100' },
  violet: { badge: 'bg-violet-100 text-violet-700', icon: 'text-violet-600', border: 'border-violet-100' },
  green:  { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600', border: 'border-emerald-100' },
};

export default function AdminSettings() {
  const [values, setValues]     = useState({});
  const [editing, setEditing]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  useEffect(() => {
    fetch('/api/admin/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setValues(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleChange(key, val) {
    setEditing(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave(group) {
    const keys = group.fields.map(f => f.key);
    const payload = {};
    let hasChanges = false;
    for (const key of keys) {
      if (key in editing) {
        payload[key] = editing[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return showToast('No changes to save.', 'info');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      // Update displayed values and clear editing state for this group
      setValues(prev => ({ ...prev, ...payload }));
      setEditing(prev => {
        const next = { ...prev };
        for (const key of keys) delete next[key];
        return next;
      });
      showToast(`Saved ${data.updated} setting(s). Active immediately.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">API Settings</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          These keys are stored securely in your database. No need to re-enter them after redeployment.
        </p>
      </div>

      <div className="space-y-6">
        {FIELD_GROUPS.map(group => {
          const c = colorMap[group.color];
          const groupDirty = group.fields.some(f => f.key in editing);
          return (
            <div key={group.title} className={`bg-white rounded-2xl border ${c.border} shadow-sm overflow-hidden`}>
              <div className={`flex items-center gap-3 px-5 py-4 border-b ${c.border}`}>
                <span className={`material-symbols-outlined text-[22px] ${c.icon}`}>{group.icon}</span>
                <h2 className="font-bold text-on-surface text-base">{group.title}</h2>
              </div>
              <div className="p-5 space-y-4">
                {group.fields.map(field => {
                  const current = editing[field.key] ?? values[field.key] ?? '';
                  const isMasked = typeof current === 'string' && current.includes('****');
                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                        {field.label}
                      </label>
                      <div className="relative">
                        <input
                          type={field.type === 'password' && !editing[field.key] ? 'password' : 'text'}
                          value={field.key in editing ? editing[field.key] : (isMasked ? '' : current)}
                          placeholder={isMasked ? '••••••••' : field.placeholder}
                          onChange={e => handleChange(field.key, e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all font-mono"
                        />
                        {isMasked && !(field.key in editing) && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>SET</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleSave(group)}
                    disabled={saving || !groupDirty}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      groupDirty
                        ? 'bg-violet-600 text-white hover:bg-violet-700 active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white transition-all ${
          toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-slate-600' : 'bg-emerald-500'
        }`}>
          {toast.msg}
        </div>
      )}
    </AdminLayout>
  );
}
