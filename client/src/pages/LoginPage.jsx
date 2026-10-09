import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePageMeta } from '../hooks/usePageMeta';

const DIAL_CODES = [
  { dial: '+91',  flag: '🇮🇳', name: 'India' },
  { dial: '+1',   flag: '🇺🇸', name: 'USA / Canada' },
  { dial: '+44',  flag: '🇬🇧', name: 'UK' },
  { dial: '+61',  flag: '🇦🇺', name: 'Australia' },
  { dial: '+971', flag: '🇦🇪', name: 'UAE' },
  { dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { dial: '+974', flag: '🇶🇦', name: 'Qatar' },
  { dial: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { dial: '+968', flag: '🇴🇲', name: 'Oman' },
  { dial: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { dial: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  { dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { dial: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  { dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  { dial: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { dial: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { dial: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { dial: '+254', flag: '🇰🇪', name: 'Kenya' },
  { dial: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { dial: '+233', flag: '🇬🇭', name: 'Ghana' },
  { dial: '+49',  flag: '🇩🇪', name: 'Germany' },
  { dial: '+33',  flag: '🇫🇷', name: 'France' },
  { dial: '+39',  flag: '🇮🇹', name: 'Italy' },
  { dial: '+34',  flag: '🇪🇸', name: 'Spain' },
  { dial: '+55',  flag: '🇧🇷', name: 'Brazil' },
  { dial: '+52',  flag: '🇲🇽', name: 'Mexico' },
  { dial: '+62',  flag: '🇮🇩', name: 'Indonesia' },
  { dial: '+63',  flag: '🇵🇭', name: 'Philippines' },
  { dial: '+81',  flag: '🇯🇵', name: 'Japan' },
  { dial: '+82',  flag: '🇰🇷', name: 'South Korea' },
  { dial: '+86',  flag: '🇨🇳', name: 'China' },
];


function PasswordInput({ value, onChange, placeholder = '••••••••' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline">
        <span className="material-symbols-outlined text-xl">lock</span>
      </div>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="block w-full pl-11 pr-12 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60"
      />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline">
        <span className="material-symbols-outlined text-xl">{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  );
}

function OtpInput({ value, onChange }) {
  const inputs = useRef([]);

  const handleChange = (i, e) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    arr[i] = val;
    onChange(arr.join(''));
    if (val && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { onChange(paste); inputs.current[5]?.focus(); }
    e.preventDefault();
  };

  return (
    <div className="flex gap-1.5 sm:gap-2 justify-center w-full" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input
          key={i}
          ref={el => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="flex-1 min-w-0 max-w-[52px] h-12 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-surface-container-high border-2 border-transparent rounded-xl focus:outline-none focus:border-primary focus:bg-surface-container-highest transition-all text-on-surface"
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  usePageMeta("Sign In — T.E.R.M. Edu", "Sign in to your T.E.R.M. Edu account to access live classes, self-paced courses, and your learning dashboard.", '/login');
  const navigate = useNavigate();
  const { loginWithUser, finishRegistration, resetPassword } = useApp();

  const [view, setView] = useState('login');

  // ── Login state ──────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError]       = useState('');
  const [loginLoading, setLoginLoading]   = useState(false);
  // 'password' | 'otp' — always visible to all users
  const [loginMethod, setLoginMethod]     = useState('password');

  // ── OTP view (login via OTP) ──────────────────────────────────────────
  const [otpValue, setOtpValue]           = useState('');
  const [otpError, setOtpError]           = useState('');
  const [otpLoading, setOtpLoading]       = useState(false);
  const [otpMasked, setOtpMasked]         = useState('');
  const [otpDevMode, setOtpDevMode]       = useState(false);
  const [otpPurpose, setOtpPurpose]       = useState('login');
  const [otpResendIn, setOtpResendIn]     = useState(0);

  // ── Forgot password state ─────────────────────────────────────────────
  const [fgEmail, setFgEmail]           = useState('');
  const [fgStep, setFgStep]             = useState(1);
  const [fgOtp, setFgOtp]               = useState('');
  const [fgNewPass, setFgNewPass]       = useState('');
  const [fgConfPass, setFgConfPass]     = useState('');
  const [fgError, setFgError]           = useState('');
  const [fgLoading, setFgLoading]       = useState(false);
  const [fgSuccess, setFgSuccess]       = useState(false);

  // ── Registration state ────────────────────────────────────────────────
  const [regName, setRegName]           = useState('');
  const [regEmail, setRegEmail]         = useState('');
  const [regPhone, setRegPhone]         = useState('');
  const [regDialCode, setRegDialCode]   = useState('+91');
  const [regPass, setRegPass]           = useState('');
  const [regConfPass, setRegConfPass]   = useState('');
  const [regError, setRegError]         = useState('');
  const [regLoading, setRegLoading]     = useState(false);
  const [regStep, setRegStep]           = useState(1);
  const [regOtp, setRegOtp]             = useState('');
  const [regOtpMasked, setRegOtpMasked] = useState('');
  const [regOtpDevMode, setRegOtpDevMode] = useState(false);
  const [regOtpResendIn, setRegOtpResendIn] = useState(0);
  const [dialOpen, setDialOpen]             = useState(false);
  const dialRef                             = useRef(null);

  useEffect(() => {
    if (!dialOpen) return;
    const close = (e) => {
      if (dialRef.current && !dialRef.current.contains(e.target)) setDialOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [dialOpen]);

  useEffect(() => { document.title = 'Sign In — T.E.R.M. Edu'; }, []);

  useEffect(() => {
    if (otpResendIn <= 0) return;
    const t = setTimeout(() => setOtpResendIn(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendIn]);

  useEffect(() => {
    if (regOtpResendIn <= 0) return;
    const t = setTimeout(() => setRegOtpResendIn(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [regOtpResendIn]);

  // ── Redirect helper ───────────────────────────────────────────────────
  const redirectAfterLogin = (user) => {
    if (user.role === 'admin') window.location.href = '/admin';
    else if (user.role === 'lecturer') window.location.href = '/lecturer';
    else navigate('/home');
  };

  // ── Login handlers ────────────────────────────────────────────────────

  // Password login — direct sign-in, no OTP step
  const handleLoginPassword = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login-password-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid email or password.');
      loginWithUser(data);
      redirectAfterLogin(data);
    } catch (err) {
      setLoginError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // OTP login step 1 — send code to email, no password needed
  const handleLoginSendOtp = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/send-login-otp-emailonly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No account found with this email.');
      setOtpMasked(data.maskedEmail || loginEmail);
      setOtpDevMode(!data.smtpConfigured);
      setOtpPurpose('login');
      setOtpValue('');
      setOtpError('');
      setOtpResendIn(60);
      setView('otp');
    } catch (err) {
      setLoginError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // OTP login step 2 — verify the code
  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    if (otpValue.length < 6) { setOtpError('Please enter the full 6-digit OTP.'); return; }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/auth/verify-login-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), otp: otpValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect OTP. Please try again.');
      loginWithUser(data);
      redirectAfterLogin(data);
    } catch (err) {
      setOtpError(err.message || 'Incorrect OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend OTP (always email-only for login)
  const handleResendLoginOtp = async () => {
    if (otpResendIn > 0) return;
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/auth/send-login-otp-emailonly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP.');
      setOtpDevMode(!data.smtpConfigured);
      setOtpValue('');
      setOtpResendIn(60);
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Forgot password handlers ──────────────────────────────────────────

  const handleForgotStep1 = async (e) => {
    e.preventDefault();
    setFgError('');
    setFgLoading(true);
    try {
      const res = await fetch('/api/auth/send-forgot-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fgEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No account found with this email.');
      setOtpMasked(data.maskedEmail || fgEmail);
      setOtpDevMode(!data.smtpConfigured);
      setOtpPurpose('forgot');
      setFgOtp('');
      setOtpResendIn(60);
      setFgStep(2);
    } catch (err) {
      setFgError(err.message);
    } finally {
      setFgLoading(false);
    }
  };

  const handleForgotOtp = async (e) => {
    e.preventDefault();
    if (fgOtp.length < 6) { setFgError('Please enter the full 6-digit OTP.'); return; }
    setFgError('');
    setFgLoading(true);
    try {
      const res = await fetch('/api/auth/verify-forgot-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fgEmail.trim(), otp: fgOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect OTP. Please try again.');
      setFgStep(3);
    } catch (err) {
      setFgError(err.message);
    } finally {
      setFgLoading(false);
    }
  };

  const handleResendForgotOtp = async () => {
    if (otpResendIn > 0) return;
    setFgError('');
    setFgLoading(true);
    try {
      const res = await fetch('/api/auth/send-forgot-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fgEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP.');
      setOtpDevMode(!data.smtpConfigured);
      setFgOtp('');
      setOtpResendIn(60);
    } catch (err) {
      setFgError(err.message);
    } finally {
      setFgLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e.preventDefault();
    setFgError('');
    if (fgNewPass !== fgConfPass) { setFgError('Passwords do not match.'); return; }
    if (fgNewPass.length < 6) { setFgError('Password must be at least 6 characters.'); return; }
    setFgLoading(true);
    try {
      await resetPassword(fgEmail.trim(), fgNewPass);
      setFgSuccess(true);
    } catch (err) {
      setFgError(err.message);
    } finally {
      setFgLoading(false);
    }
  };

  // ── Registration handlers ─────────────────────────────────────────────

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    if (regPass !== regConfPass) { setRegError('Passwords do not match.'); return; }
    if (regPass.length < 6) { setRegError('Password must be at least 6 characters.'); return; }
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/send-signup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName.trim(), email: regEmail.trim(), phone: (regDialCode + ' ' + regPhone).trim(), password: regPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP. Please try again.');
      setRegOtpMasked(data.maskedEmail || regEmail);
      setRegOtpDevMode(!data.smtpConfigured);
      setRegOtp('');
      setRegOtpResendIn(60);
      setRegStep(2);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  const handleVerifySignupOtp = async (e) => {
    e.preventDefault();
    if (regOtp.length < 6) { setRegError('Please enter the full 6-digit OTP.'); return; }
    setRegError('');
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/verify-signup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim(), otp: regOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect OTP. Please try again.');
      finishRegistration(data);
      navigate('/home');
    } catch (err) {
      setRegError(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  const handleResendSignupOtp = async () => {
    if (regOtpResendIn > 0) return;
    setRegError('');
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/send-signup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName.trim(), email: regEmail.trim(), phone: (regDialCode + ' ' + regPhone).trim(), password: regPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP.');
      setRegOtpDevMode(!data.smtpConfigured);
      setRegOtp('');
      setRegOtpResendIn(60);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  // ── Shared logo ───────────────────────────────────────────────────────

  const Logo = () => (
    <div className="flex flex-col items-center mb-10">
      <div className="mb-4">
        <div className="w-20 h-20 rounded-2xl bg-black flex items-center justify-center shadow-xl shadow-black/30 overflow-hidden">
          <img src="/term-icon.png" alt="T.E.R.M. Edu" className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  );

  // ── OTP verification view ─────────────────────────────────────────────

  if (view === 'otp') {
    return (
      <div className="bg-background font-body text-on-surface min-h-screen flex items-center justify-center p-6 sm:p-8">
        <main className="w-full max-w-[480px]">
          <Logo />
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm shadow-slate-200/50">
            <button onClick={() => { setView('login'); setOtpValue(''); setOtpError(''); }} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-5 transition-colors">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Sign In
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-1">Verify your identity</h2>
              <p className="text-on-surface-variant text-sm">
                We sent a 6-digit OTP to <span className="font-semibold text-on-surface">{otpMasked}</span>
              </p>
            </div>

            {otpDevMode && (
              <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-amber-600 text-base flex-shrink-0 mt-0.5">info</span>
                <p className="text-amber-800 text-xs">Dev mode — email not configured. The OTP has been printed to the server console.</p>
              </div>
            )}

            <form onSubmit={handleVerifyLoginOtp} className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-on-surface ml-1 block text-center">Enter OTP</label>
                <OtpInput value={otpValue} onChange={setOtpValue} />
              </div>
              {otpError && <p className="text-red-500 text-sm font-medium text-center">{otpError}</p>}
              <button type="submit" disabled={otpLoading || otpValue.length < 6} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                {otpLoading ? 'Verifying…' : 'Verify & Sign In'}
              </button>
            </form>

            <div className="text-center mt-4">
              {otpResendIn > 0 ? (
                <p className="text-on-surface-variant text-sm">Resend OTP in <span className="font-bold text-on-surface">{otpResendIn}s</span></p>
              ) : (
                <button onClick={handleResendLoginOtp} disabled={otpLoading} className="text-primary text-sm font-bold hover:underline">
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Forgot password view ──────────────────────────────────────────────

  if (view === 'forgot') {
    return (
      <div className="bg-background font-body text-on-surface min-h-screen flex items-center justify-center p-6 sm:p-8">
        <main className="w-full max-w-[480px]">
          <Logo />
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm shadow-slate-200/50">
            <button onClick={() => { setView('login'); setFgStep(1); setFgEmail(''); setFgOtp(''); setFgNewPass(''); setFgConfPass(''); setFgError(''); setFgSuccess(false); }} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-5 transition-colors">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Sign In
            </button>

            {fgSuccess ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
                </div>
                <h2 className="text-xl font-bold text-on-surface mb-2">Password Reset!</h2>
                <p className="text-on-surface-variant text-sm mb-6">Your password has been updated successfully.</p>
                <button onClick={() => { setView('login'); setFgStep(1); setFgEmail(''); setFgOtp(''); setFgNewPass(''); setFgConfPass(''); setFgError(''); setFgSuccess(false); }} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all">
                  Sign In Now
                </button>
              </div>

            ) : fgStep === 1 ? (
              <>
                <h2 className="text-xl font-bold text-on-surface mb-1">Forgot Password</h2>
                <p className="text-on-surface-variant text-sm mb-6">Enter your registered email address.</p>
                <form onSubmit={handleForgotStep1} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline">
                        <span className="material-symbols-outlined text-xl">mail</span>
                      </div>
                      <input type="email" value={fgEmail} onChange={e => setFgEmail(e.target.value)} placeholder="name@university.edu" required className="block w-full pl-11 pr-4 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60" />
                    </div>
                  </div>
                  {fgError && <p className="text-red-500 text-sm font-medium">{fgError}</p>}
                  <button type="submit" disabled={fgLoading} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                    {fgLoading ? 'Sending OTP…' : 'Send OTP'}
                  </button>
                </form>
              </>

            ) : fgStep === 2 ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
                  </div>
                  <h2 className="text-xl font-bold text-on-surface mb-1">Check your email</h2>
                  <p className="text-on-surface-variant text-sm">OTP sent to <span className="font-semibold text-on-surface">{otpMasked}</span></p>
                </div>

                {otpDevMode && (
                  <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <span className="material-symbols-outlined text-amber-600 text-base flex-shrink-0 mt-0.5">info</span>
                    <p className="text-amber-800 text-xs">Dev mode — email not configured. The OTP has been printed to the server console.</p>
                  </div>
                )}

                <form onSubmit={handleForgotOtp} className="space-y-5">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-on-surface ml-1 block text-center">Enter OTP</label>
                    <OtpInput value={fgOtp} onChange={setFgOtp} />
                  </div>
                  {fgError && <p className="text-red-500 text-sm font-medium text-center">{fgError}</p>}
                  <button type="submit" disabled={fgLoading || fgOtp.length < 6} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                    {fgLoading ? 'Verifying…' : 'Verify OTP'}
                  </button>
                </form>

                <div className="text-center mt-4">
                  {otpResendIn > 0 ? (
                    <p className="text-on-surface-variant text-sm">Resend OTP in <span className="font-bold text-on-surface">{otpResendIn}s</span></p>
                  ) : (
                    <button onClick={handleResendForgotOtp} disabled={fgLoading} className="text-primary text-sm font-bold hover:underline">
                      Resend OTP
                    </button>
                  )}
                </div>
              </>

            ) : (
              <>
                <h2 className="text-xl font-bold text-on-surface mb-1">Set New Password</h2>
                <p className="text-on-surface-variant text-sm mb-6">Create a strong new password for <span className="font-semibold text-primary">{fgEmail}</span></p>
                <form onSubmit={handleForgotReset} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">New Password</label>
                    <PasswordInput value={fgNewPass} onChange={e => setFgNewPass(e.target.value)} placeholder="Min. 6 characters" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Confirm Password</label>
                    <PasswordInput value={fgConfPass} onChange={e => setFgConfPass(e.target.value)} placeholder="Re-enter password" />
                  </div>
                  {fgError && <p className="text-red-500 text-sm font-medium">{fgError}</p>}
                  <button type="submit" disabled={fgLoading} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                    {fgLoading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Registration view ─────────────────────────────────────────────────

  if (view === 'register') {
    return (
      <div className="bg-background font-body text-on-surface min-h-screen flex items-center justify-center p-6 sm:p-8">
        <main className="w-full max-w-[480px]">
          <Logo />
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm shadow-slate-200/50">

            {regStep === 1 ? (
              <>
                <button onClick={() => { setView('login'); setRegError(''); setRegStep(1); }} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-5 transition-colors">
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Back to Sign In
                </button>
                <h2 className="text-xl font-bold text-on-surface mb-1">Create Account</h2>
                <p className="text-on-surface-variant text-sm mb-6">Join T.E.R.M. Edu and start building your future.</p>
                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Full Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline">
                        <span className="material-symbols-outlined text-xl">person</span>
                      </div>
                      <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Your full name" required className="block w-full pl-11 pr-4 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline">
                        <span className="material-symbols-outlined text-xl">mail</span>
                      </div>
                      <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="name@university.edu" required className="block w-full pl-11 pr-4 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Phone Number</label>
                    <div className="flex gap-2 items-stretch">
                      {/* Compact custom dial-code picker */}
                      <div className="relative flex-shrink-0" ref={dialRef}>
                        <button
                          type="button"
                          onClick={() => setDialOpen(v => !v)}
                          className="h-full flex items-center gap-1 px-3 py-4 bg-surface-container-high rounded-xl text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all whitespace-nowrap"
                        >
                          <span className="tracking-tight">{regDialCode}</span>
                          <span className="material-symbols-outlined text-[15px] text-outline leading-none" style={{ fontSize: 15 }}>expand_more</span>
                        </button>
                        {dialOpen && (
                          <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-60 overflow-y-auto bg-surface-container-highest rounded-xl shadow-xl py-1 border border-outline-variant/20">
                            {DIAL_CODES.map(c => (
                              <button
                                key={c.dial + c.name}
                                type="button"
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-primary/10 active:bg-primary/20 ${c.dial === regDialCode ? 'bg-primary/10' : ''}`}
                                onClick={() => { setRegDialCode(c.dial); setDialOpen(false); }}
                              >
                                <span className="text-base leading-none flex-shrink-0">{c.flag}</span>
                                <span className="font-semibold w-9 flex-shrink-0 text-on-surface">{c.dial}</span>
                                <span className="text-outline text-xs truncate">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={regPhone}
                        onChange={e => setRegPhone(e.target.value)}
                        placeholder="98765 43210"
                        className="flex-1 min-w-0 px-4 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Password</label>
                    <PasswordInput value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="Min. 6 characters" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-on-surface ml-1">Confirm Password</label>
                    <PasswordInput value={regConfPass} onChange={e => setRegConfPass(e.target.value)} placeholder="Re-enter password" />
                  </div>
                  {regError && <p className="text-red-500 text-sm font-medium">{regError}</p>}
                  <button type="submit" disabled={regLoading} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                    {regLoading ? 'Sending OTP…' : 'Continue'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <button onClick={() => { setRegStep(1); setRegError(''); setRegOtp(''); }} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-5 transition-colors">
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Back
                </button>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
                  </div>
                  <h2 className="text-xl font-bold text-on-surface mb-1">Verify your email</h2>
                  <p className="text-on-surface-variant text-sm">
                    We sent a 6-digit OTP to <span className="font-semibold text-on-surface">{regOtpMasked}</span>
                  </p>
                </div>

                {regOtpDevMode && (
                  <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <span className="material-symbols-outlined text-amber-600 text-base flex-shrink-0 mt-0.5">info</span>
                    <p className="text-amber-800 text-xs">Dev mode — email not configured. The OTP has been printed to the server console.</p>
                  </div>
                )}

                <form onSubmit={handleVerifySignupOtp} className="space-y-5">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-on-surface ml-1 block text-center">Enter OTP</label>
                    <OtpInput value={regOtp} onChange={setRegOtp} />
                  </div>
                  {regError && <p className="text-red-500 text-sm font-medium text-center">{regError}</p>}
                  <button type="submit" disabled={regLoading || regOtp.length < 6} className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60">
                    {regLoading ? 'Verifying…' : 'Verify & Create Account'}
                  </button>
                </form>

                <div className="text-center mt-4">
                  {regOtpResendIn > 0 ? (
                    <p className="text-on-surface-variant text-sm">Resend OTP in <span className="font-bold text-on-surface">{regOtpResendIn}s</span></p>
                  ) : (
                    <button onClick={handleResendSignupOtp} disabled={regLoading} className="text-primary text-sm font-bold hover:underline">
                      Resend OTP
                    </button>
                  )}
                </div>
              </>
            )}

          </div>
          <p className="text-center text-sm text-on-surface-variant mt-6">
            Already have an account?{' '}
            <button onClick={() => { setView('login'); setRegStep(1); }} className="text-primary font-bold hover:underline">Sign In</button>
          </p>
        </main>
      </div>
    );
  }

  // ── Main login view ───────────────────────────────────────────────────

  return (
    <div className="bg-background font-body text-on-surface min-h-screen flex items-center justify-center p-6 sm:p-8">
      <main className="w-full max-w-[480px]">
        <Logo />
        <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm shadow-slate-200/50">
          <h1 className="text-xl font-bold text-on-surface mb-1">Welcome back</h1>
          <p className="text-on-surface-variant/70 text-sm mb-6">Sign in to continue to your dashboard</p>

          {/* Method toggle — always visible */}
          <div className="flex rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-high mb-6">
            <button
              type="button"
              onClick={() => { setLoginMethod('password'); setLoginError(''); }}
              className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${loginMethod === 'password' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Password
            </button>
            <button
              type="button"
              onClick={() => { setLoginMethod('otp'); setLoginError(''); }}
              className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${loginMethod === 'otp' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-[16px]">mark_email_read</span>
              OTP
            </button>
          </div>

          <form onSubmit={loginMethod === 'password' ? handleLoginPassword : handleLoginSendOtp} className="space-y-5">
            {/* Email field */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline">
                  <span className="material-symbols-outlined text-xl">mail</span>
                </div>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="name@university.edu"
                  required
                  className="block w-full pl-11 pr-4 py-4 bg-surface-container-high border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-highest transition-all text-on-surface placeholder:text-outline/60"
                />
              </div>
            </div>

            {/* Password field — only for password method */}
            {loginMethod === 'password' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-sm font-semibold text-on-surface">Password</label>
                  <button type="button" onClick={() => setView('forgot')} className="text-primary text-xs font-bold hover:underline">
                    Forgot password?
                  </button>
                </div>
                <PasswordInput value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
              </div>
            )}

            {/* OTP method hint */}
            {loginMethod === 'otp' && (
              <p className="text-xs text-on-surface-variant px-1">
                We'll send a one-time code to your email — no password needed.
              </p>
            )}

            {loginError && (
              <div className="flex items-center gap-2 bg-error/10 text-error text-sm font-medium rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {loginLoading
                ? (loginMethod === 'otp' ? 'Sending OTP…' : 'Signing in…')
                : loginMethod === 'otp' ? 'Send OTP to Email' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-on-surface-variant mt-6">
          Don't have an account?{' '}
          <button onClick={() => setView('register')} className="text-primary font-bold hover:underline">Create Account</button>
        </p>
      </main>
    </div>
  );
}
