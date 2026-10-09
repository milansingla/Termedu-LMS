import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useNotifCount } from '../../components/NotificationPanel';
import EditProfileModal from '../../components/EditProfileModal';

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, logout, enrolledCourses, toggleDarkMode, darkMode, currentPlan } = useApp();
  const { courses: ctxCourses } = useCourses();
  const unread = useNotifCount();

  const enrolled = (ctxCourses || []).filter(c => (enrolledCourses || []).includes(c.id));
  const [editOpen, setEditOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <div className="signature-gradient pt-safe">
        <div className="px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-xl font-extrabold text-white font-headline">My Profile</div>
            <button onClick={() => setEditOpen(true)} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <span className="material-symbols-outlined text-white">settings</span>
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              {currentUser?.avatar
                ? <img src={currentUser.avatar} alt={currentUser?.name} className="w-20 h-20 rounded-full object-cover border-4 border-white/30" />
                : <div className="w-20 h-20 rounded-full border-4 border-white/30 bg-white/20 flex items-center justify-center"><span className="material-symbols-outlined text-white text-4xl">person</span></div>
              }
              <button
                onClick={() => setEditOpen(true)}
                className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow"
                aria-label="Edit profile"
              >
                <span className="material-symbols-outlined text-primary text-xs">edit</span>
              </button>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold font-headline text-white">{currentUser?.name}</h2>
              <p className="text-white/70 text-sm mt-0.5 capitalize">{currentUser?.role} · {currentPlan !== 'none' ? currentPlan : 'Member'}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-yellow-300 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                <span className="text-white text-sm font-bold">T.E.R.M. Edu</span>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="px-4 md:px-6 pb-32 -mt-4 space-y-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Enrolled', value: enrolled.length, icon: 'menu_book' },
            { label: 'Plan', value: currentPlan && currentPlan !== 'none' ? currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1) : '—', icon: 'workspace_premium' },
            { label: 'Alerts', value: unread, icon: 'notifications_active' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-surface-container-lowest p-5 rounded-2xl text-center shadow-sm border border-outline-variant/10">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <p className="text-2xl font-black font-headline mt-1">{value}</p>
              <p className="text-xs text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Learning</p>
          {[
            { label: 'My Courses',        icon: 'menu_book',  path: '/courses' },
            { label: 'Plans & Pricing', icon: 'workspace_premium', path: '/pricing' },
            { label: 'Study Materials',    icon: 'folder',      path: '/downloads' },
            { label: 'Live Classes',       icon: 'live_tv',     path: '/live' },
            { label: 'Projects & Tasks',   icon: 'folder_open', path: '/projects' },
          ].map(({ label, icon, path }) => (
            <button key={label} onClick={() => navigate(path)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10">
              <span className="material-symbols-outlined text-primary">{icon}</span>
              <span className="flex-1 text-left font-medium text-sm">{label}</span>
              <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
            </button>
          ))}
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Account</p>

          <button onClick={() => navigate('/support')} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10">
            <span className="material-symbols-outlined text-on-surface-variant">support_agent</span>
            <span className="flex-1 text-left font-medium text-sm">Support Chat</span>
            <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>

          <button
            onClick={() => navigate('/notifications')}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
          >
            <span className="material-symbols-outlined" style={unread > 0 ? { fontVariationSettings: "'FILL' 1", color: '#7c3aed' } : { color: '#6b7280' }}>notifications</span>
            <span className="flex-1 text-left font-medium text-sm">Notifications</span>
            {unread > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-extrabold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none mr-1">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>

          <button onClick={toggleDarkMode} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors border-t border-outline-variant/10">
            <span className="material-symbols-outlined text-on-surface-variant">{darkMode ? 'light_mode' : 'dark_mode'}</span>
            <span className="flex-1 text-left font-medium text-sm">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            <div className={`w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-primary' : 'bg-surface-container-high'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mt-1 ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </button>
        </div>

        <button onClick={handleLogout} className="w-full flex items-center gap-4 px-5 py-4 bg-surface-container-lowest rounded-2xl border border-error/20 text-error hover:bg-error/5 transition-colors shadow-sm">
          <span className="material-symbols-outlined">logout</span>
          <span className="font-bold text-sm">Log Out</span>
        </button>

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
          <p className="text-xs font-semibold text-on-surface-variant px-5 pt-4 pb-2 uppercase tracking-wide">Legal</p>
          {[
            { label: 'About T.E.R.M. Edu', icon: 'info', href: '/about' },
            { label: 'Contact Us', icon: 'support_agent', href: '/contact' },
            { label: 'Privacy Policy', icon: 'shield', href: '/privacy-policy' },
            { label: 'Terms & Conditions', icon: 'gavel', href: '/terms' },
          ].map((item, idx, arr) => (
            <a key={item.href} href={item.href}
              className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors ${idx < arr.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
              <span className="material-symbols-outlined text-on-surface-variant">{item.icon}</span>
              <span className="flex-1 text-left font-medium text-sm">{item.label}</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
            </a>
          ))}
        </div>
      </main>

      <BottomNav />
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
