import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';

const LiveClassContext = createContext(null);

const API = '/api/sessions';

export function LiveClassProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const pollingRef = useRef(null);

  const fetchSessions = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const data = await apiFetch(API);
      if (!Array.isArray(data)) return;
      // Merge: keep any local-only temp sessions that are <30s old (still being persisted)
      setSessions(prev => {
        const serverIds = new Set(data.map(s => String(s.id)));
        const nowMs = Date.now();
        const localOnly = prev.filter(s => {
          if (serverIds.has(String(s.id))) return false;
          const idStr = String(s.id);
          // temp IDs look like "temp_1712345678901"
          const ts = idStr.startsWith('temp_') ? Number(idStr.slice(5)) : Number(idStr);
          const age = nowMs - ts;
          return age < 30000;
        });
        return [...data, ...localOnly];
      });
    } catch (_) {}
    finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => {
    fetchSessions();
    // Stagger 1 s then poll every 30 s to avoid startup burst
    const delay = setTimeout(() => {
      pollingRef.current = setInterval(fetchSessions, 30_000);
    }, 1000);
    return () => { clearTimeout(delay); clearInterval(pollingRef.current); };
  }, [fetchSessions]);

  const addSession = useCallback(async ({ title, date, time, instructor, createdBy, plan = 'all', onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      date,
      time,
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan,
      isWorkshop: false,
      status: 'upcoming',
      roomName: null,
      roomUrl: null,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const addLiveSession = useCallback(async ({ title, instructor, createdBy, roomName, roomUrl, plan = 'all', onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan,
      isWorkshop: false,
      status: 'live',
      roomName,
      roomUrl,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const addWorkshop = useCallback(async ({ title, description, date, time, instructor, createdBy, tags = [], onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      description: description || '',
      date,
      time,
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan: 'free',
      isWorkshop: true,
      tags,
      registrations: [],
      status: 'upcoming',
      roomName: null,
      roomUrl: null,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const addLiveWorkshop = useCallback(async ({ title, description, instructor, createdBy, roomName, roomUrl, tags = [], onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      description: description || '',
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan: 'free',
      isWorkshop: true,
      tags,
      registrations: [],
      status: 'live',
      roomName,
      roomUrl,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const registerWorkshop = useCallback((id, userId) => {
    setSessions(prev =>
      prev.map(s => s.id === id && s.isWorkshop
        ? { ...s, registrations: s.registrations?.includes(userId) ? s.registrations : [...(s.registrations || []), userId] }
        : s)
    );
    apiFetch(`${API}/${id}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
  }, []);

  const goLive = useCallback((id, { roomName, roomUrl }) => {
    setSessions(prev => {
      const existing = prev.find(s => String(s.id) === String(id));
      const updated = existing
        ? { ...existing, status: 'live', roomName, roomUrl }
        : null;
      if (updated) {
        apiFetch(`${API}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'live', roomName, roomUrl,
            isWorkshop: updated.isWorkshop || false,
            isMeeting:  updated.isMeeting  || false,
            plan:       updated.plan       || 'all',
            title:      updated.title      || '',
            instructor: updated.instructor || 'T.E.R.M. Mentor',
            description: updated.description || '',
            tags:       updated.tags       || [],
            date:       updated.date       || null,
            time:       updated.time       || null,
            createdBy:  updated.createdBy  || null,
          }),
        }).catch(() => {});
      } else {
        apiFetch(`${API}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'live', roomName, roomUrl }),
        }).catch(() => {});
      }
      return prev.map(s => String(s.id) === String(id) ? { ...s, status: 'live', roomName, roomUrl } : s);
    });
  }, []);

  const endSession = useCallback((id) => {
    const endedAt = new Date().toISOString();
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, status: 'ended', endedAt } : s)
    );
    apiFetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended', endedAt }),
    }).catch(() => {});
  }, []);

  const deleteSession = useCallback((id) => {
    if (id === undefined || id === null) return;
    setSessions(prev => prev.filter(s => s.id !== id));
    apiFetch(`${API}/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  // ── Professional Meetings ────────────────────────────────────────────────
  const addMeeting = useCallback(async ({ title, description, date, time, instructor, createdBy, plan = 'free', onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      description: description || '',
      date,
      time,
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan,
      isMeeting: true,
      status: 'upcoming',
      roomName: null,
      roomUrl: null,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const addLiveMeeting = useCallback(async ({ title, description, instructor, createdBy, roomName, roomUrl, plan = 'free', onError }) => {
    const tempId = `temp_${Date.now()}`;
    const session = {
      id: tempId,
      title,
      description: description || '',
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      instructor: instructor || 'T.E.R.M. Mentor',
      createdBy,
      plan,
      isMeeting: true,
      status: 'live',
      roomName,
      roomUrl,
      endedAt: null,
    };
    setSessions(prev => [session, ...prev]);
    try {
      const saved = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setSessions(prev => prev.map(s => s.id === tempId ? saved : s));
      return saved;
    } catch (err) {
      setSessions(prev => prev.filter(s => s.id !== tempId));
      if (onError) onError(err);
      throw err;
    }
  }, []);

  const regularSessions = sessions.filter(s => !s.isWorkshop && !s.isMeeting);
  const workshops = sessions.filter(s => s.isWorkshop);
  const meetings = sessions.filter(s => s.isMeeting);

  const liveSessions = regularSessions.filter(s => s.status === 'live');
  const upcomingSessions = regularSessions.filter(s => s.status === 'upcoming');
  const endedSessions = regularSessions.filter(s => s.status === 'ended');

  const liveWorkshops = workshops.filter(s => s.status === 'live');
  const upcomingWorkshops = workshops.filter(s => s.status === 'upcoming');
  const endedWorkshops = workshops.filter(s => s.status === 'ended');

  const liveMeetings = meetings.filter(s => s.status === 'live');
  const upcomingMeetings = meetings.filter(s => s.status === 'upcoming');
  const endedMeetings = meetings.filter(s => s.status === 'ended');

  return (
    <LiveClassContext.Provider value={{
      sessions,
      regularSessions,
      workshops,
      meetings,
      liveSessions,
      upcomingSessions,
      endedSessions,
      liveWorkshops,
      upcomingWorkshops,
      endedWorkshops,
      liveMeetings,
      upcomingMeetings,
      endedMeetings,
      syncing,
      sessionsLoading,
      addSession,
      addLiveSession,
      addWorkshop,
      addLiveWorkshop,
      addMeeting,
      addLiveMeeting,
      registerWorkshop,
      goLive,
      endSession,
      deleteSession,
    }}>
      {children}
    </LiveClassContext.Provider>
  );
}

export const useLiveClass = () => useContext(LiveClassContext);
