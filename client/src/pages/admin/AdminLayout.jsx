import { useState, useRef, useEffect } from 'react';
import BottomNav from '../../components/BottomNav';
import NotificationPanel, { useNotifCount } from '../../components/NotificationPanel';
import EditProfileModal from '../../components/EditProfileModal';
import { useApp } from '../../context/AppContext';

function getInitials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'A';
}

export default function AdminLayout({ children }) {
  const { currentUser, logout, darkMode, toggleDarkMode } = useApp();
  const [notifOpen, setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const unread = useNotifCount();
  const profileRef = useRef(null);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  return (
    <div className="bg-background min-h-screen text-on-surface">
      <header className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl shadow-sm flex justify-between items-center px-5 py-4">
        <div className="bg-black rounded-lg px-2 py-1.5 flex items-center shadow-md md:hidden">
          <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 object-contain" />
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">Admin Panel</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(v => !v); setProfileOpen(false); }}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors text-violet-700 relative"
            >
              <span className="material-symbols-outlined">notifications</span>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 leading-none">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
          </div>

          {/* Profile button */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(v => !v); setNotifOpen(false); }}
              className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center border-2 border-white shadow-sm overflow-hidden hover:ring-2 hover:ring-primary/40 transition-all active:scale-95"
            >
              {currentUser?.avatar
                ? <img src={currentUser.avatar} alt="Admin" className="w-full h-full object-cover" />
                : <span className="text-white font-bold text-sm">{getInitials(currentUser?.name)}</span>
              }
            </button>

            {/* Profile dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-14 w-72 bg-surface rounded-2xl shadow-2xl border border-outline-variant/15 z-[200] overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="px-5 py-4 bg-surface-container-lowest flex items-center gap-3 border-b border-outline-variant/10">
                  <div className="w-12 h-12 rounded-full signature-gradient flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-white shadow">
                    {currentUser?.avatar
                      ? <img src={currentUser.avatar} alt="Admin" className="w-full h-full object-cover" />
                      : <span className="text-white font-bold">{getInitials(currentUser?.name)}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-on-surface truncate">{currentUser?.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{currentUser?.email}</p>
                    <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">Admin</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="py-2">
                  {/* Edit Profile */}
                  <button
                    onClick={() => { setEditOpen(true); setProfileOpen(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant text-xl">manage_accounts</span>
                    <span className="text-sm font-medium text-on-surface">Edit Profile</span>
                  </button>

                  {/* Dark mode toggle */}
                  <button
                    onClick={toggleDarkMode}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant text-xl">
                      {darkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                    <span className="flex-1 text-sm font-medium text-on-surface text-left">
                      {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    </span>
                    <div className={`w-10 h-[22px] rounded-full relative transition-colors duration-300 ${darkMode ? 'bg-primary' : 'bg-surface-container-high'}`}>
                      <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${darkMode ? 'left-5' : 'left-[3px]'}`} />
                    </div>
                  </button>

                  <div className="mx-4 my-1 border-t border-outline-variant/10" />

                  {/* Logout */}
                  <button
                    onClick={() => { logout(); setProfileOpen(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-error text-xl">logout</span>
                    <span className="text-sm font-medium text-error">Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-32 md:pb-10 px-4 md:px-8 md:ml-64 max-w-5xl">
        {children}
      </main>

      <BottomNav />
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
