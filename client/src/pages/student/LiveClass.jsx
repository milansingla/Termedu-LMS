import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import DailyVideoCall from '../../components/DailyVideoCall';
import { useApp } from '../../context/AppContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { useProjects } from '../../context/ProjectContext';
import { getToken } from '../../services/dailyApi';
import { SkeletonSessionCard } from '../../components/Skeleton';

const PLAN_OPTIONS = [
  { key: 'all', label: 'All Plans', color: 'bg-green-100 text-green-700' },
  { key: 'starter', label: 'Starter', color: 'bg-slate-100 text-slate-700' },
  { key: 'growth', label: 'Growth', color: 'bg-purple-100 text-purple-700' },
  { key: 'premium', label: 'Premium', color: 'bg-pink-100 text-pink-700' },
];

function PlanBadge({ planKey }) {
  if (planKey === 'free') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        Free
      </span>
    );
  }
  const opt = PLAN_OPTIONS.find(p => p.key === planKey) || PLAN_OPTIONS[0];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function formatDate(dateStr, timeStr) {
  if (!dateStr) return 'Today';
  const dt = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(dateStr);
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr, timeStr) {
  if (!timeStr) return '';
  const dt = new Date(`${dateStr}T${timeStr}`);
  return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function LiveClass() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, currentPlan, planFeatures } = useApp();
  const {
    sessions, liveSessions, upcomingSessions,
    liveWorkshops, upcomingWorkshops, endedWorkshops,
    registerWorkshop, sessionsLoading,
  } = useLiveClass();
  const { getBriefsBySession } = useProjects();
  const [activeCall, setActiveCall] = useState(null);
  const [joining, setJoining] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'classes');
  const [registered, setRegistered] = useState({});
  const [sessionInvite, setSessionInvite] = useState(null);
  const autoJoinAttempted = useRef(false);
  const inviteAttempted = useRef(false);
  const tabAutoSwitched = useRef(false);

  const canJoinLive = currentUser?.role === 'lecturer' || planFeatures?.liveClasses;

  const sessionIsForMe = (session) => {
    if (session.plan === 'all') return true;
    if (!currentPlan || currentPlan === 'none') return false;
    return session.plan === currentPlan;
  };

  const myLiveSessions = liveSessions.filter(sessionIsForMe);
  const myUpcoming = upcomingSessions.filter(sessionIsForMe);

  // Auto-switch to Workshops tab when a free workshop is live but no live class exists
  useEffect(() => {
    if (tabAutoSwitched.current || sessionsLoading) return;
    if (liveWorkshops.length > 0 && myLiveSessions.length === 0) {
      setActiveTab('workshops');
      tabAutoSwitched.current = true;
    }
  }, [liveWorkshops.length, myLiveSessions.length, sessionsLoading]);

  const myEnded = sessions.filter(s => s.status === 'ended' && !s.isWorkshop && sessionIsForMe(s)).slice(0, 5);

  const joinClass = async (cls, isWorkshop = false) => {
    if (!isWorkshop && !canJoinLive) { setShowUpgrade(true); return; }
    setJoining(cls.id);
    setJoinError(null);
    try {
      const roomName = cls.roomName || `term-lms-${cls.id}`;
      const { token, roomUrl } = await getToken({
        roomName,
        isOwner: false,
        userName: currentUser?.name || 'Student',
        userId: currentUser?.id || 'student',
      });
      setActiveCall({ roomUrl: cls.roomUrl || roomUrl, token, roomName, title: cls.title });
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(null);
    }
  };

  const handleRegister = (workshop) => {
    if (!currentUser) return;
    registerWorkshop(workshop.id, currentUser.id || currentUser.email);
    setRegistered(prev => ({ ...prev, [workshop.id]: true }));
  };

  const isRegistered = (workshop) =>
    registered[workshop.id] ||
    workshop.registrations?.includes(currentUser?.id || currentUser?.email);

  /* ── Auto-join via shared link (?join=roomName) legacy ── */
  useEffect(() => {
    const joinRoom = searchParams.get('join');
    if (!joinRoom || autoJoinAttempted.current || activeCall || !sessions.length) return;
    const session = sessions.find(s => s.roomName === joinRoom && s.status === 'live');
    if (!session) return;
    autoJoinAttempted.current = true;
    setSearchParams({}, { replace: true });
    joinClass(session, session.isWorkshop || false);
  }, [searchParams, sessions, activeCall]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Invite link handler (?session=<id>) ── */
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (!sessionId || inviteAttempted.current || !sessions.length) return;
    const found = sessions.find(s => s.id === sessionId || String(s.id) === sessionId);
    if (!found) return;
    inviteAttempted.current = true;
    if (found.status === 'live' && !activeCall) {
      setSearchParams({}, { replace: true });
      joinClass(found, found.isWorkshop || false);
    } else {
      setSearchParams({}, { replace: true });
      setSessionInvite(found);
    }
  }, [searchParams, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (activeCall) {
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={false}
        userName={currentUser?.name || 'Student'}
        onLeave={() => setActiveCall(null)}
      />
    );
  }

  /* ── Meeting Invitation Panel ── */
  if (sessionInvite) {
    const s = sessionInvite;
    const dt = s.date && s.time ? new Date(`${s.date}T${s.time}`) : null;
    const dateLabel = dt
      ? dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Today';
    const timeLabel = dt
      ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : s.time || '';
    const isLive = s.status === 'live';
    const isEnded = s.status === 'ended';
    const canJoin = isLive && (s.isWorkshop || canJoinLive);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Brand mark */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl signature-gradient flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
            </div>
            <span className="text-white/80 text-sm font-bold tracking-widest uppercase font-headline">T.E.R.M. Edu</span>
          </div>

          {/* Invite card */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl">
            {/* Status badge */}
            <div className="flex items-center justify-between">
              {isLive ? (
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full border border-red-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Live Now
                </span>
              ) : isEnded ? (
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-400/10 px-3 py-1.5 rounded-full">Session Ended</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                  <span className="material-symbols-outlined text-[13px]">event</span>
                  Upcoming
                </span>
              )}
              <span className="text-[10px] text-white/40 font-semibold uppercase">{s.isWorkshop ? 'Free Workshop' : 'Live Class'}</span>
            </div>

            {/* Session info */}
            <div className="space-y-1">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">You're invited to</p>
              <h1 className="text-white text-2xl font-extrabold font-headline leading-snug">{s.title}</h1>
              {s.description && (
                <p className="text-white/60 text-sm leading-relaxed mt-1">{s.description}</p>
              )}
            </div>

            {/* Host + time */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-white/70">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                </div>
                <span className="text-sm font-medium">{s.instructor || 'Instructor'}</span>
              </div>
              {(dateLabel || timeLabel) && (
                <div className="flex items-center gap-2.5 text-white/70">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                  </div>
                  <span className="text-sm font-medium">{dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}</span>
                </div>
              )}
              {!s.isWorkshop && s.plan && s.plan !== 'all' && (
                <div className="flex items-center gap-2.5 text-white/70">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                  </div>
                  <span className="text-sm font-medium capitalize">{s.plan} Plan required</span>
                </div>
              )}
            </div>

            {/* Action */}
            <div className="pt-1 space-y-2">
              {isLive && canJoin && (
                <button
                  onClick={() => { setSessionInvite(null); joinClass(s, s.isWorkshop || false); }}
                  disabled={joining === s.id}
                  className="w-full py-3.5 rounded-2xl signature-gradient text-white font-bold text-sm shadow-lg shadow-primary/30 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70">
                  {joining === s.id ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Joining…</>
                  ) : (
                    <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>Join Now</>
                  )}
                </button>
              )}
              {isLive && !canJoin && !s.isWorkshop && (
                <div className="bg-amber-400/10 border border-amber-400/20 rounded-2xl p-4 text-center space-y-1">
                  <p className="text-amber-300 font-semibold text-sm">Plan Required</p>
                  <p className="text-white/60 text-xs">This class requires a {s.plan || 'paid'} plan. Upgrade to join.</p>
                  <button onClick={() => { setSessionInvite(null); navigate('/live'); }} className="mt-2 px-4 py-2 rounded-xl bg-amber-400/20 text-amber-300 text-xs font-bold">View Plans</button>
                </div>
              )}
              {!isLive && !isEnded && (
                <div className="bg-white/5 rounded-2xl p-4 text-center space-y-1">
                  <span className="material-symbols-outlined text-2xl text-white/40 block" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                  <p className="text-white/80 font-semibold text-sm">Session hasn't started yet</p>
                  <p className="text-white/50 text-xs">Come back at the scheduled time — the join button will appear when the host starts the class.</p>
                </div>
              )}
              {isEnded && (
                <div className="bg-white/5 rounded-2xl p-4 text-center space-y-1">
                  <span className="material-symbols-outlined text-2xl text-white/40 block" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-white/80 font-semibold text-sm">This session has ended</p>
                  <p className="text-white/50 text-xs">You can browse recordings or check upcoming classes.</p>
                </div>
              )}
              <button onClick={() => setSessionInvite(null)} className="w-full py-2.5 rounded-2xl text-white/50 text-sm font-medium hover:text-white/80 transition-colors">
                Browse all classes
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-white/30 text-xs mt-6">Powered by T.E.R.M. Edu · Secure meeting room</p>
        </div>
      </div>
    );
  }

  const nowLive = myLiveSessions[0] || null;
  const hasClasses = nowLive || myUpcoming.length > 0 || myEnded.length > 0;
  const liveWorkshop = liveWorkshops[0] || null;
  const hasWorkshops = liveWorkshops.length > 0 || upcomingWorkshops.length > 0 || endedWorkshops.length > 0;

  return (
    <>
    <TopBar showBack={false} />
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-extrabold font-headline">Live</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Free workshops &amp; plan-based live classes
          </p>
        </div>

        {joinError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 flex-shrink-0">error</span>
            <div className="flex-1">
              <p className="text-red-700 font-medium text-sm">Failed to join</p>
              <p className="text-red-600 text-xs mt-1">{joinError}</p>
            </div>
            <button onClick={() => setJoinError(null)}>
              <span className="material-symbols-outlined text-red-400 text-sm">close</span>
            </button>
          </div>
        )}

        {/* Tab switcher */}
        {sessionsLoading ? (
          <div className="space-y-4">
            <div className="flex bg-surface-container p-1 rounded-2xl gap-1 animate-pulse">
              <div className="flex-1 h-10 rounded-xl bg-surface-container-high" />
              <div className="flex-1 h-10 rounded-xl bg-surface-container-high" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonSessionCard key={i} />)}
          </div>
        ) : (
        <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
          {[
            { key: 'workshops', label: 'Free Workshops', icon: 'cast_for_education' },
            { key: 'classes', label: 'Live Classes', icon: 'live_tv' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.key ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {/* ── FREE WORKSHOPS TAB ── */}
        {!sessionsLoading && activeTab === 'workshops' && (
          <>
            {/* Live workshop banner */}
            {liveWorkshop ? (
              <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-6">
                <div className="absolute inset-0 opacity-10">
                  <span className="material-symbols-outlined text-[250px] absolute -right-10 -bottom-10" style={{ fontVariationSettings: "'FILL' 1" }}>cast_for_education</span>
                </div>
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-widest">Live Now</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">Free</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold font-headline leading-snug">{liveWorkshop.title}</h2>
                    {liveWorkshop.description && (
                      <p className="text-white/80 text-xs mt-1">{liveWorkshop.description}</p>
                    )}
                    <p className="text-white/70 text-sm mt-1">{liveWorkshop.instructor}</p>
                  </div>
                  {liveWorkshop.tags?.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {liveWorkshop.tags.map(t => (
                        <span key={t} className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                  <button onClick={() => joinClass(liveWorkshop, true)} disabled={joining === liveWorkshop.id}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-emerald-700 font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-70">
                    {joining === liveWorkshop.id ? (
                      <><span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />Joining...</>
                    ) : (
                      <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>cast</span>Join Free</>
                    )}
                  </button>
                </div>
              </section>
            ) : (
              <section className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>cast_for_education</span>
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900">Free Online Workshops</p>
                    <p className="text-xs text-emerald-700/80 mt-1">Live workshops open to everyone — no plan required. Learn new skills, ask questions, and grow with our community.</p>
                  </div>
                </div>
              </section>
            )}

            {/* Other live workshops */}
            {liveWorkshops.length > 1 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">More Live Workshops</h2>
                {liveWorkshops.slice(1).map(ws => (
                  <div key={ws.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-emerald-200/50 shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>cast</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{ws.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{ws.instructor}</p>
                    </div>
                    <button onClick={() => joinClass(ws, true)} disabled={joining === ws.id}
                      className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white disabled:opacity-60">
                      {joining === ws.id ? 'Joining...' : 'Join Free'}
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* Upcoming workshops */}
            {upcomingWorkshops.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">Upcoming Workshops</h2>
                <div className="space-y-3">
                  {upcomingWorkshops.map(ws => {
                    const reg = isRegistered(ws);
                    return (
                      <div key={ws.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-emerald-100 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm leading-snug">{ws.title}</p>
                            {ws.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{ws.description}</p>}
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              {ws.instructor} · {formatDate(ws.date, ws.time)}{ws.time ? `, ${formatTime(ws.date, ws.time)}` : ''}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Free</span>
                              {ws.tags?.slice(0, 3).map(t => (
                                <span key={t} className="text-[10px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-medium">{t}</span>
                              ))}
                              {getBriefsBySession(ws.id).length > 0 && (
                                <button onClick={() => navigate('/projects')}
                                  className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">
                                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                                  Project
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {reg ? (
                              <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
                                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                Registered
                              </span>
                            ) : (
                              <button onClick={() => handleRegister(ws)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all active:scale-95">
                                Register
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Past workshops */}
            {endedWorkshops.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">Past Workshops</h2>
                <div className="space-y-3">
                  {endedWorkshops.slice(0, 4).map(ws => (
                    <div key={ws.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{ws.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-on-surface-variant">{ws.instructor}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Free</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!hasWorkshops && (
              <section className="text-center py-10 space-y-3">
                <span className="material-symbols-outlined text-5xl text-emerald-300 block">cast_for_education</span>
                <p className="font-semibold text-on-surface-variant text-sm">No workshops scheduled yet</p>
                <p className="text-xs text-on-surface-variant/70">Free workshops will appear here — check back soon!</p>
              </section>
            )}
          </>
        )}

        {/* ── LIVE CLASSES TAB ── */}
        {!sessionsLoading && activeTab === 'classes' && (
          <>
            <p className="text-on-surface-variant text-sm -mt-2">
              {currentPlan && currentPlan !== 'none'
                ? `Showing classes for your ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan`
                : 'Enroll in a plan to access plan-specific classes'}
            </p>

            {/* Now Live Banner */}
            {nowLive ? (
              <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-primary to-purple-700 text-white p-6">
                <div className="absolute inset-0 opacity-10">
                  <span className="material-symbols-outlined text-[250px] absolute -right-10 -bottom-10" style={{ fontVariationSettings: "'FILL' 1" }}>radio</span>
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                      <span className="w-2 h-2 rounded-full bg-red-300 animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-widest">Live Now</span>
                    </span>
                    <PlanBadge planKey={nowLive.plan || 'all'} />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold font-headline leading-snug">{nowLive.title}</h2>
                    <p className="text-white/70 text-sm mt-0.5">{nowLive.instructor}</p>
                  </div>
                  <button onClick={() => joinClass(nowLive)} disabled={joining === nowLive.id}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-primary font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-70">
                    {joining === nowLive.id ? (
                      <><span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Joining...</>
                    ) : (
                      <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>Join Now</>
                    )}
                  </button>
                </div>
              </section>
            ) : (
              <section className="bg-surface-container-lowest rounded-2xl p-6 flex items-center gap-5 border border-dashed border-outline-variant/30">
                <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl text-on-surface-variant/40">live_tv</span>
                </div>
                <div>
                  <p className="font-bold text-sm">No class is live right now</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">You'll see it here the moment a session goes live for your plan</p>
                </div>
              </section>
            )}

            {/* Other live sessions for my plan */}
            {myLiveSessions.length > 1 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">Other Live Sessions</h2>
                {myLiveSessions.slice(1).map(cls => (
                  <div key={cls.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-red-200/50 shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{cls.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-on-surface-variant">{cls.instructor}</p>
                        <PlanBadge planKey={cls.plan || 'all'} />
                      </div>
                    </div>
                    <button onClick={() => joinClass(cls)} disabled={joining === cls.id}
                      className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white disabled:opacity-60">
                      {joining === cls.id ? 'Joining...' : 'Join'}
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* Upcoming */}
            {myUpcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">Upcoming Classes</h2>
                <div className="space-y-3">
                  {myUpcoming.map(cls => (
                    <div key={cls.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-snug truncate">{cls.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {cls.instructor} · {formatDate(cls.date, cls.time)}{cls.time ? `, ${formatTime(cls.date, cls.time)}` : ''}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <PlanBadge planKey={cls.plan || 'all'} />
                          {getBriefsBySession(cls.id).length > 0 && (
                            <button onClick={() => navigate('/projects')}
                              className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">
                              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                              Project
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="px-3 py-1.5 rounded-xl bg-primary-fixed text-primary text-xs font-bold">Upcoming</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Past sessions */}
            {myEnded.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold font-headline">Past Sessions</h2>
                <div className="space-y-3">
                  {myEnded.map(cls => (
                    <div key={cls.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-snug truncate">{cls.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-on-surface-variant">{cls.instructor}</p>
                          <PlanBadge planKey={cls.plan || 'all'} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* No content at all */}
            {!hasClasses && (
              <section className="text-center py-10 space-y-3">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block">calendar_month</span>
                <p className="font-semibold text-on-surface-variant text-sm">No classes scheduled for your plan yet</p>
                <p className="text-xs text-on-surface-variant/70">Your instructor will schedule a class soon — check back later!</p>
              </section>
            )}
          </>
        )}

        {/* Join by link */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>link</span>
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Join with Meeting Link</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Enter a room name or paste a meeting link</p>
            </div>
          </div>
          <JoinByLink currentUser={currentUser} />
        </section>
      </main>
    </div>

    <BottomNav />

    {showUpgrade && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-[#0d0a1a] border border-purple-500/30 rounded-3xl w-full max-w-sm p-7 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-purple-400 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Upgrade to Join Live Classes</h3>
            <p className="text-white/50 text-sm mt-2">Live classes are available on the <span className="text-purple-400 font-bold">GROWTH</span> and <span className="text-pink-400 font-bold">PREMIUM</span> plans.</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 space-y-2 text-left">
            {['Unlimited live classes', 'Mentor interaction', 'Doubt clearing sessions', 'Access to all recordings'].map(f => (
              <div key={f} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <span className="text-white/70 text-xs">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => { setShowUpgrade(false); navigate('/pricing'); }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold">
              View Plans
            </button>
            <button onClick={() => setShowUpgrade(false)} className="text-white/40 text-sm hover:text-white/60 transition-colors">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function JoinByLink({ currentUser }) {
  const [roomInput, setRoomInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [error, setError] = useState(null);

  const join = async () => {
    if (!roomInput.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const roomName = roomInput.trim().replace(/^https?:\/\/.*\.daily\.co\//, '');
      const { token, roomUrl: serverRoomUrl } = await getToken({
        roomName,
        isOwner: false,
        userName: currentUser?.name || 'Student',
        userId: currentUser?.id || 'student',
      });
      setActiveCall({
        roomUrl: roomInput.trim().startsWith('http') ? roomInput.trim() : serverRoomUrl,
        token,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  if (activeCall) {
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={false}
        userName={currentUser?.name || 'Student'}
        onLeave={() => setActiveCall(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <input type="text" value={roomInput} onChange={e => setRoomInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && join()}
        placeholder="Paste room name or meeting link..."
        className="w-full bg-surface-container px-4 py-3.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-outline-variant/20" />
      <button onClick={join} disabled={joining || !roomInput.trim()}
        className="w-full py-3.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-transform">
        {joining ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>login</span>
        )}
        Join Meeting
      </button>
      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-sm flex-shrink-0">error</span>
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
