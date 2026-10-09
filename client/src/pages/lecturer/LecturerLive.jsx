import { useState } from 'react';
import LecturerLayout from './LecturerLayout';
import DailyVideoCall from '../../components/DailyVideoCall';
import { useApp } from '../../context/AppContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { useProjects } from '../../context/ProjectContext';
import { createRoom, getToken, deleteRoom } from '../../services/dailyApi';
import { SkeletonSessionCard } from '../../components/Skeleton';

const PLAN_OPTIONS = [
  { key: 'all', label: 'All Plans', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  { key: 'starter', label: 'Starter', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: 'growth', label: 'Growth', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'premium', label: 'Premium', color: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
];

function PlanBadge({ planKey }) {
  const opt = PLAN_OPTIONS.find(p => p.key === planKey) || PLAN_OPTIONS[0];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function PlanSelector({ value, onChange }) {
  return (
    <div>
      <label className="text-sm font-semibold text-on-surface-variant">Target Plan</label>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        {PLAN_OPTIONS.map(p => (
          <button key={p.key} onClick={() => onChange(p.key)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${value === p.key ? `border-current ${p.color}` : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMPTY_TASK = { title: '', description: '', dueDate: '', marks: '100', plan: 'all' };

export default function LecturerLive() {
  const { currentUser } = useApp();
  const { sessions, liveSessions, upcomingSessions, addSession, addLiveSession, goLive, endSession, deleteSession,
    addMeeting, addLiveMeeting, meetings, sessionsLoading } = useLiveClass();
  const { addBrief } = useProjects();

  const [activeCall, setActiveCall] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [endNoteModal, setEndNoteModal] = useState(false);
  const [endNote, setEndNote] = useState('');

  const [liveModal, setLiveModal] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [livePlan, setLivePlan] = useState('all');

  const [schedModal, setSchedModal] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPlan, setSchedPlan] = useState('all');

  const [taskModal, setTaskModal] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [savingTask, setSavingTask] = useState(false);

  const [activeTab, setActiveTab] = useState('classes');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [meetingScheduleModal, setMeetingScheduleModal] = useState(false);
  const [meetingLiveModal, setMeetingLiveModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '', date: '', time: '', plan: 'free' });
  const [liveMeetingForm, setLiveMeetingForm] = useState({ title: '', description: '', plan: 'free' });

  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const getJoinLink = (session) => `${window.location.origin}/live?session=${session.id}`;

  const copyLink = (session) => {
    navigator.clipboard.writeText(getJoinLink(session))
      .then(() => showToast('Invite link copied!'))
      .catch(() => showToast('Copy failed'));
  };

  const shareSession = (session) => {
    const link = getJoinLink(session);
    const text = `You're invited to join: ${session.title}`;
    if (navigator.share) {
      navigator.share({ title: session.title, text, url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link)
        .then(() => showToast('Invite link copied!'))
        .catch(() => showToast('Copy failed'));
    }
  };

  const openTaskModal = (session) => {
    setTaskForm({ ...EMPTY_TASK, title: `Task — ${session.title}`, plan: session.plan || 'all' });
    setTaskModal(session);
  };

  const createTask = async () => {
    if (!taskForm.title.trim() || !taskModal) return;
    setSavingTask(true);
    try {
      await addBrief({
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        dueDate: taskForm.dueDate,
        totalMarks: Number(taskForm.marks) || 100,
        accessPlan: taskForm.plan,
        sessionId: taskModal.id,
        sessionTitle: taskModal.title,
        createdBy: currentUser?.name || 'Lecturer',
      });
      setTaskModal(null);
      setTaskForm(EMPTY_TASK);
      showToast('Task created and linked to session!');
    } catch (err) {
      showToast('Failed to create task');
    } finally {
      setSavingTask(false);
    }
  };

  const getMeetingLink = (meeting) => `${window.location.origin}/meet?session=${meeting.id}`;

  const copyMeetingLink = (meeting) => {
    navigator.clipboard.writeText(getMeetingLink(meeting))
      .then(() => showToast('Meeting link copied!'))
      .catch(() => showToast('Copy failed'));
  };

  const scheduleMeeting = () => {
    if (!newMeeting.title || !newMeeting.date || !newMeeting.time) return;
    addMeeting({
      title: newMeeting.title.trim(),
      description: newMeeting.description.trim(),
      date: newMeeting.date,
      time: newMeeting.time,
      plan: newMeeting.plan,
      instructor: currentUser?.name || 'Lecturer',
      createdBy: 'lecturer',
    }).catch(() => {});
    setNewMeeting({ title: '', description: '', date: '', time: '', plan: 'free' });
    setMeetingScheduleModal(false);
    showToast('Meeting scheduled!');
  };

  const startMeetingNow = async () => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const title = liveMeetingForm.title.trim() || 'Quick Meeting';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `meeting-${slug}-${Date.now()}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Lecturer',
        userId: currentUser?.id || 'lecturer',
      });
      const meeting = await addLiveMeeting({
        title,
        description: liveMeetingForm.description.trim(),
        instructor: currentUser?.name || 'Lecturer',
        createdBy: 'lecturer',
        roomName: room.name,
        roomUrl: url,
        plan: liveMeetingForm.plan,
      });
      setActiveSessionId(meeting.id);
      setMeetingLiveModal(false);
      setLiveMeetingForm({ title: '', description: '', plan: 'free' });
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${meeting.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const startScheduledMeeting = async (meeting) => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const slug = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `meeting-${slug}-${meeting.id}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Lecturer',
        userId: currentUser?.id || 'lecturer',
      });
      goLive(meeting.id, { roomName: room.name, roomUrl: url });
      setActiveSessionId(meeting.id);
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${meeting.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const startInstantClass = async () => {
    if (!liveTitle.trim()) return;
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const slug = liveTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `${slug}-${Date.now()}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Instructor',
        userId: currentUser?.id || 'lecturer',
      });
      const session = await addLiveSession({
        title: liveTitle.trim(),
        instructor: currentUser?.name || 'Lecturer',
        createdBy: 'lecturer',
        roomName: room.name,
        roomUrl: url,
        plan: livePlan,
      });
      setActiveSessionId(session.id);
      setLiveModal(false);
      setLiveTitle('');
      setLivePlan('all');
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const rejoinSession = async (session) => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const { token } = await getToken({
        roomName: session.roomName,
        isOwner: true,
        userName: currentUser?.name || 'Instructor',
        userId: String(currentUser?.id || 'lecturer'),
      });
      setActiveSessionId(session.id);
      setActiveCall({ roomUrl: session.roomUrl, token, roomName: session.roomName, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const startScheduledSession = async (session) => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `${slug}-${session.id}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Instructor',
        userId: currentUser?.id || 'lecturer',
      });
      goLive(session.id, { roomName: room.name, roomUrl: url });
      setActiveSessionId(session.id);
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const leaveAndCleanup = async () => {
    if (activeCall?.roomName) {
      try { await deleteRoom(activeCall.roomName); } catch (_) {}
    }
    setActiveCall(null);
    if (activeSessionId != null) {
      setEndNote('');
      setEndNoteModal(true);
    } else {
      setActiveSessionId(null);
    }
  };

  const confirmEnd = () => {
    if (activeSessionId != null) endSession(activeSessionId);
    setActiveSessionId(null);
    setEndNoteModal(false);
    setEndNote('');
    showToast('Session ended and saved');
  };

  const submitSchedule = () => {
    if (!schedTitle || !schedDate || !schedTime) return;
    addSession({
      title: schedTitle,
      date: schedDate,
      time: schedTime,
      instructor: currentUser?.name || 'Lecturer',
      createdBy: 'lecturer',
      plan: schedPlan,
    }).catch(() => {});
    const planLabel = PLAN_OPTIONS.find(p => p.key === schedPlan)?.label || 'All Plans';
    setSchedTitle(''); setSchedDate(''); setSchedTime(''); setSchedPlan('all');
    setSchedModal(false);
    showToast(`Scheduled for ${planLabel} students!`);
  };

  if (activeCall) {
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={true}
        userName={currentUser?.name || 'Instructor'}
        onLeave={leaveAndCleanup}
        sessionDbId={activeSessionId}
        sessionTitle={activeCall.roomName || 'Live Class'}
        joinUrl={activeCall.joinUrl}
      />
    );
  }

  const mySessions = sessions.filter(s => s.createdBy === 'lecturer' || s.createdBy === 'admin');

  const statusColors = {
    live: 'bg-red-100 text-red-600',
    ended: 'bg-slate-100 text-slate-500',
    upcoming: 'bg-primary/10 text-primary',
  };
  const iconMap = { live: 'live_tv', ended: 'check_circle', upcoming: 'event' };

  const myMeetings = meetings.filter(m => m.createdBy === 'lecturer' || m.createdBy === 'admin');

  return (
    <LecturerLayout title={activeTab === 'meetings' ? 'Meetings' : 'Live Classes'}>
      <div className="space-y-6">
        {roomError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-2xl">{roomError}</div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 bg-surface-container-lowest rounded-2xl p-1 border border-outline-variant/10">
          {[
            { key: 'classes', label: 'Classes', icon: 'live_tv' },
            { key: 'meetings', label: 'Meetings', icon: 'video_call' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.key ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: `'FILL' ${activeTab === tab.key ? 1 : 0}` }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Skeleton loading */}
        {sessionsLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonSessionCard key={i} />)}
          </div>
        )}

        {/* ── CLASSES TAB ── */}
        {!sessionsLoading && activeTab === 'classes' && (<>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setLiveModal(true)}
            className="flex flex-col items-center gap-2.5 p-5 rounded-2xl signature-gradient text-white font-bold text-sm shadow-lg shadow-primary/25 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined text-2xl">live_tv</span>
            Start Live Now
          </button>
          <button onClick={() => setSchedModal(true)}
            className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-secondary-container/20 text-secondary border border-secondary/20 font-bold text-sm active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined text-2xl">event</span>
            Schedule Class
          </button>
        </div>

        {liveSessions.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              Currently Live
            </p>
            <div className="space-y-2">
              {liveSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-red-800 flex-1 truncate">{s.title}</p>
                  <PlanBadge planKey={s.plan || 'all'} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-base font-bold font-headline mb-3">All Sessions</h2>
          {mySessions.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant text-sm border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2 block">event_note</span>
              No sessions yet. Schedule a class to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {mySessions.slice().reverse().map(session => {
                const dt = session.date && session.time ? new Date(`${session.date}T${session.time}`) : null;
                const dateStr = dt ? dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today';
                const timeStr = dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : session.time || '';
                const canStart = session.status === 'upcoming' && session.createdBy === 'lecturer';
                return (
                  <div key={session.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center ${statusColors[session.status]}`}>
                        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>{iconMap[session.status]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{session.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{dateStr} · {timeStr}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <PlanBadge planKey={session.plan || 'all'} />
                          <span className="text-[10px] text-on-surface-variant/60 capitalize">by {session.createdBy}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase flex items-center gap-1 ${statusColors[session.status]}`}>
                        {session.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                        {session.status === 'live' ? 'Live' : session.status === 'ended' ? 'Done' : 'Soon'}
                      </span>
                    </div>

                    {canStart && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button onClick={() => startScheduledSession(session)} disabled={creatingRoom}
                          className="flex-1 py-2.5 rounded-xl signature-gradient text-white text-xs font-bold disabled:opacity-60">
                          {creatingRoom ? 'Starting…' : 'Start Session'}
                        </button>
                        <button onClick={() => copyLink(session)}
                          className="px-3 py-2.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">link</span>
                          Invite
                        </button>
                        <button onClick={() => shareSession(session)}
                          className="px-3 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">share</span>
                          Share
                        </button>
                        <button onClick={() => setDeleteConfirm(session)}
                          className="px-4 py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-bold">Delete</button>
                      </div>
                    )}

                    {session.status === 'live' && session.roomName && (
                      <div className="mt-3 space-y-2">
                        <div className="flex gap-2">
                          <button onClick={() => rejoinSession(session)} disabled={creatingRoom}
                            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60">
                            <span className="material-symbols-outlined text-sm">login</span>
                            {creatingRoom ? 'Joining…' : 'Rejoin'}
                          </button>
                          <button onClick={() => copyLink(session)}
                            className="px-3 py-2.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">link</span>
                            Copy
                          </button>
                          <button onClick={() => shareSession(session)}
                            className="px-3 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">share</span>
                            Share
                          </button>
                        </div>
                        <button onClick={() => openTaskModal(session)}
                          className="w-full py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold flex items-center justify-center gap-1.5">
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>assignment_add</span>
                          Create Task for This Session
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>)}

        {/* ── MEETINGS TAB ── */}
        {!sessionsLoading && activeTab === 'meetings' && (<>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMeetingLiveModal(true)}
            className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined text-2xl">videocam</span>
            Start Meeting
          </button>
          <button onClick={() => setMeetingScheduleModal(true)}
            className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-violet-50 text-violet-700 border border-violet-200 font-bold text-sm active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined text-2xl">event</span>
            Schedule
          </button>
        </div>

        <div>
          <h2 className="text-base font-bold font-headline mb-3">Your Meetings</h2>
          {myMeetings.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant text-sm border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-4xl text-violet-300 mb-2 block">video_call</span>
              <p className="font-semibold">No meetings yet</p>
              <p className="text-xs mt-1 text-on-surface-variant/70">Schedule a meeting to share an invite link with anyone — no T.E.R.M. account needed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myMeetings.slice().reverse().map(meeting => {
                const dt = meeting.date && meeting.time ? new Date(`${meeting.date}T${meeting.time}`) : null;
                const dateStr = dt ? dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today';
                const timeStr = dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
                const meetingLink = getMeetingLink(meeting);
                const isLive = meeting.status === 'live';
                const isUpcoming = meeting.status === 'upcoming';
                return (
                  <div key={meeting.id} className={`bg-surface-container-lowest p-4 rounded-2xl border shadow-sm ${isLive ? 'border-violet-200 bg-violet-50/40' : 'border-outline-variant/10'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${isLive ? 'bg-violet-100 text-violet-600' : isUpcoming ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{isLive ? 'videocam' : isUpcoming ? 'event' : 'check_circle'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{meeting.title}</p>
                        {meeting.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{meeting.description}</p>}
                        <p className="text-xs text-on-surface-variant mt-0.5">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</p>
                        <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isLive ? 'bg-violet-100 text-violet-700' : isUpcoming ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                          {isLive ? 'LIVE' : isUpcoming ? 'Scheduled' : 'Ended'}
                        </span>
                      </div>
                    </div>

                    {/* Invite link */}
                    <div className="mt-3 bg-violet-50 rounded-xl px-3 py-2 flex items-center gap-2 border border-violet-100">
                      <span className="material-symbols-outlined text-violet-400 text-sm flex-shrink-0">link</span>
                      <p className="text-xs text-violet-700 truncate flex-1">{meetingLink}</p>
                      <button onClick={() => copyMeetingLink(meeting)}
                        className="text-[10px] font-bold text-violet-700 bg-white border border-violet-200 px-2 py-1 rounded-lg flex-shrink-0">
                        Copy
                      </button>
                    </div>

                    {/* Actions */}
                    {isUpcoming && (
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => startScheduledMeeting(meeting)} disabled={creatingRoom}
                          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold disabled:opacity-60">
                          {creatingRoom ? 'Starting…' : 'Start Meeting'}
                        </button>
                        <button onClick={() => setDeleteConfirm(meeting)}
                          className="px-4 py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-bold">
                          Delete
                        </button>
                      </div>
                    )}
                    {isLive && meeting.roomName && (
                      <button onClick={() => rejoinSession(meeting)} disabled={creatingRoom}
                        className="w-full mt-2.5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        <span className="material-symbols-outlined text-sm">login</span>
                        {creatingRoom ? 'Joining…' : 'Rejoin Meeting'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>)}

      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-on-surface text-surface text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Start Live Modal */}
      {liveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Start Live Class</h3>
              <button onClick={() => setLiveModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-red-50 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-red-500 text-sm mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
              <p className="text-xs text-red-700">Students on the selected plan will see this class appear as live immediately.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Class Title</label>
              <input value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
                placeholder="e.g. GROWTH Live — Doubt Session"
                className="w-full mt-1.5 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                autoFocus />
            </div>
            <PlanSelector value={livePlan} onChange={setLivePlan} />
            {roomError && <p className="text-sm text-red-500">{roomError}</p>}
            <button onClick={startInstantClass} disabled={creatingRoom || !liveTitle.trim()}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-60">
              {creatingRoom ? 'Creating Room…' : 'Go Live Now'}
            </button>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {schedModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Schedule Class</h3>
              <button onClick={() => setSchedModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-secondary-container/20 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary text-sm mt-0.5">info</span>
              <p className="text-xs text-on-surface-variant">This session will appear in student panels right away as upcoming.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Title</label>
                <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="Class title"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Date</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Time</label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
                </div>
              </div>
              <PlanSelector value={schedPlan} onChange={setSchedPlan} />
            </div>
            <button onClick={submitSchedule} disabled={!schedTitle || !schedDate || !schedTime}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-50">
              Schedule Session
            </button>
          </div>
        </div>
      )}

      {/* End Note Modal */}
      {endNoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-extrabold">Session Summary</h3>
            <p className="text-sm text-on-surface-variant">Add a note about this session (optional).</p>
            <textarea value={endNote} onChange={e => setEndNote(e.target.value)}
              placeholder="Session notes, topics covered..."
              rows={3} className="w-full px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none" />
            <button onClick={confirmEnd} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">Done</button>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Create Session Task</h3>
              <button onClick={() => setTaskModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-amber-50 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-600 text-sm mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
              <p className="text-xs text-amber-700">This task will be linked to <strong>{taskModal.title}</strong> and visible to students on the project board.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Task Title</label>
                <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Build a landing page"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Description</label>
                <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What should students build or submit?"
                  rows={3} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Due Date</label>
                  <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Total Marks</label>
                  <input type="number" value={taskForm.marks} onChange={e => setTaskForm(p => ({ ...p, marks: e.target.value }))}
                    min="1" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
                </div>
              </div>
              <PlanSelector value={taskForm.plan} onChange={val => setTaskForm(p => ({ ...p, plan: val }))} />
            </div>
            <button onClick={createTask} disabled={savingTask || !taskForm.title.trim()}
              className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-50 transition-colors">
              {savingTask ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>
      )}
      {/* ── Schedule Meeting Modal ── */}
      {meetingScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6" onClick={() => setMeetingScheduleModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Schedule a Meeting</h3>
              <button onClick={() => setMeetingScheduleModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-violet-50 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-violet-500 text-sm mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>video_call</span>
              <p className="text-xs text-violet-700">Anyone can join via the meeting link — no T.E.R.M. account required.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Meeting Title *</label>
              <input value={newMeeting.title} onChange={e => setNewMeeting(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Team Review, Interview"
                className="w-full mt-1.5 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description <span className="font-normal text-on-surface-variant/60">(optional)</span></label>
              <textarea value={newMeeting.description} onChange={e => setNewMeeting(p => ({ ...p, description: e.target.value }))}
                placeholder="Agenda or notes..."
                rows={2} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Date *</label>
                <input type="date" value={newMeeting.date} onChange={e => setNewMeeting(p => ({ ...p, date: e.target.value }))}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Time *</label>
                <input type="time" value={newMeeting.time} onChange={e => setNewMeeting(p => ({ ...p, time: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" />
              </div>
            </div>
            <button onClick={scheduleMeeting} disabled={!newMeeting.title || !newMeeting.date || !newMeeting.time}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
              Schedule Meeting
            </button>
          </div>
        </div>
      )}

      {/* ── Start Meeting Now Modal ── */}
      {meetingLiveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6" onClick={() => { setMeetingLiveModal(false); setRoomError(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Start Meeting Now</h3>
              <button onClick={() => { setMeetingLiveModal(false); setRoomError(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-violet-50 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-violet-500 text-sm mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>
              <p className="text-xs text-violet-700">A meeting room is created instantly. Share the link and participants join via a branded page — no account needed.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Meeting Title</label>
              <input value={liveMeetingForm.title} onChange={e => setLiveMeetingForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Quick Sync, Demo Call"
                className="w-full mt-1.5 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description <span className="font-normal text-on-surface-variant/60">(optional)</span></label>
              <input value={liveMeetingForm.description} onChange={e => setLiveMeetingForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief topic"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" />
            </div>
            {roomError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-red-600 text-xs">{roomError}</p>
              </div>
            )}
            <button onClick={startMeetingNow} disabled={creatingRoom}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70">
              {creatingRoom
                ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Room…</>
                : <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>Start Meeting Now</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-red-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
            </div>
            <div>
              <h3 className="font-extrabold text-lg">Remove {deleteConfirm.isMeeting ? 'Meeting' : deleteConfirm.isWorkshop ? 'Workshop' : 'Session'}?</h3>
              <p className="text-sm text-on-surface-variant mt-1">"{deleteConfirm.title}" will be permanently removed.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl border border-outline-variant font-bold text-sm">Cancel</button>
              <button onClick={() => { deleteSession(deleteConfirm.id); setDeleteConfirm(null); }}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}

    </LecturerLayout>
  );
}
