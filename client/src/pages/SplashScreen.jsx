import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePageMeta } from '../hooks/usePageMeta';

const roleHome = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'lecturer') return '/lecturer';
  return '/home';
};

export default function SplashScreen() {
  usePageMeta("T.E.R.M. Edu — India's #1 Entrepreneurship Platform", "India's #1 entrepreneurship LMS. Pass TEET, join live classes, access self-paced courses, and unlock Growth or Premium plans.", '/');
  const navigate = useNavigate();
  const { currentUser, sessionLoaded } = useApp();
  const [timerDone, setTimerDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimerDone(true), 2800);

    // Use the 2.8 s animation window to preload all lazy page bundles in the
    // background so every nav tab is instant after landing on Home.
    const preload = [
      () => import('./OnboardingScreen'),
      () => import('./LoginPage'),
      () => import('./OTPVerification'),
      () => import('./NotificationsPage'),
      () => import('./student/CourseDetail'),
      () => import('./student/VideoPlayer'),
      () => import('./student/Downloads'),
      () => import('./student/Dashboard'),
      () => import('./student/SupportChat'),
      () => import('./student/TEET'),
      () => import('./admin/Dashboard'),
      () => import('./admin/AdminCourses'),
      () => import('./admin/AdminUsers'),
      () => import('./admin/AdminLive'),
      () => import('./admin/AdminSupport'),
      () => import('./admin/AdminPlans'),
      () => import('./admin/AdminProjects'),
      () => import('./admin/AdminComingSoon'),
      () => import('./admin/AdminTEET'),
      () => import('./admin/AdminMaterials'),
      () => import('./admin/AdminCategories'),
      () => import('./lecturer/LecturerHome'),
      () => import('./lecturer/LecturerLive'),
      () => import('./lecturer/LecturerCourses'),
      () => import('./lecturer/LecturerStudents'),
      () => import('./lecturer/LecturerProjects'),
      () => import('./lecturer/LecturerSupport'),
      () => import('./lecturer/LecturerProfile'),
      () => import('./lecturer/LecturerMaterials'),
    ];
    // Stagger preloads so they don't all compete on startup
    preload.forEach((fn, i) => setTimeout(fn, 300 + i * 60));

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!timerDone || !sessionLoaded) return;
    navigate(currentUser ? roleHome(currentUser.role) : '/onboarding', { replace: true });
  }, [timerDone, sessionLoaded, currentUser, navigate]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/40 via-black to-black" />

      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-700/10 blur-[140px]" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-cyan-700/5 blur-[100px]" />

      <main className="relative z-10 flex flex-col items-center gap-10">
        <div className="animate-[fadeInUp_0.6s_ease_both]">
          <img
            src="/term-logo.png"
            alt="T.E.R.M. Edu"
            className="h-16 sm:h-20 object-contain select-none"
            draggable={false}
          />
        </div>

        <div className="animate-[fadeInUp_0.6s_0.2s_ease_both] opacity-0 [animation-fill-mode:forwards] text-center">
          <p className="text-white/30 text-xs font-semibold tracking-[0.4em] uppercase">
            Stop Studying. Start Building.
          </p>
        </div>

        <div className="animate-[fadeInUp_0.6s_0.4s_ease_both] opacity-0 [animation-fill-mode:forwards] flex flex-col items-center gap-3 mt-4">
          <div className="w-48 h-[3px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-loader-bar"
              style={{ background: 'linear-gradient(to right, #ff2400, #ff6a00, #ffd000, #00e5ff, #2979ff)' }}
            />
          </div>
          <span className="text-white/20 text-[10px] font-semibold tracking-[0.3em] uppercase">
            Initializing Campus
          </span>
        </div>
      </main>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-20 select-none">
        <div className="w-4 h-0.5" style={{ background: 'linear-gradient(to right, #ff2400, #ffd000, #2979ff)' }} />
        <span className="text-white text-[9px] font-bold tracking-widest uppercase">The Academic Atelier</span>
        <div className="w-4 h-0.5" style={{ background: 'linear-gradient(to right, #2979ff, #ffd000, #ff2400)' }} />
      </div>
    </div>
  );
}
