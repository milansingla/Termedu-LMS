import { useNavigate } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useApp } from '../../context/AppContext';
import { useAssignments } from '../../context/AssignmentContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { useCourses } from '../../context/CourseContext';
import { SkeletonStatCard, SkeletonListItem, SkeletonLine } from '../../components/Skeleton';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { currentUser, enrolledCourses, dataReady } = useApp();
  const { assignments, submissions } = useAssignments();
  const { sessions, liveSessions, liveWorkshops, sessionsLoading } = useLiveClass();
  const { courses, coursesLoading } = useCourses();

  const isLoading = !dataReady || coursesLoading || sessionsLoading;

  const enrolledCount = enrolledCourses?.length || 0;

  const mySubmittedIds = new Set(
    (submissions || []).filter(s => s.studentId === currentUser?.id).map(s => s.assignmentId)
  );
  const pendingAssignments = (assignments || []).filter(a => !mySubmittedIds.has(a.id));

  const attendedCount = (submissions || []).filter(s => s.studentId === currentUser?.id).length;

  const progress = currentUser?.progress || {};
  const watchedLessons = Object.values(progress).reduce((acc, p) => {
    const done = typeof p === 'object' ? Object.values(p).filter(Boolean).length : 0;
    return acc + done;
  }, 0);

  const enrolledCourseObjects = courses.filter(c =>
    enrolledCourses?.includes(c.id) || enrolledCourses?.includes(String(c.id))
  );

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar showBack title="My Dashboard" showBrand={false} />

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto space-y-8">
        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Enrolled Courses', value: enrolledCount, icon: 'menu_book', color: 'bg-primary-fixed text-primary' },
              { label: 'Pending Assignments', value: pendingAssignments.length, icon: 'pending_actions', color: 'bg-orange-50 text-orange-600' },
              { label: 'Lessons Watched', value: watchedLessons, icon: 'play_circle', color: 'bg-secondary-container/20 text-secondary' },
              { label: 'Live Now', value: liveSessions.length + liveWorkshops.length, icon: 'live_tv', color: 'bg-red-50 text-red-500' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-surface-container-lowest p-5 rounded-3xl shadow-sm flex flex-col gap-3">
                <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
                  <span className="material-symbols-outlined">{icon}</span>
                </div>
                <div>
                  <p className="text-on-surface-variant text-sm font-medium">{label}</p>
                  <p className="text-3xl font-extrabold font-headline mt-1">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Overall Progress */}
        {isLoading ? (
          <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm space-y-4">
            <SkeletonLine width="w-40" height="h-5" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <SkeletonLine width="w-2/3" height="h-3.5" />
                  <SkeletonLine width="w-8" height="h-3.5" />
                </div>
                <SkeletonLine width="w-full" height="h-2.5" />
              </div>
            ))}
          </div>
        ) : enrolledCourseObjects.length > 0 ? (
          <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm">
            <h3 className="font-headline font-bold text-lg mb-4">Learning Progress</h3>
            <div className="space-y-4">
              {enrolledCourseObjects.map(c => {
                const courseProgress = progress[c.id] || {};
                const totalLessons = Object.keys(courseProgress).length || 1;
                const doneLessons = Object.values(courseProgress).filter(Boolean).length;
                const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-sm font-medium truncate flex-1 mr-2">{c.title}</p>
                      <span className="text-sm font-bold text-primary">{pct}%</span>
                    </div>
                    <div className="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Pending Assignments */}
        {isLoading ? (
          <div className="space-y-4">
            <SkeletonLine width="w-48" height="h-5" />
            {Array.from({ length: 2 }).map((_, i) => <SkeletonListItem key={i} />)}
          </div>
        ) : pendingAssignments.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-headline font-bold text-lg">Pending Assignments</h3>
            {pendingAssignments.slice(0, 3).map(a => (
              <div key={a.id} onClick={() => navigate('/assignments')}
                className="bg-surface-container-lowest p-4 rounded-2xl border border-orange-200 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-orange-500">assignment_late</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{a.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {a.dueDate ? `Due: ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-outline">chevron_right</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Study Materials', icon: 'folder', path: '/downloads', color: 'text-blue-600 bg-blue-50' },
            { label: 'Assignments', icon: 'assignment', path: '/assignments', color: 'text-orange-600 bg-orange-50' },
            { label: 'Live Classes', icon: 'live_tv', path: '/live', color: 'text-red-600 bg-red-50' },
            { label: 'Support', icon: 'support_agent', path: '/support', color: 'text-secondary bg-secondary-container/20' },
          ].map(({ label, icon, path, color }) => (
            <button key={label} onClick={() => navigate(path)} className={`flex items-center gap-3 p-4 rounded-2xl ${color} font-semibold text-sm transition-all hover:opacity-80 active:scale-[0.98]`}>
              <span className="material-symbols-outlined">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
