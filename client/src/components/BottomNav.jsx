import { memo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import SideNav from './SideNav';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      // Keyboard is considered open when viewport height shrinks by >120px
      setKeyboardOpen(vv.height < window.innerHeight - 120);
    };
    vv.addEventListener('resize', check);
    vv.addEventListener('scroll', check);
    return () => { vv.removeEventListener('resize', check); vv.removeEventListener('scroll', check); };
  }, []);

  const studentTabs = [
    { label: 'Home',     icon: 'home',            path: '/home' },
    { label: 'Courses',  icon: 'import_contacts', path: '/courses' },
    { label: 'Live',     icon: 'live_tv',          path: '/live' },
    { label: 'Projects', icon: 'folder_open',      path: '/projects' },
    { label: 'Profile',  icon: 'person',           path: '/profile' },
  ];

  // Pinned admin tabs shown in the bottom bar
  const adminTabs = [
    { label: 'Dashboard', icon: 'dashboard',    path: '/admin' },
    { label: 'Users',     icon: 'group',         path: '/admin/users' },
    { label: 'TEET',      icon: 'psychology',    path: '/admin/teet' },
    { label: 'Live',      icon: 'live_tv',       path: '/admin/live' },
  ];

  // Extra admin pages shown in the "More" drawer
  const adminMoreItems = [
    { label: 'Courses',     icon: 'menu_book',        path: '/admin/courses' },
    { label: 'Materials',   icon: 'book_2',            path: '/admin/materials' },
    { label: 'Projects',    icon: 'folder_open',      path: '/admin/projects' },
    { label: 'Coming Soon', icon: 'hourglass_top',    path: '/admin/coming-soon' },
    { label: 'Plans',       icon: 'workspace_premium',path: '/admin/plans' },
    { label: 'Support',     icon: 'support_agent',    path: '/admin/support' },
    { label: 'Categories',  icon: 'category',         path: '/admin/categories' },
    { label: 'Settings',    icon: 'settings',         path: '/admin/settings' },
  ];

  const lecturerTabs = [
    { label: 'Home',      icon: 'home',          path: '/lecturer' },
    { label: 'Live',      icon: 'live_tv',        path: '/lecturer/live' },
    { label: 'Projects',  icon: 'folder_open',    path: '/lecturer/projects' },
    { label: 'Students',  icon: 'group',          path: '/lecturer/students' },
    { label: 'Profile',   icon: 'person',         path: '/lecturer/profile' },
  ];

  const isAdmin = currentUser?.role === 'admin';
  const tabs = isAdmin ? adminTabs
    : currentUser?.role === 'lecturer' ? lecturerTabs
    : studentTabs;

  const handleMoreNav = (path) => {
    setMoreOpen(false);
    navigate(path);
  };

  // Check if current page is one of the "more" items
  const moreActive = isAdmin && adminMoreItems.some(m =>
    location.pathname === m.path || location.pathname.startsWith(m.path + '/')
  );

  if (keyboardOpen) return <SideNav />;

  return (
    <>
      <SideNav />

      {/* More drawer overlay */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-[80px] left-3 right-3 bg-surface-container-lowest rounded-3xl shadow-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2 mb-3">More Pages</p>
            <div className="grid grid-cols-3 gap-2">
              {adminMoreItems.map(item => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <button
                    key={item.label}
                    onClick={() => handleMoreNav(item.path)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all ${
                      active ? 'bg-violet-100 text-violet-700' : 'bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-600'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[22px]"
                      style={active ? { fontVariationSettings: "'FILL' 1" } : {}}>
                      {item.icon}
                    </span>
                    <span className="text-[10px] font-semibold leading-none text-center">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 w-full flex items-center px-2 pb-safe-nav pt-2 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_-4px_24px_rgba(29,26,36,0.06)] z-40 rounded-t-3xl" style={{ willChange: 'transform', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}>
        {tabs.map((tab) => {
          const exactOnlyPaths = ['/admin', '/lecturer'];
          const active = location.pathname === tab.path
            || (!exactOnlyPaths.includes(tab.path) && tab.path.length > 1 && location.pathname.startsWith(tab.path + '/'))
            || (tab.path === '/courses' && location.pathname.startsWith('/courses/'));
          return (
            <button
              key={tab.label}
              onClick={() => { setMoreOpen(false); navigate(tab.path); }}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-w-0 ${
                active
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-slate-400 hover:text-violet-600'
              }`}
            >
              <span
                className={`material-symbols-outlined transition-all ${active ? 'text-[22px]' : 'text-[20px]'}`}
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {tab.icon}
              </span>
              <span className="font-medium text-[9px] uppercase tracking-wide mt-0.5 leading-none truncate w-full text-center px-0.5">
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* "More" button — admin only */}
        {isAdmin && (
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-w-0 ${
              moreOpen || moreActive ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:text-violet-600'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]"
              style={moreOpen || moreActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
              {moreOpen ? 'close' : 'more_horiz'}
            </span>
            <span className="font-medium text-[9px] uppercase tracking-wide mt-0.5 leading-none">More</span>
          </button>
        )}
      </nav>
    </>
  );
}

export default memo(BottomNav);
