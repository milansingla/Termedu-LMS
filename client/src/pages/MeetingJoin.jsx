import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import DailyVideoCall from '../components/DailyVideoCall';
import { getToken } from '../services/dailyApi';

export default function MeetingJoin() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const autoJoined = useRef(false);

  // Load session + check if already logged in
  useEffect(() => {
    let mounted = true;

    const loadSession = () =>
      fetch('/api/sessions')
        .then(r => r.json())
        .then(data => {
          if (!mounted) return;
          const found = Array.isArray(data)
            ? data.find(s => s.id === sessionId || String(s.id) === sessionId)
            : null;
          setSession(found || null);
          setLoading(false);
        })
        .catch(() => { if (mounted) setLoading(false); });

    const checkAuth = () =>
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(user => { if (mounted && user) setLoggedInUser(user); })
        .catch(() => {});

    Promise.all([loadSession(), checkAuth()]);
    const t = setInterval(loadSession, 5000);
    return () => { mounted = false; clearInterval(t); };
  }, [sessionId]);

  // Auto-join logged-in users when session goes live
  useEffect(() => {
    if (autoJoined.current || !loggedInUser || !session || session.status !== 'live' || activeCall) return;
    autoJoined.current = true;
    doJoin(loggedInUser.name || loggedInUser.email || 'Guest', loggedInUser.email || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInUser, session, activeCall]);

  const doJoin = async (name, email) => {
    if (!session?.roomName) { setError("This session hasn't started yet. Please wait for the host."); return; }
    setJoining(true);
    setError(null);
    try {
      const { token, roomUrl } = await getToken({
        roomName: session.roomName,
        isOwner: false,
        userName: name.trim(),
        userId: email.trim() || name.trim(),
      });
      setActiveCall({ roomUrl: session.roomUrl || roomUrl, token });
    } catch (err) {
      setError(err.message || 'Failed to join. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const joinMeeting = () => {
    if (!guestName.trim()) { setError('Please enter your name.'); return; }
    doJoin(guestName.trim(), guestEmail.trim());
  };

  if (activeCall) {
    const displayName = loggedInUser?.name || guestName.trim() || 'Guest';
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={false}
        userName={displayName}
        onLeave={() => { setActiveCall(null); autoJoined.current = false; }}
        sessionDbId={session?.id}
        sessionTitle={session?.title || 'Session'}
      />
    );
  }

  const fmtDate = (s) => {
    if (!s?.date) return '';
    try {
      return new Date(`${s.date}T${s.time || '00:00'}`).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
    } catch { return s.date; }
  };

  const sessionType = session?.isMeeting ? 'Meeting' : session?.isWorkshop ? 'Free Workshop' : 'Live Class';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4">

      {/* Branding */}
      <div className="mb-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-violet-700/40 ring-4 ring-violet-500/20">
          <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
        </div>
        <p className="text-violet-400 text-xs font-black tracking-[0.2em] uppercase">T.E.R.M. Edu</p>
        <p className="text-slate-500 text-[11px] mt-0.5">Secure · End-to-end encrypted · No download needed</p>
      </div>

      <div className="w-full max-w-sm">
        {loading ? (
          <div className="text-center text-slate-400 py-16">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm">Loading session details…</p>
          </div>
        ) : !sessionId || !session ? (
          <div className="bg-slate-800/80 backdrop-blur rounded-3xl border border-white/10 p-8 text-center shadow-2xl">
            <span className="material-symbols-outlined text-5xl text-slate-600 block mb-3">link_off</span>
            <p className="text-white font-bold text-base">Session not found</p>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              This link may be invalid or the session was removed. Contact the host for a new link.
            </p>
          </div>
        ) : (
          <div className="bg-slate-800/90 backdrop-blur rounded-3xl border border-white/10 shadow-2xl overflow-hidden">

            {/* Session info */}
            <div className={`px-6 pt-6 pb-5 border-b border-white/10 ${session.status === 'live' ? 'bg-gradient-to-br from-violet-600/25 to-indigo-600/10' : 'bg-white/[0.03]'}`}>
              <div className="flex items-center gap-2 mb-2">
                {session.status === 'live' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                <span className={`text-[10px] font-black uppercase tracking-widest ${session.status === 'live' ? 'text-red-400' : session.status === 'ended' ? 'text-slate-500' : 'text-violet-400'}`}>
                  {session.status === 'live' ? '● Live Now' : session.status === 'ended' ? 'Ended' : '⏰ Upcoming'}
                </span>
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-violet-500/15 text-violet-400 border-violet-500/25">
                  {sessionType}
                </span>
              </div>
              <h1 className="text-white font-black text-xl leading-tight">{session.title}</h1>
              {session.description && (
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{session.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {session.instructor && (
                  <span className="text-slate-400 text-[11px] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}>person</span>
                    {session.instructor}
                  </span>
                )}
                {session.date && (
                  <span className="text-slate-400 text-[11px] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>schedule</span>
                    {fmtDate(session)}{session.time ? ` · ${session.time}` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Join area */}
            <div className="p-6 space-y-4">
              {session.status === 'ended' ? (
                <div className="text-center py-6">
                  <span className="material-symbols-outlined text-4xl text-slate-600 block mb-2">meeting_room</span>
                  <p className="text-slate-300 font-semibold">This session has ended</p>
                  <p className="text-slate-500 text-xs mt-1">The host has closed this session.</p>
                </div>
              ) : loggedInUser ? (
                /* Logged-in user — auto-joins when live, shows wait if upcoming */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-base" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                    </div>
                    <div>
                      <p className="text-violet-200 text-sm font-semibold">{loggedInUser.name || loggedInUser.email}</p>
                      <p className="text-violet-400 text-[11px]">Joining as T.E.R.M. member</p>
                    </div>
                  </div>

                  {session.status === 'upcoming' && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                      <span className="material-symbols-outlined text-amber-400 flex-shrink-0" style={{ fontSize: '16px' }}>schedule</span>
                      <p className="text-amber-300 text-xs leading-relaxed">
                        Session hasn't started yet. This page auto-refreshes — you'll be taken in automatically when the host starts.
                      </p>
                    </div>
                  )}

                  {error && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
                      {error}
                    </p>
                  )}

                  <button
                    onClick={() => doJoin(loggedInUser.name || loggedInUser.email || 'Guest', loggedInUser.email || '')}
                    disabled={joining || session.status !== 'live'}
                    className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-700/30"
                  >
                    {joining ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Joining…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>videocam</span>
                        {session.status === 'live' ? 'Join Now' : 'Waiting for Host…'}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Guest — show name/email form */
                <>
                  {session.status === 'upcoming' && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                      <span className="material-symbols-outlined text-amber-400 flex-shrink-0" style={{ fontSize: '16px' }}>schedule</span>
                      <p className="text-amber-300 text-xs leading-relaxed">
                        This session hasn't started yet. Fill in your details and the join button will activate when the host opens the room.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1.5">Your Name *</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && joinMeeting()}
                      placeholder="Enter your full name"
                      autoFocus
                      className="w-full bg-slate-700/80 text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-slate-500 border border-white/10"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1.5">
                      Email <span className="normal-case font-normal text-slate-500 tracking-normal">(optional)</span>
                    </label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-slate-700/80 text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-slate-500 border border-white/10"
                    />
                  </div>

                  {error && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
                      {error}
                    </p>
                  )}

                  <button
                    onClick={joinMeeting}
                    disabled={joining || !guestName.trim() || session.status !== 'live'}
                    className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-700/30"
                  >
                    {joining ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Joining…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>videocam</span>
                        Join Session
                      </>
                    )}
                  </button>

                  {session.status === 'upcoming' && (
                    <p className="text-center text-slate-600 text-[10px]">
                      Page auto-refreshes every 5 seconds · Join button activates when host starts
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-slate-600 text-[10px]">
            Powered by <span className="text-violet-500 font-bold">T.E.R.M. Edu</span> · End-to-end encrypted · No download needed
          </p>
        </div>
      </div>
    </div>
  );
}
