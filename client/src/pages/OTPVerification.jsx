import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function OTPVerification() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const refs = useRef([]);

  useEffect(() => {
    const t = setInterval(() => setTimer(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handleVerify = () => {
    if (currentUser?.role === 'admin') navigate('/admin');
    else if (currentUser?.role === 'lecturer') navigate('/lecturer');
    else navigate('/home');
  };

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-6">
      <main className="w-full max-w-[420px]">
        <button onClick={() => navigate(-1)} className="mb-8 flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="font-medium text-sm">Back</span>
        </button>

        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full bg-primary-fixed flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          </div>
          <h1 className="font-headline text-3xl font-extrabold text-on-surface text-center">Verify Your Identity</h1>
          <p className="text-on-surface-variant text-center mt-3 text-sm leading-relaxed">
            We sent a 6-digit OTP to your registered phone number. Enter it below to continue.
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-8 shadow-sm">
          <div className="flex gap-2 sm:gap-3 justify-center mb-8">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => refs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className={`flex-1 min-w-0 max-w-[52px] h-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-xl border-2 transition-all focus:outline-none ${
                  digit
                    ? 'border-primary bg-primary-fixed text-primary'
                    : 'border-outline-variant bg-surface-container text-on-surface focus:border-primary'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleVerify}
            className="w-full py-4 rounded-xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98]"
          >
            Verify & Continue
          </button>

          <div className="mt-6 text-center">
            {timer > 0 ? (
              <p className="text-on-surface-variant text-sm">
                Resend OTP in <span className="text-primary font-bold">0:{timer.toString().padStart(2, '0')}</span>
              </p>
            ) : (
              <button onClick={() => setTimer(30)} className="text-primary font-bold text-sm">
                Resend OTP
              </button>
            )}
          </div>

          <button
            onClick={handleVerify}
            className="w-full mt-3 py-3 rounded-xl text-primary font-semibold text-sm hover:bg-primary-fixed/30 transition-all"
          >
            Skip (Demo Mode)
          </button>
        </div>
      </main>
    </div>
  );
}
