import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useNotifCount } from './NotificationPanel';

export default function SideNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useApp();
  const unread = useNotifCount();

  const studentTabs = [
    { label: 'Home',      icon: 'home',              path: '/home' },
    { label: 'Courses',   icon: 'import_contacts',   path: '/courses' },
    { label: 'Live',      icon: 'live_tv',            path: '/live' },
    { label: 'Projects',  icon: 'folder_open',        path: '/projects' },
    { label: 'Materials', icon: 'book_2',             path: '/downloads' },
    { label: 'TEET',      icon: 'psychology',         path: '/teet' },
    { label: 'Plans',     icon: 'workspace_premium',  path: '/pricing' },
    { label: 'Profile',   icon: 'person',             path: '/profile' },
  ];

  const adminTabs = [
    { label: 'Dashboard',   icon: 'dashboard',        path: '/admin' },
    { label: 'Courses',     icon: 'menu_book',         path: '/admin/courses' },
    { label: 'Users',       icon: 'group',             path: '/admin/users' },
    { label: 'Materials',   icon: 'book_2',            path: '/admin/materials' },
    { label: 'Live',        icon: 'live_tv',           path: '/admin/live' },
    { label: 'Projects',    icon: 'folder_open',       path: '/admin/projects' },
    { label: 'TEET',        icon: 'psychology',        path: '/admin/teet' },
    { label: 'Coming Soon', icon: 'hourglass_top',     path: '/admin/coming-soon' },
    { label: 'Support',     icon: 'support_agent',     path: '/admin/support' },
    { label: 'Plans',       icon: 'workspace_premium', path: '/admin/plans' },
    { label: 'Categories',  icon: 'category',          path: '/admin/categories' },
  ];

  const lecturerTabs = [
    { label: 'Home',      icon: 'home',          path: '/lecturer' },
    { label: 'Live Class',icon: 'live_tv',        path: '/lecturer/live' },
    { label: 'Courses',   icon: 'video_library',  path: '/lecturer/courses' },
    { label: 'Materials', icon: 'book_2',         path: '/lecturer/materials' },
    { label: 'Students',  icon: 'group',          path: '/lecturer/students' },
    { label: 'Projects',  icon: 'folder_open',    path: '/lecturer/projects' },
    { label: 'Support',   icon: 'support_agent',  path: '/lecturer/support' },
    { label: 'Profile',   icon: 'person',         path: '/lecturer/profile' },
  ];

  const role = currentUser?.role;
  const tabs = role === 'admin' ? adminTabs
    : role === 'lecturer' ? lecturerTabs
    : studentTabs;

  const roleLabel = role === 'admin' ? 'Admin Panel'
    : role === 'lecturer' ? 'Lecturer Panel'
    : 'Student Portal';

  // Paths that are exact-match only (they are prefixes of all sub-routes so startsWith would always fire)
  const exactOnlyPaths = ['/admin', '/lecturer'];
  const isActive = (tab) => {
    if (location.pathname === tab.path) return true;
    if (exactOnlyPaths.includes(tab.path)) return false;
    if (tab.path.length > 1 && location.pathname.startsWith(tab.path + '/')) return true;
    if (tab.path === '/courses' && location.pathname.startsWith('/courses/')) return true;
    return false;
  };

  const handleProfileNav = () => {
    if (!currentUser) return;
    navigate(role === 'lecturer' ? '/lecturer/profile' : '/profile');
  };

  const handleLogout = () => {
    if (!currentUser) return;
    logout();
    navigate('/login');
  };

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-outline-variant/20 z-40 shadow-sm">
      <div className="px-5 py-5 border-b border-outline-variant/10 flex items-center gap-3">
        <div className="bg-black rounded-xl px-3 py-2 flex items-center shadow-md">
          <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 w-auto" />
        </div>
        <div>
          <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-widest leading-none">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {tabs.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                active
                  ? 'signature-gradient text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px] flex-shrink-0"
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {tab.icon}
              </span>
              <span className="font-semibold text-sm">{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => navigate('/notifications')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
            location.pathname === '/notifications'
              ? 'signature-gradient text-white shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] flex-shrink-0"
            style={unread > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}
          >
            notifications
          </span>
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <span className="ml-auto bg-red-500 text-white text-[9px] font-extrabold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </nav>

      <div className="px-4 py-4 border-t border-outline-variant/10 space-y-2">
        {currentUser ? (
          <>
            <button
              onClick={handleProfileNav}
              className="flex items-center gap-3 px-1 w-full text-left hover:opacity-80 active:scale-95 transition-all"
            >
              <div className="w-9 h-9 rounded-full signature-gradient flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white shadow-sm">
                {currentUser.avatar
                  ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-sm">{currentUser.name?.[0] ?? 'U'}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-surface truncate">{currentUser.name}</p>
                <p className="text-[10px] text-on-surface-variant truncate capitalize">{currentUser.role}</p>
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-all text-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Sign Out
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-surface-container animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-surface-container animate-pulse rounded w-24" />
              <div className="h-2.5 bg-surface-container animate-pulse rounded w-16" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
