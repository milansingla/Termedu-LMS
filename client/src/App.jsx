import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { LiveClassProvider } from './context/LiveClassContext';
import { CourseProvider } from './context/CourseContext';
import { ProjectProvider } from './context/ProjectContext';
import { ComingSoonProvider } from './context/ComingSoonContext';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';

// ── Core student nav pages — eagerly imported so they're instant after splash ──
import Home           from './pages/student/Home';
import ExploreCourses from './pages/student/ExploreCourses';
import LiveClass      from './pages/student/LiveClass';
import Projects       from './pages/student/Projects';
import Profile        from './pages/student/Profile';

// ── Everything else — lazy loaded (not on the critical nav path) ──────────────
const SplashScreen      = lazy(() => import('./pages/SplashScreen'));
const OnboardingScreen  = lazy(() => import('./pages/OnboardingScreen'));
const LoginPage         = lazy(() => import('./pages/LoginPage'));
const OTPVerification   = lazy(() => import('./pages/OTPVerification'));
const Pricing           = lazy(() => import('./pages/Pricing'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const PrivacyPolicy     = lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const ContactUs         = lazy(() => import('./pages/ContactUs'));
const AboutUs           = lazy(() => import('./pages/AboutUs'));

const CourseDetail    = lazy(() => import('./pages/student/CourseDetail'));
const VideoPlayer     = lazy(() => import('./pages/student/VideoPlayer'));
const Downloads       = lazy(() => import('./pages/student/Downloads'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const SupportChat     = lazy(() => import('./pages/student/SupportChat'));
const TEET            = lazy(() => import('./pages/student/TEET'));

const AdminDashboard   = lazy(() => import('./pages/admin/Dashboard'));
const AdminCourses     = lazy(() => import('./pages/admin/AdminCourses'));
const AdminUsers       = lazy(() => import('./pages/admin/AdminUsers'));
const AdminLive        = lazy(() => import('./pages/admin/AdminLive'));
const AdminSupport     = lazy(() => import('./pages/admin/AdminSupport'));
const AdminPlans       = lazy(() => import('./pages/admin/AdminPlans'));
const AdminProjects    = lazy(() => import('./pages/admin/AdminProjects'));
const AdminComingSoon  = lazy(() => import('./pages/admin/AdminComingSoon'));
const AdminTEET        = lazy(() => import('./pages/admin/AdminTEET'));
const AdminMaterials   = lazy(() => import('./pages/admin/AdminMaterials'));
const AdminCategories  = lazy(() => import('./pages/admin/AdminCategories'));
const AdminSettings    = lazy(() => import('./pages/admin/AdminSettings'));

const LecturerHome      = lazy(() => import('./pages/lecturer/LecturerHome'));
const LecturerLive      = lazy(() => import('./pages/lecturer/LecturerLive'));
const LecturerCourses   = lazy(() => import('./pages/lecturer/LecturerCourses'));
const LecturerStudents  = lazy(() => import('./pages/lecturer/LecturerStudents'));
const LecturerProjects  = lazy(() => import('./pages/lecturer/LecturerProjects'));
const LecturerSupport   = lazy(() => import('./pages/lecturer/LecturerSupport'));
const LecturerProfile   = lazy(() => import('./pages/lecturer/LecturerProfile'));
const LecturerMaterials = lazy(() => import('./pages/lecturer/LecturerMaterials'));
const MeetingJoin       = lazy(() => import('./pages/MeetingJoin'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function roleHome(role) {
  if (role === 'admin') return '/admin';
  if (role === 'lecturer') return '/lecturer';
  return '/home';
}

function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, sessionLoaded } = useApp();
  if (!sessionLoaded) return <PageLoader />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to={roleHome(currentUser.role)} replace />;
  }
  return <>{children}</>;
}

// Blocks public pages (splash, login, onboarding) while session is loading,
// then redirects already-logged-in users straight to their home page.
function GuestRoute({ children }) {
  const { currentUser, sessionLoaded } = useApp();
  if (!sessionLoaded) return <PageLoader />;
  if (currentUser) return <Navigate to={roleHome(currentUser.role)} replace />;
  return children;
}

// ── Deep-link handler: when the Android app opens via FCM notification ────────
// The FCM payload sets navigateTo='/support'; the Android WebView opens the app
// with ?fcm=support appended. This hook catches that and navigates in-app.
function useDeepLink() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { currentUser, sessionLoaded } = useApp();
  useEffect(() => {
    if (!sessionLoaded || !currentUser) return;
    const params = new URLSearchParams(location.search);
    const fcmTarget = params.get('fcm');
    if (fcmTarget === 'support') {
      navigate('/support', { replace: true });
    }
  }, [sessionLoaded, currentUser, location.search]); // eslint-disable-line
}

function AppRoutes() {
  const { currentUser } = useApp();
  useDeepLink();
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/onboarding" element={<GuestRoute><OnboardingScreen /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/otp" element={<GuestRoute><OTPVerification /></GuestRoute>} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/meet" element={<MeetingJoin />} />

        <Route path="/home" element={<ProtectedRoute allowedRoles={['student']}><Home /></ProtectedRoute>} />
        <Route path="/courses" element={<ProtectedRoute allowedRoles={['student']}><ExploreCourses /></ProtectedRoute>} />
        <Route path="/courses/:id" element={<ProtectedRoute allowedRoles={['student']}><CourseDetail /></ProtectedRoute>} />
        <Route path="/video/:id" element={<ProtectedRoute allowedRoles={['student']}><VideoPlayer /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute allowedRoles={['student', 'lecturer']}><LiveClass /></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute allowedRoles={['student']}><Downloads /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute allowedRoles={['student']}><Profile /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportChat /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute allowedRoles={['student']}><Projects /></ProtectedRoute>} />
        <Route path="/teet" element={<ProtectedRoute allowedRoles={['student', 'lecturer', 'admin']}><TEET /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/courses" element={<ProtectedRoute allowedRoles={['admin']}><AdminCourses /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/live" element={<ProtectedRoute allowedRoles={['admin']}><AdminLive /></ProtectedRoute>} />
        <Route path="/admin/support" element={<ProtectedRoute allowedRoles={['admin']}><AdminSupport /></ProtectedRoute>} />
        <Route path="/admin/plans" element={<ProtectedRoute allowedRoles={['admin']}><AdminPlans /></ProtectedRoute>} />
        <Route path="/admin/projects" element={<ProtectedRoute allowedRoles={['admin']}><AdminProjects /></ProtectedRoute>} />
        <Route path="/admin/coming-soon" element={<ProtectedRoute allowedRoles={['admin']}><AdminComingSoon /></ProtectedRoute>} />
        <Route path="/admin/teet" element={<ProtectedRoute allowedRoles={['admin']}><AdminTEET /></ProtectedRoute>} />
        <Route path="/admin/materials" element={<ProtectedRoute allowedRoles={['admin']}><AdminMaterials /></ProtectedRoute>} />
        <Route path="/admin/categories" element={<ProtectedRoute allowedRoles={['admin']}><AdminCategories /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />

        <Route path="/lecturer" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerHome /></ProtectedRoute>} />
        <Route path="/lecturer/live" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerLive /></ProtectedRoute>} />
        <Route path="/lecturer/courses" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerCourses /></ProtectedRoute>} />
        <Route path="/lecturer/students" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerStudents /></ProtectedRoute>} />
        <Route path="/lecturer/projects" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerProjects /></ProtectedRoute>} />
        <Route path="/lecturer/support" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerSupport /></ProtectedRoute>} />
        <Route path="/lecturer/profile" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerProfile /></ProtectedRoute>} />
        <Route path="/lecturer/materials" element={<ProtectedRoute allowedRoles={['lecturer']}><LecturerMaterials /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to={currentUser ? roleHome(currentUser.role) : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <CourseProvider>
          <LiveClassProvider>
            <ProjectProvider>
              <ComingSoonProvider>
                <BrowserRouter>
                  <OfflineBanner />
                  <AppRoutes />
                </BrowserRouter>
              </ComingSoonProvider>
            </ProjectProvider>
          </LiveClassProvider>
        </CourseProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
