import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiPost } from '../lib/api';

const PLAN_OPTS = [
  { value: 'all',     label: 'All Students',   icon: 'groups' },
  { value: 'starter', label: 'Starter Plan',   icon: 'menu_book' },
  { value: 'growth',  label: 'Growth Plan',    icon: 'trending_up' },
  { value: 'premium', label: 'Premium Plan',   icon: 'workspace_premium' },
];

const ICON_OPTS = [
  { id: 'campaign',             label: 'Announce'  },
  { id: 'notifications',        label: 'Alert'     },
  { id: 'school',               label: 'Learn'     },
  { id: 'live_tv',              label: 'Live'      },
  { id: 'bolt',                 label: 'Flash'     },
  { id: 'celebration',          label: 'Celebrate' },
  { id: 'workspace_premium',    label: 'Premium'   },
  { id: 'rocket_launch',        label: 'Launch'    },
  { id: 'local_fire_department',label: 'Hot'       },
  { id: 'emoji_events',         label: 'Award'     },
  { id: 'star',                 label: 'Star'      },
  { id: 'info',                 label: 'Info'      },
  { id: 'warning',              label: 'Warning'   },
  { id: 'announcement',         label: 'News'      },
];

const PRIORITY_OPTS = [
  { value: 'info',     label: 'Informational', color: 'blue',   icon: 'info'            },
  { value: 'default',  label: 'General',       color: 'purple', icon: 'campaign'        },
  { value: 'urgent',   label: 'Urgent',        color: 'red',    icon: 'priority_high'   },
];

const TTL_OPTS = [
  { value: 1,   label: '1h'    },
  { value: 6,   label: '6h'    },
  { value: 12,  label: '12h'   },
  { value: 24,  label: '1d'    },
  { value: 48,  label: '2d'    },
  { value: 72,  label: '3d'    },
  { value: 168, label: '7d'    },
  { value: 0,   label: '∞'    },
];

const TTL_LABEL_LONG = {
  1: '1 hour', 6: '6 hours', 12: '12 hours', 24: '1 day',
  48: '2 days', 72: '3 days', 168: '7 days', 0: 'never expires',
};

const PRIORITY_COLOR = {
  info:    { bg: 'bg-blue-500',   ring: 'ring-blue-400',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200'   },
  default: { bg: 'bg-purple-500', ring: 'ring-purple-400', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
  urgent:  { bg: 'bg-red-500',    ring: 'ring-red-400',    text: 'text-red-600',    light: 'bg-red-50',    border: 'border-red-200'    },
};

const COLOR_OPTS = [
  { value: '#6c63ff', label: 'Brand'  },
  { value: '#EF4444', label: 'Red'    },
  { value: '#F97316', label: 'Orange' },
  { value: '#EAB308', label: 'Yellow' },
  { value: '#22C55E', label: 'Green'  },
  { value: '#3B82F6', label: 'Blue'   },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#EC4899', label: 'Pink'   },
];

const BLANK = { title: '', message: '', icon: 'campaign', planKey: 'all', badge: '', ttlHours: 24, priority: 'default', color: '#6c63ff' };

function AndroidPreview({ title, message, icon, appName = 'T.E.R.M. Edu', priority, accentColor }) {
  const colors = PRIORITY_COLOR[priority] || PRIORITY_COLOR.default;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-gray-900 select-none" style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-white/60 text-[10px] font-medium">{timeStr}</span>
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-white/60" style={{ fontSize: 12 }}>signal_cellular_alt</span>
          <span className="material-symbols-outlined text-white/60" style={{ fontSize: 12 }}>wifi</span>
          <span className="material-symbols-outlined text-white/60" style={{ fontSize: 12 }}>battery_full</span>
        </div>
      </div>
      {/* Notification card */}
      <div className="mx-2 mb-2.5 rounded-xl bg-gray-800 overflow-hidden">
        {/* Accent line — uses selected notification color */}
        <div className="h-[3px]" style={{ backgroundColor: accentColor || '#6c63ff' }} />
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          {/* App icon with color ring */}
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 mt-0.5 bg-black ring-2"
               style={{ ringColor: accentColor || '#6c63ff', boxShadow: `0 0 0 2px ${accentColor || '#6c63ff'}40` }}>
            <img src="/term-icon.png" alt="T.E.R.M. Edu" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/50 text-[10px] font-semibold tracking-wide">TERM Edu</span>
              <span className="text-white/40 text-[9px]">just now</span>
            </div>
            {/* Title — full line */}
            <p className="text-white text-[13px] font-bold leading-snug">
              {title || <span className="text-white/30 italic font-normal">Notification title…</span>}
            </p>
            {/* Body — clearly on its own line below title */}
            <p className="text-white/65 text-[11.5px] leading-snug mt-1 line-clamp-3">
              {message || <span className="text-white/25 italic">Message body appears here…</span>}
            </p>
          </div>
        </div>
        {/* Action row */}
        <div className="flex border-t border-white/10">
          <button className="flex-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: accentColor || '#6c63ff' }}>Open</button>
          <div className="w-px bg-white/10" />
          <button className="flex-1 py-1.5 text-center text-white/40 text-[10px] font-semibold uppercase tracking-widest">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export default function SendNotifModal({ open, onClose, senderType = 'lecturer' }) {
  const { currentUser, addAnnouncement } = useApp();
  const [form, setForm]             = useState({ ...BLANK });
  const [pushEnabled, setPush]      = useState(false);
  const [saved, setSaved]           = useState(false);
  const [sending, setSending]       = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [step, setStep]             = useState('compose'); // 'compose' | 'preview'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const reset = () => { setForm({ ...BLANK }); setPush(false); setSaved(false); setPushResult(null); setStep('compose'); };

  const handleSend = async () => {
    if (!form.title.trim()) return;
    setSending(true);
    setPushResult(null);

    addAnnouncement({
      title:     form.title.trim(),
      subtitle:  form.message.trim() || undefined,
      message:   form.message.trim() || undefined,
      icon:      form.icon,
      planKey:   form.planKey,
      badge:     form.badge.trim() || undefined,
      type:      senderType,
      priority:  form.priority,
      createdBy: currentUser?.name || senderType,
      active:    true,
      ttlHours:  Number(form.ttlHours),
      notifOnly: true,
    });

    if (pushEnabled) {
      try {
        const result = await apiPost('/api/fcm/send', {
          title: form.title.trim(),
          body:  form.message.trim() || form.title.trim(),
          color: form.color,
        });
        setPushResult({ sent: result.sent ?? 0, failed: result.failed ?? 0 });
      } catch {
        setPushResult({ sent: 0, failed: -1 });
      }
    }

    setSending(false);
    setSaved(true);
    setTimeout(() => { reset(); onClose(); }, 2400);
  };

  if (!open) return null;

  const colors = PRIORITY_COLOR[form.priority] || PRIORITY_COLOR.default;
  const selectedPlan = PLAN_OPTS.find(o => o.value === form.planKey);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) { reset(); onClose(); } }}
    >
      <div className="bg-white dark:bg-gray-900 w-full max-w-md shadow-2xl flex flex-col rounded-t-3xl sm:rounded-3xl max-h-[96dvh] sm:max-h-[92vh]">

        {/* ── Header ── */}
        <div className="signature-gradient px-5 pt-4 pb-4 shrink-0 rounded-t-3xl">
          <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
              </div>
              <div>
                <h2 className="text-base font-extrabold font-headline text-white leading-tight tracking-tight">Broadcast Notification</h2>
                <p className="text-white/60 text-[11px] mt-0.5">Push alerts to students instantly</p>
              </div>
            </div>
            <button onClick={() => { reset(); onClose(); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/40 transition-colors">
              <span className="material-symbols-outlined text-white text-base">close</span>
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex mt-3.5 gap-1 bg-white/10 rounded-xl p-0.5">
            {['compose', 'preview'].map(t => (
              <button key={t} onClick={() => setStep(t)}
                className={`flex-1 py-1.5 rounded-[10px] text-xs font-bold capitalize transition-all ${step === t ? 'bg-white text-gray-900 shadow-sm' : 'text-white/70 active:text-white'}`}>
                {t === 'preview' ? '📱 Preview' : '✏️ Compose'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-4 pt-4 pb-4 space-y-4">

          {/* Success state */}
          {saved && (
            <div className="flex flex-col gap-1.5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                </div>
                <div>
                  <p className="text-emerald-800 text-sm font-bold leading-tight">Notification sent!</p>
                  <p className="text-emerald-600 text-[11px]">Delivered to {selectedPlan?.label ?? 'All Students'}</p>
                </div>
              </div>
              {pushResult && pushEnabled && (
                <div className="mt-1 flex items-center gap-2 pl-9">
                  <span className="material-symbols-outlined text-emerald-600 text-sm">smartphone</span>
                  <p className="text-xs text-emerald-700 leading-snug">
                    {pushResult.failed === -1
                      ? 'Android push failed — check server.'
                      : `Android push: ${pushResult.sent} device${pushResult.sent !== 1 ? 's' : ''} reached${pushResult.failed > 0 ? ` · ${pushResult.failed} failed` : ' · all delivered'}.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'preview' ? (
            /* ── PREVIEW TAB ── */
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Android Notification Preview</p>
              <AndroidPreview title={form.title} message={form.message} icon={form.icon} priority={form.priority} accentColor={form.color} />
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="material-symbols-outlined text-gray-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{selectedPlan?.icon}</span>
                    <span>{selectedPlan?.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="material-symbols-outlined text-gray-400 text-sm">timer</span>
                    <span>{TTL_LABEL_LONG[Number(form.ttlHours)] || `${form.ttlHours}h`}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className={`material-symbols-outlined text-sm ${colors.text}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {PRIORITY_OPTS.find(p => p.value === form.priority)?.icon}
                    </span>
                    <span>{PRIORITY_OPTS.find(p => p.value === form.priority)?.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className={`material-symbols-outlined text-sm ${pushEnabled ? 'text-emerald-500' : 'text-gray-400'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {pushEnabled ? 'smartphone' : 'mobile_off'}
                    </span>
                    <span>{pushEnabled ? 'Android push on' : 'In-app only'}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── COMPOSE TAB ── */
            <div className="space-y-4">

              {/* Title */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Title <span className="text-red-400">*</span></label>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. New Live Session This Friday"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 focus:border-purple-400 transition-all placeholder:text-gray-300"
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Message Body</label>
                <textarea
                  value={form.message}
                  onChange={e => set('message', e.target.value)}
                  placeholder="Add details (optional)"
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 focus:border-purple-400 resize-none transition-all placeholder:text-gray-300"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITY_OPTS.map(o => {
                    const c = PRIORITY_COLOR[o.value];
                    const active = form.priority === o.value;
                    return (
                      <button key={o.value} onClick={() => set('priority', o.value)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all text-center active:scale-95 ${active ? `${c.light} ${c.border} shadow-sm` : 'border-gray-100 bg-gray-50'}`}>
                        <span className={`material-symbols-outlined text-xl transition-colors ${active ? c.text : 'text-gray-300'}`} style={{ fontVariationSettings: "'FILL' 1" }}>{o.icon}</span>
                        <span className={`text-[10px] font-bold transition-colors ${active ? c.text : 'text-gray-400'}`}>{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audience + Badge */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Audience</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-300 text-base pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }}>{selectedPlan?.icon}</span>
                    <select value={form.planKey} onChange={e => set('planKey', e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 focus:border-purple-400 appearance-none transition-all">
                      {PLAN_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Badge Tag</label>
                  <input value={form.badge} onChange={e => set('badge', e.target.value)} placeholder="e.g. URGENT"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 focus:border-purple-400 transition-all placeholder:text-gray-300" />
                </div>
              </div>

              {/* Auto-expire chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Auto-expire after</label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${Number(form.ttlHours) === 0 ? 'bg-gray-100 text-gray-500' : 'bg-purple-100 text-purple-600'}`}>
                    {Number(form.ttlHours) === 0 ? 'Never' : TTL_LABEL_LONG[Number(form.ttlHours)] ?? `${form.ttlHours}h`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {TTL_OPTS.map(o => (
                    <button key={o.value} type="button" onClick={() => set('ttlHours', o.value)}
                      className={`py-2 rounded-xl text-[11px] font-bold border-2 transition-all active:scale-95 ${
                        Number(form.ttlHours) === o.value
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'border-gray-100 text-gray-400 bg-gray-50 active:bg-gray-100'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {/* Live expiry indicator */}
                {Number(form.ttlHours) === 0 ? (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                    <span className="material-symbols-outlined text-gray-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>all_inclusive</span>
                    <p className="text-xs text-gray-500 leading-snug">Never expires — stays until you remove it manually.</p>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-200">
                    <span className="material-symbols-outlined text-purple-500 text-base shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-purple-500 font-medium leading-none mb-0.5">Auto-removes at</p>
                      <p className="text-sm font-bold text-purple-700 leading-tight">
                        {(() => {
                          const exp = new Date(Date.now() + Number(form.ttlHours) * 60 * 60 * 1000);
                          return exp.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
                        })()}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wide shrink-0">Active</span>
                  </div>
                )}
              </div>

              {/* Icon picker */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Icon</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ICON_OPTS.map(({ id, label }) => (
                    <button key={id} title={label} onClick={() => set('icon', id)}
                      className={`aspect-square rounded-xl flex items-center justify-center transition-all active:scale-90 border-2 ${
                        form.icon === id
                          ? `${colors.light} ${colors.border} shadow-sm scale-105`
                          : 'border-transparent bg-gray-50 active:bg-gray-100'
                      }`}>
                      <span className={`material-symbols-outlined text-[18px] transition-colors ${form.icon === id ? colors.text : 'text-gray-400'}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}>{id}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification colour */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notification Colour</label>
                  <span className="text-[10px] font-semibold text-gray-500"
                        style={{ color: form.color }}>
                    {COLOR_OPTS.find(c => c.value === form.color)?.label || 'Custom'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTS.map(c => (
                    <button key={c.value} type="button" title={c.label}
                      onClick={() => set('color', c.value)}
                      className="w-8 h-8 rounded-full transition-all active:scale-90 flex items-center justify-center"
                      style={{ backgroundColor: c.value,
                               boxShadow: form.color === c.value ? `0 0 0 3px white, 0 0 0 5px ${c.value}` : 'none',
                               transform: form.color === c.value ? 'scale(1.15)' : 'scale(1)' }}>
                      {form.color === c.value && (
                        <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Android Push toggle */}
              <button type="button" onClick={() => setPush(v => !v)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                  pushEnabled ? 'border-emerald-400 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className={`w-11 h-6 rounded-full flex items-center shrink-0 transition-colors duration-200 ${pushEnabled ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${pushEnabled ? 'ml-[22px]' : 'ml-0.5'}`} />
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-sm font-bold leading-tight ${pushEnabled ? 'text-emerald-700' : 'text-gray-700'}`}>Android Push Notification</p>
                  <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                    {pushEnabled ? 'Fires to all registered devices — even when app is closed' : 'In-app only — no device notification popup'}
                  </p>
                </div>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${pushEnabled ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                  <span className={`material-symbols-outlined text-lg ${pushEnabled ? 'text-emerald-500' : 'text-gray-300'}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>{pushEnabled ? 'smartphone' : 'mobile_off'}</span>
                </div>
              </button>

            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 pb-5 pt-2 shrink-0 space-y-2.5 border-t border-gray-100">
          {step === 'compose' && (
            <button onClick={() => setStep('preview')} disabled={!form.title.trim()}
              className="w-full py-2.5 rounded-xl border-2 border-purple-200 text-purple-600 font-semibold text-sm disabled:opacity-30 flex items-center justify-center gap-1.5 active:bg-purple-50 transition-colors">
              <span className="material-symbols-outlined text-base">smartphone</span>
              Preview Notification
            </button>
          )}
          <div className="flex gap-2.5">
            <button onClick={() => { reset(); onClose(); }}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold text-sm active:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSend} disabled={!form.title.trim() || sending || saved}
              className="flex-[2] py-3 rounded-2xl signature-gradient text-white font-bold text-sm shadow-md disabled:opacity-40 flex items-center justify-center gap-2 transition-all active:scale-[0.97]">
              {sending
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />Sending…</>
                : saved
                  ? <><span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>Sent!</>
                  : <><span className="material-symbols-outlined text-base">send</span>Send Now</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
