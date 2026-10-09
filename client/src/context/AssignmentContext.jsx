import { createContext, useContext, useState, useEffect, useRef } from 'react';

const AssignmentContext = createContext(null);

const BASE = '/api/data';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function AssignmentProvider({ children }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const pollRef = useRef(null);

  const loadAll = async () => {
    try {
      const [a, s] = await Promise.all([
        apiFetch('/assignments'),
        apiFetch('/submissions'),
      ]);
      setAssignments(a);
      setSubmissions(s);
      setLoaded(true);
    } catch (err) {
      console.error('AssignmentContext load error:', err);
    }
  };

  useEffect(() => {
    loadAll();
    // Stagger 5 s then poll every 45 s to avoid startup burst
    const delay = setTimeout(() => {
      pollRef.current = setInterval(loadAll, 45_000);
    }, 5000);
    return () => { clearTimeout(delay); clearInterval(pollRef.current); };
  }, []);

  const addAssignment = async (data) => {
    const item = await apiFetch('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setAssignments(prev => [item, ...prev]);
    return item;
  };

  const updateAssignment = async (id, updates) => {
    const item = await apiFetch(`/assignments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setAssignments(prev => prev.map(a => a.id === id ? item : a));
  };

  const deleteAssignment = async (id) => {
    await apiFetch(`/assignments/${id}`, { method: 'DELETE' });
    setAssignments(prev => prev.filter(a => a.id !== id));
    setSubmissions(prev => prev.filter(s => s.assignmentId !== id));
  };

  const submitAssignment = async (data) => {
    const item = await apiFetch('/submissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setSubmissions(prev => {
      const existing = prev.find(s => s.assignmentId === data.assignmentId && s.studentId === data.studentId);
      if (existing) return prev.map(s => (s.assignmentId === data.assignmentId && s.studentId === data.studentId) ? item : s);
      return [item, ...prev];
    });
    return item;
  };

  const gradeSubmission = async (submissionId, marks, feedback) => {
    const item = await apiFetch(`/submissions/${submissionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ marks, feedback }),
    });
    setSubmissions(prev => prev.map(s => s.id === submissionId ? item : s));
  };

  const getSubmission = (assignmentId, studentId) =>
    submissions.find(s => s.assignmentId === assignmentId && s.studentId === studentId) || null;

  const getSubmissionsForAssignment = (assignmentId) =>
    submissions.filter(s => s.assignmentId === assignmentId);

  const getAssignmentsForPlan = (planKeys) =>
    assignments.filter(a =>
      a.planKey === 'all' ||
      planKeys.includes(a.planKey) ||
      a.planKey === 'course'
    );

  return (
    <AssignmentContext.Provider value={{
      assignments,
      submissions,
      loaded,
      addAssignment,
      updateAssignment,
      deleteAssignment,
      submitAssignment,
      gradeSubmission,
      getSubmission,
      getSubmissionsForAssignment,
      getAssignmentsForPlan,
    }}>
      {children}
    </AssignmentContext.Provider>
  );
}

export const useAssignments = () => useContext(AssignmentContext);
