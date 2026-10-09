import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import DailyVideoCall from '../../components/DailyVideoCall';
import { useApp } from '../../context/AppContext';
import { useLiveClass } from '../../context/LiveClassContext';
import { useProjects } from '../../context/ProjectContext';
import { createRoom, getToken, deleteRoom } from '../../services/dailyApi';
import { SkeletonSessionCard, SkeletonLine } from '../../components/Skeleton';

const PLAN_OPTIONS = [
  { key: 'all', label: 'All Plans', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  { key: 'starter', label: 'Starter', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: 'growth', label: 'Growth', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'premium', label: 'Premium', color: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
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

const WORKSHOP_TAGS = ['Beginner', 'Career', 'Tech', 'Design', 'Finance', 'Marketing', 'AI / ML', 'Coding'];

export default function AdminLive() {
  const { currentUser } = useApp();
  const {
    sessions, regularSessions, workshops, meetings,
    liveSessions, upcomingSessions, endedSessions,
    liveWorkshops, upcomingWorkshops, endedWorkshops,
    liveMeetings, upcomingMeetings, endedMeetings,
    addSession, addLiveSession, addWorkshop, addLiveWorkshop, addMeeting, addLiveMeeting,
    goLive, endSession, deleteSession, sessionsLoading,
  } = useLiveClass();

  const navigate = useNavigate();
  const { getBriefsBySession, addBrief } = useProjects();

  const [activeTab, setActiveTab] = useState('classes');

  const [activeCall, setActiveCall] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState(null);

  const [liveModal, setLiveModal] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [livePlan, setLivePlan] = useState('all');

  const [scheduleModal, setScheduleModal] = useState(false);
  const [newClass, setNewClass] = useState({ title: '', date: '', time: '', plan: 'all' });

  const [workshopModal, setWorkshopModal] = useState(false);
  const [workshopLiveModal, setWorkshopLiveModal] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState({ title: '', description: '', date: '', time: '', tags: [] });
  const [liveWorkshop, setLiveWorkshop] = useState({ title: '', description: '', tags: [] });

  // ── Professional Meetings state ──────────────────────────────────────────
  const [meetingScheduleModal, setMeetingScheduleModal] = useState(false);
  const [meetingLiveModal, setMeetingLiveModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '', date: '', time: '', plan: 'free' });
  const [liveMeetingForm, setLiveMeetingForm] = useState({ title: '', description: '', plan: 'free' });

  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const EMPTY_TASK = { title: '', description: '', dueDate: '', marks: '100', plan: 'all' };
  const [taskModal, setTaskModal] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [savingTask, setSavingTask] = useState(false);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const getJoinLink = (session) => `${window.location.origin}/meet?session=${session.id}`;
  const getMeetingLink = (session) => `${window.location.origin}/meet?session=${session.id}`;

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

  // ── Pre-Quiz Bank ─────────────────────────────────────────────────────────
  const [preQuizModal, setPreQuizModal] = useState(null); // session being configured
  const [preQuizzes, setPreQuizzes] = useState([]);
  const [preQuizDraft, setPreQuizDraft] = useState({ question: '', options: ['', '', '', ''], correctOption: 0 });

  const openPreQuiz = (session) => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(`qbank_${session.id}`) || '[]'); } catch {}
    setPreQuizzes(saved);
    setPreQuizDraft({ question: '', options: ['', '', '', ''], correctOption: 0 });
    setPreQuizModal(session);
  };

  const savePreQuizBank = () => {
    if (!preQuizModal) return;
    localStorage.setItem(`qbank_${preQuizModal.id}`, JSON.stringify(preQuizzes));
    showToast(`${preQuizzes.length} quiz${preQuizzes.length !== 1 ? 'zes' : ''} saved to bank`);
    setPreQuizModal(null);
  };

  const addPreQuiz = () => {
    const { question, options, correctOption } = preQuizDraft;
    if (!question.trim()) return;
    const validOpts = options.filter(o => o.trim());
    if (validOpts.length < 2) return;
    const quiz = {
      id: `pq_${Date.now()}`,
      question: question.trim(),
      options: options.map(o => o.trim()).filter(Boolean),
      correctOption: validOpts.length > correctOption ? correctOption : 0,
    };
    setPreQuizzes(prev => [...prev, quiz]);
    setPreQuizDraft({ question: '', options: ['', '', '', ''], correctOption: 0 });
  };

  const getQuizCount = (session) => {
    try { return JSON.parse(localStorage.getItem(`qbank_${session.id}`) || '[]').length; } catch { return 0; }
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
        createdBy: currentUser?.name || 'Admin',
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

  const startLiveClass = async () => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const title = liveTitle.trim() || 'Admin Live Session';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `${slug}-${Date.now()}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
      });
      const session = await addLiveSession({
        title,
        instructor: currentUser?.name || 'T.E.R.M. Admin',
        createdBy: 'admin',
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

  const startLiveWorkshopNow = async () => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const title = liveWorkshop.title.trim() || 'Free Workshop';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `workshop-${slug}-${Date.now()}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
      });
      const session = await addLiveWorkshop({
        title,
        description: liveWorkshop.description.trim(),
        instructor: currentUser?.name || 'T.E.R.M. Admin',
        createdBy: 'admin',
        roomName: room.name,
        roomUrl: url,
        tags: liveWorkshop.tags,
      });
      setActiveSessionId(session.id);
      setWorkshopLiveModal(false);
      setLiveWorkshop({ title: '', description: '', tags: [] });
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
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
      const prefix = session.isWorkshop ? 'workshop-' : '';
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `${prefix}${slug}-${session.id}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
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

  const rejoinSession = async (session) => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const { token } = await getToken({
        roomName: session.roomName,
        isOwner: true,
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
      });
      setActiveSessionId(session.id);
      setActiveCall({ roomUrl: session.roomUrl, token, roomName: session.roomName, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
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
    if (activeSessionId != null) endSession(activeSessionId);
    setActiveCall(null);
    setActiveSessionId(null);
    showToast('Session ended');
  };

  const scheduleClass = () => {
    if (!newClass.title || !newClass.date || !newClass.time) return;
    const planLabel = PLAN_OPTIONS.find(p => p.key === newClass.plan)?.label || 'All Plans';
    addSession({
      title: newClass.title,
      date: newClass.date,
      time: newClass.time,
      instructor: currentUser?.name || 'T.E.R.M. Admin',
      createdBy: 'admin',
      plan: newClass.plan,
      onError: (err) => {
        const msg = err?.message || '';
        if (msg.includes('403')) {
          showToast('Session save failed — please log out and log back in as admin', 'error');
        } else {
          showToast('Failed to save session. Please try again.', 'error');
        }
      },
    }).catch(() => {});
    setNewClass({ title: '', date: '', time: '', plan: 'all' });
    setScheduleModal(false);
    showToast(`Class scheduled for ${planLabel}`);
  };

  const scheduleWorkshop = () => {
    if (!newWorkshop.title || !newWorkshop.date || !newWorkshop.time) return;
    addWorkshop({
      title: newWorkshop.title,
      description: newWorkshop.description.trim(),
      date: newWorkshop.date,
      time: newWorkshop.time,
      instructor: currentUser?.name || 'T.E.R.M. Admin',
      createdBy: 'admin',
      tags: newWorkshop.tags,
      onError: (err) => {
        const msg = err?.message || '';
        if (msg.includes('403')) {
          showToast('Session save failed — please log out and log back in as admin', 'error');
        } else {
          showToast('Failed to save workshop. Please try again.', 'error');
        }
      },
    }).catch(() => {});
    setNewWorkshop({ title: '', description: '', date: '', time: '', tags: [] });
    setWorkshopModal(false);
    showToast('Free workshop scheduled');
  };

  const scheduleMeeting = () => {
    if (!newMeeting.title || !newMeeting.date || !newMeeting.time) return;
    addMeeting({
      title: newMeeting.title.trim(),
      description: newMeeting.description.trim(),
      date: newMeeting.date,
      time: newMeeting.time,
      instructor: currentUser?.name || 'T.E.R.M. Admin',
      createdBy: 'admin',
      plan: newMeeting.plan,
      onError: (err) => {
        const msg = err?.message || '';
        if (msg.includes('403')) {
          showToast('Session save failed — please log out and log back in as admin', 'error');
        } else {
          showToast('Failed to save meeting. Please try again.', 'error');
        }
      },
    }).catch(() => {});
    setNewMeeting({ title: '', description: '', date: '', time: '', plan: 'free' });
    setMeetingScheduleModal(false);
    showToast('Meeting scheduled! Share the invite link.');
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
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
      });
      const session = await addLiveMeeting({
        title,
        description: liveMeetingForm.description.trim(),
        instructor: currentUser?.name || 'T.E.R.M. Admin',
        createdBy: 'admin',
        roomName: room.name,
        roomUrl: url,
        plan: liveMeetingForm.plan,
      });
      setActiveSessionId(session.id);
      setMeetingLiveModal(false);
      setLiveMeetingForm({ title: '', description: '', plan: 'free' });
      setActiveCall({ roomUrl: url, token, roomName: room.name, joinUrl: `${window.location.origin}/meet?session=${session.id}` });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const startScheduledMeeting = async (session) => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const roomName = `meeting-${slug}-${session.id}`;
      const { room, url } = await createRoom(roomName);
      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Admin',
        userId: String(currentUser?.id || 'admin'),
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

  const copyMeetingLink = (session) => {
    navigator.clipboard.writeText(getMeetingLink(session))
      .then(() => showToast('Meeting link copied!'))
      .catch(() => showToast('Copy failed'));
  };

  const shareMeetingLink = (session) => {
    const link = getMeetingLink(session);
    if (navigator.share) {
      navigator.share({ title: session.title, text: `Join my T.E.R.M. Edu meeting: ${session.title}`, url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).then(() => showToast('Link copied!')).catch(() => {});
    }
  };

  const toggleTag = (tag, list, setList) => {
    setList(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  if (activeCall) {
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={true}
        userName={currentUser?.name || 'Admin'}
        onLeave={leaveAndCleanup}
        sessionDbId={activeSessionId}
        sessionTitle={activeCall.roomName || 'Live Class'}
        joinUrl={activeCall.joinUrl}
      />
    );
  }

  const statusColors = {
    live: 'bg-red-100 text-red-600',
    upcoming: 'bg-primary-fixed text-primary',
    ended: 'bg-surface-container text-on-surface-variant',
  };
  const iconMap = { live: 'radio_button_checked', upcoming: 'event', ended: 'check_circle' };

  const displayedSessions = activeTab === 'classes' ? regularSessions : workshops;
  const totalWorkshops = workshops.length;
  const liveWorkshopCount = liveWorkshops.length;
  const upcomingWorkshopCount = upcomingWorkshops.length;

  return (
    <AdminLayout>
      <div className="space-y-6 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Live & Meetings</h1>
          </div>
          {activeTab === 'classes' ? (
            <div className="flex gap-2">
              <button onClick={() => setScheduleModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-container text-on-surface font-semibold text-sm hover:bg-surface-container-high transition-all">
                <span className="material-symbols-outlined text-[18px]">event</span>
                Schedule
              </button>
              <button onClick={() => setLiveModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl signature-gradient text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                Go Live
              </button>
            </div>
          ) : activeTab === 'workshops' ? (
            <div className="flex gap-2">
              <button onClick={() => setWorkshopModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-semibold text-sm border border-emerald-200 hover:bg-emerald-100 transition-all">
                <span className="material-symbols-outlined text-[18px]">event</span>
                Schedule
              </button>
              <button onClick={() => setWorkshopLiveModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all active:scale-95">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>cast</span>
                Go Live
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setMeetingScheduleModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-semibold text-sm border border-indigo-200 hover:bg-indigo-100 transition-all">
                <span className="material-symbols-outlined text-[18px]">event</span>
                Schedule
              </button>
              <button onClick={() => setMeetingLiveModal(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 hover:scale-[1.02] transition-all active:scale-95">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>video_call</span>
                New Meeting
              </button>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
          {[
            { key: 'classes', label: 'Live Classes', icon: 'live_tv' },
            { key: 'workshops', label: 'Workshops', icon: 'cast_for_education' },
            { key: 'meetings', label: 'Meetings', icon: 'video_call' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab.key ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
              {tab.key === 'workshops' && totalWorkshops > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{totalWorkshops}</span>
              )}
              {tab.key === 'meetings' && meetings.length > 0 && (
                <span className="bg-violet-100 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{meetings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Stats */}
        {sessionsLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center animate-pulse space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-surface-container-high mx-auto" />
                  <div className="h-6 bg-surface-container-high rounded-lg w-10 mx-auto" />
                  <div className="h-3 bg-surface-container-high rounded w-16 mx-auto" />
                </div>
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonSessionCard key={i} />)}
          </div>
        ) : activeTab === 'classes' ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Sessions', value: regularSessions.length, icon: 'live_tv', color: 'text-primary' },
              { label: 'Live Now', value: liveSessions.length, icon: 'radio_button_checked', color: 'text-red-500' },
              { label: 'Upcoming', value: upcomingSessions.length, icon: 'event', color: 'text-secondary' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
                <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <p className="text-2xl font-bold font-headline mt-1">{value}</p>
                <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        ) : activeTab === 'workshops' ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Workshops', value: totalWorkshops, icon: 'cast_for_education', color: 'text-emerald-600' },
              { label: 'Live Now', value: liveWorkshopCount, icon: 'radio_button_checked', color: 'text-red-500' },
              { label: 'Upcoming', value: upcomingWorkshopCount, icon: 'event', color: 'text-teal-600' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
                <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <p className="text-2xl font-bold font-headline mt-1">{value}</p>
                <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Meetings', value: meetings.length, icon: 'video_call', color: 'text-violet-600' },
              { label: 'Live Now', value: liveMeetings.length, icon: 'radio_button_checked', color: 'text-red-500' },
              { label: 'Upcoming', value: upcomingMeetings.length, icon: 'event', color: 'text-indigo-600' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
                <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <p className="text-2xl font-bold font-headline mt-1">{value}</p>
                <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {roomError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500 text-sm">error</span>
            <p className="text-red-600 text-xs">{roomError}</p>
          </div>
        )}

        {/* ── Meetings tab content ─────────────────────────────────────────── */}
        {activeTab === 'meetings' && (
          <div className="space-y-3">
            <h2 className="font-bold text-lg font-headline">Professional Meetings</h2>

            {/* Invite link info banner */}
            <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3">
              <span className="material-symbols-outlined text-violet-500 flex-shrink-0" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>info</span>
              <p className="text-violet-700 text-xs leading-relaxed">
                Schedule a meeting → copy the <strong>invite link</strong> → share with anyone. They open the link and join instantly — no T.E.R.M. account needed. The link shows your branded meeting page.
              </p>
            </div>

            {meetings.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl p-10 text-center border border-dashed border-outline-variant/30">
                <span className="material-symbols-outlined text-4xl text-violet-300 mb-2 block">video_call</span>
                <p className="font-semibold text-on-surface-variant">No meetings yet</p>
                <p className="text-xs mt-1 text-on-surface-variant/70">Schedule a meeting or start one instantly using the buttons above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {meetings.map(session => {
                  const dt = session.date && session.time ? new Date(`${session.date}T${session.time}`) : null;
                  const dateStr = dt ? dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Today';
                  const timeStr = dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : session.time || '';
                  const meetLink = getMeetingLink(session);
                  const isLive = session.status === 'live';
                  const isEnded = session.status === 'ended';
                  return (
                    <div key={session.id} className={`bg-surface-container-lowest rounded-2xl border shadow-sm overflow-hidden ${isLive ? 'border-violet-200' : 'border-outline-variant/10'}`}>
                      {/* Live banner */}
                      {isLive && (
                        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          <span className="text-white text-[10px] font-black uppercase tracking-widest">Meeting in progress</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${isLive ? 'bg-violet-100 text-violet-600' : isEnded ? 'bg-surface-container text-on-surface-variant' : 'bg-indigo-50 text-indigo-600'}`}>
                            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {isLive ? 'videocam' : isEnded ? 'meeting_room' : 'video_call'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm leading-tight">{session.title}</p>
                            {session.description && (
                              <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{session.description}</p>
                            )}
                            <p className="text-xs text-on-surface-variant mt-0.5">{session.instructor}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLive ? 'bg-violet-100 text-violet-700' : isEnded ? 'bg-surface-container text-on-surface-variant' : 'bg-indigo-50 text-indigo-700'}`}>
                                {isLive ? '● Live' : isEnded ? 'Ended' : 'Upcoming'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${session.plan === 'free' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                                {session.plan === 'free' ? 'Free' : 'Professional'}
                              </span>
                              {dt && <span className="text-[10px] text-on-surface-variant">{dateStr} · {timeStr}</span>}
                            </div>
                          </div>
                          <button onClick={() => setDeleteConfirm(session)}
                            className="flex-shrink-0 w-8 h-8 rounded-xl bg-surface-container text-on-surface-variant hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all">
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>

                        {/* Invite link row */}
                        {!isEnded && (
                          <div className="mt-3 flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2">
                            <span className="material-symbols-outlined text-on-surface-variant/50 flex-shrink-0" style={{ fontSize: '14px' }}>link</span>
                            <span className="flex-1 text-[10px] text-on-surface-variant truncate font-mono">{meetLink}</span>
                            <button onClick={() => copyMeetingLink(session)}
                              className="flex-shrink-0 px-2 py-1 rounded-lg bg-violet-600 text-white text-[10px] font-bold hover:bg-violet-500 transition-colors flex items-center gap-1">
                              <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>content_copy</span>
                              Copy
                            </button>
                            <button onClick={() => shareMeetingLink(session)}
                              className="flex-shrink-0 w-6 h-6 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>share</span>
                            </button>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {isEnded ? (
                            <span className="flex-1 text-center text-[11px] text-on-surface-variant py-2">Meeting ended</span>
                          ) : isLive ? (
                            <button onClick={() => { const s = sessions.find(x => x.id === session.id); if (s) rejoinSession(s); }}
                              className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition-colors flex items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>
                              Rejoin Meeting
                            </button>
                          ) : (
                            <>
                              <button onClick={() => startScheduledMeeting(session)} disabled={creatingRoom}
                                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:scale-[1.01] transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 shadow-sm shadow-violet-500/20">
                                {creatingRoom ? (
                                  <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Starting…</>
                                ) : (
                                  <><span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>Start</>
                                )}
                              </button>
                              <button onClick={() => openPreQuiz(session)}
                                className="relative px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-bold flex items-center gap-1 border border-violet-200 hover:bg-violet-100 transition-colors">
                                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
                                Quizzes
                                {getQuizCount(session) > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-violet-600 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                    {getQuizCount(session)}
                                  </span>
                                )}
                              </button>
                            </>
                          )}
                          {!isEnded && !isLive && (
                            <button onClick={() => copyMeetingLink(session)}
                              className="px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">share</span>
                              Share
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Classes / Workshops tab content ────────────────────────────────── */}
        {activeTab !== 'meetings' && (
        <div className="space-y-3">
          <h2 className="font-bold text-lg font-headline">
            {activeTab === 'classes' ? 'All Sessions' : 'All Workshops'}
          </h2>
          {displayedSessions.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant text-sm border border-dashed border-outline-variant/30">
              {activeTab === 'workshops' ? (
                <>
                  <span className="material-symbols-outlined text-4xl text-emerald-300 mb-2 block">cast_for_education</span>
                  <p className="font-semibold">No free workshops yet</p>
                  <p className="text-xs mt-1 text-on-surface-variant/70">Create a workshop to engage all users — no plan required to join.</p>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2 block">event_note</span>
                  No sessions yet. Schedule or go live to get started.
                </>
              )}
            </div>
          ) : (
            displayedSessions.map(session => {
              const dt = session.date && session.time ? new Date(`${session.date}T${session.time}`) : null;
              const dateStr = dt ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Today';
              const timeStr = dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : session.time || '';
              return (
                <div key={session.id} className={`bg-surface-container-lowest p-4 rounded-2xl border shadow-sm ${session.isWorkshop ? 'border-emerald-100' : 'border-outline-variant/10'}`}>
                  {/* Info row */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${statusColors[session.status]}`}>
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>{iconMap[session.status]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight pr-1">{session.title}</p>
                      {session.description && (
                        <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{session.description}</p>
                      )}
                      <p className="text-xs text-on-surface-variant mt-0.5">{session.instructor}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[session.status]}`}>
                          {session.status === 'live' ? '● LIVE' : session.status === 'upcoming' ? 'Upcoming' : 'Ended'}
                        </span>
                        <PlanBadge planKey={session.plan || 'all'} />
                        <span className="text-[10px] text-on-surface-variant">{dateStr} · {timeStr}</span>
                        {session.isWorkshop && session.registrations?.length > 0 && (
                          <span className="text-[10px] text-emerald-600 font-semibold">{session.registrations.length} registered</span>
                        )}
                        {(() => {
                          const projCount = getBriefsBySession(session.id).length;
                          return projCount > 0 ? (
                            <button onClick={() => navigate('/admin/projects')}
                              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">
                              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
                              {projCount} project{projCount > 1 ? 's' : ''}
                            </button>
                          ) : null;
                        })()}
                      </div>
                      {session.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {session.tags.map(t => (
                            <span key={t} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Action buttons — responsive bottom row */}
                  {session.status === 'upcoming' && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/10">
                      <button onClick={() => startScheduledSession(session)} disabled={creatingRoom}
                        className={`flex-1 min-w-[72px] py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60 ${session.isWorkshop ? 'bg-emerald-600' : 'signature-gradient'}`}>
                        {creatingRoom ? 'Starting…' : 'Start'}
                      </button>
                      <button onClick={() => openPreQuiz(session)}
                        className="relative px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-bold flex items-center gap-1 border border-violet-200 hover:bg-violet-100 transition-colors">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
                        Quizzes
                        {getQuizCount(session) > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-violet-600 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                            {getQuizCount(session)}
                          </span>
                        )}
                      </button>
                      <button onClick={() => copyLink(session)}
                        className="px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">link</span>
                        Invite
                      </button>
                      <button onClick={() => shareSession(session)}
                        className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">share</span>
                        Share
                      </button>
                      <button onClick={() => setDeleteConfirm(session)}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-bold">Cancel</button>
                    </div>
                  )}
                  {session.status === 'live' && session.roomName && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/10">
                      <button onClick={() => rejoinSession(session)} disabled={creatingRoom}
                        className="flex-1 min-w-[72px] py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
                        {creatingRoom ? '...' : 'Rejoin'}
                      </button>
                      <button onClick={() => copyLink(session)}
                        className="px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">link</span>
                        Copy
                      </button>
                      <button onClick={() => shareSession(session)}
                        className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">share</span>
                        Share
                      </button>
                      <button onClick={() => openTaskModal(session)}
                        className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>assignment_add</span>
                        Task
                      </button>
                    </div>
                  )}
                  {session.status === 'ended' && (
                    <div className="flex justify-end mt-2">
                      <button onClick={() => setDeleteConfirm(session)}
                        className="px-3 py-1.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold">Remove</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}

      </div>

      {toast && (
        <div className={`fixed bottom-36 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap ${(toast.type || toast) === 'error' ? 'bg-red-600 text-white' : 'bg-on-surface text-surface'}`}>{toast.msg ?? toast}</div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-red-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
            </div>
            <div>
              <h3 className="font-extrabold text-lg">Remove {deleteConfirm.isMeeting ? 'Meeting' : deleteConfirm.isWorkshop ? 'Workshop' : 'Session'}?</h3>
              <p className="text-sm text-on-surface-variant mt-1">"{deleteConfirm.title}" will be removed permanently.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl border border-outline-variant font-bold text-sm">Cancel</button>
              <button onClick={() => { deleteSession(deleteConfirm.id); setDeleteConfirm(null); showToast('Removed'); }}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Quiz Bank Modal */}
      {preQuizModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-white rounded-t-3xl">
              <div>
                <h3 className="font-headline font-bold text-lg">Pre-load Quiz Bank</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 truncate max-w-[230px]">{preQuizModal.title}</p>
              </div>
              <button onClick={() => setPreQuizModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Info */}
              <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-200 rounded-2xl px-3 py-2.5">
                <span className="material-symbols-outlined text-violet-500 flex-shrink-0" style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}>info</span>
                <p className="text-violet-700 text-xs leading-relaxed">
                  Quizzes saved here will be ready in the Quiz Bank when you start this session — launch them instantly without re-typing.
                </p>
              </div>

              {/* Add quiz form */}
              <div className="bg-surface-container rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold">Add a Question</p>
                <textarea
                  value={preQuizDraft.question}
                  onChange={e => setPreQuizDraft(d => ({ ...d, question: e.target.value }))}
                  placeholder="Type your quiz question…"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-white border border-outline-variant/30 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-on-surface-variant">Options (min. 2)</p>
                  {preQuizDraft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        onClick={() => setPreQuizDraft(d => ({ ...d, correctOption: i }))}
                        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${preQuizDraft.correctOption === i ? 'border-green-500 bg-green-500' : 'border-outline-variant/40 hover:border-green-400'}`}
                        title="Mark as correct answer"
                      >
                        {preQuizDraft.correctOption === i && (
                          <span className="material-symbols-outlined text-white" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>check</span>
                        )}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => {
                          const opts = [...preQuizDraft.options];
                          opts[i] = e.target.value;
                          setPreQuizDraft(d => ({ ...d, options: opts }));
                        }}
                        placeholder={`Option ${i + 1}${i < 2 ? ' *' : ''}`}
                        className="flex-1 px-3 py-2 bg-white border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      />
                    </div>
                  ))}
                  <p className="text-[10px] text-on-surface-variant">Tap the circle to mark the correct answer</p>
                </div>
                <button
                  onClick={addPreQuiz}
                  disabled={!preQuizDraft.question.trim() || preQuizDraft.options.filter(o => o.trim()).length < 2}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Add to Bank
                </button>
              </div>

              {/* Saved quizzes */}
              {preQuizzes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold">{preQuizzes.length} Quiz{preQuizzes.length !== 1 ? 'zes' : ''} in Bank</p>
                  {preQuizzes.map((q, idx) => (
                    <div key={q.id} className="bg-surface-container rounded-2xl px-4 py-3 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-black">Q{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-snug line-clamp-2">{q.question}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {q.options.map((o, oi) => (
                            <span key={oi} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${oi === q.correctOption ? 'bg-green-100 text-green-700' : 'bg-surface-container-high text-on-surface-variant'}`}>
                              {oi === q.correctOption ? '✓ ' : ''}{o}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => setPreQuizzes(prev => prev.filter((_, i) => i !== idx))}
                        className="flex-shrink-0 w-7 h-7 rounded-lg text-on-surface-variant hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 sticky bottom-0 bg-white">
              <button onClick={savePreQuizBank}
                className="w-full py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>
                Save Quiz Bank ({preQuizzes.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Go Live — Live Class Modal */}
      {liveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Start Live Class</h3>
              <button onClick={() => { setLiveModal(false); setRoomError(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-red-50 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
              <div>
                <p className="font-bold text-sm text-red-700">Going Live Now</p>
                <p className="text-xs text-red-600/80 mt-0.5">Students on the selected plan will see this class instantly.</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Class Title</label>
              <input type="text" value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
                placeholder="e.g., GROWTH Weekly Doubt Session"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
            </div>
            <PlanSelector value={livePlan} onChange={setLivePlan} />
            {roomError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-red-600 text-xs">{roomError}</p>
              </div>
            )}
            <button onClick={startLiveClass} disabled={creatingRoom}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70">
              {creatingRoom
                ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Room...</>
                : <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>Start Live Now</>}
            </button>
          </div>
        </div>
      )}

      {/* Schedule Live Class Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Schedule Live Class</h3>
              <button onClick={() => setScheduleModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-secondary-container/20 rounded-2xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary text-sm mt-0.5">info</span>
              <p className="text-xs text-on-surface-variant">Students on the selected plan will see this as an upcoming class immediately.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Class Title</label>
                <input type="text" value={newClass.title} onChange={e => setNewClass(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., GROWTH Live Session"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Date</label>
                  <input type="date" value={newClass.date} onChange={e => setNewClass(p => ({ ...p, date: e.target.value }))}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Time</label>
                  <input type="time" value={newClass.time} onChange={e => setNewClass(p => ({ ...p, time: e.target.value }))}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
              </div>
              <PlanSelector value={newClass.plan} onChange={val => setNewClass(p => ({ ...p, plan: val }))} />
            </div>
            <button onClick={scheduleClass} disabled={!newClass.title || !newClass.date || !newClass.time}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-50">
              Schedule Class
            </button>
          </div>
        </div>
      )}

      {/* Schedule Workshop Modal */}
      {workshopModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Schedule Free Workshop</h3>
              <button onClick={() => setWorkshopModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-emerald-600 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>cast_for_education</span>
              <div>
                <p className="font-bold text-sm text-emerald-800">Open to Everyone — Free</p>
                <p className="text-xs text-emerald-700/80 mt-0.5">All students can register and join, regardless of their plan.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Workshop Title</label>
                <input type="text" value={newWorkshop.title} onChange={e => setNewWorkshop(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Intro to Machine Learning"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Short Description</label>
                <textarea value={newWorkshop.description} onChange={e => setNewWorkshop(p => ({ ...p, description: e.target.value }))}
                  placeholder="What will students learn in this workshop?"
                  rows={2}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Date</label>
                  <input type="date" value={newWorkshop.date} onChange={e => setNewWorkshop(p => ({ ...p, date: e.target.value }))}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Time</label>
                  <input type="time" value={newWorkshop.time} onChange={e => setNewWorkshop(p => ({ ...p, time: e.target.value }))}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">Tags (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {WORKSHOP_TAGS.map(tag => (
                    <button key={tag} type="button"
                      onClick={() => setNewWorkshop(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${newWorkshop.tags.includes(tag) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-outline-variant/30 text-on-surface-variant hover:border-emerald-400'}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={scheduleWorkshop} disabled={!newWorkshop.title || !newWorkshop.date || !newWorkshop.time}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-50">
              Schedule Workshop
            </button>
          </div>
        </div>
      )}

      {/* Go Live Workshop Modal */}
      {workshopLiveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Start Live Workshop</h3>
              <button onClick={() => { setWorkshopLiveModal(false); setRoomError(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-emerald-600 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>cast</span>
              <div>
                <p className="font-bold text-sm text-emerald-800">Going Live — Open to All</p>
                <p className="text-xs text-emerald-700/80 mt-0.5">This free workshop will be visible to every student immediately, no plan needed.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Workshop Title</label>
                <input type="text" value={liveWorkshop.title} onChange={e => setLiveWorkshop(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Free Career Q&A Session"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Short Description</label>
                <textarea value={liveWorkshop.description} onChange={e => setLiveWorkshop(p => ({ ...p, description: e.target.value }))}
                  placeholder="Quick description for students..."
                  rows={2}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant mb-2 block">Tags (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {WORKSHOP_TAGS.map(tag => (
                    <button key={tag} type="button"
                      onClick={() => setLiveWorkshop(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${liveWorkshop.tags.includes(tag) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-outline-variant/30 text-on-surface-variant hover:border-emerald-400'}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {roomError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-red-600 text-xs">{roomError}</p>
              </div>
            )}
            <button onClick={startLiveWorkshopNow} disabled={creatingRoom || !liveWorkshop.title.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70">
              {creatingRoom
                ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Room...</>
                : <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>cast</span>Start Workshop Now</>}
            </button>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold font-headline">Create Session Task</h3>
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
              <h3 className="font-headline font-bold text-xl">Schedule a Meeting</h3>
              <button onClick={() => setMeetingScheduleModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-violet-50 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-violet-500 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>video_call</span>
              <div>
                <p className="font-bold text-sm text-violet-700">Zoom/Meet-style Invite</p>
                <p className="text-xs text-violet-600/80 mt-0.5">After scheduling, you'll get a shareable link. Anyone can join — no T.E.R.M. account required.</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Meeting Title *</label>
              <input type="text" value={newMeeting.title} onChange={e => setNewMeeting(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Product Review, Team Standup"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description <span className="font-normal text-on-surface-variant/60">(optional)</span></label>
              <textarea value={newMeeting.description} onChange={e => setNewMeeting(p => ({ ...p, description: e.target.value }))}
                placeholder="Agenda, topic, or notes for participants..."
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
            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1.5">Meeting Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'free', label: 'Free Meeting', sub: 'Anyone can join via link', icon: 'public', color: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
                  { key: 'paid', label: 'Professional', sub: 'T.E.R.M. Edu branding', icon: 'verified', color: 'border-violet-500 bg-violet-50 text-violet-700' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setNewMeeting(p => ({ ...p, plan: opt.key }))}
                    className={`flex flex-col gap-0.5 p-3 rounded-xl border-2 text-left transition-all ${newMeeting.plan === opt.key ? opt.color : 'border-outline-variant/30 hover:border-outline-variant'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
                      <span className="font-bold text-xs">{opt.label}</span>
                    </div>
                    <span className="text-[10px] opacity-70">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={scheduleMeeting} disabled={!newMeeting.title || !newMeeting.date || !newMeeting.time}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-violet-500/20">
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
              <h3 className="font-headline font-bold text-xl">Start Meeting Now</h3>
              <button onClick={() => { setMeetingLiveModal(false); setRoomError(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-4 flex items-start gap-3 border border-violet-100">
              <span className="material-symbols-outlined text-violet-500 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>
              <div>
                <p className="font-bold text-sm text-violet-700">Instant Meeting Room</p>
                <p className="text-xs text-violet-600/80 mt-0.5">Room is created immediately. Share the link with participants and they join via a branded T.E.R.M. Edu page.</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Meeting Title</label>
              <input type="text" value={liveMeetingForm.title} onChange={e => setLiveMeetingForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Quick Sync, Interview, Demo"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description <span className="font-normal text-on-surface-variant/60">(optional)</span></label>
              <input type="text" value={liveMeetingForm.description} onChange={e => setLiveMeetingForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief topic or agenda"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant block mb-1.5">Meeting Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'free', label: 'Free', icon: 'public' },
                  { key: 'paid', label: 'Professional', icon: 'verified' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setLiveMeetingForm(p => ({ ...p, plan: opt.key }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${liveMeetingForm.plan === opt.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant'}`}>
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
              <span className="material-symbols-outlined text-amber-500 flex-shrink-0 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
              <p className="text-amber-700 text-xs leading-relaxed">Once in the meeting, open the Quiz Bank to launch pre-planned quizzes for participants.</p>
            </div>
            {roomError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-red-600 text-xs">{roomError}</p>
              </div>
            )}
            <button onClick={startMeetingNow} disabled={creatingRoom}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-violet-500/20">
              {creatingRoom
                ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Room…</>
                : <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>Start Meeting Now</>}
            </button>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
