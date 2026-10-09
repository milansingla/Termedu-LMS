import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ProjectContext = createContext(null);

const API_BRIEFS = '/api/projects';
const API_SUBS = '/api/project-submissions';

async function apiFetch(path, options) {
  const res = await fetch(path, { credentials: 'include', ...options });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function ProjectProvider({ children }) {
  const [briefs, setBriefs] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [b, s] = await Promise.all([apiFetch(API_BRIEFS), apiFetch(API_SUBS)]);
      setBriefs(Array.isArray(b) ? b : []);
      setSubmissions(Array.isArray(s) ? s : []);
    } catch (_) {}
    finally { fetchingRef.current = false; }
  }, []);

  const lastFetchRef = useRef(0);

  useEffect(() => {
    fetchAll();
    lastFetchRef.current = Date.now();
    // Only re-fetch on visibility if at least 60 s have passed since last fetch
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 60_000) {
        lastFetchRef.current = Date.now();
        fetchAll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchAll]);

  const addBrief = useCallback(async (data) => {
    const brief = {
      id: `proj_${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...data,
    };
    setBriefs(prev => [brief, ...prev]);
    try {
      await apiFetch(API_BRIEFS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brief) });
    } catch (err) {
      setBriefs(prev => prev.filter(b => b.id !== brief.id));
      throw err;
    }
    return brief;
  }, []);

  const updateBrief = useCallback(async (id, patch) => {
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    try {
      await apiFetch(`${API_BRIEFS}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    } catch (err) {
      throw err;
    }
  }, []);

  const deleteBrief = useCallback(async (id) => {
    setBriefs(prev => prev.filter(b => b.id !== id));
    try {
      await apiFetch(`${API_BRIEFS}/${id}`, { method: 'DELETE' });
    } catch (err) {
      await fetchAll();
      throw err;
    }
  }, [fetchAll]);

  const submitProject = useCallback(async ({ briefId, studentId, studentName, link, description }) => {
    const existing = submissions.find(s => s.briefId === briefId && s.studentId === studentId);
    const payload = { briefId, studentId, studentName, link, description };
    if (existing) {
      const optimistic = { ...existing, ...payload, submittedAt: new Date().toISOString() };
      setSubmissions(prev => prev.map(s => s.id === existing.id ? optimistic : s));
      try {
        const saved = await apiFetch(`${API_SUBS}/${existing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        setSubmissions(prev => prev.map(s => s.id === existing.id ? { ...s, ...saved } : s));
        return saved;
      } catch (_) { return optimistic; }
    } else {
      const tempId = `temp_projsub_${Date.now()}`;
      const optimistic = { id: tempId, ...payload, submittedAt: new Date().toISOString(), marks: null, feedback: null };
      setSubmissions(prev => [optimistic, ...prev]);
      try {
        const saved = await apiFetch(API_SUBS, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        setSubmissions(prev => prev.map(s => s.id === tempId ? { ...s, ...saved } : s));
        return saved;
      } catch (err) {
        setSubmissions(prev => prev.filter(s => s.id !== tempId));
        throw err;
      }
    }
  }, [submissions]);

  const gradeSubmission = useCallback(async (id, { marks, feedback }) => {
    const prev = submissions.find(s => s.id === id);
    setSubmissions(ps => ps.map(s => s.id === id ? { ...s, marks, feedback } : s));
    try {
      await apiFetch(`${API_SUBS}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marks, feedback }) });
    } catch (err) {
      if (prev) setSubmissions(ps => ps.map(s => s.id === id ? prev : s));
      throw err;
    }
  }, [submissions]);

  const getSubmission = (briefId, studentId) =>
    submissions.find(s => s.briefId === briefId && s.studentId === studentId) || null;

  const getBriefsBySession = (sessionId) =>
    briefs.filter(b => b.sessionId === sessionId);

  const getSubmissionsForBrief = (briefId) =>
    submissions.filter(s => s.briefId === briefId);

  return (
    <ProjectContext.Provider value={{
      briefs,
      submissions,
      addBrief,
      updateBrief,
      deleteBrief,
      submitProject,
      gradeSubmission,
      getSubmission,
      getBriefsBySession,
      getSubmissionsForBrief,
      refreshProjects: fetchAll,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProjects = () => useContext(ProjectContext);
