import { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { apiFetch } from '../lib/api.js';

let _readyPromise = Promise.resolve();

// ── Global WebView audio unlock ───────────────────────────────────────────
let _audioUnlocked = false;
const _audioUnlockCbs = [];
function onAudioUnlocked(cb) {
  if (_audioUnlocked) { cb(); return; }
  _audioUnlockCbs.push(cb);
}
function _triggerAudioUnlock() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
      ctx.resume(); setTimeout(() => ctx.close(), 500);
    }
  } catch (_) {}
  _audioUnlockCbs.splice(0).forEach(cb => cb());
}

async function teardown(co) {
  if (!co) return;
  try { await co.leave(); } catch (_) {}
  try { co.destroy(); } catch (_) {}
}

function isPostMessageError(err) {
  return err?.message?.includes('postMessage') || err?.message?.includes('null');
}

const _ua = navigator.userAgent || '';
const IS_IOS = /iPhone|iPad|iPod/i.test(_ua);
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(_ua);
const IS_WEBVIEW = /; wv\)/i.test(_ua) || (/Android/i.test(_ua) && /Version\/\d/i.test(_ua));

const WatermarkOverlay = memo(function WatermarkOverlay({ label }) {
  const bg = useMemo(() => {
    const text = `${label} \u00B7 T.E.R.M. Edu`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='120'><text x='10' y='60' font-family='sans-serif' font-size='11' font-weight='700' fill='white' opacity='0.08' transform='rotate(-22,140,60)' letter-spacing='1'>${text}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [label]);
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, zIndex: 25,
        pointerEvents: 'none', userSelect: 'none',
        backgroundImage: bg,
        backgroundRepeat: 'repeat',
        backgroundSize: '280px 120px',
      }}
    />
  );
});

const VideoTile = memo(function VideoTile({ videoTrack, audioTrack, userName, isLocal, isSmall, isMuted: extMuted, isPinned, onPin, sessionId, large }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const initials = (userName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hasVideo = Boolean(videoTrack);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (videoTrack) {
      v.srcObject = new MediaStream([videoTrack]);
      v.play().catch(() => {});
    } else {
      v.pause();
      v.srcObject = null;
      try { v.load(); } catch (_) {}
    }
  }, [videoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || isLocal) return;

    if (!audioTrack) {
      el.pause();
      el.srcObject = null;
      return;
    }

    el.srcObject = new MediaStream([audioTrack]);

    // Attempt immediate play — works if autoplay is already allowed
    const attempt = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay blocked by browser/WebView policy.
          // Register a one-shot listener that retries play() DIRECTLY
          // inside the touchstart event, which IS a user-gesture context.
          const retry = () => { try { el.play(); } catch (_) {} };
          document.addEventListener('touchstart', retry, { once: true, capture: true });
          document.addEventListener('click',      retry, { once: true, capture: true });
        });
      }
    };

    attempt();

    // Also fire the global AudioContext unlock on the same gesture
    // so that subsequent tracks auto-play without needing another tap.
    const unlockAndRetry = () => {
      _triggerAudioUnlock();
      try { el.play(); } catch (_) {}
    };
    document.addEventListener('touchstart', unlockAndRetry, { once: true, capture: true });
    document.addEventListener('click',      unlockAndRetry, { once: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', unlockAndRetry, true);
      document.removeEventListener('click',      unlockAndRetry, true);
    };
  }, [audioTrack, isLocal]);

  const handleMeta = () => {
    const v = videoRef.current;
    if (v && v.videoWidth && v.videoHeight) setIsPortrait(v.videoHeight > v.videoWidth);
  };

  const containerCls = isSmall
    ? 'relative bg-slate-800 rounded-2xl overflow-hidden aspect-video'
    : 'relative bg-slate-800 rounded-2xl overflow-hidden w-full h-full';
  const fitCls = isPortrait ? 'object-contain' : 'object-cover';

  return (
    <div className={containerCls} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className={`absolute inset-0 transition-opacity duration-150 ${hasVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-800">
          <div className="w-14 h-14 rounded-full bg-primary/30 border border-primary/50 flex items-center justify-center text-white text-xl font-bold">{initials}</div>
          {!isSmall && (
            <div className="flex items-center gap-1 text-slate-400">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '14px' }}>videocam_off</span>
              <span className="text-xs">Camera off</span>
            </div>
          )}
        </div>
      </div>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} onLoadedMetadata={handleMeta}
        className={`absolute inset-0 w-full h-full ${fitCls} transition-opacity duration-150 ${hasVideo ? 'opacity-100' : 'opacity-0'}`} />
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}
      {!isSmall && onPin && (hovered || isPinned) && (
        <button onClick={(e) => { e.stopPropagation(); onPin(sessionId); }}
          className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-lg z-10 ${isPinned ? 'bg-yellow-400 text-slate-900' : 'bg-black/60 text-white hover:bg-yellow-400 hover:text-slate-900'}`}
          title={isPinned ? 'Unpin' : 'Pin to main view'}>
          <span className="material-symbols-outlined" style={{ fontSize: '15px', fontVariationSettings: isPinned ? "'FILL' 1" : "'FILL' 0" }}>push_pin</span>
        </button>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
        {isPinned && !isSmall && (
          <div className="bg-yellow-400/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg">
            <span className="material-symbols-outlined text-slate-900" style={{ fontSize: '11px', fontVariationSettings: "'FILL' 1" }}>push_pin</span>
          </div>
        )}
        <div className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-lg">
          <span className="text-white text-xs font-medium">{isLocal ? 'You' : (userName || 'Participant')}</span>
        </div>
        {(!audioTrack || extMuted) && (
          <div className="bg-black/60 backdrop-blur-sm w-5 h-5 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '12px' }}>mic_off</span>
          </div>
        )}
      </div>
    </div>
  );
});

function ScreenTile({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return (
    <div className="relative bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center w-full h-full">
      <video ref={ref} autoPlay playsInline muted className="w-full h-full object-contain" />
      <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded-lg flex items-center gap-1">
        <span className="material-symbols-outlined text-blue-400 text-sm">screen_share</span>
        <span className="text-white text-xs">Screen Share</span>
      </div>
    </div>
  );
}

export default function DailyVideoCall({ roomUrl, token, isOwner, userName, onLeave, sessionDbId, sessionTitle, joinUrl }) {
  const [callState, setCallState] = useState('loading');
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState(new Map());
  const [localSessionId, setLocalSessionId] = useState(null);
  const [isMuted, setIsMuted] = useState(!isOwner);
  const [isCamOff, setIsCamOff] = useState(!isOwner);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('chat');
  const [pinnedId, setPinnedId] = useState(null);
  const [callToast, setCallToast] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [noiseCancellation, setNoiseCancellation] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const toggleNoiseCancellation = () => {
    const next = !noiseCancellation;
    setNoiseCancellation(next);
    try {
      coRef.current?.updateInputSettings?.({
        audio: { processor: { type: next ? 'noise-cancellation' : 'none' } }
      });
    } catch {}
  };

  const copyInviteLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    }).catch(() => {});
  };

  // ── Polls / Quizzes ──────────────────────────────────────────────────────────
  // Poll shape: { id, question, options, votes, closed, isQuiz, correctOption, startedAt, duration, revealed, closedAt }
  const [polls, setPolls] = useState([]);
  const [myVotes, setMyVotes] = useState({});           // pollId -> optionIdx
  const [pollModal, setPollModal] = useState(false);
  const [pollModalTab, setPollModalTab] = useState('create');
  const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''], isQuiz: false, correctOption: null });
  const [quizBank, setQuizBank] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`qbank_${sessionDbId}`) || '[]'); } catch { return []; }
  });
  const [pollVoteOrder, setPollVoteOrder] = useState({}); // host-only: pollId -> [{name,option,ts}]
  const [quizLeaderboards, setQuizLeaderboards] = useState({}); // pollId -> ranked array
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const quizLeaderboardsRef = useRef({});
  useEffect(() => { quizLeaderboardsRef.current = quizLeaderboards; }, [quizLeaderboards]);
  useEffect(() => {
    if (sessionDbId) localStorage.setItem(`qbank_${sessionDbId}`, JSON.stringify(quizBank));
  }, [quizBank, sessionDbId]);
  const [tick, setTick] = useState(0);                  // 1-second heartbeat for countdowns

  // Refs for closures
  const pollsRef = useRef([]);
  const pollVoteOrderRef = useRef({});
  useEffect(() => { pollsRef.current = polls; }, [polls]);
  useEffect(() => { pollVoteOrderRef.current = pollVoteOrder; }, [pollVoteOrder]);

  // ── Host lock states ────────────────────────────────────────────────────────
  const [isMicsLocked, setIsMicsLocked] = useState(false);
  const [isCamsLocked, setIsCamsLocked] = useState(false);
  const [isScreenShareLocked, setIsScreenShareLocked] = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);
  const lockStateRef = useRef({ mics: false, cams: false, screenshare: false, chat: false });

  const [isLandscape, setIsLandscape] = useState(() => typeof screen !== 'undefined' && screen.orientation?.type?.includes('landscape'));
  const [bannedIds, setBannedIds] = useState(new Set());
  const bannedIdsRef = useRef(new Set());

  const coRef = useRef(null);
  const chatEndRef = useRef(null);
  const recorderRef = useRef(null);
  const recChunksRef = useRef([]);
  const recAnimRef = useRef(null);
  const recAudioCtxRef = useRef(null);
  const recCanvasRef = useRef(null);

  // ── 1-second ticker (for quiz countdown) ─────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auto-close quizzes when their 30s timer expires (owner only) ──────────
  useEffect(() => {
    if (!isOwner) return;
    pollsRef.current.forEach(p => {
      if (p.isQuiz && !p.closed && p.startedAt && p.duration) {
        const elapsed = (Date.now() - p.startedAt) / 1000;
        if (elapsed >= p.duration) closeQuiz(p.id);
      }
    });
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-dismiss closed polls from chat 30s after closing ─────────────────
  useEffect(() => {
    const now = Date.now();
    setPolls(prev => {
      const next = prev.filter(p => !p.closed || !p.closedAt || (now - p.closedAt) < 30000);
      return next.length === prev.length ? prev : next;
    });
  }, [tick]);

  const showCallToast = useCallback((msg, type = 'info') => {
    setCallToast({ msg, type });
    setTimeout(() => setCallToast(null), 3500);
  }, []);

  const _pendingRef = useRef({});
  const _rafRef = useRef(null);

  const _flushParticipants = useCallback(() => {
    _rafRef.current = null;
    const pending = _pendingRef.current;
    if (!Object.keys(pending).length) return;
    _pendingRef.current = {};
    setParticipants(prev => {
      const next = new Map(prev);
      for (const [sid, updates] of Object.entries(pending)) {
        next.set(sid, { ...(next.get(sid) || {}), ...updates });
      }
      return next;
    });
  }, []);

  const updateParticipant = useCallback((sessionId, updates) => {
    _pendingRef.current[sessionId] = { ...(_pendingRef.current[sessionId] || {}), ...updates };
    if (!_rafRef.current) {
      _rafRef.current = requestAnimationFrame(_flushParticipants);
    }
  }, [_flushParticipants]);

  const removeParticipant = useCallback((sessionId) => {
    setParticipants(prev => { const next = new Map(prev); next.delete(sessionId); return next; });
  }, []);

  const extractTracks = (p) => {
    // p.video is Daily's authoritative "camera on" flag — false when muted/off.
    // We MUST check this first because Daily can send a 'playable' placeholder
    // track (grey camera-off frame) even when the participant's camera is off.
    const camOn = p.video !== false && p.tracks?.video?.state === 'playable'
      && p.tracks?.video?.persistentTrack?.readyState === 'live';
    const micOn = p.audio !== false && p.tracks?.audio?.state === 'playable'
      && p.tracks?.audio?.persistentTrack?.readyState === 'live';
    return {
      videoTrack: camOn ? p.tracks.video.persistentTrack : null,
      audioTrack: micOn ? p.tracks.audio.persistentTrack : null,
      screenVideoTrack: p.tracks?.screenVideo?.persistentTrack?.readyState === 'live'
        ? p.tracks.screenVideo.persistentTrack : null,
      audioMuted: !micOn,
      videoMuted: !camOn,
    };
  };

  const broadcastHostControl = useCallback((action, value) => {
    if (!coRef.current) return;
    try { coRef.current.sendAppMessage({ type: 'host-control', action, value }, '*'); } catch (_) {}
  }, []);

  useEffect(() => {
    lockStateRef.current = { mics: isMicsLocked, cams: isCamsLocked, screenshare: isScreenShareLocked, chat: isChatLocked };
  }, [isMicsLocked, isCamsLocked, isScreenShareLocked, isChatLocked]);

  useEffect(() => {
    const handler = () => setIsLandscape(screen.orientation?.type?.includes('landscape') ?? false);
    screen.orientation?.addEventListener?.('change', handler);
    return () => screen.orientation?.removeEventListener?.('change', handler);
  }, []);

  const toggleLandscape = useCallback(async () => {
    try {
      if (isLandscape) { await screen.orientation.lock('portrait-primary'); }
      else { await screen.orientation.lock('landscape-primary'); }
    } catch (_) { showCallToast('Rotate your device to switch orientation.', 'info'); }
  }, [isLandscape, showCallToast]);

  // ── WebView audio unlock: fire on first user gesture ─────────────────────
  useEffect(() => {
    const unlock = () => _triggerAudioUnlock();
    document.addEventListener('touchstart', unlock, { once: true, capture: true });
    document.addEventListener('click', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
  }, []);

  // ── Back-swipe / hardware-back interceptor ────────────────────────────────
  // Push two history entries so the WebView has a buffer — even if native
  // Android consumes one "go back" before JavaScript sees it, the second
  // entry is still there and triggers popstate.
  useEffect(() => {
    if (callState !== 'joined') return;
    // Push twice to create a buffer against WebView's native back handling
    window.history.pushState({ lmsCall: true }, '');
    window.history.pushState({ lmsCall: true }, '');
    const onPop = (e) => {
      // Always re-push to keep the buffer alive
      window.history.pushState({ lmsCall: true }, '');
      setLeaveConfirm(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [callState]);

  useEffect(() => {
    let cancelled = false;
    let co = null;
    let timeoutId = null;

    _readyPromise = _readyPromise.then(async () => {
      if (cancelled) return;
      try {
        co = DailyIframe.createCallObject({ audioSource: true, videoSource: true });
      } catch (err) {
        console.error('[Daily] createCallObject failed:', err);
        if (!cancelled) { setError(isPostMessageError(err) ? 'postmessage' : err.message); setCallState('error'); }
        return;
      }
      if (cancelled) { await teardown(co); return; }
      coRef.current = co;

      timeoutId = setTimeout(() => {
        if (co.meetingState?.() !== 'joined-meeting') { setError('timeout'); setCallState('error'); }
      }, 25000);

      co
        .on('joined-meeting', ({ participants: ps }) => {
          clearTimeout(timeoutId);
          setCallState('joined');
          const local = ps?.local;
          if (local) {
            setLocalSessionId(local.session_id);
            updateParticipant(local.session_id, { sessionId: local.session_id, userName: local.user_name || userName || 'You', isLocal: true, ...extractTracks(local) });
          }
        })
        .on('participant-joined', ({ participant: p }) => {
          if (isOwner && bannedIdsRef.current.has(p.user_id || p.user_name)) {
            try { co.updateParticipant(p.session_id, { eject: true }); } catch (_) {}
            return;
          }
          updateParticipant(p.session_id, { sessionId: p.session_id, userName: p.user_name, userId: p.user_id, isLocal: false, isOwnerParticipant: p.owner || false, ...extractTracks(p) });
          if (isOwner) {
            const ls = lockStateRef.current;
            try {
              if (ls.mics)        co.sendAppMessage({ type: 'host-control', action: 'lock-mics',        value: true }, p.session_id);
              if (ls.cams)        co.sendAppMessage({ type: 'host-control', action: 'lock-cams',        value: true }, p.session_id);
              if (ls.screenshare) co.sendAppMessage({ type: 'host-control', action: 'lock-screenshare', value: true }, p.session_id);
              if (ls.chat)        co.sendAppMessage({ type: 'host-control', action: 'lock-chat',        value: true }, p.session_id);
            } catch (_) {}
            // ── Sync active polls to late joiner ─────────────────────────────
            pollsRef.current.filter(poll => !poll.closed).forEach(poll => {
              try {
                co.sendAppMessage({
                  type: 'poll',
                  poll: {
                    id: poll.id, question: poll.question, options: poll.options,
                    closed: false, isQuiz: poll.isQuiz,
                    startedAt: poll.startedAt, duration: poll.duration,
                    correctOption: null,
                  },
                }, p.session_id);
              } catch (_) {}
            });
          }
        })
        .on('participant-updated', ({ participant: p }) => {
          updateParticipant(p.session_id, { sessionId: p.session_id, userName: p.user_name, isLocal: p.local, isOwnerParticipant: p.owner || false, ...extractTracks(p) });
        })
        .on('participant-left', ({ participant: p }) => { removeParticipant(p.session_id); setPinnedId(prev => prev === p.session_id ? null : prev); })
        .on('track-started', ({ participant: p, track }) => {
          if (!track || !p) return;
          if (track.kind === 'video' && track.label?.toLowerCase().includes('screen')) {
            updateParticipant(p.session_id, { screenVideoTrack: track });
          } else {
            updateParticipant(p.session_id, { [track.kind + 'Track']: track });
          }
        })
        .on('track-stopped', ({ participant: p, track }) => {
          if (!track || !p) return;
          if (track.kind === 'video' && track.label?.toLowerCase().includes('screen')) {
            updateParticipant(p.session_id, { screenVideoTrack: null });
          } else {
            updateParticipant(p.session_id, { [track.kind + 'Track']: null });
          }
        })
        .on('app-message', ({ data }) => {
          if (data?.type === 'chat') {
            setMessages(prev => [...prev, {
              id: Date.now() + Math.random(),
              name: data.name || 'Participant',
              text: data.text,
              ts: Date.now(),
              isLocal: false,
              isFromHost: !!data.isHost,
              senderId: data.senderId || null,
            }]);
            setSidebarOpen(prev => { if (!prev) setUnreadCount(c => c + 1); return prev; });
          }

          // Poll/quiz launched by host
          if (data?.type === 'poll') {
            setPolls(prev => {
              if (prev.find(p => p.id === data.poll.id)) return prev;
              return [...prev, { ...data.poll, votes: {} }];
            });
            setSidebarOpen(prev => { if (!prev) setUnreadCount(c => c + 1); return prev; });
          }

          // Vote received (host tallies; also tracks order for quiz leaderboard)
          if (data?.type === 'poll-vote' && isOwner) {
            setPolls(prev => prev.map(p => {
              if (p.id !== data.pollId) return p;
              const votes = { ...p.votes };
              if (data.prevOption !== undefined && data.prevOption !== null) {
                votes[data.prevOption] = Math.max(0, (votes[data.prevOption] || 0) - 1);
              }
              votes[data.option] = (votes[data.option] || 0) + 1;
              return { ...p, votes };
            }));
            setPollVoteOrder(prev => {
              const existing = prev[data.pollId] || [];
              const filtered = (data.prevOption !== null && data.prevOption !== undefined)
                ? existing.filter(v => v.name !== (data.name || 'Student'))
                : existing;
              return { ...prev, [data.pollId]: [...filtered, { name: data.name || 'Student', option: data.option, ts: data.ts || Date.now() }] };
            });
          }

          // Poll/quiz closed — may carry correctOption + leaderboard
          if (data?.type === 'poll-close') {
            const closedAt = data.closedAt || Date.now();
            setPolls(prev => prev.map(p => p.id === data.pollId ? {
              ...p, closed: true, votes: data.votes || p.votes,
              correctOption: data.correctOption !== undefined ? data.correctOption : p.correctOption,
              revealed: true, closedAt,
            } : p));
            if (data.leaderboard) {
              setQuizLeaderboards(prev => ({ ...prev, [data.pollId]: data.leaderboard }));
            }
          }

          // "end-for-all" exits EVERYONE (including co-hosts/teachers) before room is deleted
          if (data?.type === 'host-control' && data?.action === 'end-for-all') {
            co.leave().catch(() => {});
          }

          // Host-control messages (non-owners / students only)
          if (data?.type === 'host-control' && !isOwner) {
            const { action, value } = data;
            if (action === 'lock-mics')       { setIsMicsLocked(value); if (value) { co.setLocalAudio(false); setIsMuted(true); } }
            if (action === 'lock-cams')       { setIsCamsLocked(value); if (value) { co.setLocalVideo(false); setIsCamOff(true); } }
            if (action === 'lock-screenshare') {
              setIsScreenShareLocked(value);
              if (value && co.screenVideoSendState?.() === 'sending') { co.stopScreenShare().catch(() => {}); setIsScreenSharing(false); }
            }
            if (action === 'lock-chat')       setIsChatLocked(value);
            if (action === 'cameras-off')     { co.setLocalVideo(false); setIsCamOff(true); }
            if (action === 'mute-all')        { co.setLocalAudio(false); setIsMuted(true); }
            if (action === 'screenshare-off-all') { co.stopScreenShare().catch(() => {}); setIsScreenSharing(false); }
            if (action === 'removed')         { showCallToast('You were removed from the session.', 'warn'); setTimeout(() => co.leave().catch(() => {}), 1500); }
            if (action === 'banned')          { showCallToast('You have been banned from this session.', 'warn'); setTimeout(() => co.leave().catch(() => {}), 1500); }
          }
        })
        .on('recording-started', () => {
          setIsRecording(true);
          if (isOwner) showCallToast('Cloud recording started.', 'info');
        })
        .on('recording-stopped', () => {
          setIsRecording(false);
        })
        .on('recording-error', ({ error }) => {
          setIsRecording(false);
          console.error('[Daily] recording error:', error);
          if (isOwner) showCallToast('Recording error — check Daily.co plan.', 'warn');
        })
        .on('left-meeting', () => { clearTimeout(timeoutId); onLeave?.(); })
        .on('error', (evt) => { console.error('[Daily] error event:', evt); clearTimeout(timeoutId); setError(evt?.error?.msg || evt?.errorMsg || 'Connection error'); setCallState('error'); })
        .on('camera-error', () => { showCallToast('Camera unavailable — continuing without video.', 'warn'); setIsCamOff(true); });

      /* ── Permission check: fall back gracefully instead of hard-blocking ── */
      let startVideoOff = false;
      let startAudioOff = false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (permErr) {
        console.warn('[Daily] full media denied, trying audio-only:', permErr);
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          audioStream.getTracks().forEach(t => t.stop());
          startVideoOff = true;
          if (!cancelled) showCallToast('Camera unavailable — joining with audio only.', 'warn');
        } catch (audioErr) {
          console.warn('[Daily] audio also denied, joining as listener:', audioErr);
          startVideoOff = true;
          startAudioOff = true;
          if (!cancelled) showCallToast('Camera & mic unavailable — joining as listener.', 'warn');
        }
      }

      const joinParams = { url: roomUrl };
      if (token) joinParams.token = token;
      if (userName) joinParams.userName = userName;
      if (startVideoOff) joinParams.startVideoOff = true;
      if (startAudioOff) joinParams.startAudioOff = true;
      console.log('[Daily] joining room:', roomUrl);
      try {
        await co.join(joinParams);
      } catch (err) {
        console.error('[Daily] join failed:', err, 'roomUrl:', roomUrl);
        if (!cancelled) {
          clearTimeout(timeoutId);
          const msg = isPostMessageError(err) ? 'postmessage' : (err.message || err?.errorMsg || err?.error?.msg || JSON.stringify(err) || 'Failed to join');
          setError(msg); setCallState('error');
        }
      }
    }).catch(err => { if (!err?.message?.includes('postMessage')) console.warn('[DailyVideoCall]', err); });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      const c = co;
      _readyPromise = _readyPromise.then(() => teardown(c)).catch(() => {});
    };
  }, [roomUrl, token, isOwner, userName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sidebarOpen && sidebarTab === 'chat') {
      setUnreadCount(0);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [sidebarOpen, sidebarTab, messages.length]);

  useEffect(() => {
    if (callState === 'joined' && isOwner && !isRecording) {
      const t = setTimeout(() => { startLocalRecording(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [callState, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Student screen-record protection ─────────────────────────────────────
  useEffect(() => {
    if (isOwner) return;

    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = async (...args) => {
        showCallToast('Screen recording is not permitted in this session.', 'warn');
        throw new DOMException('Permission denied by the session host.', 'NotAllowedError');
      };
    }

    const handleKey = (e) => {
      const blocked = e.key === 'PrintScreen'
        || (e.shiftKey && e.metaKey && e.key === 's')
        || (e.shiftKey && e.metaKey && e.key === '4')
        || (e.shiftKey && e.metaKey && e.key === '5')
        || (e.ctrlKey && e.shiftKey && e.key === 'S');
      if (blocked) {
        e.preventDefault();
        showCallToast('Screenshots are not permitted in this session.', 'warn');
      }
    };

    window.addEventListener('keydown', handleKey, true);
    const handleContext = (e) => { if (e.target.tagName === 'VIDEO') e.preventDefault(); };
    document.addEventListener('contextmenu', handleContext);

    return () => {
      window.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('contextmenu', handleContext);
      if (navigator.mediaDevices && origGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePin = useCallback((sid) => setPinnedId(prev => prev === sid ? null : sid), []);

  const toggleMute = () => {
    if (!isOwner && isMicsLocked) { showCallToast('Microphone is locked by the host.', 'warn'); return; }
    coRef.current?.setLocalAudio(isMuted); setIsMuted(m => !m);
  };
  const toggleCam = () => {
    if (!isOwner && isCamsLocked) { showCallToast('Camera is locked by the host.', 'warn'); return; }
    coRef.current?.setLocalVideo(isCamOff); setIsCamOff(c => !c);
  };

  const startLocalRecording = () => {
    if (!isOwner || recorderRef.current) return;
    const co = coRef.current;
    if (!co) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 720;
      recCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      recAudioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      // Mix all participant audio into the recording
      const allParticipants = co.participants ? Object.values(co.participants()) : [];
      allParticipants.forEach(p => {
        if (p.audioTrack) {
          try {
            const src = audioCtx.createMediaStreamSource(new MediaStream([p.audioTrack]));
            src.connect(dest);
          } catch (_) {}
        }
      });
      const drawFrame = () => {
        recAnimRef.current = requestAnimationFrame(drawFrame);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const vids = document.querySelectorAll('video');
        if (vids.length > 0) {
          try { ctx.drawImage(vids[0], 0, 0, canvas.width, canvas.height); } catch (_) {}
        }
      };
      drawFrame();
      const videoStream = canvas.captureStream(24);
      const combined = new MediaStream([...videoStream.getTracks(), ...dest.stream.getTracks()]);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_000_000 });
      recChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) recChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        cancelAnimationFrame(recAnimRef.current);
        recAnimRef.current = null;
        const blob = new Blob(recChunksRef.current, { type: mimeType });
        recChunksRef.current = [];
        const filename = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showCallToast('Recording downloaded to your device.', 'info');
      };
      recorder.start(5000);
      recorderRef.current = recorder;
      setIsRecording(true);
      showCallToast('Recording started.', 'info');
    } catch (err) {
      console.warn('[Rec] startLocalRecording failed:', err);
      showCallToast('Could not start recording on this device.', 'warn');
    }
  };

  const stopLocalRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (recAudioCtxRef.current) { recAudioCtxRef.current.close().catch(() => {}); recAudioCtxRef.current = null; }
    if (recAnimRef.current) { cancelAnimationFrame(recAnimRef.current); recAnimRef.current = null; }
    recCanvasRef.current = null;
    setIsRecording(false);
  };

  const leaveCall = async () => {
    if (isOwner && isRecording) stopLocalRecording();
    coRef.current?.leave();
  };

  const toggleScreenShare = async () => {
    if (!coRef.current) return;
    if (!isOwner && isScreenShareLocked) { showCallToast('Screen sharing is locked by the host.', 'warn'); return; }
    if (IS_IOS) { showCallToast('Screen share is not supported on iPhone/iPad.', 'warn'); return; }
    if (IS_MOBILE && !navigator.mediaDevices?.getDisplayMedia) { showCallToast('Screen share not supported on this device.', 'warn'); return; }
    try {
      if (isScreenSharing) { await coRef.current.stopScreenShare()?.catch?.(() => {}); setIsScreenSharing(false); }
      else { await coRef.current.startScreenShare(); setIsScreenSharing(true); }
    } catch (err) {
      setIsScreenSharing(false);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('blocked')) showCallToast('Permission denied. Allow screen share in browser settings.', 'warn');
    }
  };

  const toggleRecording = () => {
    if (!isOwner) return;
    if (isRecording) stopLocalRecording();
    else startLocalRecording();
  };

  const sendChat = () => {
    if (!isOwner && isChatLocked) { showCallToast('Chat is disabled by the host.', 'warn'); return; }
    const text = chatInput.trim();
    if (!text || !coRef.current) return;
    try {
      const localId = coRef.current.participants()?.local?.session_id || null;
      coRef.current.sendAppMessage({ type: 'chat', text, name: userName || 'Me', isHost: isOwner, senderId: localId }, '*');
      setMessages(prev => [...prev, { id: Date.now(), name: userName || 'Me', text, ts: Date.now(), isLocal: true, isFromHost: isOwner }]);
      setChatInput('');
    } catch (_) {}
  };

  // ── Poll / Quiz helpers ────────────────────────────────────────────────────
  const launchPoll = () => {
    const q = pollDraft.question.trim();
    const opts = pollDraft.options.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) { showCallToast('Add a question and at least 2 options.', 'warn'); return; }
    if (pollDraft.isQuiz && pollDraft.correctOption === null) { showCallToast('Select the correct answer for quiz mode.', 'warn'); return; }
    const startedAt = Date.now();
    const poll = {
      id: `poll_${startedAt}`,
      question: q, options: opts, votes: {}, closed: false,
      isQuiz: pollDraft.isQuiz,
      correctOption: pollDraft.isQuiz ? pollDraft.correctOption : null,
      startedAt, duration: 30, revealed: false,
    };
    setPolls(prev => [...prev, poll]);
    try {
      coRef.current?.sendAppMessage({
        type: 'poll',
        poll: {
          id: poll.id, question: q, options: opts, closed: false,
          isQuiz: poll.isQuiz, startedAt, duration: 30,
          correctOption: null, // keep correct answer hidden from students until reveal
        },
      }, '*');
    } catch (_) {}
    setPollModal(false);
    setPollDraft({ question: '', options: ['', ''], isQuiz: false, correctOption: null });
    setSidebarOpen(true); setSidebarTab('chat');
    showCallToast(poll.isQuiz ? 'Quiz launched — 30 seconds!' : 'Poll launched!', 'info');
  };

  const saveToBank = () => {
    const q = pollDraft.question.trim();
    const opts = pollDraft.options.map(o => o.trim()).filter(Boolean);
    if (!q) { showCallToast('Enter a question first.', 'warn'); return; }
    if (opts.length < 2) { showCallToast('Add at least 2 options.', 'warn'); return; }
    if (pollDraft.correctOption === null) { showCallToast('Select the correct answer to save to bank.', 'warn'); return; }
    setQuizBank(prev => [...prev, { id: `bq_${Date.now()}`, question: q, options: opts, correctOption: pollDraft.correctOption }]);
    setPollDraft({ question: '', options: ['', ''], isQuiz: true, correctOption: null });
    showCallToast('Quiz saved to bank!', 'info');
  };

  const launchFromBank = (item) => {
    const startedAt = Date.now();
    const poll = {
      id: `poll_${startedAt}`, question: item.question, options: item.options,
      votes: {}, closed: false, isQuiz: true, correctOption: item.correctOption,
      startedAt, duration: 30, revealed: false,
    };
    setPolls(prev => [...prev, poll]);
    try {
      coRef.current?.sendAppMessage({
        type: 'poll',
        poll: { id: poll.id, question: item.question, options: item.options, closed: false, isQuiz: true, startedAt, duration: 30, correctOption: null },
      }, '*');
    } catch (_) {}
    setPollModal(false);
    setSidebarOpen(true); setSidebarTab('chat');
    showCallToast('Quiz launched — 30 seconds!', 'info');
  };

  // Compute leaderboard and broadcast quiz close
  const closeQuiz = useCallback((pollId) => {
    const poll = pollsRef.current.find(p => p.id === pollId);
    if (!poll || poll.closed) return;
    const voteOrder = pollVoteOrderRef.current[pollId] || [];
    let leaderboard = [];
    if (poll.correctOption !== null) {
      const correct = voteOrder.filter(v => v.option === poll.correctOption).sort((a, b) => a.ts - b.ts);
      const wrong   = voteOrder.filter(v => v.option !== poll.correctOption).sort((a, b) => a.ts - b.ts);
      leaderboard = [
        ...correct.map((v, i) => ({ name: v.name, rank: i + 1, correct: true })),
        ...wrong.map((v, i)   => ({ name: v.name, rank: correct.length + i + 1, correct: false })),
      ];
    } else {
      leaderboard = voteOrder.sort((a, b) => a.ts - b.ts).map((v, i) => ({ name: v.name, rank: i + 1, correct: null, option: v.option }));
    }
    const closedAt = Date.now();
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, closed: true, revealed: true, closedAt } : p));
    setQuizLeaderboards(prev => ({ ...prev, [pollId]: leaderboard }));
    try {
      coRef.current?.sendAppMessage({
        type: 'poll-close',
        pollId, votes: poll.votes,
        correctOption: poll.correctOption,
        leaderboard, closedAt,
      }, '*');
    } catch (_) {}
  }, []);

  const closePoll = (pollId) => {
    const poll = pollsRef.current.find(p => p.id === pollId);
    if (!poll || poll.closed) return;
    if (poll.isQuiz) { closeQuiz(pollId); return; }
    const closedAt = Date.now();
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, closed: true, closedAt } : p));
    try { coRef.current?.sendAppMessage({ type: 'poll-close', pollId, votes: poll.votes, closedAt }, '*'); } catch (_) {}
  };

  const castVote = (pollId, optionIdx) => {
    const prevOption = myVotes[pollId] !== undefined ? myVotes[pollId] : null;
    if (prevOption === optionIdx) return;
    setMyVotes(prev => ({ ...prev, [pollId]: optionIdx }));
    try {
      coRef.current?.sendAppMessage({
        type: 'poll-vote', pollId, option: optionIdx, prevOption,
        name: userName || 'Student', ts: Date.now(),
      }, '*');
    } catch (_) {}
  };

  const muteParticipant = (sessionId, mute) => {
    if (!coRef.current || !isOwner) return;
    try { coRef.current.updateParticipant(sessionId, { setAudio: !mute }); } catch (_) {}
  };
  const turnOffCamera = (sessionId) => {
    if (!coRef.current || !isOwner) return;
    try { coRef.current.updateParticipant(sessionId, { setVideo: false }); } catch (_) {}
    updateParticipant(sessionId, { videoTrack: null, videoMuted: true });
  };

  const muteAll = () => {
    if (!coRef.current || !isOwner) return;
    Object.values(coRef.current.participants()).forEach(p => {
      if (!p.local) {
        try { coRef.current.updateParticipant(p.session_id, { setAudio: false }); } catch (_) {}
        updateParticipant(p.session_id, { audioTrack: null, audioMuted: true });
      }
    });
    broadcastHostControl('mute-all', true);
    showCallToast('All microphones muted.', 'info');
  };

  const camerasOff = () => {
    if (!coRef.current || !isOwner) return;
    Object.values(coRef.current.participants()).forEach(p => {
      if (!p.local) {
        try { coRef.current.updateParticipant(p.session_id, { setVideo: false }); } catch (_) {}
        updateParticipant(p.session_id, { videoTrack: null, videoMuted: true });
      }
    });
    broadcastHostControl('cameras-off', true);
    showCallToast('All cameras turned off.', 'info');
  };

  const screenShareOffAll = () => {
    if (!coRef.current || !isOwner) return;
    if (isScreenSharing) { coRef.current.stopScreenShare()?.catch(() => {}); setIsScreenSharing(false); }
    broadcastHostControl('screenshare-off-all', true);
    showCallToast('All screen shares stopped.', 'info');
  };

  const toggleLockMics = () => {
    if (!isOwner) return; const next = !isMicsLocked;
    setIsMicsLocked(next); broadcastHostControl('lock-mics', next);
    if (next) muteAll();
    showCallToast(next ? 'Microphones locked.' : 'Microphones unlocked.', 'info');
  };
  const toggleLockCams = () => {
    if (!isOwner) return; const next = !isCamsLocked;
    setIsCamsLocked(next); broadcastHostControl('lock-cams', next);
    if (next) camerasOff();
    showCallToast(next ? 'Cameras locked.' : 'Cameras unlocked.', 'info');
  };
  const toggleLockScreenShare = () => {
    if (!isOwner) return; const next = !isScreenShareLocked;
    setIsScreenShareLocked(next); broadcastHostControl('lock-screenshare', next);
    showCallToast(next ? 'Screen sharing locked.' : 'Screen sharing unlocked.', 'info');
  };
  const toggleLockChat = () => {
    if (!isOwner) return; const next = !isChatLocked;
    setIsChatLocked(next); broadcastHostControl('lock-chat', next);
    showCallToast(next ? 'Chat disabled for students.' : 'Chat enabled for students.', 'info');
  };

  const endForAll = async () => {
    if (!coRef.current || !isOwner) return;
    broadcastHostControl('end-for-all', true);

    if (isRecording) stopLocalRecording();
    await new Promise(r => setTimeout(r, 600));
    coRef.current?.leave().catch(() => {});
  };

  const ejectParticipant = useCallback((p) => {
    if (!coRef.current || !isOwner) return;
    try { coRef.current.sendAppMessage({ type: 'host-control', action: 'removed', value: true }, p.sessionId); } catch (_) {}
    setTimeout(() => { try { coRef.current.updateParticipant(p.sessionId, { eject: true }); } catch (_) {} }, 600);
    showCallToast(`${p.userName} was removed.`, 'info');
  }, [isOwner, showCallToast]);

  const banParticipant = useCallback((p) => {
    if (!coRef.current || !isOwner) return;
    const banKey = p.userId || p.userName;
    bannedIdsRef.current = new Set([...bannedIdsRef.current, banKey]);
    setBannedIds(new Set(bannedIdsRef.current));
    try { coRef.current.sendAppMessage({ type: 'host-control', action: 'banned', value: true }, p.sessionId); } catch (_) {}
    setTimeout(() => { try { coRef.current.updateParticipant(p.sessionId, { eject: true }); } catch (_) {} }, 600);
    showCallToast(`${p.userName} was banned.`, 'info');
  }, [isOwner, showCallToast]);

  const openSidebar = (tab) => {
    setSidebarTab(tab); setSidebarOpen(true);
    if (tab === 'chat') setUnreadCount(0);
  };

  // ─── Error screen ──────────────────────────────────────────────────────────
  if (callState === 'error') {
    const isCameraErr = error === 'camera', isTimeout = error === 'timeout', isEnvErr = error === 'postmessage';
    const isWebViewCamera = isCameraErr && IS_WEBVIEW;
    const openInChrome = () => {
      const intent = window.location.href.replace(/^https?:\/\//, 'intent://') + '#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;end';
      window.location.href = intent;
    };
    const title = isWebViewCamera ? 'Camera Access Required' : isCameraErr ? 'Camera Access Denied' : isTimeout ? 'Connection Timed Out' : isEnvErr ? 'Open App Directly to Join' : 'Could Not Connect';
    const message = isWebViewCamera ? 'Your app needs camera and microphone access. Tap below to open in Chrome.' : isCameraErr ? 'Please allow camera and microphone access in your browser settings, then try again.' : isTimeout ? 'The connection took too long. Check your internet and try again.' : isEnvErr ? 'Your browser is blocking video access. Open the app in a full browser tab.' : error;
    const icon = isWebViewCamera ? 'open_in_browser' : isCameraErr ? 'no_photography' : isEnvErr ? 'open_in_new' : 'signal_wifi_bad';
    return (
      <div className="bg-slate-900 min-h-screen flex flex-col items-center justify-center text-white gap-6 px-6 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isWebViewCamera ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <span className={`material-symbols-outlined text-4xl ${isWebViewCamera ? 'text-blue-400' : 'text-red-400'}`}>{icon}</span>
        </div>
        <div className="space-y-2"><h2 className="text-xl font-bold">{title}</h2><p className="text-slate-400 text-sm max-w-xs leading-relaxed">{message}</p></div>
        {isWebViewCamera && (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <button onClick={openInChrome} className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 active:scale-95 transition-all shadow-xl">
              <span className="material-symbols-outlined text-base">open_in_browser</span>Open in Chrome
            </button>
            <p className="text-slate-500 text-xs">Live classes require camera &amp; mic access</p>
          </div>
        )}
        {isCameraErr && !isWebViewCamera && (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            {/* Primary: join anyway without camera */}
            <button
              onClick={() => { setError(null); setCallState('joining'); setIsCamOff(true); setIsMuted(true); }}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all shadow-xl"
            >
              <span className="material-symbols-outlined text-base">headphones</span>
              Join as Listener (no cam/mic)
            </button>
            {/* Secondary: fix instructions */}
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 w-full text-left space-y-1.5">
              <p className="text-orange-300 text-xs font-bold uppercase tracking-widest">Or enable camera</p>
              <p className="text-orange-200 text-xs">1. Click the camera icon in the address bar</p>
              <p className="text-orange-200 text-xs">2. Set Camera &amp; Microphone to Allow</p>
              <p className="text-orange-200 text-xs">3. Refresh and try again</p>
            </div>
          </div>
        )}
        {isEnvErr && (
          <a href={window.location.origin + window.location.pathname} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-base">open_in_new</span>Open App in Full Tab
          </a>
        )}
        <button onClick={onLeave} className="px-6 py-3 rounded-2xl bg-white/10 text-white text-sm font-semibold hover:bg-white/15 transition-colors">Go Back</button>
      </div>
    );
  }

  // ─── Call screen ────────────────────────────────────────────────────────────
  const participantList = Array.from(participants.values());
  const remotes = participantList.filter(p => !p.isLocal && (isOwner || p.isOwnerParticipant));
  const local = participantList.find(p => p.isLocal);
  const count = participants.size;
  const activeScreen = participantList.find(p => p.screenVideoTrack);
  const pinnedParticipant = pinnedId ? participantList.find(p => p.sessionId === pinnedId) : null;
  const unpinnedParticipants = pinnedParticipant ? participantList.filter(p => p.sessionId !== pinnedId) : [];

  // Students see only the host + themselves in People tab (not other students)
  const peopleTabList = isOwner
    ? participantList
    : participantList.filter(p => p.isLocal || p.isOwnerParticipant);

  const gridClass = remotes.length === 0 ? 'grid-cols-1'
    : remotes.length === 1 ? 'grid-cols-1'
    : remotes.length <= 4 ? 'grid-cols-1 sm:grid-cols-2'
    : 'grid-cols-2 sm:grid-cols-3';

  const LockBadge = ({ active, label }) => active ? (
    <span className="ml-auto text-[9px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full uppercase tracking-wide">{label}</span>
  ) : null;

  return (
    <div className="bg-slate-900 h-dvh flex flex-col overflow-hidden relative">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-sm">school</span>
          </div>
          <span className="text-white text-sm font-bold font-headline">Live</span>
          {callState === 'joined' && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-red-400 text-[10px] font-bold">LIVE</span>
            </div>
          )}
          {isRecording && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-700/40 border border-red-600/50">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-red-300 text-[10px] font-bold">REC</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {callState === 'joined' && isOwner && (
            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-full border border-white/10">
              <span className="material-symbols-outlined text-slate-300" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>group</span>
              <span className="text-white text-xs font-bold">{count}</span>
              <span className="text-slate-400 text-xs hidden sm:inline">{count === 1 ? 'participant' : 'participants'}</span>
            </div>
          )}
          {callState === 'loading' && (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="hidden sm:inline">Connecting...</span>
            </div>
          )}
          {callState === 'joined' && (
            <div className="flex items-center gap-1">
              <button onClick={() => openSidebar('chat')}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${sidebarOpen && sidebarTab === 'chat' ? 'bg-primary' : 'bg-white/10 hover:bg-white/20'}`}>
                <span className="material-symbols-outlined text-base">chat</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>
                )}
              </button>
              {isOwner && (
                <button onClick={() => openSidebar('participants')}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${sidebarOpen && sidebarTab === 'participants' ? 'bg-primary' : 'bg-white/10 hover:bg-white/20'}`}>
                  <span className="material-symbols-outlined text-base">group</span>
                </button>
              )}
              {isOwner && (
                <button onClick={() => openSidebar('controls')}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${sidebarOpen && sidebarTab === 'controls' ? 'bg-primary' : 'bg-white/10 hover:bg-white/20'}`}>
                  <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                </button>
              )}
              <button onClick={() => openSidebar('settings')}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${sidebarOpen && sidebarTab === 'settings' ? 'bg-primary' : 'bg-white/10 hover:bg-white/20'}`}
                title="Settings">
                <span className="material-symbols-outlined text-base">settings</span>
                {noiseCancellation && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-400" />}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Body: video + sidebar ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Video area ── */}
        <div className="flex-1 relative overflow-hidden p-2" onClick={() => sidebarOpen && setSidebarOpen(false)}>

          {/* ── Student watermark — deters screen recording (single CSS div, no React churn) ── */}
          {!isOwner && callState === 'joined' && (
            <WatermarkOverlay label={userName || 'Student'} />
          )}

          {/* ── T.E.R.M. Edu brand badge ── */}
          {callState === 'joined' && (
            <div
              aria-hidden="true"
              style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 24, pointerEvents: 'none' }}
              className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-2.5 py-1"
            >
              <img src="/term-icon.png" alt="" className="w-4 h-4 rounded-sm object-contain flex-shrink-0 opacity-90" />
              <span className="text-white/70 text-[10px] font-bold tracking-wide select-none">T.E.R.M. Edu</span>
            </div>
          )}

          {callState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
              <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-white text-base font-medium">Joining live class...</p>
            </div>
          )}
          {callState === 'joined' && (
            <>
              {activeScreen ? (
                <div className="flex flex-col h-full gap-2">
                  <div className="flex-1 min-h-0"><ScreenTile track={activeScreen.screenVideoTrack} /></div>
                  <div className="flex gap-2 h-16 sm:h-24 flex-shrink-0 overflow-x-auto pb-0.5">
                    {remotes.map(p => (
                      <div key={p.sessionId || p.userName} className="w-28 sm:w-36 flex-shrink-0 h-full">
                        <VideoTile videoTrack={p.videoTrack} audioTrack={p.audioTrack} userName={p.userName} isLocal={false} isSmall />
                      </div>
                    ))}
                    {local && (
                      <div className="w-28 sm:w-36 flex-shrink-0 h-full">
                        <VideoTile videoTrack={local.videoTrack} audioTrack={local.audioTrack} userName="You" isLocal isSmall />
                      </div>
                    )}
                  </div>
                </div>
              ) : pinnedParticipant ? (
                <div className="flex flex-col h-full gap-2">
                  <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                    <VideoTile videoTrack={pinnedParticipant.videoTrack} audioTrack={pinnedParticipant.audioTrack}
                      userName={pinnedParticipant.isLocal ? 'You' : pinnedParticipant.userName}
                      isLocal={pinnedParticipant.isLocal} isMuted={pinnedParticipant.audioMuted} isPinned large
                      sessionId={pinnedParticipant.sessionId} onPin={togglePin} />
                  </div>
                  {unpinnedParticipants.length > 0 && (
                    <div className="flex gap-2 h-16 sm:h-28 flex-shrink-0 overflow-x-auto pb-1">
                      {unpinnedParticipants.map(p => (
                        <div key={p.sessionId || p.userName} className="w-28 sm:w-44 flex-shrink-0 h-full relative group/thumb">
                          <VideoTile videoTrack={p.videoTrack} audioTrack={p.audioTrack} userName={p.isLocal ? 'You' : p.userName} isLocal={p.isLocal} isMuted={p.audioMuted} isSmall />
                          <button onClick={(e) => { e.stopPropagation(); togglePin(p.sessionId); }}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 text-white opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity hover:bg-yellow-400 hover:text-slate-900"
                            title="Pin"><span className="material-symbols-outlined" style={{ fontSize: '13px' }}>push_pin</span></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={`grid ${gridClass} gap-2 h-full`}>
                  {remotes.map(p => (
                    <VideoTile key={p.sessionId || p.userName} videoTrack={p.videoTrack} audioTrack={p.audioTrack} userName={p.userName} isLocal={false} isMuted={p.audioMuted} isPinned={pinnedId === p.sessionId} sessionId={p.sessionId} onPin={togglePin} />
                  ))}
                  {local && remotes.length > 0 && (
                    <div className="absolute bottom-4 right-4 w-20 sm:w-28 z-20 rounded-xl overflow-hidden shadow-2xl border border-white/10">
                      <VideoTile videoTrack={local.videoTrack} audioTrack={local.audioTrack} userName="You" isLocal isSmall />
                    </div>
                  )}
                  {remotes.length === 0 && local && (
                    <VideoTile videoTrack={local.videoTrack} audioTrack={local.audioTrack} userName="You" isLocal isPinned={pinnedId === local.sessionId} sessionId={local.sessionId} onPin={togglePin} />
                  )}
                  {remotes.length === 0 && !local && (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 h-full">
                      <span className="material-symbols-outlined text-5xl">group</span>
                      <p className="text-sm">Waiting for participants...</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <div className="fixed sm:relative inset-0 sm:inset-auto z-40 sm:z-auto w-full sm:w-72 flex-shrink-0 bg-slate-800 sm:border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              <div className="flex gap-1">
                {[
                  { key: 'chat', icon: 'chat', label: 'Chat' },
                  ...(isOwner ? [{ key: 'participants', icon: 'group', label: 'People' }] : []),
                  ...(isOwner ? [{ key: 'controls', icon: 'admin_panel_settings', label: 'Controls' }] : []),
                  { key: 'settings', icon: 'settings', label: 'Settings' },
                ].map(t => (
                  <button key={t.key} onClick={() => setSidebarTab(t.key)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${sidebarTab === t.key ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                    <span className="material-symbols-outlined text-sm">{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* ── Chat tab ── */}
            {sidebarTab === 'chat' && (
              <>
                {!isOwner && (
                  <div className="mx-3 mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-700/60 border border-white/5 flex-shrink-0">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '13px' }}>visibility_off</span>
                    <span className="text-slate-400 text-[10px]">Only you and the host can see your messages</span>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                  {(() => {
                    const visibleMessages = isOwner ? messages : messages.filter(m => m.isLocal || m.isFromHost);
                    const timeline = [
                      ...visibleMessages.map(m => ({ _kind: 'msg', _ts: m.ts, ...m })),
                      ...polls.map(p => ({ _kind: 'poll', _ts: p.id ? parseInt(p.id.replace('poll_', '')) || 0 : 0, ...p })),
                    ].sort((a, b) => a._ts - b._ts);

                    if (timeline.length === 0) return (
                      <div className="text-center text-slate-500 text-xs mt-8">
                        <span className="material-symbols-outlined text-3xl block mb-2 opacity-40">chat_bubble</span>
                        No messages yet. Say hello!
                      </div>
                    );

                    return timeline.map(item => {
                      if (item._kind === 'msg') {
                        return (
                          <div key={item.id} className={`flex flex-col gap-0.5 ${item.isLocal ? 'items-end' : 'items-start'}`}>
                            <span className="text-slate-500 text-[10px] px-1 flex items-center gap-1">
                              {item.name}
                              {item.isFromHost && <span className="text-[9px] font-bold text-violet-400 bg-violet-500/15 px-1 rounded">HOST</span>}
                            </span>
                            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${item.isLocal ? 'bg-primary text-white rounded-br-sm' : item.isFromHost ? 'bg-violet-600/30 text-slate-100 border border-violet-500/30 rounded-bl-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm'}`}>
                              {item.text}
                            </div>
                          </div>
                        );
                      }

                      // ── Poll / Quiz card ───────────────────────────────────
                      const totalVotes = Object.values(item.votes || {}).reduce((a, b) => a + b, 0);
                      const myVote = myVotes[item.id];
                      const hasVoted = myVote !== undefined;

                      // Countdown for active quizzes
                      const secondsLeft = item.isQuiz && !item.closed && item.startedAt && item.duration
                        ? Math.max(0, item.duration - Math.floor((Date.now() - item.startedAt) / 1000))
                        : null;
                      const isUrgent = secondsLeft !== null && secondsLeft <= 5;

                      // Leaderboard for this poll/quiz
                      const leaderboard = quizLeaderboards[item.id];

                      return (
                        <div key={item.id} className="rounded-2xl bg-slate-700/80 border border-violet-500/20 p-3 space-y-2">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '14px' }}>
                                {item.isQuiz ? 'quiz' : 'poll'}
                              </span>
                              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">
                                {item.isQuiz ? 'Quiz' : 'Poll'}
                              </span>
                              {item.closed && <span className="text-[9px] font-bold text-slate-500 bg-slate-600/60 px-1.5 rounded-full">CLOSED</span>}
                              {/* Countdown timer */}
                              {secondsLeft !== null && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isUrgent ? 'bg-red-500/30 text-red-300 animate-pulse' : 'bg-slate-600/60 text-slate-300'}`}>
                                  {secondsLeft}s
                                </span>
                              )}
                            </div>
                            {isOwner && !item.closed && (
                              <button onClick={() => closePoll(item.id)} className="text-[10px] text-slate-400 hover:text-red-400 transition-colors flex-shrink-0">
                                {item.isQuiz ? 'End quiz' : 'End poll'}
                              </button>
                            )}
                          </div>

                          <p className="text-white text-sm font-semibold leading-snug">{item.question}</p>

                          {/* Correct answer reveal banner — students only, shown after quiz closes */}
                          {item.isQuiz && item.revealed && !isOwner && item.correctOption !== null && (
                            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-green-500/15 border border-green-500/40">
                              <span className="material-symbols-outlined text-green-400 flex-shrink-0" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                              <div>
                                <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Correct Answer</p>
                                <p className="text-white text-xs font-semibold mt-0.5">{item.options[item.correctOption]}</p>
                              </div>
                              {hasVoted && (
                                <div className="ml-auto flex-shrink-0">
                                  {myVote === item.correctOption
                                    ? <span className="text-[9px] font-bold text-green-400 bg-green-500/20 px-2 py-1 rounded-full">✓ You got it!</span>
                                    : <span className="text-[9px] font-bold text-red-400 bg-red-500/20 px-2 py-1 rounded-full">✗ Wrong</span>
                                  }
                                </div>
                              )}
                            </div>
                          )}

                          {/* Options */}
                          <div className="space-y-1.5">
                            {(item.options || []).map((opt, idx) => {
                              const count = item.votes?.[idx] || 0;
                              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                              const isMyVote = myVote === idx;
                              // Correct/wrong highlighting after quiz reveal
                              const isCorrectAnswer = item.isQuiz && item.revealed && item.correctOption === idx;
                              const isWrongMyVote = item.isQuiz && item.revealed && isMyVote && item.correctOption !== idx;
                              // Owner always sees percentages; students NEVER see percentages (only correct/wrong after reveal)
                              const showPct = isOwner;
                              const canVote = !isOwner && !item.closed && !hasVoted;

                              let optBorder = 'border-white/10';
                              let optBg = 'bg-slate-700/50';
                              if (isCorrectAnswer) { optBorder = 'border-green-500/60'; optBg = 'bg-green-500/15'; }
                              else if (isWrongMyVote) { optBorder = 'border-red-500/50'; optBg = 'bg-red-500/10'; }
                              else if (isMyVote && !item.revealed) { optBorder = 'border-violet-500/60'; }

                              return (
                                <button
                                  key={idx}
                                  disabled={!canVote}
                                  onClick={() => canVote && castVote(item.id, idx)}
                                  className={`w-full text-left rounded-xl overflow-hidden relative transition-all border ${optBorder} ${optBg} ${canVote ? 'hover:border-violet-400/60 cursor-pointer' : 'cursor-default'}`}
                                >
                                  {/* Progress bar — host only */}
                                  {showPct && (
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-xl transition-all duration-500"
                                      style={{ width: `${pct}%`, background: isMyVote ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)' }}
                                    />
                                  )}
                                  <div className="relative px-3 py-2 flex items-center justify-between gap-2">
                                    <span className="text-xs text-slate-200 flex items-center gap-1.5">
                                      {isCorrectAnswer && <span className="material-symbols-outlined text-green-400" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
                                      {isWrongMyVote && <span className="material-symbols-outlined text-red-400" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>cancel</span>}
                                      {opt}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {showPct && (
                                        <span className="text-[10px] text-slate-400 font-bold">
                                          {pct}%{isOwner && <span className="ml-0.5 text-slate-500"> ({count})</span>}
                                        </span>
                                      )}
                                      {isMyVote && !isCorrectAnswer && !isWrongMyVote && (
                                        <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Vote count — owner only */}
                          {isOwner && (
                            <p className="text-[10px] text-slate-500 text-right">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                          )}

                          {/* Leaderboard — shown after quiz closes */}
                          {item.isQuiz && item.closed && leaderboard && leaderboard.length > 0 && (
                            <div className="mt-1 rounded-xl bg-slate-800/80 border border-white/5 p-2 space-y-1">
                              <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1">
                                <span className="material-symbols-outlined" style={{ fontSize: '11px', fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                                Results
                              </p>
                              {leaderboard.slice(0, 5).map((entry, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold w-5 text-right flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                                    #{entry.rank}
                                  </span>
                                  <span className="text-xs text-slate-200 flex-1 truncate">{entry.name}</span>
                                  {entry.correct === true && <span className="material-symbols-outlined text-green-400" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
                                  {entry.correct === false && <span className="material-symbols-outlined text-red-400" style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>cancel</span>}
                                </div>
                              ))}
                              {leaderboard.length > 5 && (
                                <p className="text-[9px] text-slate-500 text-center">+{leaderboard.length - 5} more</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-2">
                  <div className="flex gap-2">
                    {isOwner && (
                      <button onClick={() => setPollModal(true)}
                        className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600/15 border border-violet-500/20 hover:bg-violet-600/25 transition-colors text-left">
                        <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '16px' }}>quiz</span>
                        <span className="text-violet-300 text-xs font-semibold">Launch Poll / Quiz</span>
                      </button>
                    )}
                    {Object.keys(quizLeaderboards).length > 0 && (
                      <button onClick={() => setRankingsOpen(true)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500/15 border border-yellow-500/30 hover:bg-yellow-500/25 transition-colors flex-shrink-0 ${!isOwner ? 'flex-1' : ''}`}>
                        <span className="material-symbols-outlined text-yellow-400" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                        <span className="text-yellow-300 text-xs font-semibold">Rankings</span>
                      </button>
                    )}
                  </div>
                  {!isOwner && isChatLocked ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="material-symbols-outlined text-amber-400 text-sm">lock</span>
                      <span className="text-amber-300 text-xs">Chat is disabled by the host</span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Type a message..."
                        className="flex-1 bg-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-slate-500 border border-white/10" />
                      <button onClick={sendChat} disabled={!chatInput.trim()}
                        className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white disabled:opacity-40 transition-opacity hover:bg-primary/90">
                        <span className="material-symbols-outlined text-base">send</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── People tab ── */}
            {sidebarTab === 'participants' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {!isOwner && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-700/60 border border-white/5 mb-1">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '13px' }}>info</span>
                    <span className="text-slate-400 text-[10px]">Showing host and yourself only</span>
                  </div>
                )}
                {peopleTabList.length === 0 && (
                  <p className="text-slate-500 text-xs text-center mt-8">No participants yet</p>
                )}
                {peopleTabList.map(p => (
                  <div key={p.sessionId || p.userName} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/30 border border-primary/40 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(p.userName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white text-xs font-semibold truncate">{p.isLocal ? `${p.userName} (You)` : p.userName}</p>
                        {p.isOwnerParticipant && !p.isLocal && (
                          <span className="text-[8px] font-bold text-violet-400 bg-violet-500/15 px-1 py-0.5 rounded flex-shrink-0">HOST</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`material-symbols-outlined text-[11px] ${p.audioMuted ? 'text-red-400' : 'text-green-400'}`}>{p.audioMuted ? 'mic_off' : 'mic'}</span>
                        <span className={`material-symbols-outlined text-[11px] ${p.videoMuted ? 'text-red-400' : 'text-green-400'}`}>{p.videoMuted ? 'videocam_off' : 'videocam'}</span>
                      </div>
                    </div>
                    {isOwner && !p.isLocal && (
                      <div className="flex gap-1">
                        <button onClick={() => muteParticipant(p.sessionId, !p.audioMuted)} title="Toggle mute"
                          className="w-6 h-6 rounded-lg bg-white/10 hover:bg-red-500/30 flex items-center justify-center transition-colors">
                          <span className="material-symbols-outlined text-slate-300" style={{ fontSize: '13px' }}>{p.audioMuted ? 'mic' : 'mic_off'}</span>
                        </button>
                        <button onClick={() => turnOffCamera(p.sessionId)} title="Turn off camera"
                          className="w-6 h-6 rounded-lg bg-white/10 hover:bg-red-500/30 flex items-center justify-center transition-colors">
                          <span className="material-symbols-outlined text-slate-300" style={{ fontSize: '13px' }}>videocam_off</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Host Controls tab ── */}
            {sidebarTab === 'controls' && isOwner && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {joinUrl && (
                  <div className="bg-slate-700 border border-white/10 rounded-xl p-3 space-y-2">
                    <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Invite Link</p>
                    <p className="text-slate-300 text-xs break-all leading-relaxed">{joinUrl}</p>
                    <button onClick={copyInviteLink}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${inviteCopied ? 'bg-green-600 text-white' : 'bg-primary/80 text-white hover:bg-primary'}`}>
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `'FILL' ${inviteCopied ? 1 : 0}` }}>{inviteCopied ? 'check_circle' : 'content_copy'}</span>
                      {inviteCopied ? 'Link Copied!' : 'Copy Invite Link'}
                    </button>
                  </div>
                )}
                {!IS_IOS && (
                  <button onClick={() => { toggleScreenShare(); setSidebarOpen(false); }}
                    className={`sm:hidden w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors text-left ${isScreenSharing ? 'bg-blue-500/20 border-blue-500/30' : 'bg-slate-700 border-white/10 hover:bg-slate-600'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isScreenSharing ? 'bg-blue-500/30' : 'bg-white/10'}`}>
                      <span className={`material-symbols-outlined text-lg ${isScreenSharing ? 'text-blue-400' : 'text-slate-300'}`}>{isScreenSharing ? 'stop_screen_share' : 'screen_share'}</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">{isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}</p>
                      <p className="text-slate-500 text-xs">Share your screen with participants</p>
                    </div>
                  </button>
                )}

                <div className="flex items-center gap-2 px-1 pt-1">
                  <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Recording</p>
                  {isRecording && <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">Auto</span>}
                </div>
                {isRecording && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <p className="text-red-400 text-xs">Recording in progress — will download to your device when you stop or end the class.</p>
                  </div>
                )}
                <button onClick={toggleRecording}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors text-left ${isRecording ? 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30' : 'bg-slate-700 border-white/10 hover:bg-slate-600'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isRecording ? 'bg-red-500/40' : 'bg-white/10'}`}>
                    <span className={`material-symbols-outlined text-lg ${isRecording ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{isRecording ? 'stop_circle' : 'radio_button_checked'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{isRecording ? 'Stop Recording' : 'Start Recording'}</p>
                    <p className="text-slate-500 text-xs">{isRecording ? 'Stops and downloads to your device' : 'Records locally — downloads to your device'}</p>
                  </div>
                </button>

                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1 pt-2">Session</p>
                <button onClick={endForAll}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-red-600/20 border border-red-500/40 hover:bg-red-600/30 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-red-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-red-400 text-lg">call_end</span>
                  </div>
                  <div>
                    <p className="text-red-300 text-sm font-semibold">End for All</p>
                    <p className="text-slate-500 text-xs">Removes all participants & emails results</p>
                  </div>
                </button>

                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1 pt-2">Quick Actions</p>
                <button onClick={muteAll} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-700 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-slate-300 text-lg">mic_off</span></div>
                  <div><p className="text-white text-sm font-semibold">Mute All</p><p className="text-slate-500 text-xs">Instantly mutes all students</p></div>
                </button>
                <button onClick={camerasOff} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-700 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-slate-300 text-lg">videocam_off</span></div>
                  <div><p className="text-white text-sm font-semibold">Cameras Off</p><p className="text-slate-500 text-xs">Turns off all student cameras</p></div>
                </button>
                <button onClick={screenShareOffAll} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-700 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-slate-300 text-lg">cancel_presentation</span></div>
                  <div><p className="text-white text-sm font-semibold">Screen Share Off</p><p className="text-slate-500 text-xs">Stops all active screen shares</p></div>
                </button>

                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1 pt-2">Locks</p>
                {[
                  { label: 'Lock Mics', sub: "Students can't unmute", toggle: toggleLockMics, active: isMicsLocked, icon: isMicsLocked ? 'lock' : 'lock_open' },
                  { label: 'Lock Cameras', sub: "Students can't turn camera on", toggle: toggleLockCams, active: isCamsLocked, icon: isCamsLocked ? 'lock' : 'lock_open' },
                  { label: 'Chats Off', sub: 'Disables chat for students', toggle: toggleLockChat, active: isChatLocked, icon: isChatLocked ? 'comments_disabled' : 'chat' },
                  { label: 'Lock Screen Share', sub: "Students can't share screen", toggle: toggleLockScreenShare, active: isScreenShareLocked, icon: isScreenShareLocked ? 'cancel_presentation' : 'screen_share' },
                ].map(({ label, sub, toggle, active, icon }) => (
                  <button key={label} onClick={toggle}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors text-left ${active ? 'bg-amber-500/15 border-amber-500/40' : 'bg-slate-700 border-white/10 hover:bg-slate-600'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-amber-500/30' : 'bg-white/10'}`}>
                      <span className={`material-symbols-outlined text-lg ${active ? 'text-amber-400' : 'text-slate-300'}`}>{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold">{label}</p><p className="text-slate-500 text-xs">{sub}</p></div>
                    <LockBadge active={active} label="ON" />
                  </button>
                ))}

                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1 pt-2">Per Student</p>
                {remotes.length === 0 ? (
                  <p className="text-slate-600 text-xs text-center py-4">No students in the call yet</p>
                ) : (
                  <div className="space-y-2 pb-2">
                    {remotes.map(p => (
                      <div key={p.sessionId || p.userName} className="rounded-xl bg-slate-700/50 border border-white/5 overflow-hidden">
                        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {(p.userName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <p className="flex-1 text-white text-xs font-medium truncate">{p.userName}</p>
                          {bannedIds.has(p.userId || p.userName) && (
                            <span className="text-[9px] font-bold bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded-full">BANNED</span>
                          )}
                        </div>
                        <div className="flex gap-1 px-2.5 pb-2.5">
                          <button onClick={() => muteParticipant(p.sessionId, !p.audioMuted)}
                            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition-colors ${p.audioMuted ? 'bg-red-500/30 text-red-300' : 'bg-white/10 text-slate-300 hover:bg-red-500/20'}`}
                            title={p.audioMuted ? 'Unmute' : 'Mute'}>
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{p.audioMuted ? 'mic' : 'mic_off'}</span>
                          </button>
                          <button onClick={() => turnOffCamera(p.sessionId)}
                            className="flex-1 h-7 rounded-lg bg-white/10 text-slate-300 hover:bg-red-500/20 flex items-center justify-center transition-colors" title="Turn off camera">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>videocam_off</span>
                          </button>
                          <button onClick={() => ejectParticipant(p)}
                            className="flex-1 h-7 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 flex items-center justify-center transition-colors" title="Remove">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>person_remove</span>
                          </button>
                          <button onClick={() => banParticipant(p)}
                            className="flex-1 h-7 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/40 flex items-center justify-center transition-colors" title="Ban">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>block</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Settings tab ── */}
            {sidebarTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1">Audio</p>

                {/* Noise Cancellation */}
                <div className="bg-slate-700 border border-white/10 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-violet-400 text-lg">noise_aware</span>
                        <p className="text-white text-sm font-semibold">Noise Cancellation</p>
                      </div>
                      <p className="text-slate-500 text-xs mt-1 ml-7">Filters out background sounds like fans, keyboard clicks, and room noise so you come through crystal clear.</p>
                    </div>
                    <button onClick={toggleNoiseCancellation}
                      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-200 focus:outline-none ${noiseCancellation ? 'bg-green-500' : 'bg-slate-600'}`}
                      role="switch" aria-checked={noiseCancellation}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${noiseCancellation ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {noiseCancellation && (
                    <div className="mt-2.5 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                      <p className="text-green-400 text-[11px] font-medium">Active — background noise is being filtered</p>
                    </div>
                  )}
                </div>

                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold px-1 pt-1">About</p>
                <div className="bg-slate-700/50 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <img src="/term-icon.png" alt="T.E.R.M. Edu" className="w-9 h-9 rounded-lg object-contain flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-bold">T.E.R.M. Edu</p>
                    <p className="text-slate-500 text-[11px]">Live learning platform · Powered by Daily.co</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── In-call toast ── */}
      {callToast && (
        <div className={`absolute bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold shadow-xl flex items-center gap-2 pointer-events-none ${callToast.type === 'warn' ? 'bg-amber-500 text-white' : 'bg-slate-700 text-white'}`}>
          <span className="material-symbols-outlined text-base">{callToast.type === 'warn' ? 'warning' : 'info'}</span>
          {callToast.msg}
        </div>
      )}

      {/* ── Rankings Modal ── */}
      {rankingsOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setRankingsOpen(false)}>
          <div className="w-full max-w-sm bg-slate-800 rounded-3xl border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-400" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                <h3 className="text-white font-bold">Quiz Rankings</h3>
              </div>
              <button onClick={() => setRankingsOpen(false)} className="text-slate-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Overall cumulative leaderboard */}
              {(() => {
                const closedQuizzes = polls.filter(p => p.isQuiz && p.closed && quizLeaderboards[p.id]?.length > 0);
                if (closedQuizzes.length < 2) return null;
                const scoreMap = {};
                closedQuizzes.forEach(q => {
                  (quizLeaderboards[q.id] || []).forEach(e => {
                    if (!scoreMap[e.name]) scoreMap[e.name] = 0;
                    if (e.correct === true) scoreMap[e.name] += 10;
                  });
                });
                const maxScore = closedQuizzes.length * 10;
                const ranked = Object.entries(scoreMap)
                  .map(([name, score]) => ({ name, score }))
                  .sort((a, b) => b.score - a.score);
                const myScore = scoreMap[userName] || 0;
                return (
                  <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/25 overflow-hidden">
                    <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2">
                      <span className="material-symbols-outlined text-yellow-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
                      <div className="flex-1">
                        <p className="text-yellow-300 text-xs font-bold uppercase tracking-widest">Overall Score</p>
                        <p className="text-slate-400 text-[10px]">{closedQuizzes.length} quizzes · {maxScore} pts max</p>
                      </div>
                      {scoreMap[userName] !== undefined && (
                        <div className="text-right">
                          <p className="text-yellow-300 font-bold text-sm">{myScore} pts</p>
                          <p className="text-slate-500 text-[10px]">Your score</p>
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-white/5">
                      {ranked.slice(0, 10).map((entry, i) => (
                        <div key={entry.name} className={`flex items-center gap-3 px-4 py-2.5 ${entry.name === userName ? 'bg-primary/10' : ''}`}>
                          <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <span className={`flex-1 text-sm truncate ${entry.name === userName ? 'text-primary font-bold' : 'text-slate-200'}`}>{entry.name}</span>
                          <span className={`text-xs font-bold flex-shrink-0 ${entry.score === maxScore ? 'text-green-400' : entry.score === 0 ? 'text-red-400' : 'text-slate-300'}`}>{entry.score}/{maxScore}</span>
                        </div>
                      ))}
                      {ranked.length > 10 && <p className="text-[9px] text-slate-500 text-center py-2">+{ranked.length - 10} more</p>}
                    </div>
                  </div>
                );
              })()}

              {polls.filter(p => p.isQuiz && p.closed && quizLeaderboards[p.id]?.length > 0).map((quiz, qi) => {
                const lb = quizLeaderboards[quiz.id] || [];
                const myEntry = lb.find(e => e.name === userName);
                return (
                  <div key={quiz.id} className="rounded-2xl bg-slate-700/50 border border-white/5 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/60 border-b border-white/5">
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-0.5">Quiz {qi + 1}</p>
                      <p className="text-white text-sm font-semibold leading-snug">{quiz.question}</p>
                      {myEntry && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${myEntry.correct ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '11px', fontVariationSettings: "'FILL' 1" }}>{myEntry.correct ? 'check_circle' : 'cancel'}</span>
                          You ranked #{myEntry.rank}
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-white/5">
                      {lb.map((entry, i) => (
                        <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${entry.name === userName ? 'bg-primary/10' : ''}`}>
                          <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                          </span>
                          <span className={`flex-1 text-sm truncate ${entry.name === userName ? 'text-primary font-bold' : 'text-slate-200'}`}>{entry.name}</span>
                          {entry.correct === true && <span className="text-[10px] text-green-400 font-bold bg-green-500/15 px-2 py-0.5 rounded-full flex-shrink-0">Correct</span>}
                          {entry.correct === false && <span className="text-[10px] text-red-400 font-bold bg-red-500/15 px-2 py-0.5 rounded-full flex-shrink-0">Wrong</span>}
                          {entry.reactionMs !== undefined && entry.correct && (
                            <span className="text-[9px] text-slate-500 flex-shrink-0">{(entry.reactionMs / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {polls.filter(p => p.isQuiz && p.closed && quizLeaderboards[p.id]?.length > 0).length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">No quiz results yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {pollModal && isOwner && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => { setPollModal(false); }}>
          <div className="w-full max-w-sm bg-slate-800 rounded-3xl border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-violet-400">quiz</span>
                <h3 className="text-white font-bold">Poll / Quiz</h3>
              </div>
              <button onClick={() => setPollModal(false)} className="text-slate-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setPollModalTab('create')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${pollModalTab === 'create' ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-500/5' : 'text-slate-400 hover:text-white'}`}>
                Create New
              </button>
              <button
                onClick={() => setPollModalTab('bank')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${pollModalTab === 'bank' ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-500/5' : 'text-slate-400 hover:text-white'}`}>
                Quiz Bank
                {quizBank.length > 0 && (
                  <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{quizBank.length}</span>
                )}
              </button>
            </div>

            {/* ── Create New tab ── */}
            {pollModalTab === 'create' && (
              <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">

                {/* Quiz mode toggle — fixed CSS */}
                <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${pollDraft.isQuiz ? 'bg-violet-600/10 border-violet-500/25' : 'bg-slate-700/60 border-white/5'}`}>
                  <div>
                    <p className="text-white text-sm font-semibold">Quiz Mode</p>
                    <p className="text-slate-400 text-xs">{pollDraft.isQuiz ? '30s timer · correct answer · leaderboard' : 'Mark a correct answer to enable quiz'}</p>
                  </div>
                  <button
                    onClick={() => setPollDraft(d => ({ ...d, isQuiz: !d.isQuiz, correctOption: null }))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none ${pollDraft.isQuiz ? 'bg-violet-600' : 'bg-slate-600'}`}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 block"
                      style={{ transform: pollDraft.isQuiz ? 'translateX(20px)' : 'translateX(0px)' }}
                    />
                  </button>
                </div>

                <div>
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Question</label>
                  <input type="text" value={pollDraft.question}
                    onChange={e => setPollDraft(d => ({ ...d, question: e.target.value }))}
                    placeholder={pollDraft.isQuiz ? 'Ask a quiz question...' : 'Ask the class something...'}
                    className="w-full bg-slate-700 text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 placeholder:text-slate-500 border border-white/10" autoFocus />
                </div>

                <div>
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                    Options {pollDraft.isQuiz && <span className="text-violet-400 normal-case font-normal ml-1">— tap ✓ to mark correct</span>}
                  </label>
                  <div className="space-y-2">
                    {pollDraft.options.map((opt, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        {pollDraft.isQuiz && (
                          <button
                            onClick={() => setPollDraft(d => ({ ...d, correctOption: d.correctOption === idx ? null : idx }))}
                            className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors border ${pollDraft.correctOption === idx ? 'bg-green-500/30 border-green-500/50 text-green-400' : 'bg-slate-700 border-white/10 text-slate-500 hover:text-green-400'}`}
                            title="Mark as correct answer">
                            <span className="material-symbols-outlined" style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          </button>
                        )}
                        <input type="text" value={opt}
                          onChange={e => setPollDraft(d => { const options = [...d.options]; options[idx] = e.target.value; return { ...d, options }; })}
                          placeholder={`Option ${idx + 1}`}
                          className={`flex-1 bg-slate-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 placeholder:text-slate-500 border ${pollDraft.isQuiz && pollDraft.correctOption === idx ? 'border-green-500/40' : 'border-white/10'}`} />
                        {pollDraft.options.length > 2 && (
                          <button onClick={() => setPollDraft(d => ({ ...d, options: d.options.filter((_, i) => i !== idx), correctOption: d.correctOption === idx ? null : d.correctOption }))}
                            className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {pollDraft.options.length < 6 && (
                      <button onClick={() => setPollDraft(d => ({ ...d, options: [...d.options, ''] }))}
                        className="w-full py-1.5 rounded-xl border border-dashed border-white/20 text-slate-400 hover:text-white hover:border-white/40 text-xs transition-colors">
                        + Add option
                      </button>
                    )}
                  </div>
                </div>

                {pollDraft.isQuiz && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600/10 border border-violet-500/20">
                    <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '14px' }}>timer</span>
                    <span className="text-violet-300 text-xs">Quiz auto-closes after <strong>30 seconds</strong> and reveals the leaderboard</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {pollDraft.isQuiz && (
                    <button onClick={saveToBank}
                      className="flex-1 py-2.5 rounded-2xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-sm transition-colors border border-white/10 flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-base">save</span>
                      Save to Bank
                    </button>
                  )}
                  <button onClick={launchPoll}
                    className={`${pollDraft.isQuiz ? 'flex-1' : 'w-full'} py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors`}>
                    {pollDraft.isQuiz ? 'Launch Quiz' : 'Launch Poll'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Quiz Bank tab ── */}
            {pollModalTab === 'bank' && (
              <div className="p-4 max-h-[72vh] overflow-y-auto">
                {quizBank.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-slate-600 text-4xl">quiz</span>
                    <p className="text-slate-500 text-sm mt-2 font-medium">No quizzes in the bank yet</p>
                    <p className="text-slate-600 text-xs mt-1">Create a quiz in the "Create New" tab and tap "Save to Bank"</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest px-1">Tap a quiz to launch it instantly</p>
                    {quizBank.map((item, idx) => (
                      <div key={item.id} className="rounded-2xl bg-slate-700/50 border border-white/5 overflow-hidden hover:border-violet-500/30 transition-colors">
                        <div className="flex items-start gap-3 p-3">
                          {/* Number badge */}
                          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                            <span className="text-violet-300 font-black text-sm">Q{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{item.question}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-slate-500 text-[10px]">{item.options.length} options</span>
                              {item.correctOption !== null && (
                                <span className="text-green-400 text-[10px] flex items-center gap-0.5">
                                  <span className="material-symbols-outlined" style={{ fontSize: '10px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                  Ans: {item.options[item.correctOption]?.slice(0, 20)}{item.options[item.correctOption]?.length > 20 ? '…' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => setQuizBank(prev => prev.filter(q => q.id !== item.id))}
                            className="flex-shrink-0 w-6 h-6 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                          </button>
                        </div>
                        <button
                          onClick={() => launchFromBank(item)}
                          className="w-full py-2 bg-violet-600/20 hover:bg-violet-600/40 border-t border-white/5 text-violet-300 hover:text-violet-100 text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                          <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                          Launch Q{idx + 1}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Leave confirmation modal ── */}
      {leaveConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLeaveConfirm(false)}>
          <div className="bg-slate-800 border border-white/10 rounded-3xl w-full max-w-xs p-6 space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>call_end</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-bold">{isOwner ? 'End Meeting?' : 'Leave Meeting?'}</h3>
                <p className="text-slate-400 text-sm mt-1">
                  {isOwner
                    ? 'Choose to leave for yourself or end the class for everyone.'
                    : 'Are you sure you want to leave this live class?'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isOwner && (
                <button
                  onClick={() => { setLeaveConfirm(false); endForAll(); }}
                  className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                  End for Everyone
                </button>
              )}
              <button
                onClick={() => { setLeaveConfirm(false); leaveCall(); }}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">logout</span>
                {isOwner ? 'Leave (Keep Class Running)' : 'Yes, Leave'}
              </button>
              <button
                onClick={() => setLeaveConfirm(false)}
                className="w-full py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors">
                Stay in Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls bar ── */}
      <div className="flex-shrink-0 flex items-center justify-center gap-2 sm:gap-3 py-3 px-3 bg-slate-900 border-t border-white/10"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button onClick={toggleMute}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          title={isMuted ? 'Unmute' : 'Mute'}>
          <span className="material-symbols-outlined text-lg">{isMuted ? 'mic_off' : 'mic'}</span>
        </button>
        <button onClick={toggleCam}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${isCamOff ? 'bg-red-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          title={isCamOff ? 'Turn camera on' : 'Turn camera off'}>
          <span className="material-symbols-outlined text-lg">{isCamOff ? 'videocam_off' : 'videocam'}</span>
        </button>
        {!IS_IOS && (
          <button onClick={toggleScreenShare}
            className={`${isOwner ? 'hidden sm:flex' : 'flex'} w-10 h-10 sm:w-11 sm:h-11 rounded-full items-center justify-center transition-colors ${isScreenSharing ? 'bg-blue-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
            <span className="material-symbols-outlined text-lg">{isScreenSharing ? 'stop_screen_share' : 'screen_share'}</span>
          </button>
        )}
        <button onClick={() => setLeaveConfirm(true)}
          className="px-5 h-10 sm:h-11 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors shadow-lg" title="Leave">
          <span className="material-symbols-outlined text-xl">call_end</span>
        </button>
        {isOwner && joinUrl && (
          <button onClick={copyInviteLink}
            className={`h-10 sm:h-11 px-3 rounded-full flex items-center gap-1.5 transition-all text-xs font-bold ${inviteCopied ? 'bg-green-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title="Copy invite link">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: `'FILL' ${inviteCopied ? 1 : 0}` }}>{inviteCopied ? 'check_circle' : 'link'}</span>
            <span className="hidden sm:inline">{inviteCopied ? 'Copied!' : 'Invite'}</span>
          </button>
        )}
        {isOwner && (
          <button onClick={toggleRecording}
            className={`hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-colors ${isRecording ? 'bg-red-700 text-white animate-pulse' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title={isRecording ? 'Stop recording' : 'Start recording'}>
            <span className="material-symbols-outlined text-lg">radio_button_checked</span>
          </button>
        )}
        <button onClick={() => { setSidebarOpen(o => !o); setUnreadCount(0); setSidebarTab('chat'); }}
          className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${sidebarOpen ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} title="Chat">
          <span className="material-symbols-outlined text-lg">chat</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>
          )}
        </button>
        {isOwner && (
          <button onClick={() => openSidebar('controls')}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${sidebarOpen && sidebarTab === 'controls' ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} title="Host Controls">
            <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
          </button>
        )}
        {IS_MOBILE && (
          <button onClick={toggleLandscape}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isLandscape ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title={isLandscape ? 'Switch to portrait' : 'Switch to landscape'}>
            <span className="material-symbols-outlined text-lg">screen_rotation</span>
          </button>
        )}
      </div>
    </div>
  );
}
