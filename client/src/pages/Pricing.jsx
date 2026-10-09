import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import { usePageMeta } from '../hooks/usePageMeta';

const PLAN_ORDER = ['starter', 'growth', 'premium'];
const DEFAULT_TEET_PLANS = ['growth', 'premium'];

export default function Pricing() {
  usePageMeta("Pricing & Plans — T.E.R.M. Edu", "Choose your T.E.R.M. Edu plan — Starter, Growth, or Premium. Unlock live classes, expert mentorship, and startup incubation.", '/pricing');
  const navigate = useNavigate();
  const { currentUser, currentPlan, planConfigs } = useApp();

  const getWhatsAppLink = (_plan) => 'https://wa.link/wd50xe';
  const PLANS = PLAN_ORDER.map(key => ({ ...planConfigs[key], key }));
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [teetStatus, setTeetStatus] = useState({ loaded: false, passed: false, score: null });

  const userPlans = Array.isArray(currentUser?.plans)
    ? currentUser.plans
    : (currentUser?.plan && currentUser.plan !== 'none' ? [currentUser.plan] : []);

  const isCurrentPlan = (key) => currentPlan === key;
  const isEnrolled = (key) => userPlans.includes(key);

  // Admins and lecturers bypass TEET requirement
  const bypassTEET = currentUser?.role === 'admin' || currentUser?.role === 'lecturer';

  useEffect(() => { document.title = 'Pricing & Plans — T.E.R.M. Edu'; }, []);

  useEffect(() => {
    if (!currentUser?.email || bypassTEET) {
      setTeetStatus({ loaded: true, passed: bypassTEET, score: null });
      return;
    }
    fetch(`/api/teet-passed?email=${encodeURIComponent(currentUser.email)}`)
      .then(r => r.json())
      .then(data => setTeetStatus({ loaded: true, passed: !!data.passed, score: data.score }))
      .catch(() => setTeetStatus({ loaded: true, passed: false, score: null }));
  }, [currentUser?.email, bypassTEET]);

  // Returns true if TEET is required for a plan (reads live config, falls back to defaults)
  const isPlanTeetRequired = (planKey) => {
    const cfg = planConfigs[planKey];
    return cfg?.teetRequired !== undefined ? cfg.teetRequired : DEFAULT_TEET_PLANS.includes(planKey);
  };

  // Returns true if this plan is locked behind TEET for this user
  const isTeetLocked = (planKey) => {
    if (bypassTEET) return false;
    if (!isPlanTeetRequired(planKey)) return false;
    return !teetStatus.passed;
  };

  const handlePlanClick = (plan) => {
    if (!currentUser) { navigate('/login'); return; }
    if (isCurrentPlan(plan.key) || isEnrolled(plan.key)) return;
    if (isTeetLocked(plan.key)) {
      navigate('/teet');
      return;
    }
    setSelectedPlan(plan);
    setConfirmModal(true);
  };

  const handleConfirm = async () => {
    if (currentUser?.role === 'student' && isPlanTeetRequired(selectedPlan.key)) {
      const check = await fetch(`/api/teet-passed?email=${encodeURIComponent(currentUser.email)}`)
        .then(r => r.json()).catch(() => ({ passed: false }));
      if (!check.passed) {
        setConfirmModal(false);
        navigate('/teet');
        return;
      }
    }
    window.open(getWhatsAppLink(selectedPlan), '_blank');
    setConfirmModal(false);
    setSuccessModal(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white md:ml-64">
      {/* Top bar */}
      <header className="relative flex items-center px-4 py-5 border-b border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors z-10"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          <span className="text-sm font-medium">Back</span>
        </button>
        <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">T.E.R.M.</span>
            <span className="text-purple-400 font-bold">Edu.</span>
            <span className="ml-1 text-xs border border-purple-500 text-purple-400 px-2 py-0.5 rounded-full">Eduversity</span>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div className="overflow-hidden bg-purple-600/20 border-y border-purple-500/20 py-2">
        <div className="flex gap-8 animate-ticker whitespace-nowrap">
          {Array.from({ length: 4 }).flatMap(() => ['Challenge-based learning', 'Industry exposure', 'Global mentor network']).map((t, i) => (
            <span key={i} className="text-purple-300 text-xs font-medium uppercase tracking-widest">
              {t} <span className="text-purple-500 mx-2">■</span>
            </span>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-12 pb-32">
        {/* Headline */}
        <h1 className="text-center text-2xl sm:text-3xl font-extrabold text-white mb-3">
          Learning Plans &amp; Pricing
        </h1>
        <p className="text-center text-white/70 text-base mb-4 max-w-lg mx-auto">
          All services included in every plan. The only difference is recorded vs live vs guaranteed internship.
        </p>

        {/* TEET notice for students who haven't passed */}
        {currentUser?.role === 'student' && teetStatus.loaded && !teetStatus.passed && (
          <div className="mb-8 max-w-2xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-4 flex items-start gap-4">
            <span className="material-symbols-outlined text-amber-400 text-2xl mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              lock
            </span>
            <div className="flex-1">
              <p className="text-amber-300 font-semibold text-sm">Growth & Premium plans require passing the TEET Exam</p>
              <p className="text-amber-400/70 text-xs mt-1">
                The T.E.R.M. Edu Entrance Test (TEET) is a short AI interview that qualifies you for advanced plans. Starter plan is available without TEET.
              </p>
              <button
                onClick={() => navigate('/teet')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-300 border border-amber-500/40 rounded-lg px-3 py-1.5 hover:bg-amber-500/10 transition-colors"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                Take TEET Exam
              </button>
            </div>
          </div>
        )}

        {/* TEET passed badge */}
        {currentUser?.role === 'student' && teetStatus.loaded && teetStatus.passed && (
          <div className="mb-8 max-w-2xl mx-auto bg-green-500/10 border border-green-500/30 rounded-2xl px-6 py-4 flex items-center gap-4">
            <span className="material-symbols-outlined text-green-400 text-2xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            <div>
              <p className="text-green-300 font-semibold text-sm">TEET Qualified</p>
              <p className="text-green-400/70 text-xs mt-0.5">
                You passed the entrance exam{teetStatus.score !== null ? ` with a score of ${teetStatus.score}/100` : ''}. All plans are unlocked for you.
              </p>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-10 mt-6">
          {PLANS.map((plan) => {
            const locked = isTeetLocked(plan.key);
            const isCurrent = isCurrentPlan(plan.key);
            const enrolled = isEnrolled(plan.key);
            // TEET-passed students can always purchase growth/premium regardless of comingSoon flag
            const effectiveComingSoon = plan.comingSoon && !(teetStatus.passed && isPlanTeetRequired(plan.key));

            const showBadge = plan.badge && !effectiveComingSoon && !locked;
            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl p-7 transition-all ${
                  locked
                    ? 'bg-[#0d0d0d] border border-amber-500/20 opacity-80'
                    : effectiveComingSoon
                      ? 'bg-[#0d0d0d] border border-amber-500/30'
                      : plan.popular
                        ? 'bg-[#0f0a1e] border-2 border-purple-500 shadow-[0_0_40px_rgba(139,92,246,0.2)]'
                        : 'bg-[#111111] border border-white/10'
                }`}
              >
                {/* TEET lock overlay banner */}
                {locked && (
                  <div className="absolute top-0 left-0 right-0 rounded-t-2xl flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/20 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-400">
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                    TEET Exam Required
                  </div>
                )}

                {/* Coming Soon top banner */}
                {effectiveComingSoon && !locked && (
                  <div className="absolute top-0 left-0 right-0 rounded-t-2xl flex items-center justify-center gap-2 bg-amber-500/90 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black">
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                    Batch Opening Soon
                  </div>
                )}

                {/* Normal badge — floats above card, visible only when unlocked */}
                {showBadge && (
                  <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg ${
                    plan.popular
                      ? 'bg-purple-600 text-white shadow-purple-500/40'
                      : 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-pink-500/30'
                  }`}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan name + price */}
                <div className={`mb-6 ${(effectiveComingSoon || locked) ? 'mt-7' : showBadge ? 'mt-3' : ''}`}>
                  <h2 className={`text-lg font-bold tracking-widest uppercase mb-3 ${(effectiveComingSoon || locked) ? 'text-white/50' : 'text-white/80'}`}>{plan.name}</h2>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-extrabold ${(effectiveComingSoon || locked) ? 'text-white/30' : 'text-white'}`}>{plan.price}</span>
                    <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">ONE-TIME</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className={`material-symbols-outlined text-base flex-shrink-0 mt-0.5 ${(effectiveComingSoon || locked) ? 'text-white/20' : 'text-purple-400'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span className={`text-sm ${(effectiveComingSoon || locked) ? 'text-white/30' : 'text-white/70'}`}>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Tagline */}
                <p className={`text-xs mb-5 italic ${(effectiveComingSoon || locked) ? 'text-white/20' : 'text-white/30'}`}>{plan.tagline}</p>

                {/* CTA Button */}
                {locked ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => navigate('/teet')}
                      className="w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                      Take TEET Exam
                    </button>
                    <p className="text-center text-[10px] text-amber-400/40 tracking-wide">Pass the entrance test to unlock this plan</p>
                  </div>
                ) : effectiveComingSoon ? (
                  <div className="space-y-2">
                    <button disabled
                      className="w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 text-amber-400/70 cursor-not-allowed flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                      Opening Soon
                    </button>
                    <p className="text-center text-[10px] text-white/20 tracking-wide">Registrations will open shortly</p>
                  </div>
                ) : (() => {
                  const label = isCurrent ? '✓ Current Plan' : enrolled ? '✓ Enrolled' : plan.btnLabel;
                  const disabled = isCurrent || enrolled;
                  if (plan.btnStyle === 'gradient') {
                    return (
                      <button
                        onClick={() => handlePlanClick(plan)}
                        className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all active:scale-95 ${
                          isCurrent
                            ? 'bg-purple-800 text-white/60 cursor-default'
                            : enrolled
                              ? 'bg-purple-900/40 text-purple-300/60 cursor-default border border-purple-500/20'
                              : 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 text-white hover:opacity-90 shadow-lg shadow-purple-500/30'
                        }`}
                        disabled={disabled}
                      >
                        {label}
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={() => handlePlanClick(plan)}
                      className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest border transition-all active:scale-95 ${
                        isCurrent
                          ? 'border-purple-500/40 text-purple-400/60 cursor-default'
                          : enrolled
                            ? 'border-white/10 text-white/40 cursor-default'
                            : 'border-white/30 text-white hover:border-white hover:bg-white/5'
                      }`}
                      disabled={disabled}
                    >
                      {label}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>

        <p className="text-center text-white/30 text-xs mt-8">
          * Internship subject to performance criteria. Growth & Premium plans require passing the TEET entrance exam.
        </p>

        {/* Cross-links */}
        <nav className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/40">
          <a href="/about" className="hover:text-white/70 transition-colors">About T.E.R.M. Edu</a>
          <a href="/contact" className="hover:text-white/70 transition-colors">Contact Us</a>
          <a href="/privacy-policy" className="hover:text-white/70 transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-white/70 transition-colors">Terms &amp; Conditions</a>
        </nav>
      </main>

      {currentUser?.role === 'student' && <BottomNav />}

      {/* Confirm Modal */}
      {confirmModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-sm p-7 space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-purple-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
              </div>
              <h3 className="text-xl font-bold text-white">{selectedPlan.name} Plan</h3>
              <p className="text-white/50 text-sm mt-1">One-time payment</p>
              <p className="text-4xl font-extrabold text-white mt-3">{selectedPlan.price}</p>
            </div>

            {/* TEET passed indicator on confirm modal */}
            {teetStatus.passed && isPlanTeetRequired(selectedPlan.key) && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
                <span className="material-symbols-outlined text-green-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                <span className="text-green-300 text-xs font-semibold">
                  TEET Qualified {teetStatus.score !== null ? `· Score: ${teetStatus.score}/100` : ''}
                </span>
              </div>
            )}

            <div className="bg-white/5 rounded-2xl p-4 space-y-2">
              {selectedPlan.features.map(f => (
                <div key={f} className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-white/70 text-xs">{f}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-center text-white/40 text-xs">
                You'll be redirected to WhatsApp to complete your payment with our team.
              </p>
              <button
                onClick={handleConfirm}
                className="w-full py-4 rounded-2xl bg-[#25D366] text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.132.557 4.133 1.528 5.874L.057 23.882a.5.5 0 0 0 .61.61l6.008-1.471A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.884 0-3.641-.523-5.142-1.43l-.368-.216-3.814.935.951-3.814-.228-.378A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Pay via WhatsApp — {selectedPlan.price}
              </button>
              <button
                onClick={() => { setConfirmModal(false); setSelectedPlan(null); }}
                className="w-full py-3 rounded-2xl border border-white/10 text-white/50 text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#111] border border-green-500/30 rounded-3xl w-full max-w-sm p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-[#25D366]/20 border border-[#25D366]/30 flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-[#25D366]">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.132.557 4.133 1.528 5.874L.057 23.882a.5.5 0 0 0 .61.61l6.008-1.471A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.884 0-3.641-.523-5.142-1.43l-.368-.216-3.814.935.951-3.814-.228-.378A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Request Sent!</h3>
              <p className="text-white/50 text-sm mt-2">
                Our team will reach out to you on WhatsApp to confirm your <span className="text-white font-semibold">{selectedPlan.name} Plan</span> payment and activate your account.
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 text-left space-y-2">
              <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest">What happens next</p>
              <div className="flex items-start gap-2">
                <span className="text-[#25D366] text-sm mt-0.5 flex-shrink-0">1.</span>
                <span className="text-white/60 text-xs">You'll receive a WhatsApp message from our team</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#25D366] text-sm mt-0.5 flex-shrink-0">2.</span>
                <span className="text-white/60 text-xs">Complete the payment as guided</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#25D366] text-sm mt-0.5 flex-shrink-0">3.</span>
                <span className="text-white/60 text-xs">Your {selectedPlan.name} plan will be activated within 24 hours</span>
              </div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => window.open(getWhatsAppLink(selectedPlan), '_blank')}
                className="w-full py-3 rounded-2xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.132.557 4.133 1.528 5.874L.057 23.882a.5.5 0 0 0 .61.61l6.008-1.471A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.884 0-3.641-.523-5.142-1.43l-.368-.216-3.814.935.951-3.814-.228-.378A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Open WhatsApp Again
              </button>
              <button
                onClick={() => { setSuccessModal(false); navigate(currentUser?.role === 'student' ? '/home' : '/lecturer'); }}
                className="w-full py-3 rounded-2xl border border-white/10 text-white/50 text-sm hover:text-white transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 18s linear infinite;
        }
      `}</style>
    </div>
  );
}
