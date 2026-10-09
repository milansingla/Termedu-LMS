import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import DailyVideoCall from '../../components/DailyVideoCall';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useProjects } from '../../context/ProjectContext';
import { createRoom, getToken, deleteRoom } from '../../services/dailyApi';

const LS_SESSIONS_KEY = 'lms_scheduled_sessions';
const LS_UPLOADS_KEY = 'lms_uploads';
const LS_COURSES_KEY = 'lms_courses';

function getStoredSessions() {
  try { return JSON.parse(localStorage.getItem(LS_SESSIONS_KEY) || '[]'); } catch { return []; }
}
function storeSessions(sessions) {
  localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
}
function getStoredUploads() {
  try { return JSON.parse(localStorage.getItem(LS_UPLOADS_KEY) || '[]'); } catch { return []; }
}
function storeUploads(uploads) {
  localStorage.setItem(LS_UPLOADS_KEY, JSON.stringify(uploads));
}
function getStoredCourses() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_COURSES_KEY) || 'null');
    return stored || [];
  } catch { return []; }
}
function storeCourses(courses) {
  localStorage.setItem(LS_COURSES_KEY, JSON.stringify(courses));
}

function getSessionStatus(session, now) {
  if (session.ended) return 'Ended';
  const dt = new Date(`${session.date}T${session.time}`);
  if (now >= dt) return 'Live';
  return 'Upcoming';
}

export default function LecturerDashboard() {
  const navigate = useNavigate();
  const { currentUser, logout, appUsers } = useApp();
  const { courses: ctxCourses, totalLessonsAll } = useCourses();
  const { submissions: allSubmissions, briefs: allAssignments } = useProjects();

  const [courses, setCourses] = useState(getStoredCourses);
  const [sessions, setSessions] = useState(getStoredSessions);
  const [uploadsList, setUploadsList] = useState(getStoredUploads);

  const [scheduleModal, setScheduleModal] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [liveModal, setLiveModal] = useState(false);
  const [editCourseModal, setEditCourseModal] = useState(null);
  const [analyticsModal, setAnalyticsModal] = useState(null);
  const [endNoteModal, setEndNoteModal] = useState(false);
  const [endNote, setEndNote] = useState('');
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [activeCall, setActiveCall] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null);
  const [liveTitle, setLiveTitle] = useState('');

  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');

  const [uploadType, setUploadType] = useState('Video');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const pendingReviews = (allSubmissions || []).filter(s => s.marks === null);
  const totalStudents = (appUsers || []).filter(u => u.role === 'student').length;
  const totalLectures = totalLessonsAll;
  const avgRating = (() => {
    const rated = (ctxCourses || []).filter(c => c.rating > 0);
    if (!rated.length) return '0.0';
    return (rated.reduce((s, c) => s + c.rating, 0) / rated.length).toFixed(1);
  })();

  const upcomingInNext24 = sessions.filter(s => {
    const dt = new Date(`${s.date}T${s.time}`);
    const diff = dt - now;
    return diff > 0 && diff <= 24 * 60 * 60 * 1000;
  });
  const notifCount = upcomingInNext24.length + pendingReviews.length;

  const startLiveClass = async () => {
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const slugTitle = (liveTitle || 'term-live-class')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const roomName = `${slugTitle}-${Date.now()}`;

      const { room, url } = await createRoom(roomName);

      const { token } = await getToken({
        roomName: room.name,
        isOwner: true,
        userName: currentUser?.name || 'Instructor',
        userId: currentUser?.id || 'lecturer',
      });

      setCreatedRoomInfo({ roomName: room.name, url, token });
      setLiveModal(false);
      setActiveCall({ roomUrl: url, token, roomName: room.name });
    } catch (err) {
      setRoomError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const leaveAndCleanup = async () => {
    if (createdRoomInfo?.roomName) {
      try { await deleteRoom(createdRoomInfo.roomName); } catch (_) {}
    }
    setActiveCall(null);
    if (activeSessionId != null) {
      setEndNote('');
      setEndNoteModal(true);
    } else {
      setCreatedRoomInfo(null);
      setActiveSessionId(null);
    }
  };

  const confirmSessionEnd = () => {
    if (activeSessionId != null) {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === activeSessionId ? { ...s, ended: true, recordingNote: endNote || null } : s
        );
        storeSessions(updated);
        return updated;
      });
    }
    setCreatedRoomInfo(null);
    setActiveSessionId(null);
    setEndNoteModal(false);
    setEndNote('');
  };

  const submitSchedule = () => {
    if (!schedTitle || !schedDate || !schedTime) return;
    const newSession = {
      id: Date.now(),
      title: schedTitle,
      date: schedDate,
      time: schedTime,
      ended: false,
      roomUrl: null,
    };
    const updated = [...sessions, newSession];
    setSessions(updated);
    storeSessions(updated);
    setSchedTitle('');
    setSchedDate('');
    setSchedTime('');
    setScheduleModal(false);
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
      const updated = sessions.map(s =>
        s.id === session.id ? { ...s, roomUrl: url, roomName: room.name } : s
      );
      setSessions(updated);
      storeSessions(updated);
      setCreatedRoomInfo({ roomName: room.name, url, token });
      setActiveSessionId(session.id);
      setActiveCall({ roomUrl: url, token, roomName: room.name });
    } catch (err) {
      alert('Failed to start session: ' + err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const markSessionEnded = (sessionId) => {
    const updated = sessions.map(s => s.id === sessionId ? { ...s, ended: true } : s);
    setSessions(updated);
    storeSessions(updated);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadProgress(0);
    setUploadDone(false);
  };

  const handleUpload = () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadProgress(0);
    let pct = 0;
    const interval = setInterval(() => {
      pct += 10 + Math.random() * 20;
      if (pct >= 100) {
        pct = 100;
        clearInterval(interval);
        const record = { id: Date.now(), name: uploadFile.name, type: uploadType, date: new Date().toLocaleDateString() };
        const stored = getStoredUploads();
        const newList = [...stored, record];
        storeUploads(newList);
        setUploadsList(newList);
        setUploadProgress(100);
        setUploadDone(true);
        setUploading(false);
        setUploadModal(false);
        setToast({ message: `"${uploadFile.name}" uploaded successfully!`, icon: 'check_circle' });
        setTimeout(() => setToast(null), 3500);
      } else {
        setUploadProgress(Math.round(pct));
      }
    }, 200);
  };

  const resetUploadModal = () => {
    setUploadFile(null);
    setUploadProgress(0);
    setUploadDone(false);
    setUploading(false);
    setUploadType('Video');
    setUploadModal(false);
  };

  const openEditCourse = (course) => {
    setEditTitle(course.title);
    setEditDesc(course.description || '');
    setEditCourseModal(course.id);
  };

  const saveEditCourse = () => {
    const updated = courses.map(c =>
      c.id === editCourseModal ? { ...c, title: editTitle, description: editDesc } : c
    );
    setCourses(updated);
    storeCourses(updated);
    setEditCourseModal(null);
  };

  const acceptedTypes = {
    'Video': 'video/*',
    'PDF/Notes': '.pdf,.doc,.docx',
    'Assignment': '.pdf,.doc,.docx,.zip',
  };

  const displayedCourses = showAllCourses ? courses : courses.slice(0, 3);

  if (activeCall) {
    return (
      <DailyVideoCall
        roomUrl={activeCall.roomUrl}
        token={activeCall.token}
        isOwner={true}
        userName={currentUser?.name || 'Instructor'}
        onLeave={leaveAndCleanup}
      />
    );
  }

  return (
    <div className="bg-background min-h-screen pb-32 text-on-surface">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl shadow-sm flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden">
            <img src={currentUser?.avatar} alt="Lecturer" className="w-full h-full object-cover" />
          </div>
          <div className="bg-black rounded-lg px-2 py-1.5 flex items-center shadow-md">
            <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 object-contain" />
          </div>
        </div>
        <div className="relative">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors relative"
            onClick={() => setNotifOpen(o => !o)}
          >
            <span className="material-symbols-outlined text-slate-400">notifications</span>
            {notifCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">{notifCount}</span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-outline-variant/10 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-outline-variant/10">
                <p className="font-bold text-sm">Notifications</p>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-outline-variant/10">
                {upcomingInNext24.length === 0 && pendingReviews.length === 0 && (
                  <p className="text-on-surface-variant text-sm text-center py-6">No new notifications</p>
                )}
                {upcomingInNext24.map(s => (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="material-symbols-outlined text-primary text-base mt-0.5">event</span>
                    <div>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="text-xs text-on-surface-variant">{s.date} at {s.time} — Upcoming soon</p>
                    </div>
                  </div>
                ))}
                {pendingReviews.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="material-symbols-outlined text-orange-500 text-base mt-0.5">assignment_late</span>
                    <div>
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-on-surface-variant">{a.course} — Due {a.due}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="pt-24 px-6 md:px-12 max-w-7xl mx-auto space-y-8 pb-32">
        {/* Greeting */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-on-surface-variant font-medium uppercase tracking-widest text-xs mb-2">Welcome Back</p>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">Good Morning, {currentUser?.name?.split(' ')[0]}</h1>
          </div>
          <div className="flex items-center gap-3 bg-secondary-container/30 px-4 py-2 rounded-full border border-secondary/10">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary" />
            </span>
            <span className="text-secondary font-semibold text-sm">Lecturer Portal</span>
          </div>
        </section>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Students in Batch', value: totalStudents.toLocaleString(), icon: 'groups', color: 'text-primary' },
            { label: 'Total Lectures', value: totalLectures, icon: 'menu_book', color: 'text-secondary' },
            { label: 'Pending Reviews', value: pendingReviews.length, icon: 'pending_actions', color: 'text-orange-500' },
            { label: 'Average Rating', value: avgRating, icon: 'star', color: 'text-yellow-500' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm flex flex-col justify-between min-h-[140px]">
              <span className={`material-symbols-outlined text-3xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <div>
                <p className="text-on-surface-variant text-sm font-medium">{label}</p>
                <p className="text-3xl font-bold font-headline mt-1">{value}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Start Live Class', icon: 'live_tv', color: 'signature-gradient text-white', action: () => setLiveModal(true) },
            { label: 'Upload Content', icon: 'cloud_upload', color: 'bg-secondary-container/20 text-secondary', action: () => setUploadModal(true) },
            { label: 'Schedule Class', icon: 'event', color: 'bg-tertiary-fixed text-tertiary', action: () => setScheduleModal(true) },
            { label: 'Grade Assignments', icon: 'grading', color: 'bg-orange-50 text-orange-600', action: () => navigate('/lecturer/projects') },
          ].map(({ label, icon, color, action }) => (
            <button key={label} onClick={action} className={`flex flex-col items-center gap-2 p-4 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] ${color}`}>
              <span className="material-symbols-outlined text-2xl">{icon}</span>
              {label}
            </button>
          ))}
        </section>

        {/* Live & Upcoming Classes */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold font-headline">Live &amp; Upcoming Classes</h2>
          {sessions.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-6 text-center text-on-surface-variant text-sm">
              No sessions scheduled yet. Use "Schedule Class" to add one.
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => {
                const status = getSessionStatus(session, now);
                const isActivelyLive = status === 'Live' && !!session.roomUrl;
                const dt = new Date(`${session.date}T${session.time}`);
                const formattedDate = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const formattedTime = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={session.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center ${isActivelyLive ? 'bg-red-100' : status === 'Ended' ? 'bg-slate-100' : status === 'Live' ? 'bg-orange-50' : 'bg-primary-fixed/30'}`}>
                      <span className={`material-symbols-outlined text-xl ${isActivelyLive ? 'text-red-500' : status === 'Ended' ? 'text-slate-400' : status === 'Live' ? 'text-orange-500' : 'text-primary'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {status === 'Live' ? 'live_tv' : status === 'Ended' ? 'check_circle' : 'event'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{session.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{formattedDate} at {formattedTime}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${isActivelyLive ? 'bg-red-100 text-red-600' : status === 'Ended' ? 'bg-slate-100 text-slate-500' : status === 'Live' ? 'bg-orange-100 text-orange-600' : 'bg-primary-fixed/30 text-primary'}`}>
                        {isActivelyLive ? 'Live' : status}
                      </span>
                      {(status === 'Upcoming' || (status === 'Live' && !session.roomUrl)) && (
                        <button
                          onClick={() => startScheduledSession(session)}
                          disabled={creatingRoom}
                          className="px-3 py-1.5 rounded-lg signature-gradient text-white text-xs font-bold disabled:opacity-60"
                        >
                          Start
                        </button>
                      )}
                      {isActivelyLive && (
                        <button
                          onClick={() => markSessionEnded(session.id)}
                          className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold"
                        >
                          End
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* My Courses */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-headline">My Courses</h2>
            <button onClick={() => setShowAllCourses(p => !p)} className="text-primary text-xs font-bold uppercase tracking-wider">
              {showAllCourses ? 'Show Less' : 'Manage All'}
            </button>
          </div>
          <div className="space-y-3">
            {displayedCourses.map(c => (
              <div key={c.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl flex-shrink-0 bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-white/60 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate">{c.title}</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">{c.students.toLocaleString()} students • {c.lectures} lectures</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="material-symbols-outlined text-yellow-400 text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="text-xs font-bold">{c.rating}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => openEditCourse(c)} className="px-3 py-1.5 rounded-lg signature-gradient text-white text-xs font-bold">Edit</button>
                  <button onClick={() => setAnalyticsModal(c)} className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-xs font-bold">Analytics</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pending Assignment Reviews */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-headline">Pending Reviews</h2>
            <button onClick={() => navigate('/lecturer/projects')}
              className="text-primary text-xs font-bold uppercase tracking-wider">
              View All
            </button>
          </div>
          {pendingReviews.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-5 text-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 block">check_circle</span>
              <p className="text-on-surface-variant text-sm mt-2">All caught up — no submissions awaiting review.</p>
            </div>
          ) : (
            pendingReviews.slice(0, 5).map(sub => {
              const asgn = (allAssignments || []).find(a => a.id === sub.briefId);
              return (
                <div key={sub.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary text-sm">assignment</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{asgn?.title || 'Project/Task'}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{sub.studentName}</p>
                  </div>
                  <button
                    onClick={() => navigate('/lecturer/projects')}
                    className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold signature-gradient text-white"
                  >
                    Grade
                  </button>
                </div>
              );
            })
          )}
        </section>

        {/* Uploaded Content */}
        {uploadsList.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold font-headline">Uploaded Content</h2>
            <div className="space-y-3">
              {uploadsList.map(u => (
                <div key={u.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary-container/30 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {u.type === 'Video' ? 'videocam' : u.type === 'Assignment' ? 'assignment' : 'picture_as_pdf'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{u.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{u.type} • Uploaded {u.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Logout */}
        <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center gap-4 px-5 py-4 bg-surface-container-lowest rounded-2xl border border-error/20 text-error hover:bg-error/5 transition-colors shadow-sm">
          <span className="material-symbols-outlined">logout</span>
          <span className="font-bold text-sm">Log Out</span>
        </button>
      </main>

      <BottomNav />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-green-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{toast.icon}</span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Notifications overlay close */}
      {notifOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
      )}

      {/* Start Live Class Modal */}
      {liveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Start Live Class</h3>
              <button onClick={() => { setLiveModal(false); setRoomError(null); }} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-primary-fixed/30 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
              <div>
                <p className="font-bold text-sm text-on-surface">Live Video Class</p>
                <p className="text-xs text-on-surface-variant mt-0.5">A private video room will be created instantly. You'll join as the host with full admin controls.</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Class Title (optional)</label>
              <input
                type="text"
                value={liveTitle}
                onChange={e => setLiveTitle(e.target.value)}
                placeholder="e.g., Wave-Particle Duality"
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              />
            </div>

            <div className="bg-surface-container rounded-2xl p-3 space-y-1.5">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Your host controls will include:</p>
              {['Mute all students', 'Remove participants', 'Start/stop recording', 'Screen sharing'].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-xs text-on-surface">{f}</span>
                </div>
              ))}
            </div>

            {roomError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-red-600 text-xs">{roomError}</p>
              </div>
            )}

            <button
              onClick={startLiveClass}
              disabled={creatingRoom}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {creatingRoom ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Room...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                  Start Live Now
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Schedule Live Class</h3>
              <button onClick={() => setScheduleModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Class Title</label>
                <input
                  type="text"
                  value={schedTitle}
                  onChange={e => setSchedTitle(e.target.value)}
                  placeholder="e.g., Wave-Particle Duality"
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Date</label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={e => setSchedDate(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Time</label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={e => setSchedTime(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={submitSchedule}
              disabled={!schedTitle || !schedDate || !schedTime}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-60"
            >
              Schedule Class
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Upload Content</h3>
              <button onClick={resetUploadModal} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Video', icon: 'videocam', color: 'text-red-600 bg-red-50' },
                { label: 'PDF/Notes', icon: 'picture_as_pdf', color: 'text-red-600 bg-red-50' },
                { label: 'Assignment', icon: 'assignment', color: 'text-primary bg-primary-fixed/30' },
              ].map(({ label, icon, color }) => (
                <button
                  key={label}
                  onClick={() => { setUploadType(label); setUploadFile(null); setUploadProgress(0); setUploadDone(false); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl font-semibold text-sm transition-all ${uploadType === label ? `${color} ring-2 ring-offset-1 ring-primary` : color}`}
                >
                  <span className="material-symbols-outlined text-2xl">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedTypes[uploadType]}
              className="hidden"
              onChange={handleFileSelect}
            />

            {!uploadDone ? (
              <div
                className="border-2 border-dashed border-outline-variant rounded-2xl p-8 flex flex-col items-center gap-3 bg-surface-container-low cursor-pointer"
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-4xl text-outline">cloud_upload</span>
                {uploadFile ? (
                  <p className="font-bold text-sm text-center break-all">{uploadFile.name}</p>
                ) : (
                  <>
                    <p className="font-bold text-sm">Tap to select file</p>
                    <p className="text-xs text-on-surface-variant">
                      {uploadType === 'Video' ? 'MP4, MOV, AVI' : uploadType === 'PDF/Notes' ? 'PDF, DOC, DOCX' : 'PDF, DOC, DOCX, ZIP'} (max 500MB)
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-green-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="font-bold text-sm text-green-700">Upload successful!</p>
                  <p className="text-xs text-green-600">{uploadFile.name}</p>
                </div>
              </div>
            )}

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-surface-container rounded-full h-2">
                  <div
                    className="signature-gradient h-2 rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {!uploadDone ? (
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-50"
              >
                Upload
              </button>
            ) : (
              <button onClick={resetUploadModal} className="w-full py-4 rounded-2xl bg-surface-container text-on-surface font-bold">
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourseModal !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Edit Course</h3>
              <button onClick={() => setEditCourseModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Course Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Description</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={4}
                  className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                />
              </div>
            </div>
            <button onClick={saveEditCourse} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {analyticsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Course Analytics</h3>
              <button onClick={() => setAnalyticsModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className={`w-full h-24 rounded-2xl bg-gradient-to-br ${analyticsModal.gradient || 'from-primary to-secondary'} flex items-center px-6 gap-4`}>
              <span className="material-symbols-outlined text-white/70 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{analyticsModal.gradientIcon || 'school'}</span>
              <p className="font-bold text-white text-lg">{analyticsModal.title}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Students', value: analyticsModal.students?.toLocaleString(), icon: 'groups', color: 'text-primary' },
                { label: 'Lectures', value: analyticsModal.lectures, icon: 'menu_book', color: 'text-secondary' },
                { label: 'Rating', value: analyticsModal.rating, icon: 'star', color: 'text-yellow-500' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-surface-container-lowest rounded-2xl p-4 flex flex-col items-center gap-2">
                  <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  <p className="text-xl font-bold font-headline">{value}</p>
                  <p className="text-xs text-on-surface-variant">{label}</p>
                </div>
              ))}
            </div>
            <div className="bg-surface-container-lowest rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Additional Info</p>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Level</span>
                <span className="font-semibold">{analyticsModal.level || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Duration</span>
                <span className="font-semibold">{analyticsModal.duration || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Category</span>
                <span className="font-semibold">{analyticsModal.category || 'N/A'}</span>
              </div>
            </div>
            <button onClick={() => setAnalyticsModal(null)} className="w-full py-4 rounded-2xl bg-surface-container text-on-surface font-bold">
              Close
            </button>
          </div>
        </div>
      )}

      {/* End Session — Recording Note Modal */}
      {endNoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Session Ended</h3>
            </div>
            <div className="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="text-sm text-on-surface">Your live session has ended. Would you like to add a recording note for students?</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Recording Note (optional)</label>
              <textarea
                value={endNote}
                onChange={e => setEndNote(e.target.value)}
                rows={3}
                placeholder="e.g., Recording will be available within 24 hours in the course materials section."
                className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
              />
            </div>
            <button onClick={confirmSessionEnd} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
