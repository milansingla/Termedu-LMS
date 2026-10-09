import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useCourses } from '../../context/CourseContext';
import { useApp } from '../../context/AppContext';
import { COURSES } from '../../data/mockData';
import BottomNav from '../../components/BottomNav';

// ─── YouTube IFrame API loader (singleton) ───────────────────────────────────
let ytAPIPromise = null;
function loadYouTubeAPI() {
  if (ytAPIPromise) return ytAPIPromise;
  ytAPIPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytAPIPromise;
}

const QUALITY_LABELS = {
  max: 'MAX', highres: '4K', hd1080: '1080p', hd720: '720p',
  large: '480p', medium: '360p', small: '240p', tiny: '144p', auto: 'Auto',
};

// ─── Profanity filter ─────────────────────────────────────────────────────────
const BAD_WORDS = [
  'fuck','f u c k','fucker','fucking','fucked','fucks','fuk','f*ck',
  'shit','shits','shitting','shitted','sh1t','s h i t',
  'bitch','bitches','bitching','b1tch',
  'asshole','assholes','ass hole','arse','arsehole',
  'bastard','bastards',
  'damn','dammit','damned',
  'cunt','cunts',
  'dick','dicks','dickhead','d1ck',
  'cock','cocks','cockhead',
  'pussy','pussies',
  'whore','whores',
  'slut','sluts',
  'nigger','nigga','nig','n1gger',
  'faggot','fag','f4g',
  'retard','retarded','retards',
  'motherfucker','mofo','mf',
  'wtf','stfu','gtfo',
  'idiot','idiots','moron','morons','stupid','dumbass','dumb ass',
  'hell','hells','hellhole',
  'piss','pissed','pissing','pissoff',
  'rape','raped','raping','rapist',
  'kill','killing','die','death threat',
  'chutiya','madarchod','bhenchod','gandu','harami','bhosdike','randi','saala','saali','kamina','kamine',
  'bc','mc','mf','lund','gaand','chut','bhen ke lode','teri maa','teri ma','bhosdi',
  'sala','sali','kutte','kutiya','haramzada','haramzadi',
];

const PROFANITY_REGEX = new RegExp(
  '(' + BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'gi'
);

function censorText(text) {
  if (!text) return text;
  return text.replace(PROFANITY_REGEX, (match) => '*'.repeat(match.length));
}

function hasProfanity(text) {
  if (!text) return false;
  PROFANITY_REGEX.lastIndex = 0;
  return PROFANITY_REGEX.test(text);
}

// ─── localStorage helpers ────────────────────────────────────────────────────
function loadLessonNotes(lessonId) {
  try { return JSON.parse(localStorage.getItem(`lms_notes_${lessonId}`) || '[]'); } catch { return []; }
}
function saveLessonNotes(lessonId, notes) {
  try { localStorage.setItem(`lms_notes_${lessonId}`, JSON.stringify(notes)); } catch {}
}
async function loadLessonQA(lessonId) {
  try {
    const res = await fetch(`/api/data/qa/${lessonId}`, { credentials: 'include' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}
async function saveLessonQA(lessonId, qa) {
  try {
    await fetch(`/api/data/qa/${lessonId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(qa),
    });
  } catch {}
}

// ─── Corner watermark ────────────────────────────────────────────────────────
function CornerWatermark({ name, email }) {
  return (
    <div className="absolute bottom-12 left-3 select-none pointer-events-none" style={{ zIndex: 30 }}>
      <p style={{ color: '#fff', fontSize: 11, fontWeight: 700, opacity: 0.22, margin: 0, letterSpacing: 0.4, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{name}</p>
      <p style={{ color: '#fff', fontSize: 9, fontWeight: 500, opacity: 0.18, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{email}</p>
    </div>
  );
}

// ─── Custom YouTube player ────────────────────────────────────────────────────
function YouTubeCustomPlayer({ videoId, title, onEnded, onPrev, hasNext, hasPrev }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const hideTimer = useRef(null);
  const lastTapRef = useRef({ time: 0, side: null });

  // When autoplay is blocked and user taps the overlay, switch to a plain iframe
  // with autoplay=1 in the URL. This bypasses the postMessage restriction that
  // blocks playVideo() in Android WebView and some restrictive mobile browsers.
  const [useDirectIframe, setUseDirectIframe] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [showQuality, setShowQuality] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [skipFlash, setSkipFlash] = useState(null);
  const isDraggingRef = useRef(false);
  const dragProgressRef = useRef(null);
  const wasPlayingRef = useRef(false);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!videoId) return;
    // Destroy existing player BEFORE clearing the container — prevents widgetapi
    // from holding a stale iframe reference and throwing postMessage origin errors
    try { if (playerRef.current?.destroy) playerRef.current.destroy(); } catch (_) {}
    playerRef.current = null;
    setIsReady(false); setIsPlaying(false); setHasStarted(false); setDuration(0); setCurrentTime(0); setQualities([]); setControlsVisible(true);
    setPlayerError(null); setUseDirectIframe(false);
    let player; let tickInterval;
    loadYouTubeAPI().then((YT) => {
      if (!containerRef.current) return;
      containerRef.current.replaceChildren();
      const div = document.createElement('div');
      containerRef.current.appendChild(div);
      player = new YT.Player(div, {
        videoId, width: '100%', height: '100%',
        playerVars: { controls: 0, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3, cc_load_policy: 0, disablekb: 1, fs: 0, autoplay: 1, playsinline: 1, enablejsapi: 1, ...(window.location.protocol === 'https:' ? { origin: window.location.origin } : {}) },
        events: {
          onReady(e) {
            playerRef.current = e.target;
            setDuration(e.target.getDuration());
            const avail = e.target.getAvailableQualityLevels() || [];
            const qualList = avail.length
              ? ['max', 'auto', ...avail.filter(q => q !== 'auto')]
              : ['max', 'auto'];
            setQualities(qualList);
            const highest = avail.find(q => q !== 'auto');
            if (highest && typeof e.target.setPlaybackQuality === 'function') {
              e.target.setPlaybackQuality(highest);
            }
            setCurrentQuality('max');
            e.target.playVideo();
            setTimeout(() => { setIsReady(true); bumpControls(); }, 650);
          },
          onStateChange(e) {
            const S = window.YT.PlayerState;
            const playing = e.data === S.PLAYING;
            setIsPlaying(playing);
            if (playing) {
              setHasStarted(true);
              clearInterval(tickInterval);
              tickInterval = setInterval(() => { if (playerRef.current) setCurrentTime(playerRef.current.getCurrentTime()); }, 500);
              bumpControls();
            } else { clearInterval(tickInterval); }
            if (e.data === S.ENDED && onEnded) onEnded();
          },
          onPlaybackQualityChange() {
            if (playerRef.current?.getAvailableQualityLevels) {
              const avail = playerRef.current.getAvailableQualityLevels() || [];
              if (avail.length) {
                setQualities(['max', 'auto', ...avail.filter(q => q !== 'auto')]);
              }
            }
            setCurrentQuality(prev => (prev === 'max' ? 'max' : (playerRef.current?.getPlaybackQuality?.() || 'auto')));
          },
          onError(e) {
            const MSGS = { 2: 'Invalid video ID', 5: 'Video cannot be played', 100: 'Video not found or private', 101: 'Video cannot be embedded', 150: 'Video cannot be embedded' };
            setPlayerError(MSGS[e.data] || 'Failed to load video');
            setIsReady(true);
          },
        },
      });
    });
    return () => { clearInterval(tickInterval); clearTimeout(hideTimer.current); try { player && player.destroy(); } catch (_) {} playerRef.current = null; };
  }, [videoId]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current || typeof playerRef.current.playVideo !== 'function') return;
    isPlaying ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
    bumpControls();
  }, [isPlaying, bumpControls]);

  const seekBy = useCallback((secs) => {
    if (!playerRef.current || !duration) return;
    const ct = playerRef.current.getCurrentTime?.() ?? 0;
    const t = Math.min(Math.max(0, ct + secs), duration);
    playerRef.current.seekTo(t, true);
    setCurrentTime(t);
    bumpControls();
  }, [duration, bumpControls]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(10); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [seekBy, togglePlay]);

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute?.();
      playerRef.current.setVolume?.(volume || 100);
      setIsMuted(false);
    } else {
      playerRef.current.mute?.();
      setIsMuted(true);
    }
    bumpControls();
  };

  const handleVolumeChange = (v) => {
    const val = Number(v);
    setVolume(val);
    if (playerRef.current?.setVolume) playerRef.current.setVolume(val);
    setIsMuted(val === 0);
    bumpControls();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen().then(() => {
        screen.orientation?.lock('landscape').catch(() => {});
      }).catch(() => {});
    } else {
      screen.orientation?.unlock?.();
      document.exitFullscreen();
    }
    bumpControls();
  };

  const applyQuality = (q) => {
    if (!playerRef.current || typeof playerRef.current.setPlaybackQuality !== 'function') return;
    if (q === 'max') {
      const avail = playerRef.current.getAvailableQualityLevels?.() || [];
      const highest = avail.find(x => x !== 'auto') || 'hd1080';
      playerRef.current.setPlaybackQuality(highest);
      setCurrentQuality('max');
    } else {
      playerRef.current.setPlaybackQuality(q);
      setCurrentQuality(q);
    }
    setShowQuality(false);
    bumpControls();
  };

  const getPct = (e, rect) => Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));

  const handleScrubDown = (e) => {
    if (!playerRef.current || !duration) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    wasPlayingRef.current = isPlaying;
    const pct = getPct(e, e.currentTarget.getBoundingClientRect());
    dragProgressRef.current = pct;
    setCurrentTime((pct / 100) * duration);
    bumpControls();
  };

  const handleScrubMove = (e) => {
    if (!isDraggingRef.current || !duration) return;
    e.preventDefault();
    const pct = getPct(e, e.currentTarget.getBoundingClientRect());
    dragProgressRef.current = pct;
    setCurrentTime((pct / 100) * duration);
  };

  const handleScrubUp = (e) => {
    if (!isDraggingRef.current || !playerRef.current || !duration) return;
    if (typeof playerRef.current.seekTo !== 'function') { isDraggingRef.current = false; return; }
    isDraggingRef.current = false;
    const pct = dragProgressRef.current ?? 0;
    const t = (pct / 100) * duration;
    setCurrentTime(t);
    playerRef.current.seekTo(t, true);
    dragProgressRef.current = null;
    if (wasPlayingRef.current && typeof playerRef.current.playVideo === 'function') playerRef.current.playVideo();
  };

  const handleTap = useCallback((e) => {
    if (showQuality) { setShowQuality(false); return; }
    const rect = wrapperRef.current?.getBoundingClientRect();
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    const side = rect && x < rect.left + rect.width / 2 ? 'left' : 'right';
    const now = Date.now();
    const last = lastTapRef.current;
    if (now - last.time < 320 && last.side === side) {
      // Double-tap: seek ±10s
      lastTapRef.current = { time: 0, side: null };
      const secs = side === 'left' ? -10 : 10;
      seekBy(secs);
      setSkipFlash({ side, id: now });
      setTimeout(() => setSkipFlash(null), 700);
      return;
    }
    lastTapRef.current = { time: now, side };
    // Single tap: show controls if hidden, hide if visible (play/pause is only via Play button)
    if (controlsVisible) setControlsVisible(false);
    else bumpControls();
  }, [showQuality, controlsVisible, bumpControls, seekBy]);

  const fmt = (s) => { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const progress = duration ? Math.min((currentTime / duration) * 100, 100) : 0;
  const volIcon = isMuted || volume === 0 ? 'volume_off' : volume < 50 ? 'volume_down' : 'volume_up';

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onMouseMove={bumpControls}
      style={{ cursor: controlsVisible ? 'default' : 'none' }}
    >
      {/* YouTube iframe — bottom-clipped to hide YT watermark; pause screen covers pause overlay */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: 'inset(46px 0px 34px 0px)' }}>
        <div ref={containerRef} className="absolute left-0 right-0" style={{ pointerEvents: 'none', top: -46, bottom: -34 }} />
      </div>


      {/* Loading spinner */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black" style={{ zIndex: 20 }}>
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3" style={{ zIndex: 28 }}>
          <span className="material-symbols-outlined text-red-400 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          <p className="text-white font-semibold text-sm">{playerError}</p>
          <p className="text-white/40 text-xs text-center px-6">This video may be private or unavailable in your region.</p>
        </div>
      )}


      {/* Direct iframe fallback — mounted DURING user tap so autoplay is allowed */}
      {useDirectIframe && (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&fs=1`}
          title={title}
          allow="autoplay; fullscreen; accelerometer; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          style={{ zIndex: 35, background: '#000' }}
        />
      )}

      {/* Tap-to-start overlay — shown when autoplay is blocked (e.g. Android WebView).
          On tap: switch immediately to a direct iframe with autoplay=1 in the URL.
          This avoids postMessage-based playVideo() which WebView always blocks. */}
      {isReady && !hasStarted && !playerError && !useDirectIframe && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 30, background: '#000' }}
          onClick={() => {
            // First try the JS API (works in browsers, no-op in WebView)
            try { playerRef.current?.playVideo(); } catch (_) {}
            // Immediately switch to direct iframe — if JS API works the iframe
            // will simply load redundantly; if not (WebView), this is the fix.
            setUseDirectIframe(true);
          }}
        >
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.7 }}
          />
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: 44, fontVariationSettings: "'FILL' 1", marginLeft: 4 }}>play_arrow</span>
          </div>
        </div>
      )}

      {/* Double-tap skip flash */}
      {skipFlash && (
        <div
          key={skipFlash.id}
          className="absolute inset-y-0 pointer-events-none flex items-center justify-center"
          style={{
            zIndex: 26,
            left: skipFlash.side === 'left' ? 0 : '50%',
            right: skipFlash.side === 'right' ? 0 : '50%',
            background: skipFlash.side === 'left'
              ? 'radial-gradient(ellipse at 25% 50%, rgba(255,255,255,0.18) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at 75% 50%, rgba(255,255,255,0.18) 0%, transparent 70%)',
            animation: 'skipFlashFade 0.7s ease-out forwards',
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 36, opacity: 0.95 }}>
              {skipFlash.side === 'left' ? 'replay_10' : 'forward_10'}
            </span>
            <span className="text-white text-xs font-semibold" style={{ opacity: 0.9 }}>
              {skipFlash.side === 'left' ? '10 seconds' : '10 seconds'}
            </span>
          </div>
        </div>
      )}

      {/* Tap area — desktop only (mobile layout handles its own taps) */}
      <div
        className="hidden md:block absolute inset-0"
        style={{ zIndex: 23 }}
        onClick={handleTap}
      />

      {/* ── Controls overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 25, opacity: controlsVisible ? 1 : 0, transition: controlsVisible ? 'opacity 0.2s ease' : 'opacity 1.8s ease' }}
      >

        {/* ══ MOBILE layout (hidden on md+) ══ */}
        {/* pointer-events always auto so taps always reach this layer */}
        <div
          className="md:hidden absolute inset-0 flex flex-col justify-between"
          style={{ pointerEvents: 'auto' }}
          onClick={handleTap}
        >
          {/* Top scrim — non-interactive */}
          <div className="h-12 flex-shrink-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' }} />

          {/* Center: Play only — always interactive so pause→play works without two taps */}
          <div className="flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={e => { e.stopPropagation(); togglePlay(); }}
              className="rounded-full flex items-center justify-center text-white active:scale-90 transition-all"
              style={{ width: 66, height: 66, background: 'rgba(0,0,0,0.5)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 42, fontVariationSettings: "'FILL' 1", marginLeft: isPlaying ? 0 : 4 }}>
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>

          {/* Bottom: time + fullscreen + progress bar */}
          <div
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)', pointerEvents: controlsVisible ? 'auto' : 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 pb-1 pt-4">
              <span className="text-white text-xs font-medium tabular-nums drop-shadow">{fmt(currentTime)} / {fmt(duration)}</span>
              <div className="flex items-center gap-2">
                {/* Quality — mobile */}
                {qualities.length > 0 && (
                  <div className="relative">
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { e.stopPropagation(); setShowQuality(v => !v); }}
                      className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-white/10 text-white text-xs font-bold active:scale-90 transition-all"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>settings</span>
                      {QUALITY_LABELS[currentQuality] || currentQuality}
                    </button>
                    {showQuality && (
                      <div className="absolute bottom-full mb-2 right-0 bg-slate-900/95 backdrop-blur rounded-xl border border-white/10 overflow-hidden min-w-[90px]" style={{ zIndex: 50 }}>
                        {qualities.map(q => (
                          <button
                            key={q}
                            onMouseDown={e => e.preventDefault()}
                            onClick={e => { e.stopPropagation(); applyQuality(q); }}
                            className={`w-full px-3 py-2.5 text-xs text-left font-medium transition-colors ${currentQuality === q ? 'text-white bg-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                          >
                            {QUALITY_LABELS[q] || q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); toggleFullscreen(); }} className="text-white p-1 active:scale-90 transition-all">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
                </button>
              </div>
            </div>
            <div
              className="w-full cursor-pointer"
              style={{ height: 3, touchAction: 'none', background: 'rgba(255,255,255,0.25)' }}
              onPointerDown={e => { e.stopPropagation(); handleScrubDown(e); }}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubUp}
              onPointerCancel={handleScrubUp}
            >
              <div className="h-full bg-red-500 relative" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-red-500" />
              </div>
            </div>
          </div>
        </div>

        {/* ══ DESKTOP layout (hidden on mobile) ══ */}
        <div
          className="hidden md:flex absolute inset-x-0 bottom-0 flex-col"
          style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {/* Bottom scrim */}
          <div className="absolute inset-x-0 bottom-0 h-28 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }} />

          {/* Red progress bar */}
          <div className="relative px-0 mb-0 group/bar cursor-pointer" style={{ touchAction: 'none' }}
            onPointerDown={handleScrubDown}
            onPointerMove={handleScrubMove}
            onPointerUp={handleScrubUp}
            onPointerCancel={handleScrubUp}
          >
            <div className="w-full relative" style={{ height: 4, background: 'rgba(255,255,255,0.25)' }}>
              <div className="absolute inset-y-0 left-0 bg-red-500" style={{ width: `${progress}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 shadow"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="relative flex items-center gap-2 px-3 py-2">
            {/* -10s */}
            <button onMouseDown={e => e.preventDefault()} onClick={() => seekBy(-10)}
              className="text-white hover:text-white/80 transition-colors active:scale-90">
              <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>replay_10</span>
            </button>

            {/* Play / Pause */}
            <button onMouseDown={e => e.preventDefault()} onClick={togglePlay} className="text-white hover:text-white/80 transition-colors active:scale-90">
              <span className="material-symbols-outlined" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {/* +10s */}
            <button onMouseDown={e => e.preventDefault()} onClick={() => seekBy(10)}
              className="text-white hover:text-white/80 transition-colors active:scale-90">
              <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>forward_10</span>
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol ml-1">
              <button onMouseDown={e => e.preventDefault()} onClick={toggleMute} className="text-white hover:text-white/80 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>{volIcon}</span>
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200 flex items-center">
                <input
                  type="range" min={0} max={100} value={isMuted ? 0 : volume}
                  onChange={e => handleVolumeChange(e.target.value)}
                  className="w-20 h-1 accent-white cursor-pointer"
                  onMouseDown={e => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Time */}
            <span className="text-white/85 text-xs font-medium tabular-nums pl-1">{fmt(currentTime)} / {fmt(duration)}</span>

            <div className="flex-1" />

            {/* Quality */}
            {qualities.length > 0 && (
              <div className="relative">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowQuality(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>settings</span>
                  {QUALITY_LABELS[currentQuality] || currentQuality}
                </button>
                {showQuality && (
                  <div className="absolute bottom-9 right-0 bg-slate-900/95 backdrop-blur rounded-xl border border-white/10 overflow-hidden min-w-[90px]">
                    {qualities.map(q => (
                      <button
                        key={q}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => applyQuality(q)}
                        className={`w-full px-3 py-2 text-xs text-left font-medium transition-colors ${currentQuality === q ? 'text-white bg-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                      >
                        {QUALITY_LABELS[q] || q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button onMouseDown={e => e.preventDefault()} onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors active:scale-90">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Android WebView detection ────────────────────────────────────────────────
// WebView UA contains "wv" (Chrome WebView) or Android + Version/x.x (old WebView)
const IS_ANDROID_WEBVIEW = (() => {
  const ua = navigator.userAgent || '';
  return /wv/.test(ua) || (/Android/.test(ua) && /Version\/\d+/.test(ua) && !/Chrome\/\d+/.test(ua));
})();

// ─── WebView-safe YouTube player ──────────────────────────────────────────────
// Uses direct <iframe> mount with autoplay=1 in src URL, which bypasses the
// postMessage restriction that blocks playVideo() calls in Android WebView.
function WebViewYouTubePlayer({ videoId, title, onEnded }) {
  const [started, setStarted] = useState(false);
  const iframeRef = useRef(null);

  // Listen for ENDED via postMessage (best-effort; may not work in all WebViews)
  useEffect(() => {
    if (!started || !onEnded) return;
    const handler = (e) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.event === 'onStateChange' && d?.info === 0) onEnded();
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [started, onEnded]);

  if (!started) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
        style={{ background: '#000', zIndex: 10 }}
        onClick={() => setStarted(true)}
      >
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.72 }}
        />
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{ width: 72, height: 72, background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.3)', zIndex: 2 }}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: 44, fontVariationSettings: "'FILL' 1", marginLeft: 4 }}>play_arrow</span>
        </div>
        <div className="absolute bottom-2 left-3 right-3 text-center">
          <p className="text-white/70 text-xs font-medium drop-shadow truncate">{title}</p>
        </div>
      </div>
    );
  }

  // Direct iframe with autoplay=1 in src — no JS API postMessage needed
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&showinfo=0&enablejsapi=1&fs=1`;
  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      allow="autoplay; fullscreen; accelerometer; gyroscope; picture-in-picture"
      allowFullScreen
      className="absolute inset-0 w-full h-full border-0"
      style={{ background: '#000' }}
    />
  );
}

// ─── Vimeo fallback ───────────────────────────────────────────────────────────
function VimeoPlayer({ videoId, title }) {
  const src = `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&autoplay=1&color=6d28d9`;
  return <iframe src={src} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="w-full h-full border-0" title={title} />;
}

// ─── Notes tab ────────────────────────────────────────────────────────────────
function NotesTab({ lessonId, lessonTitle }) {
  const [notes, setNotes] = useState(() => loadLessonNotes(lessonId));
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const loaded = loadLessonNotes(lessonId);
    setNotes(loaded);
    setDraft('');
  }, [lessonId]);

  const saveNote = () => {
    if (!draft.trim()) return;
    const updated = [{ id: Date.now(), text: draft.trim(), time: new Date().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }, ...notes];
    setNotes(updated);
    saveLessonNotes(lessonId, updated);
    setDraft('');
  };

  const deleteNote = (id) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    saveLessonNotes(lessonId, updated);
  };

  return (
    <div className="space-y-3">
      <p className="text-white/40 text-xs">Notes for: <span className="text-white/70 font-medium">{lessonTitle}</span></p>
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Type your notes here..."
          rows={4}
          className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl resize-none focus:outline-none focus:border-primary/50 text-sm text-white placeholder-white/30 leading-relaxed"
        />
        <button
          onClick={saveNote}
          disabled={!draft.trim()}
          className="w-full py-3 rounded-xl signature-gradient text-white font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          Save Note
        </button>
      </div>

      {notes.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">Saved Notes ({notes.length})</p>
          {notes.map(n => (
            <div key={n.id} className="p-4 bg-white/5 border border-white/8 rounded-2xl group">
              <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{n.text}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-white/30 text-[10px]">{n.time}</p>
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-white/20 hover:text-red-400 transition-colors p-1 rounded-lg"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Q&A tab ──────────────────────────────────────────────────────────────────
function QATab({ lessonId, lessonTitle, userName }) {
  const [questions, setQuestions] = useState([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [censorWarn, setCensorWarn] = useState(false);
  const [qaLoading, setQaLoading] = useState(true);

  useEffect(() => {
    setQaLoading(true);
    setDraft('');
    setReplyTo(null);
    setReplyText('');
    setCensorWarn(false);
    loadLessonQA(lessonId).then(data => {
      setQuestions(data);
      setQaLoading(false);
    });
  }, [lessonId]);

  const persist = (updated) => { setQuestions(updated); saveLessonQA(lessonId, updated); };

  const postQuestion = () => {
    if (!draft.trim()) return;
    const raw = draft.trim();
    const wasCensored = hasProfanity(raw);
    const clean = censorText(raw);
    const q = {
      id: Date.now(),
      text: clean,
      author: userName || 'You',
      time: new Date().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      upvotes: 0,
      upvoted: false,
      answers: [],
    };
    persist([q, ...questions]);
    setDraft('');
    if (wasCensored) { setCensorWarn(true); setTimeout(() => setCensorWarn(false), 3500); }
  };

  const toggleUpvote = (qId) => {
    persist(questions.map(q => q.id === qId ? { ...q, upvotes: q.upvoted ? q.upvotes - 1 : q.upvotes + 1, upvoted: !q.upvoted } : q));
  };

  const postReply = (qId) => {
    if (!replyText.trim()) return;
    const clean = censorText(replyText.trim());
    const answer = {
      id: Date.now(),
      text: clean,
      author: userName || 'You',
      time: new Date().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    persist(questions.map(q => q.id === qId ? { ...q, answers: [...(q.answers || []), answer] } : q));
    setReplyTo(null);
    setReplyText('');
  };

  const draftHasProfanity = hasProfanity(draft);
  const replyHasProfanity = hasProfanity(replyText);

  return (
    <div className="space-y-3">
      <p className="text-white/40 text-xs">Questions about: <span className="text-white/70 font-medium">{lessonTitle}</span></p>

      {/* Censor warning toast */}
      {censorWarn && (
        <div className="flex items-center gap-2 px-4 py-3 bg-orange-500/15 border border-orange-500/30 rounded-2xl">
          <span className="material-symbols-outlined text-orange-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>report</span>
          <p className="text-orange-300 text-xs font-medium">Inappropriate language was automatically censored from your post.</p>
        </div>
      )}

      {/* Ask a question */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask a question about this lesson..."
            rows={3}
            className={`w-full p-4 bg-white/5 border rounded-2xl resize-none focus:outline-none text-sm text-white placeholder-white/30 leading-relaxed transition-colors ${draftHasProfanity ? 'border-orange-500/40 focus:border-orange-500/60' : 'border-white/10 focus:border-primary/50'}`}
          />
          {draftHasProfanity && (
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="material-symbols-outlined text-orange-400 text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              <p className="text-orange-400 text-[11px]">Inappropriate words will be replaced with *** on post.</p>
            </div>
          )}
        </div>
        <button
          onClick={postQuestion}
          disabled={!draft.trim()}
          className="w-full py-3 rounded-xl signature-gradient text-white font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          Post Question
        </button>
      </div>

      {/* Questions list */}
      {qaLoading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-white/30">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-xs">Loading Q&amp;A...</span>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-8 text-white/30">
          <span className="material-symbols-outlined text-3xl mb-1 opacity-40">forum</span>
          <p className="text-sm">No questions yet. Be the first to ask!</p>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">{questions.length} Question{questions.length !== 1 ? 's' : ''}</p>
          {questions.map(q => (
            <div key={q.id} className="p-4 bg-white/5 border border-white/8 rounded-2xl space-y-3">
              <div>
                <p className="text-sm text-white/90 leading-relaxed">{q.text}</p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-white/30 text-[10px]">{q.author} · {q.time}</p>
                  <button
                    onClick={() => toggleUpvote(q.id)}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all ${q.upvoted ? 'bg-primary/20 text-primary' : 'text-white/30 hover:text-white/60'}`}
                  >
                    <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: q.upvoted ? "'FILL' 1" : "'FILL' 0" }}>thumb_up</span>
                    {q.upvotes}
                  </button>
                  <button
                    onClick={() => setReplyTo(replyTo === q.id ? null : q.id)}
                    className="text-[10px] text-primary/70 hover:text-primary font-bold transition-colors"
                  >
                    Reply
                  </button>
                </div>
              </div>

              {/* Answers */}
              {(q.answers || []).length > 0 && (
                <div className="ml-3 pl-3 border-l border-white/10 space-y-2">
                  {q.answers.map(a => (
                    <div key={a.id}>
                      <p className="text-sm text-white/80 leading-relaxed">{a.text}</p>
                      <p className="text-white/25 text-[10px] mt-0.5">{a.author} · {a.time}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply box */}
              {replyTo === q.id && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postReply(q.id)}
                      placeholder="Write a reply..."
                      className={`flex-1 px-3 py-2.5 bg-white/8 border rounded-xl text-sm text-white placeholder-white/30 focus:outline-none transition-colors ${replyHasProfanity ? 'border-orange-500/40' : 'border-white/15 focus:border-primary/40'}`}
                    />
                    <button
                      onClick={() => postReply(q.id)}
                      disabled={!replyText.trim()}
                      className="w-10 h-10 rounded-xl signature-gradient flex items-center justify-center disabled:opacity-40 flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                    </button>
                  </div>
                  {replyHasProfanity && (
                    <p className="text-orange-400 text-[11px] flex items-center gap-1 px-1">
                      <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                      Inappropriate words will be replaced with *** on reply.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main VideoPlayer page ────────────────────────────────────────────────────
const NUMERIC_PLAN_MAP = { '1': 'starter', '2': 'growth', '3': 'premium' };

export default function VideoPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { courses } = useCourses();
  const { currentUser } = useApp();

  // ── Anti-abuse: disable right-click, F12/DevTools shortcuts, and text selection ──
  useEffect(() => {
    const noCtxMenu = (e) => { e.preventDefault(); };
    const noDevtools = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) ||
        (e.ctrlKey && e.key === 'U') ||
        (e.metaKey && e.altKey && ['I', 'J'].includes(e.key))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', noCtxMenu);
    document.addEventListener('keydown', noDevtools);
    return () => {
      document.removeEventListener('contextmenu', noCtxMenu);
      document.removeEventListener('keydown', noDevtools);
    };
  }, []);

  const resolvedPlanKey = NUMERIC_PLAN_MAP[id];
  const contextCourse = resolvedPlanKey
    ? courses.find(c => c.isPlanProgram && c.planKey === resolvedPlanKey)
    : courses.find(c => c.id === id);

  const mockCourse = COURSES.find(c => c.id === Number(id));
  const course = contextCourse || mockCourse;

  // ── Plan access guard ─────────────────────────────────────────────────────
  const PLAN_LEVEL = { none: 0, starter: 1, growth: 2, premium: 3 };
  const userPlanKey = (() => {
    if (!currentUser) return 'none';
    if (currentUser.role === 'admin' || currentUser.role === 'lecturer') return 'premium';
    if (Array.isArray(currentUser.plans) && currentUser.plans.length) {
      return ['starter', 'growth', 'premium'].filter(p => currentUser.plans.includes(p)).pop() || 'none';
    }
    return currentUser.plan || 'none';
  })();
  const requiredPlan = contextCourse?.planKey || resolvedPlanKey || null;
  const hasAccess = !requiredPlan || (PLAN_LEVEL[userPlanKey] ?? 0) >= (PLAN_LEVEL[requiredPlan] ?? 0);

  const allLessons = contextCourse
    ? (contextCourse.sections || []).flatMap(s => s.lessons.map(l => ({ ...l, sectionTitle: s.title })))
    : [];

  const [currentLesson, setCurrentLesson] = useState(null);
  const [watched, setWatched] = useState({});
  const [activeTab, setActiveTab] = useState('lessons');

  // Initialize currentLesson once courses load from the server (allLessons starts
  // empty when courses are still being fetched, so useState(allLessons[0]) would
  // always give null). Also honors sectionIdx/lessonIdx passed via navigate state.
  useEffect(() => {
    if (allLessons.length === 0) return;
    setCurrentLesson(prev => {
      if (prev) return prev;
      const { sectionIdx, lessonIdx } = location.state || {};
      if (typeof sectionIdx === 'number' && typeof lessonIdx === 'number') {
        const sec = contextCourse?.sections?.[sectionIdx];
        const les = sec?.lessons?.[lessonIdx];
        if (les) return { ...les, sectionTitle: sec.title };
      }
      return allLessons[0];
    });
  }, [allLessons.length]);

  const isYouTube = (currentLesson?.videoType || 'youtube') === 'youtube';
  const currentIdx = allLessons.findIndex(l => l.id === currentLesson?.id);

  const goNext = () => {
    if (currentIdx < allLessons.length - 1) {
      setCurrentLesson(allLessons[currentIdx + 1]);
      setWatched(w => ({ ...w, [currentLesson?.id]: true }));
    }
  };
  const goPrev = () => { if (currentIdx > 0) setCurrentLesson(allLessons[currentIdx - 1]); };

  if (!course) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-on-surface-variant">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-5xl opacity-40">search_off</span>
          <p className="font-semibold">Course not found</p>
          <button onClick={() => navigate(-1)} className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold">Go Back</button>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-background px-6">
        <div className="text-center max-w-sm space-y-4">
          <span className="material-symbols-outlined text-5xl text-primary opacity-70">lock</span>
          <h2 className="text-lg font-bold text-on-surface">Plan required</h2>
          <p className="text-sm text-on-surface-variant">
            This content requires the <strong className="capitalize">{requiredPlan}</strong> plan or higher.
            Upgrade to unlock all lessons.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl border border-outline text-sm font-semibold text-on-surface">Go Back</button>
            <button onClick={() => navigate('/pricing')} className="px-4 py-2 rounded-xl signature-gradient text-white text-sm font-bold">Upgrade Plan</button>
          </div>
        </div>
      </div>
    );
  }

  if (!contextCourse || allLessons.length === 0) {
    return (
      <div className="bg-background min-h-screen text-on-surface pb-8 md:ml-64">
        <nav className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-slate-900/95 backdrop-blur-md flex items-center gap-3 px-4 py-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/10">
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <span className="text-white font-bold font-headline truncate">{course?.title}</span>
        </nav>
        <div className="pt-16 flex flex-col items-center justify-center h-[60vh] text-on-surface-variant space-y-3">
          <span className="material-symbols-outlined text-5xl opacity-40">video_library</span>
          <p className="font-semibold">No video lessons yet</p>
          <p className="text-sm text-center max-w-xs">The instructor hasn't uploaded any lessons for this course yet. Check back soon!</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-6 py-2.5 rounded-xl signature-gradient text-white font-bold text-sm">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen text-white flex flex-col md:ml-64">
      {/* Top nav */}
      <nav className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-white/10 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/10">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold truncate text-sm text-left">{course.title}</p>
          {currentLesson && <p className="text-white/50 text-xs truncate text-left">{currentLesson.sectionTitle} · {currentLesson.title}</p>}
        </div>
      </nav>

      {/* Video area */}
      <div className="relative bg-slate-900 w-full flex-shrink-0" style={{ aspectRatio: '16/9' }}>
        {currentLesson?.videoId ? (
          <>
            {isYouTube ? (
              IS_ANDROID_WEBVIEW ? (
                <WebViewYouTubePlayer
                  key={currentLesson.id}
                  videoId={currentLesson.videoId}
                  title={currentLesson.title}
                  onEnded={goNext}
                />
              ) : (
                <YouTubeCustomPlayer
                  key={currentLesson.id}
                  videoId={currentLesson.videoId}
                  title={currentLesson.title}
                  onEnded={goNext}
                  onPrev={goPrev}
                  hasNext={currentIdx < allLessons.length - 1}
                  hasPrev={currentIdx > 0}
                />
              )
            ) : (
              <VimeoPlayer videoId={currentLesson.videoId} title={currentLesson.title} />
            )}
            <CornerWatermark name={currentUser?.name || 'Student'} email={currentUser?.email || currentUser?.phone || ''} />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900">
            <span className="material-symbols-outlined text-5xl text-white/20">play_circle</span>
          </div>
        )}
      </div>

      {/* Lesson title bar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-white/10">
        <p className="text-white font-semibold text-sm truncate text-left">{currentLesson?.title}</p>
        {currentLesson?.duration && <p className="text-white/40 text-xs text-left">{currentLesson.duration}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 bg-slate-950">
        {[
          { key: 'lessons', label: 'Lessons', icon: 'list' },
          { key: 'notes',   label: 'Notes',   icon: 'edit_note' },
          { key: 'qa',      label: 'Q&A',     icon: 'forum' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${activeTab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
            <span className="material-symbols-outlined text-sm">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-8 space-y-2">
        {/* Lessons */}
        {activeTab === 'lessons' && (
          <>
            {(contextCourse.sections || []).map((section, si) => (
              <div key={section.id} className="mb-2">
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest px-2 py-1.5">
                  Section {si + 1}: {section.title}
                </p>
                {section.lessons.map((lesson) => {
                  const isActive = currentLesson?.id === lesson.id;
                  const isDone   = watched[lesson.id];
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => { setCurrentLesson({ ...lesson, sectionTitle: section.title }); setWatched(w => ({ ...w, [currentLesson?.id]: true })); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all mb-1 text-left ${isActive ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-primary' : isDone ? 'bg-secondary/30' : 'bg-white/10'}`}>
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1", color: isActive ? '#fff' : isDone ? '#4dd0e1' : '#ffffff80' }}>
                          {isDone ? 'check_circle' : isActive ? 'play_arrow' : 'play_circle'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-white font-bold' : 'text-white/80'}`}>{lesson.title}</p>
                        {lesson.duration && <p className="text-white/40 text-xs">{lesson.duration}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {/* Notes */}
        {activeTab === 'notes' && currentLesson && (
          <NotesTab lessonId={currentLesson.id} lessonTitle={currentLesson.title} />
        )}

        {/* Q&A */}
        {activeTab === 'qa' && currentLesson && (
          <QATab lessonId={currentLesson.id} lessonTitle={currentLesson.title} userName={currentUser?.name} />
        )}
      </div>

      <BottomNav />
    </div>
  );
}
