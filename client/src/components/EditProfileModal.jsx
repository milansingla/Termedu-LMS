import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiPatch, apiPost } from '../lib/api';

const API = import.meta.env.VITE_API_URL || '';

const PRESET_AVATARS = [
  { seed: 'Felix',   style: 'avataaars' },
  { seed: 'Aneka',   style: 'avataaars' },
  { seed: 'Mia',     style: 'avataaars' },
  { seed: 'Leo',     style: 'avataaars' },
  { seed: 'Zara',    style: 'avataaars' },
  { seed: 'Omar',    style: 'avataaars' },
  { seed: 'Priya',   style: 'avataaars' },
  { seed: 'Ravi',    style: 'avataaars' },
  { seed: 'Nadia',   style: 'avataaars' },
  { seed: 'Carlos',  style: 'avataaars' },
  { seed: 'Yuki',    style: 'avataaars' },
  { seed: 'Sam',     style: 'avataaars' },
].map(({ seed, style }) => `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`);

function getInitials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function Avatar({ src, name, size = 'lg' }) {
  const dim = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm';
  if (src) return <img src={src} alt={name} className={`${dim} rounded-full object-cover`} />;
  return (
    <div className={`${dim} rounded-full bg-primary/20 flex items-center justify-center font-extrabold text-primary select-none`}>
      {getInitials(name)}
    </div>
  );
}

const EMAIL_STEP = { IDLE: 'idle', ENTER: 'enter', OTP: 'otp', DONE: 'done' };

export default function EditProfileModal({ open, onClose }) {
  const { currentUser, updateUser } = useApp();
  const [name, setName]         = useState('');
  const [avatar, setAvatar]     = useState('');
  const [avatarTab, setAvatarTab] = useState('presets');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [urlPreviewOk, setUrlPreviewOk] = useState(null); // null=idle, true=ok, false=error
  const [showPicker, setShowPicker] = useState(false);

  const [emailStep, setEmailStep] = useState(EMAIL_STEP.IDLE);
  const [newEmail, setNewEmail]   = useState('');
  const [otp, setOtp]             = useState('');
  const [masked, setMasked]       = useState('');
  const [resendSec, setResendSec] = useState(0);
  const resendRef = useRef(null);

  const [saving, setSaving]       = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError]         = useState('');
  const [emailError, setEmailError] = useState('');
  const [success, setSuccess]     = useState('');

  /* debounced URL image probe */
  useEffect(() => {
    if (!avatarUrl.trim()) { setUrlPreviewOk(null); return; }
    setUrlPreviewOk(null);
    const t = setTimeout(() => {
      const img = new Image();
      img.onload  = () => setUrlPreviewOk(true);
      img.onerror = () => setUrlPreviewOk(false);
      img.src = avatarUrl.trim();
    }, 600);
    return () => clearTimeout(t);
  }, [avatarUrl]);

  useEffect(() => {
    if (open && currentUser) {
      setName(currentUser.name || '');
      setAvatar(currentUser.avatar || '');
      setAvatarUrl('');
      setUrlPreviewOk(null);
      setShowPicker(false);
      setEmailStep(EMAIL_STEP.IDLE);
      setNewEmail('');
      setOtp('');
      setError('');
      setEmailError('');
      setSuccess('');
      setResendSec(0);
    }
  }, [open, currentUser]);

  useEffect(() => () => clearInterval(resendRef.current), []);

  const startResendTimer = () => {
    setResendSec(60);
    clearInterval(resendRef.current);
    resendRef.current = setInterval(() => {
      setResendSec(s => { if (s <= 1) { clearInterval(resendRef.current); return 0; } return s - 1; });
    }, 1000);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name cannot be blank.'); return; }
    setSaving(true); setError('');
    try {
      const data = await apiPatch('/api/user/profile', { name: name.trim(), avatar: avatar || null });
      updateUser({ name: data.name, avatar: data.avatar });
      setSuccess('Profile saved!');
      setTimeout(() => { setSuccess(''); onClose(); }, 1200);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleSendOtp = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError('Enter a valid email address.'); return; }
    if (email === currentUser?.email?.toLowerCase()) { setEmailError('This is already your current email.'); return; }
    setEmailLoading(true); setEmailError('');
    try {
      const res = await fetch(`${API}/api/auth/send-email-change-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');
      setMasked(data.maskedEmail || email);
      setEmailStep(EMAIL_STEP.OTP);
      startResendTimer();
    } catch (e) { setEmailError(e.message); } finally { setEmailLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) { setEmailError('Enter the 6-digit OTP.'); return; }
    setEmailLoading(true); setEmailError('');
    try {
      const res = await fetch(`${API}/api/auth/verify-email-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase(), otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      updateUser({ email: data.email });
      setEmailStep(EMAIL_STEP.DONE);
      clearInterval(resendRef.current);
    } catch (e) { setEmailError(e.message); } finally { setEmailLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-surface rounded-t-3xl shadow-2xl animate-slide-up flex flex-col max-h-[92dvh]">
        <div className="px-6 pt-4 pb-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-3" />
          <h3 className="text-lg font-extrabold font-headline text-on-surface text-center">Edit Profile</h3>
        </div>

        <div className="overflow-y-auto px-6 pb-8 space-y-5 flex-1">

          {/* ── Avatar ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/25 shadow-lg">
                <Avatar src={avatar} name={name || currentUser?.name} size="lg" />
              </div>
              <button
                onClick={() => setShowPicker(p => !p)}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary shadow-lg flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Change avatar"
              >
                <span className="material-symbols-outlined text-white text-sm">photo_camera</span>
              </button>
            </div>

            {showPicker && (
              <div className="w-full bg-surface-container rounded-2xl p-4 space-y-3 border border-outline-variant/20">
                <div className="flex gap-2">
                  {['presets', 'url'].map(t => (
                    <button
                      key={t}
                      onClick={() => setAvatarTab(t)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${avatarTab === t ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}
                    >
                      {t === 'url' ? 'Image URL' : 'Presets'}
                    </button>
                  ))}
                </div>

                {avatarTab === 'presets' && (
                  <div className="grid grid-cols-6 gap-2">
                    <button
                      onClick={() => { setAvatar(''); setShowPicker(false); }}
                      className={`rounded-full overflow-hidden border-2 transition-all flex items-center justify-center bg-primary/10 w-10 h-10 ${!avatar ? 'border-primary scale-110' : 'border-transparent'}`}
                      title="Use initials"
                    >
                      <span className="material-symbols-outlined text-primary text-sm">person</span>
                    </button>
                    {PRESET_AVATARS.map((src) => (
                      <button
                        key={src}
                        onClick={() => { setAvatar(src); setShowPicker(false); }}
                        className={`rounded-full overflow-hidden border-2 transition-all ${avatar === src ? 'border-primary scale-110' : 'border-transparent'}`}
                      >
                        <img src={src} alt="preset" className="w-10 h-10 object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {avatarTab === 'url' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="url"
                          value={avatarUrl}
                          onChange={e => { setAvatarUrl(e.target.value); setUrlPreviewOk(null); }}
                          placeholder="https://example.com/photo.jpg"
                          className={`w-full px-3 py-2 pr-8 rounded-xl bg-surface border text-sm text-on-surface outline-none transition-colors ${
                            urlPreviewOk === true  ? 'border-green-500 focus:border-green-500' :
                            urlPreviewOk === false ? 'border-error   focus:border-error' :
                            'border-outline-variant focus:border-primary'
                          }`}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && avatarUrl.trim() && urlPreviewOk === true) {
                              setAvatar(avatarUrl.trim()); setShowPicker(false);
                            }
                          }}
                        />
                        {avatarUrl.trim() && urlPreviewOk === null && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                        )}
                        {urlPreviewOk === true && (
                          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        )}
                        {urlPreviewOk === false && (
                          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-error text-base" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                        )}
                      </div>
                      <button
                        onClick={() => { if (avatarUrl.trim() && urlPreviewOk === true) { setAvatar(avatarUrl.trim()); setShowPicker(false); } }}
                        disabled={!avatarUrl.trim() || urlPreviewOk !== true}
                        className="px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40 transition-opacity"
                      >Apply</button>
                    </div>

                    {urlPreviewOk === false && (
                      <p className="text-xs text-error flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        Could not load image. Check the URL and try again.
                      </p>
                    )}

                    {urlPreviewOk === true && (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                        <img src={avatarUrl.trim()} alt="preview" className="w-10 h-10 rounded-full object-cover border-2 border-green-500/30 flex-shrink-0" />
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">Image looks good — hit Apply or press Enter.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Name ── */}
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="Your full name"
            />
          </div>

          {/* ── Email (OTP-gated change) ── */}
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Email Address</label>

            {emailStep === EMAIL_STEP.IDLE && (
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm opacity-70 truncate">
                  {currentUser?.email}
                </div>
                <button
                  onClick={() => { setEmailStep(EMAIL_STEP.ENTER); setEmailError(''); }}
                  className="flex-shrink-0 px-4 py-3 rounded-2xl bg-surface-container-high border border-outline-variant text-xs font-bold text-on-surface hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            {emailStep === EMAIL_STEP.ENTER && (
              <div className="mt-1 space-y-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder="New email address"
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEmailStep(EMAIL_STEP.IDLE); setEmailError(''); }}
                    className="flex-1 py-2.5 rounded-2xl border border-outline-variant text-on-surface-variant text-sm font-bold"
                  >Cancel</button>
                  <button
                    onClick={handleSendOtp}
                    disabled={emailLoading}
                    className="flex-1 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {emailLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
                      : 'Send OTP'}
                  </button>
                </div>
              </div>
            )}

            {emailStep === EMAIL_STEP.OTP && (
              <div className="mt-1 space-y-2">
                <p className="text-xs text-on-surface-variant">
                  OTP sent to <span className="font-bold text-primary">{masked}</span>. Enter it below.
                </p>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="w-full px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary transition-colors tracking-widest font-mono text-center text-lg"
                  placeholder="— — — — — —"
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEmailStep(EMAIL_STEP.ENTER); setOtp(''); setEmailError(''); }}
                    className="flex-1 py-2.5 rounded-2xl border border-outline-variant text-on-surface-variant text-sm font-bold"
                  >Back</button>
                  <button
                    onClick={handleVerifyOtp}
                    disabled={emailLoading || otp.length < 6}
                    className="flex-1 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {emailLoading
                      ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</>
                      : 'Verify & Update'}
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant text-center">
                  {resendSec > 0
                    ? `Resend in ${resendSec}s`
                    : <button onClick={handleSendOtp} disabled={emailLoading} className="text-primary font-bold underline underline-offset-2">Resend OTP</button>
                  }
                </p>
              </div>
            )}

            {emailStep === EMAIL_STEP.DONE && (
              <div className="mt-1 flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/30">
                <span className="material-symbols-outlined text-green-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">Email updated!</p>
                  <p className="text-xs text-on-surface-variant">{currentUser?.email}</p>
                </div>
              </div>
            )}

            {emailError && (
              <p className="mt-1.5 text-xs text-error font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>{emailError}
              </p>
            )}
          </div>

          {/* ── General error / success ── */}
          {error && (
            <p className="text-xs text-error font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">error</span>{error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-500 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>{success}
            </p>
          )}

          {/* ── Save / Cancel ── */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-outline-variant text-on-surface-variant font-bold text-sm hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 py-3 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
