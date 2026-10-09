import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LecturerLayout from './LecturerLayout';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useProjects } from '../../context/ProjectContext';
import EditProfileModal from '../../components/EditProfileModal';

export default function LecturerProfile() {
  const navigate = useNavigate();
  const { currentUser, appUsers, logout, darkMode, toggleDarkMode } = useApp();
  const { courses: ctxCourses, totalLessonsAll } = useCourses();
  const { submissions } = useProjects();
  const [editOpen, setEditOpen] = useState(false);

  const totalStudents = (appUsers || []).filter(u => u.role === 'student').length;
  const avgRating = (() => {
    const rated = (ctxCourses || []).filter(c => c.rating > 0);
    if (!rated.length) return '—';
    return (rated.reduce((s, c) => s + c.rating, 0) / rated.length).toFixed(1);
  })();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <LecturerLayout>
      <div className="space-y-4 pt-2">
        <div className="signature-gradient rounded-3xl overflow-hidden shadow-lg shadow-primary/20">
          <div className="px-6 py-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                {currentUser?.avatar
                  ? <img src={currentUser.avatar} alt={currentUser.name} className="w-20 h-20 rounded-full object-cover border-4 border-white/30" />
                  : <div className="w-20 h-20 rounded-full border-4 border-white/30 bg-white/20 flex items-center justify-center">
                      <span className="text-white text-3xl font-extrabold">{currentUser?.name?.[0] ?? 'L'}</span>
                    </div>
                }
                <button
                  onClick={() => setEditOpen(true)}
                  className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow"
                  aria-label="Edit profile"
                >
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>edit</span>
                </button>
              </div>
              <div>
                <h2 className="text-xl font-extrabold font-headline text-white">{currentUser?.name}</h2>
                <p className="text-white/70 text-sm mt-0.5">Lecturer · T.E.R.M. Edu</p>
                <p className="text-white/50 text-xs mt-0.5">{currentUser?.email}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Students', value: totalStudents.toLocaleString(), icon: 'groups' },
            { label: 'Lessons', value: totalLessonsAll.toString(), icon: 'menu_book' },
            { label: 'Avg Rating', value: avgRating, icon: 'star' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl text-center shadow-sm border border-outline-variant/10">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <p className="text-xl font-black font-headline mt-1">{value}</p>
              <p className="text-xs text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Teaching</p>
          {[
            { label: 'Live Classes', icon: 'live_tv', path: '/lecturer/live' },
            { label: 'Students & Grades', icon: 'grading', path: '/lecturer/students' },
            { label: 'Support Chat', icon: 'support_agent', path: '/lecturer/support' },
          ].map(({ label, icon, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container transition-colors border-t border-outline-variant/10"
            >
              <span className="material-symbols-outlined text-primary">{icon}</span>
              <span className="flex-1 text-left font-medium text-sm">{label}</span>
              <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
            </button>
          ))}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Preferences</p>

          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container transition-colors border-t border-outline-variant/10"
          >
            <span className="material-symbols-outlined text-on-surface-variant">
              {darkMode ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="flex-1 text-left font-medium text-sm">
              {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </span>
            <div className={`w-11 h-6 rounded-full relative transition-colors duration-300 ${darkMode ? 'bg-primary' : 'bg-surface-container-high'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${darkMode ? 'left-6' : 'left-1'}`} />
            </div>
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-5 py-4 bg-surface-container-lowest rounded-2xl border border-error/20 text-error hover:bg-error/5 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-bold text-sm">Log Out</span>
        </button>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </LecturerLayout>
  );
}
