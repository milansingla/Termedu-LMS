import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LecturerLayout from './LecturerLayout';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useProjects } from '../../context/ProjectContext';
import { useLiveClass } from '../../context/LiveClassContext';
import SendNotifModal from '../../components/SendNotifModal';
import { SkeletonStatCard, SkeletonSessionCard } from '../../components/Skeleton';

export default function LecturerHome() {
  const navigate = useNavigate();
  const { currentUser, appUsers, dataReady } = useApp();
  const { courses: ctxCourses, totalLessonsAll, coursesLoading } = useCourses();
  const { submissions } = useProjects();
  const { sessions, sessionsLoading } = useLiveClass();

  const isLoading = !dataReady || coursesLoading || sessionsLoading;
  const [notifModal, setNotifModal] = useState(false);

  const now = new Date();
  const [hour] = useState(now.getHours());
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const totalStudents = (appUsers || []).filter(u => u.role === 'student').length;
  const pendingReviews = (submissions || []).filter(s => s.marks === null).length;

  const avgRating = (() => {
    const rated = (ctxCourses || []).filter(c => c.rating > 0);
    if (!rated.length) return '—';
    return (rated.reduce((s, c) => s + c.rating, 0) / rated.length).toFixed(1);
  })();

  const upcomingSoon = (sessions || []).filter(s => {
    const dt = new Date(`${s.date}T${s.time}`);
    const diff = dt - now;
    return s.status === 'upcoming' && diff > 0 && diff <= 24 * 60 * 60 * 1000;
  });

  return (
    <LecturerLayout>
      <div className="space-y-6 pt-2">
        <div className="bg-gradient-to-br from-primary via-violet-700 to-secondary rounded-3xl p-6 text-white shadow-lg shadow-primary/20">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">{greeting}</p>
          <h1 className="text-2xl font-extrabold font-headline">{currentUser?.name?.split(' ')[0]} 👋</h1>
          <p className="text-white/60 text-sm mt-1">Lecturer Portal — T.E.R.M. Edu</p>
          <div className="flex items-center gap-2 mt-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <span className="text-white/80 text-xs font-medium">Live Video Classes</span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Students', value: totalStudents.toLocaleString(), icon: 'groups', color: 'text-primary bg-primary/5' },
              { label: 'Total Lessons', value: totalLessonsAll.toString(), icon: 'menu_book', color: 'text-secondary bg-secondary/5' },
              { label: 'Pending Reviews', value: pendingReviews.toString(), icon: 'pending_actions', color: 'text-orange-500 bg-orange-50' },
              { label: 'Avg. Rating', value: avgRating, icon: 'star', color: 'text-yellow-500 bg-yellow-50' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                </div>
                <p className="text-2xl font-extrabold font-headline">{value}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-base font-bold font-headline mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Start Live Class', icon: 'live_tv', color: 'signature-gradient text-white shadow-primary/20', action: () => navigate('/lecturer/live') },
              { label: 'Schedule Class', icon: 'event', color: 'bg-secondary-container/20 text-secondary border border-secondary/20', action: () => navigate('/lecturer/live') },
              { label: 'Grade Assignments', icon: 'grading', color: 'bg-orange-50 text-orange-600 border border-orange-100', action: () => navigate('/lecturer/students') },
              { label: 'View Students', icon: 'group', color: 'bg-surface-container text-on-surface-variant border border-outline-variant/20', action: () => navigate('/lecturer/students') },
              { label: 'Send Notification', icon: 'send', color: 'bg-violet-50 text-violet-700 border border-violet-200', action: () => setNotifModal(true) },
            ].map(({ label, icon, color, action }) => (
              <button key={label} onClick={action} className={`flex flex-col items-center gap-2 p-5 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] shadow-sm ${color}`}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {upcomingSoon.length > 0 && (
          <div>
            <h2 className="text-base font-bold font-headline mb-3">Coming Up (Next 24 hrs)</h2>
            <div className="space-y-2">
              {upcomingSoon.map(s => (
                <div key={s.id} className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                  <div>
                    <p className="font-semibold text-sm">{s.title}</p>
                    <p className="text-xs text-on-surface-variant">{s.date} at {s.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-base font-bold font-headline mb-3">My Courses</h2>
          {(ctxCourses || []).length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-outline/40">library_books</span>
              <p className="text-sm text-on-surface-variant mt-2">No courses yet. Create one in the Courses section.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(ctxCourses || []).map(c => (
                <div key={c.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center ${c.gradient ? `bg-gradient-to-br ${c.gradient}` : 'signature-gradient'}`}>
                    <span className="material-symbols-outlined text-white/80 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {c.gradientIcon || 'school'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{c.title}</p>
                    <p className="text-xs text-on-surface-variant">
                      {c.isPlanProgram ? `${c.planKey} plan` : (c.level || 'Course')}
                      {c.rating > 0 ? ` · ⭐ ${c.rating.toFixed(1)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SendNotifModal open={notifModal} onClose={() => setNotifModal(false)} senderType="lecturer" />
    </LecturerLayout>
  );
}
