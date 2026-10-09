import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useNotifCount } from '../../components/NotificationPanel';
import BottomNav from '../../components/BottomNav';

export default function LecturerLayout({ children, title }) {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const unread = useNotifCount();

  return (
    <div className="bg-background min-h-screen text-on-surface">
      <header className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-white/80 backdrop-blur-xl shadow-sm flex justify-between items-center px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary/20 bg-primary-container flex items-center justify-center">
            {currentUser?.avatar
              ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="material-symbols-outlined text-primary text-base">person</span>
            }
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest leading-none">Lecturer</p>
            <p className="font-extrabold text-sm text-on-surface leading-tight">{currentUser?.name?.split(' ')[0]}</p>
          </div>
        </div>

        <div className="bg-black rounded-lg px-2 py-1.5 flex items-center shadow-md md:hidden">
          <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 object-contain" />
        </div>

        <button
          onClick={() => navigate('/notifications')}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors relative md:hidden"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-violet-700 text-xl" style={unread > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}>notifications</span>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </header>

      <main className="pt-20 px-4 md:px-8 md:ml-64 max-w-4xl space-y-6 pb-32 md:pb-10">
        {title && (
          <div className="pt-2">
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Lecturer Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">{title}</h1>
          </div>
        )}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
