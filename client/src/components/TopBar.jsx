import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useNotifCount } from './NotificationPanel';

export default function TopBar({ title, showBack = false, showBrand = true, actions = [] }) {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const unread = useNotifCount();

  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-surface-container-lowest shadow-sm shadow-violet-500/5 flex justify-between items-center px-6 py-4 border-b border-outline-variant/10" style={{ willChange: 'transform', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}>
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-on-surface">arrow_back</span>
          </button>
        )}
        {!showBack && currentUser && (
          <button
            onClick={() => navigate(currentUser.role === 'lecturer' ? '/lecturer/profile' : '/profile')}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center overflow-hidden border-2 border-primary-fixed flex-shrink-0 active:scale-95 transition-transform"
            aria-label="Go to profile"
          >
            {currentUser.avatar
              ? <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-sm">{currentUser.name?.[0] ?? 'U'}</span>
            }
          </button>
        )}
        {!showBack && currentUser && (
          <div className="flex flex-col">
            <span className="text-xs text-on-surface-variant font-medium">Welcome back,</span>
            <span className="text-on-surface font-bold font-headline leading-tight">{currentUser.name}</span>
          </div>
        )}
        {title && <span className="text-lg font-extrabold tracking-tight text-slate-900 font-headline">{title}</span>}
      </div>

      {showBrand && (
        <div className="flex items-center md:hidden">
          <div className="bg-black rounded-lg px-2 py-1.5 flex items-center shadow-md">
            <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 w-auto" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {actions.map((action, i) => (
          <button key={i} onClick={action.onClick} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-violet-700">{action.icon}</span>
          </button>
        ))}
        {!showBack && (
          <button
            onClick={() => navigate('/notifications')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors relative md:hidden"
            aria-label="Notifications"
          >
            <span className="material-symbols-outlined text-violet-700" style={unread > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}>notifications</span>
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
