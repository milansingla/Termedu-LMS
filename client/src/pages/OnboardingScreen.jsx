import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

const SLIDES = [
  {
    icon: 'school',
    badge: 'Self-Paced',
    badgeIcon: 'timer',
    cardBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badgeBg: 'bg-primary',
    headline: ['Learn Anytime,', 'Anywhere'],
    headlineColors: ['text-on-surface', 'text-primary'],
    subtitle: 'Access content at your own pace, on any device, wherever you are.',
  },
  {
    icon: 'live_tv',
    badge: 'Live Sessions',
    badgeIcon: 'bolt',
    cardBg: 'bg-secondary/10',
    iconColor: 'text-secondary',
    badgeBg: 'bg-secondary',
    headline: ['Expert-Led', 'Live Classes'],
    headlineColors: ['text-on-surface', 'text-secondary'],
    subtitle: 'Join live sessions with top educators and ask questions in real time.',
  },
  {
    icon: 'insights',
    badge: 'Analytics',
    badgeIcon: 'bar_chart',
    cardBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badgeBg: 'bg-secondary',
    headline: ['Track Your', 'Progress'],
    headlineColors: ['text-on-surface', 'text-primary'],
    subtitle: 'Stay on top of your learning journey with detailed progress insights.',
  },
];

const SWIPE_THRESHOLD = 50;

export default function OnboardingScreen() {
  usePageMeta("Get Started — T.E.R.M. Edu", "Create your free T.E.R.M. Edu account and start your entrepreneurship journey today.", '/onboarding');
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);


  useEffect(() => {
    if (localStorage.getItem('hasSeenOnboarding')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  function finish() {
    localStorage.setItem('hasSeenOnboarding', '1');
    navigate('/login', { replace: true });
  }

  function handleNext() {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      finish();
    }
  }

  function handlePrev() {
    if (slide > 0) setSlide(slide - 1);
  }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse') {
      touchStartX.current = e.clientX;
      touchStartY.current = e.clientY;
    }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'mouse' && touchStartX.current !== null) {
      const dx = e.clientX - touchStartX.current;
      const dy = e.clientY - touchStartY.current;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0) handleNext();
        else handlePrev();
      }
      touchStartX.current = null;
      touchStartY.current = null;
    }
  }

  const current = SLIDES[slide];

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-surface px-6 py-10 select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="absolute top-[-8%] right-[-8%] w-[30rem] h-[30rem] rounded-full bg-secondary-container/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-8%] w-[28rem] h-[28rem] rounded-full bg-primary-fixed/20 blur-[90px] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center w-full max-w-sm">
        <div className="flex items-center justify-center mb-10 mt-2">
          <div className="bg-black rounded-2xl px-5 py-3 shadow-lg">
            <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-8 w-auto object-contain" />
          </div>
        </div>

        <div
          className={`w-full rounded-3xl ${current.cardBg} p-8 flex flex-col items-center relative overflow-hidden mb-8 transition-colors duration-300`}
          style={{ minHeight: '220px' }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <span
            className={`material-symbols-outlined ${current.iconColor} mb-4 transition-colors duration-300`}
            style={{ fontSize: '80px', fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48" }}
          >
            {current.icon}
          </span>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${current.badgeBg} shadow-sm transition-colors duration-300`}>
            <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{current.badgeIcon}</span>
            <span className="text-xs font-semibold text-white tracking-wide">{current.badge}</span>
          </div>
        </div>

        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-center leading-tight mb-3 w-full">
          <span className={current.headlineColors[0]}>{current.headline[0]} </span>
          <span className={`${current.headlineColors[1]} transition-colors duration-300`}>{current.headline[1]}</span>
        </h1>

        <p className="text-on-surface-variant text-sm text-center leading-relaxed mb-8 max-w-xs">
          {current.subtitle}
        </p>

        <div className="flex items-center gap-2 mb-10">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === slide
                  ? 'w-6 bg-primary'
                  : 'w-2 border border-outline-variant bg-transparent'
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-full py-4 rounded-2xl bg-secondary text-on-secondary font-headline font-bold text-base tracking-wide shadow-lg shadow-secondary/20 active:scale-[0.98] transition-transform"
        >
          Next →
        </button>

        <button
          onClick={finish}
          className="mt-4 text-sm text-on-surface-variant hover:text-on-surface transition-colors py-2"
        >
          Skip onboarding
        </button>
      </main>
    </div>
  );
}
