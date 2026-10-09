import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { saveSession, loadSession, loadSessionAsync, clearSession, saveAuthToken, loadAuthToken, clearAuthToken } from '../utils/sessionManager';
import { apiFetch } from '../lib/api';

const PRE_AUTH_ROUTES = new Set(['/', '/onboarding', '/login', '/otp']);

const AppContext = createContext(null);

// Belt-and-suspenders client-side expiry guard
function filterExpired(notifs) {
  const now = Date.now();
  return (notifs || []).filter(n => !n.expiresAt || new Date(n.expiresAt).getTime() > now);
}

export const DEFAULT_PLAN_CONFIGS = {
  starter: {
    key: 'starter', name: 'STARTER', price: '₹5,500', priceNum: 5500,
    tagline: 'Best for independent learners.', btnLabel: 'ENROLL NOW', btnStyle: 'border',
    badge: null, popular: false,
    features: ['Online recorded courses only', 'Lifetime access', 'Community support', 'Portfolio assignments', 'Completion certificate'],
    liveClasses: false, recordings: false, download: false, mentorAccess: false,
    color: 'text-white', bg: 'bg-white/10', border: 'border-white/20',
  },
  growth: {
    key: 'growth', name: 'GROWTH', price: '₹10,000', priceNum: 10000,
    tagline: 'Best for structured learning.', btnLabel: 'JOIN GROWTH', btnStyle: 'gradient',
    badge: 'POPULAR', popular: true,
    features: ['Recorded courses', 'Live classes', 'Mentor interaction', 'Doubt clearing sessions', 'Project feedback'],
    liveClasses: true, recordings: true, download: false, mentorAccess: true,
    color: 'text-purple-400', bg: 'bg-purple-600/10', border: 'border-purple-500/30',
  },
  premium: {
    key: 'premium', name: 'PREMIUM', price: '₹15,500', priceNum: 15500,
    tagline: 'Best for career-focused learners.', btnLabel: 'APPLY FOR PREMIUM', btnStyle: 'border',
    badge: 'BEST VALUE', popular: false,
    features: ['Recorded courses', 'Live classes', 'Guaranteed internship', 'Resume & interview prep', 'Industry exposure support'],
    liveClasses: true, recordings: true, download: true, mentorAccess: true,
    color: 'text-pink-400', bg: 'bg-gradient-to-r from-purple-600/10 to-pink-600/10', border: 'border-pink-500/30',
  },
  none: { key: 'none', name: 'No Plan', liveClasses: false, recordings: false, download: false, mentorAccess: false },
};

function playChime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ac.currentTime + 0.12);
    osc.frequency.exponentialRampToValueAtTime(880, ac.currentTime + 0.25);
    gain.gain.setValueAtTime(0.22, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.55);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.55);
  } catch {}
}

try { localStorage.removeItem('lms_announcements_v1'); } catch {}

const apiGet    = (path)        => apiFetch(path);
const apiPut    = (path, body)  => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) });
const apiPost   = (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const apiPatch  = (path, body)  => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) });
const apiDelete = (path)        => apiFetch(path, { method: 'DELETE' });


function derivePlan(user) {
  if (!user) return 'none';
  if (user.role === 'lecturer' || user.role === 'admin') return 'premium';
  const PLAN_ORDER = ['starter', 'growth', 'premium'];
  if (Array.isArray(user.plans) && user.plans.length)
    return PLAN_ORDER.filter(p => user.plans.includes(p)).pop() || 'none';
  return user.plan && user.plan !== 'none' ? user.plan : 'none';
}

function normPlan(p) { return (p || '').toLowerCase().replace(/[^a-z]/g, ''); }

function sessionMatchesPlan(session, studentPlan) {
  if (session.isWorkshop) return true;
  const sp = normPlan(session.plan || 'all');
  if (sp === 'all' || sp === '') return true;
  return sp === studentPlan;
}

export function AppProvider({ children }) {
  const isPreAuthRoute = PRE_AUTH_ROUTES.has(window.location.pathname);

  const savedSession                      = loadSession();
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [currentUser, setCurrentUser]     = useState(savedSession || null);
  const [darkMode, setDarkMode]           = useState(() => { try { return localStorage.getItem('term_dark_mode') === 'true'; } catch { return false; } });
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [currentPlan, setCurrentPlan]     = useState(() => derivePlan(savedSession));
  const [planConfigs, setPlanConfigs]     = useState(DEFAULT_PLAN_CONFIGS);
  const [appUsers, setAppUsers]           = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [categories, setCategories]       = useState([]);
  const [dataReady, setDataReady]         = useState(false);
  const [liveToast, setLiveToast]         = useState(null); // { sessionId, title, type }
  const prevNotifCount = useRef(null);
  const seenSessions   = useRef(null); // Map<sessionId, status>  — null means not yet initialised

  // Primary session check — server-side token (survives tab/browser close).
  // On 401, tries to restore via localStorage token before giving up (Android
  // WebView wipes cookies on clear-app; the localStorage token survives longer).
  // Falls back to local storage user data if server is unreachable (offline).
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          const { _token, ...user } = data;
          if (_token) saveAuthToken(_token); // rolling renewal — save fresh token
          setCurrentUser(user);
          setCurrentPlan(derivePlan(user));
          saveSession(user);
        } else {
          // Only attempt restore on 401 (cookie missing/expired).
          // 403 (inactive account), 5xx, etc. go straight to clearSession.
          const storedToken = res.status === 401 ? loadAuthToken() : null;
          if (storedToken) {
            try {
              const restore = await fetch('/api/auth/restore', {
                method: 'POST',
                credentials: 'include',
                headers: { Authorization: `Bearer ${storedToken}` },
              });
              if (restore.ok) {
                const data = await restore.json();
                const { _token, ...user } = data;
                if (_token) saveAuthToken(_token);
                setCurrentUser(user);
                setCurrentPlan(derivePlan(user));
                saveSession(user);
                return; // session restored — skip clearSession below
              }
            } catch {}
            // Restore failed — token is stale, clear it
            clearAuthToken();
          }
          // No valid session found — clear everything
          setCurrentUser(null);
          setCurrentPlan('none');
          clearSession();
        }
      })
      .catch(async () => {
        // Network unreachable (offline) — fall back to any local session we have
        const localUser = await loadSessionAsync();
        if (localUser) {
          setCurrentUser(localUser);
          setCurrentPlan(derivePlan(localUser));
        }
      })
      .finally(() => setSessionLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      apiGet('/api/data/users').catch(() => null),
      apiGet('/api/data/plan-configs').catch(() => null),
      apiGet('/api/data/notifications').catch(() => null),
      apiGet('/api/data/categories').catch(() => null),
    ]).then(([users, configs, notifs, cats]) => {
      if (users)   setAppUsers(users);
      if (configs) setPlanConfigs(prev => ({ ...DEFAULT_PLAN_CONFIGS, ...configs }));
      if (notifs)  {
        const alive = filterExpired(notifs);
        setAnnouncements(alive);
        prevNotifCount.current = alive.filter(n => n.active).length;
      }
      if (cats && cats.length) setCategories(cats);
      setDataReady(true);
    });
  }, []);

  // Purge any in-memory notifications that expired while the tab was open
  useEffect(() => {
    const id = setInterval(() => {
      setAnnouncements(prev => filterExpired(prev));
    }, 15 * 1000); // every 15 seconds
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let id;
    // Stagger 7 s then poll every 90 s to avoid startup burst
    const delay = setTimeout(() => {
      id = setInterval(async () => {
        if (!navigator.onLine) return;
        try {
          const [users, configs, notifs] = await Promise.all([
            apiGet('/api/data/users').catch(() => null),
            apiGet('/api/data/plan-configs').catch(() => null),
            apiGet('/api/data/notifications').catch(() => null),
          ]);
          if (users)   setAppUsers(users);
          if (configs) setPlanConfigs(prev => ({ ...DEFAULT_PLAN_CONFIGS, ...configs }));
          if (notifs) {
            const alive = filterExpired(notifs);
            setAnnouncements(alive);
            const count = alive.filter(n => n.active).length;
            if (prevNotifCount.current !== null && count > prevNotifCount.current) {
              playChime();
            }
            prevNotifCount.current = count;
          }
        } catch {
          // Silent — network may be briefly unavailable
        }
      }, 90_000);
    }, 7000);
    return () => { clearTimeout(delay); clearInterval(id); };
  }, []);

  // ── Heartbeat: tells the server this student is actively on the app ──────────
  // Runs every 30s while any user is logged in. Server uses this to decide
  // whether to send an FCM push when a support reply arrives.
  useEffect(() => {
    if (!currentUser?.id) return;
    const ping = () => apiFetch('/api/heartbeat', {
      method: 'POST', body: JSON.stringify({ userId: currentUser.id }),
    }).catch(() => {});
    ping(); // immediate ping on login / page load
    const hb = setInterval(ping, 30_000);
    return () => clearInterval(hb);
  }, [currentUser?.id]);

  // ── In-app live session detector ─────────────────────────────────────────────
  // Polls /api/sessions every 30 s for students.
  // First poll: seeds the status map AND immediately shows a banner if any
  // session is already live (student may have just opened the app).
  // Subsequent polls: shows a banner only when a session transitions to live.
  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== 'student') return;
    // Reset on every login so a fresh login always re-checks
    seenSessions.current = null;

    const myPlan = normPlan(derivePlan(currentUser)) || 'starter';

    const check = async () => {
      try {
        const all = await apiGet('/api/sessions');
        if (seenSessions.current === null) {
          const map = new Map();
          (all || []).forEach(s => map.set(String(s.id), s.status));
          seenSessions.current = map;
          const alreadyLive = (all || []).find(s =>
            s.status === 'live' && !s.isMeeting && sessionMatchesPlan(s, myPlan)
          );
          if (alreadyLive) {
            const type = alreadyLive.isWorkshop ? 'Free Workshop' : 'Live Class';
            setLiveToast({ sessionId: String(alreadyLive.id), title: alreadyLive.title || type, type, isWorkshop: alreadyLive.isWorkshop });
          }
          return;
        }
        for (const s of (all || [])) {
          const key  = String(s.id);
          const prev = seenSessions.current.get(key);
          if (s.status === 'live' && prev !== 'live' && !s.isMeeting && sessionMatchesPlan(s, myPlan)) {
            const type = s.isWorkshop ? 'Free Workshop' : 'Live Class';
            setLiveToast({ sessionId: key, title: s.title || type, type, isWorkshop: s.isWorkshop });
            seenSessions.current.set(key, 'live');
            break;
          }
          seenSessions.current.set(key, s.status);
        }
      } catch {}
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [currentUser?.id, currentUser?.role, currentPlan]);

  // ── FCM token registration (WebToApk Android bridge) ─────────────────────────
  // The native Android app generates the FCM token. We expose global JS functions
  // so the native side can call them to hand the token to us, then we persist it
  // to the server so push notifications can be delivered.
  useEffect(() => {
    if (!currentUser?.id) return;
    const uid = currentUser.id;

    const persistToken = (token) => {
      if (!token || typeof token !== 'string' || token.length < 20) return;
      fetch('/api/fcm/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userId: uid }),
        credentials: 'include',
      }).then(r => r.json())
        .then(d => console.log('[FCM] Token registered, devices:', d.totalTokens))
        .catch(() => {});
    };

    // Expose multiple entry points — native code may call any of these
    window.registerFcmToken     = persistToken;
    window.onFcmToken           = persistToken;
    window.onFcmTokenReceived   = persistToken;
    window.onNewFcmToken        = persistToken;

    // Pull eagerly from WebToApk bridge if already available
    const tryBridgeToken = () => {
      try {
        if (window.WebToApk?.getFcmToken) {
          const t = window.WebToApk.getFcmToken();
          if (t) { persistToken(t); return true; }
        }
      } catch {}
      // Some bridge versions inject into localStorage
      try {
        const stored = localStorage.getItem('fcm_token')
          || localStorage.getItem('FCM_TOKEN')
          || localStorage.getItem('firebase_token')
          || localStorage.getItem('pushToken');
        if (stored) { persistToken(stored); return true; }
      } catch {}
      return false;
    };

    // Try immediately, then retry every 3 s for up to 30 s — native bridge may
    // deliver the token slightly after the page finishes loading
    if (!tryBridgeToken()) {
      let attempts = 0;
      const retry = setInterval(() => {
        attempts++;
        if (tryBridgeToken() || attempts >= 10) clearInterval(retry);
      }, 3000);
    }

    return () => {
      delete window.registerFcmToken;
      delete window.onFcmToken;
      delete window.onFcmTokenReceived;
      delete window.onNewFcmToken;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || appUsers.length === 0) return;
    const fresh = appUsers.find(u => u.id === currentUser.id);
    if (!fresh) return;
    const roleChanged = fresh.role !== currentUser.role;
    const statusChanged = fresh.status !== currentUser.status;
    if (roleChanged || statusChanged) {
      const updated = { ...currentUser, role: fresh.role, status: fresh.status };
      setCurrentUser(updated);
      saveSession(updated);
      if (fresh.role === 'admin' || fresh.role === 'lecturer') {
        setCurrentPlan('premium');
        if (roleChanged) {
          const dest = fresh.role === 'admin' ? '/admin' : '/lecturer';
          window.location.href = dest;
        }
      }
    }
  }, [appUsers]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('term_dark_mode', darkMode); } catch {}
  }, [darkMode]);

  const PLAN_ORDER = ['starter', 'growth', 'premium'];
  const getHighestPlan = (plans) => {
    if (!Array.isArray(plans) || plans.length === 0) return 'none';
    return PLAN_ORDER.filter(p => plans.includes(p)).pop() || 'none';
  };

  const login = async (email, password) => {
    const data = await apiPost('/api/auth/login', { email, password });
    const { _token, ...user } = data;
    if (_token) saveAuthToken(_token);
    setCurrentUser(user);
    saveSession(user);
    if (user.role === 'student') {
      const highest = Array.isArray(user.plans) ? getHighestPlan(user.plans) : (user.plan && user.plan !== 'none' ? user.plan : 'none');
      setCurrentPlan(highest);
    }
    if (user.role === 'lecturer') setCurrentPlan('premium');
    if (user.role === 'admin') setCurrentPlan('premium');
    return user;
  };

  const loginWithUser = (data) => {
    const { _token, ...user } = data;
    if (_token) saveAuthToken(_token);
    setCurrentUser(user);
    saveSession(user);
    if (user.role === 'student') {
      const highest = Array.isArray(user.plans) ? getHighestPlan(user.plans) : (user.plan && user.plan !== 'none' ? user.plan : 'none');
      setCurrentPlan(highest);
    }
    if (user.role === 'lecturer') setCurrentPlan('premium');
    if (user.role === 'admin') setCurrentPlan('premium');
  };

  const finishRegistration = (user) => {
    setAppUsers(prev => [...prev, user]);
    loginWithUser(user);
    setCurrentPlan('none');
  };

  const register = async ({ name, email, phone, password }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const exists = appUsers.find(u => u.email.toLowerCase() === normalizedEmail);
    if (exists) throw new Error('Email already registered');
    const saved = await apiPost('/api/data/users', {
      name, email: normalizedEmail, phone: phone || null, password,
      role: 'student', plan: 'none', status: 'active',
      joined: new Date().toISOString().split('T')[0], avatar: null,
    });
    setAppUsers(prev => [...prev, saved]);
    setCurrentUser(saved);
    saveSession(saved);
    setCurrentPlan('none');
    return saved;
  };

  const resetPassword = async (email, newPassword) => {
    const found = appUsers.find(u => u.email === email);
    if (!found) throw new Error('No account found with this email');
    await apiPatch(`/api/data/users/${found.id}`, { password: newPassword });
    setAppUsers(prev => prev.map(u => u.id === found.id ? { ...u } : u));
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setCurrentUser(null); setCurrentPlan('none'); clearSession(); setSessionLoaded(true);
  };
  const enrollCourse   = (courseId) => setEnrolledCourses(prev => [...prev, courseId]);
  const toggleDarkMode = () => setDarkMode(p => !p);
  const updateUser     = (updates) => setCurrentUser(prev => {
    const next = { ...prev, ...updates };
    saveSession(next);
    return next;
  });

  const updatePlanConfig = useCallback((key, updates) => {
    setPlanConfigs(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...updates } };
      apiPut('/api/data/plan-configs', next).catch(() => {});
      return next;
    });
  }, []);

  const addPlanConfig = useCallback((key, config) => {
    setPlanConfigs(prev => {
      const next = { ...prev, [key]: { key, ...config } };
      apiPut('/api/data/plan-configs', next).catch(() => {});
      return next;
    });
  }, []);

  const removePlanConfig = useCallback((key) => {
    setPlanConfigs(prev => {
      const next = { ...prev };
      delete next[key];
      apiPut('/api/data/plan-configs', next).catch(() => {});
      return next;
    });
  }, []);

  const persistUsers = useCallback((updated) => {
    setAppUsers(updated);
    apiPut('/api/data/users', updated).catch(() => {});
  }, []);

  const addAppUser = useCallback((user) => {
    const newUser = { id: `u${Date.now()}`, status: 'active', plan: 'none', joined: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), ...user };
    persistUsers([newUser, ...appUsers]);
    return newUser;
  }, [appUsers, persistUsers]);

  const updateAppUser = useCallback((id, updates) => {
    const updated = appUsers.map(u => u.id === id ? { ...u, ...updates } : u);
    persistUsers(updated);
    setCurrentUser(prev => {
      if (!prev || prev.id !== id) return prev;
      const merged = { ...prev, ...updates };
      if (merged.role === 'student') {
        const highest = Array.isArray(merged.plans) ? (['starter','growth','premium'].filter(p => merged.plans.includes(p)).pop() || 'none') : (merged.plan && merged.plan !== 'none' ? merged.plan : 'none');
        setCurrentPlan(highest);
      }
      return merged;
    });
  }, [appUsers, persistUsers]);

  const toggleAppUserStatus = useCallback((id) => {
    persistUsers(appUsers.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
  }, [appUsers, persistUsers]);

  const removeAppUser = useCallback((id) => {
    persistUsers(appUsers.filter(u => u.id !== id));
  }, [appUsers, persistUsers]);

  const selectPlan = useCallback((planKey) => {
    setCurrentPlan(planKey);
    if (currentUser && currentUser.role === 'student') {
      const existingPlans = Array.isArray(currentUser.plans)
        ? currentUser.plans
        : (currentUser.plan && currentUser.plan !== 'none' ? [currentUser.plan] : []);
      const updatedPlans = existingPlans.includes(planKey) ? existingPlans : [...existingPlans, planKey];
      const highest = PLAN_ORDER.filter(p => updatedPlans.includes(p)).pop() || 'none';
      const merged = { ...currentUser, plan: highest, plans: updatedPlans };
      setCurrentUser(merged);
      saveSession(merged);
      persistUsers(appUsers.map(u => u.id === currentUser.id ? merged : u));
    }
  }, [currentUser, appUsers, persistUsers]);

  const updateCategories = useCallback((newCats) => {
    setCategories(newCats);
    apiPut('/api/data/categories', newCats).catch(() => {});
  }, []);

  const addAnnouncement = useCallback((data) => {
    const tempId = `notif_${Date.now()}`;
    const item = { id: tempId, active: true, readBy: [], createdAt: new Date().toISOString(), ...data };
    setAnnouncements(prev => [item, ...prev]);
    apiPost('/api/data/notifications', data)
      .then(saved => setAnnouncements(prev => prev.map(a => a.id === tempId ? saved : a)))
      .catch(() => {});
  }, []);

  const updateAnnouncement = useCallback((id, upd) => {
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, ...upd } : a));
    apiPatch(`/api/data/notifications/${id}`, upd).catch(() => {});
  }, []);

  const removeAnnouncement = useCallback((id) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    apiDelete(`/api/data/notifications/${id}`).catch(() => {});
  }, []);

  const toggleAnnouncement = useCallback((id) => {
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
    const ann = announcements.find(a => a.id === id);
    if (ann) apiPatch(`/api/data/notifications/${id}`, { active: !ann.active }).catch(() => {});
  }, [announcements]);

  const planFeatures = planConfigs[currentPlan] || planConfigs.none || planConfigs.starter;

  return (
    <AppContext.Provider value={{
      sessionLoaded,
      currentUser, login, loginWithUser, finishRegistration, logout, updateUser, register, resetPassword,
      darkMode, toggleDarkMode,
      enrolledCourses, enrollCourse,
      currentPlan, selectPlan, planFeatures,
      planConfigs, updatePlanConfig, addPlanConfig, removePlanConfig,
      appUsers, addAppUser, updateAppUser, toggleAppUserStatus, removeAppUser,
      announcements, addAnnouncement, updateAnnouncement, removeAnnouncement, toggleAnnouncement,
      categories, updateCategories,
      dataReady,
    }}>
      {children}

      {/* ── In-app live session toast banner ── */}
      {liveToast && !isPreAuthRoute && (
        <div
          style={{ position: 'fixed', bottom: '72px', left: '50%',
                   transform: 'translateX(-50%)', zIndex: 9999, width: 'min(92vw, 400px)',
                   animation: 'slideUpFade 0.35s ease' }}
        >
          <div style={{ background: '#0f172a', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                        border: '1px solid rgba(239,68,68,0.5)', padding: '14px 16px',
                        display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Pulsing red dot + icon */}
            <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(239,68,68,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ color: '#f87171', fontSize: 22,
                fontVariationSettings: "'FILL' 1" }}>live_tv</span>
              <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8,
                             borderRadius: '50%', background: '#ef4444',
                             boxShadow: '0 0 0 0 rgba(239,68,68,0.6)',
                             animation: 'livePulse 1.4s infinite' }} />
            </div>
            <style>{`@keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>
            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#f87171',
                          letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {liveToast.type} is Live Now!
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: '#fff',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {liveToast.title}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                Tap Join to enter the session
              </p>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => {
                  const tab = liveToast.isWorkshop ? 'workshops' : 'classes';
                  setLiveToast(null);
                  window.location.href = `/live?tab=${tab}&session=${liveToast.sessionId}`;
                }}
                style={{ padding: '5px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                         background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                Join Now
              </button>
              <button
                onClick={() => setLiveToast(null)}
                style={{ padding: '5px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
                         cursor: 'pointer', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
