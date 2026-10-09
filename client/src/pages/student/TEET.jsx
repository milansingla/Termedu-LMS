import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';

const MAX_VIOLATIONS = 3;

const enterFullscreen = async () => {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.() ?? el.mozRequestFullScreen?.());
    }
  } catch {}
};
const exitFullscreen = () => {
  try {
    if (document.fullscreenElement) {
      (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.() ?? document.mozCancelFullScreen?.());
    }
  } catch {}
};

/* ─── Clean text before speaking (strip markdown / special chars) ─── */
function cleanForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold → plain
    .replace(/\*(.*?)\*/g, '$1')        // italic → plain
    .replace(/`([^`]*)`/g, '$1')        // inline code → plain
    .replace(/#{1,6}\s*/g, '')          // headings
    .replace(/•\s*/g, '')               // bullets
    .replace(/^\s*[-*]\s+/gm, '')       // list dashes
    .replace(/^\s*\d+\.\s+/gm, '')      // numbered lists
    .replace(/—/g, ', ')                // em-dash → pause
    .replace(/\n{2,}/g, '. ')           // paragraph breaks → sentence pause
    .replace(/\n/g, ' ')                // single newlines → space
    .replace(/\s{2,}/g, ' ')            // collapse spaces
    .trim();
}

/* ─── Pick the best available voice ─── */
function pickVoice(voices) {
  const preferred = ['Lekha', 'Priya', 'Heera', 'Raveena', 'Aditi', 'Neerja'];
  for (const n of preferred) {
    const v = voices.find(v => v.name.includes(n));
    if (v) return v;
  }
  const inVoice = voices.find(v => v.lang === 'en-IN');
  if (inVoice) return inVoice;
  // Prefer known quality female voices as fallback
  const femaleNames = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Veena', 'Serena', 'Zira'];
  for (const n of femaleNames) {
    const v = voices.find(v => v.name.includes(n));
    if (v) return v;
  }
  return voices.find(v => v.lang?.startsWith('en')) || null;
}

/* ─── Speech synthesis hook ─── */
function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const keepAliveRef = useRef(null);

  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      synth.cancel();
      clearInterval(keepAliveRef.current);

      const doSpeak = () => {
        const cleaned = cleanForSpeech(text);
        const utt = new SpeechSynthesisUtterance(cleaned);
        const voices = synth.getVoices();
        const voice = pickVoice(voices);
        if (voice) { utt.voice = voice; utt.lang = voice.lang; }
        else { utt.lang = 'en-IN'; }
        utt.rate = 1.05;   // natural conversational pace
        utt.pitch = 1.0;   // neutral — browser voices sound best at 1.0
        utt.volume = 1.0;

        utt.onstart = () => {
          setIsSpeaking(true);
          // Keep-alive every 14s — Chrome stops synthesis on long utterances
          keepAliveRef.current = setInterval(() => {
            if (synth.speaking && !synth.paused) {
              synth.pause();
              requestAnimationFrame(() => synth.resume());
            }
          }, 14000);
        };
        utt.onend = () => {
          clearInterval(keepAliveRef.current);
          setIsSpeaking(false);
          resolve();
        };
        utt.onerror = (e) => {
          clearInterval(keepAliveRef.current);
          setIsSpeaking(false);
          // 'interrupted' and 'canceled' are normal — not real errors
          resolve();
        };
        synth.speak(utt);
      };

      const voices = synth.getVoices();
      if (voices.length > 0) doSpeak();
      else synth.addEventListener('voiceschanged', function h() {
        synth.removeEventListener('voiceschanged', h);
        doSpeak();
      });
    });
  }, []);

  const stop = useCallback(() => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  useEffect(() => () => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop, isSpeaking };
}

/* ─── Pre-warm mic permission (call on a user gesture — e.g. "Begin Exam" tap) ─── */
async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Keep the stream alive for a moment so the browser marks permission as granted,
    // then release all tracks — SpeechRecognition will reuse the granted permission.
    setTimeout(() => stream.getTracks().forEach(t => t.stop()), 300);
    return true;
  } catch {
    return false;
  }
}

/* ─── Speech recognition hook ─── */
function useRecognition() {
  const [isListening, setIsListening]   = useState(false);
  const [micError,    setMicError]      = useState('');
  const [interimText, setInterimText]   = useState('');
  const recRef = useRef(null);

  const stopRec = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const listen = useCallback((onInterim) => new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicError('Speech recognition is not supported in your browser. Please type your answer.');
      resolve('');
      return;
    }

    setMicError('');
    setInterimText('');
    if (recRef.current) { try { recRef.current.abort(); } catch {} recRef.current = null; }

    // settled flag ensures promise resolves exactly once, even when
    // onerror + onend both fire (which Chrome always does)
    let settled = false;
    const settle = (val) => { if (!settled) { settled = true; resolve(val); } };

    const attempt = (lang, networkRetry = 0) => {
      const rec = new SR();
      recRef.current = rec;
      rec.continuous      = false;
      rec.interimResults  = true;
      rec.maxAlternatives = 1;
      rec.lang = lang;

      let final = '';

      rec.onstart = () => setIsListening(true);

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) { final += t; }
          else { interim += t; }
        }
        setInterimText(final + interim);
        if (onInterim) onInterim(final + interim);
      };

      rec.onerror = (e) => {
        setIsListening(false);
        setInterimText('');
        recRef.current = null;

        if (e.error === 'language-not-supported' && lang === 'en-IN') {
          rec.onend = null;
          attempt('en-US', 0);
          return;
        }

        // Network errors are often transient — silently retry up to 3 times
        if (e.error === 'network' && networkRetry < 3) {
          rec.onend = null;
          const delay = 600 * (networkRetry + 1);
          setTimeout(() => attempt(lang, networkRetry + 1), delay);
          return;
        }

        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setMicError('Microphone access was denied. Tap the mic icon in your browser address bar → Allow, then try again.');
        } else if (e.error === 'audio-capture') {
          setMicError('No microphone detected. Connect a microphone and try again, or type your answer.');
        } else if (e.error === 'network') {
          setMicError('Speech service is temporarily unavailable. Please type your answer or try again in a moment.');
        } else if (e.error === 'no-speech') {
          // Resolve with empty — caller decides what to show
        } else if (e.error !== 'aborted') {
          setMicError('Microphone could not be used. Please type your answer below.');
        }

        settle(e.error === 'aborted' ? final : '');
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimText('');
        recRef.current = null;
        settle(final);
      };

      try {
        rec.start();
      } catch {
        setIsListening(false);
        setMicError('Could not start microphone. Please type your answer below.');
        settle('');
      }
    };

    attempt('en-IN');
  }), []);

  useEffect(() => () => { if (recRef.current) { try { recRef.current.abort(); } catch {} } }, []);

  return { listen, stop: stopRec, isListening, micError, interimText };
}

/* ─── Animated avatar ─── */
function Avatar({ state }) {
  const speaking = state === 'speaking';
  const listening = state === 'listening';
  const thinking = state === 'thinking';

  return (
    <div className="relative flex items-center justify-center w-44 h-44 mx-auto">
      {speaking && (
        <>
          <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" style={{ animationDuration: '1s' }} />
          <div className="absolute inset-[-14px] rounded-full border-2 border-violet-400/25 animate-ping" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-[-28px] rounded-full border border-violet-300/10 animate-ping" style={{ animationDuration: '2s' }} />
        </>
      )}
      {listening && (
        <>
          <div className="absolute inset-0 rounded-full bg-pink-500/25 animate-ping" style={{ animationDuration: '0.75s' }} />
          <div className="absolute inset-[-14px] rounded-full border-2 border-pink-400/25 animate-ping" style={{ animationDuration: '1.1s' }} />
        </>
      )}
      <div className={`relative z-10 w-36 h-36 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
        speaking  ? 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 scale-105 shadow-violet-500/50'
        : listening ? 'bg-gradient-to-br from-pink-500 via-rose-600 to-pink-700 scale-105 shadow-pink-500/50'
        : thinking ? 'bg-gradient-to-br from-slate-600 to-slate-800'
        : 'bg-gradient-to-br from-violet-700 via-purple-800 to-indigo-900 shadow-violet-900/30'
      }`}>
        {thinking ? (
          <div className="flex gap-1.5">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {speaking && (
              <div className="flex items-end gap-0.5 h-5">
                {[10,18,14,22,10,16,12].map((h, i) => (
                  <div key={i} className="w-1 bg-white/80 rounded-full animate-pulse"
                    style={{ height: `${h}px`, animationDuration: `${0.35 + i * 0.08}s`, animationDelay: `${i * 0.06}s` }} />
                ))}
              </div>
            )}
            <span className="material-symbols-outlined text-white text-5xl"
              style={{ fontVariationSettings: listening ? "'FILL' 1" : "'FILL' 0" }}>
              {listening ? 'mic' : speaking ? 'record_voice_over' : 'face'}
            </span>
            <span className="text-white/60 text-[9px] font-bold uppercase tracking-widest">
              {speaking ? 'Speaking' : listening ? 'Listening' : 'Priya · TEET'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Score circle ─── */
function ScoreCircle({ score, passed }) {
  const r = 52; const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const dash = (pct / 100) * circ;
  const color = passed ? '#22c55e' : '#ef4444';

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="z-10 text-center">
        <p className="text-4xl font-black text-white leading-none">{pct}</p>
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">/ 100</p>
      </div>
    </div>
  );
}

/* ─── API helpers ─── */
async function fetchInterviewId(studentName = '', studentEmail = '', studentPhone = '', userId = null) {
  const res = await fetch('/api/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentName, studentEmail, studentPhone, userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) {
    const err = new Error(data.error || 'exam_locked');
    err.status = 403;
    if (data.unlocksAt) err.unlocksAt = data.unlocksAt;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || 'Failed to start exam');
  return data[0]?.id;
}

async function fetchAIReply(messages, interviewId, action, studentEmail) {
  const res = await fetch('/api/interview-chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, interviewId, action, studentEmail }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const err = new Error(data.message || 'API quota reached. Please wait a moment and try again.');
    err.isQuota = true;
    throw err;
  }
  if (!res.ok) throw new Error(data.message || 'AI request failed');
  return data;
}

/* ── Stream AI reply via SSE — yields text chunks as they arrive ── */
async function* streamAIReply(messages, interviewId) {
  const res = await fetch('/api/interview-chat-stream', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, interviewId }),
  });
  if (!res.ok) throw new Error('Stream request failed');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj.error) {
          const err = new Error(obj.error);
          if (obj.error === 'quota') err.isQuota = true;
          throw err;
        }
        if (obj.done) return;
        if (obj.text) yield obj.text;
      } catch (e) { if (e.isQuota !== undefined) throw e; }
    }
  }
}

/* ─── Parse final result block from AI text ─── */
function parseResult(text) {
  const scoreM  = text.match(/SCORE:\s*(\d+)/i);
  const resultM = text.match(/RESULT:\s*(PASS|FAIL)/i);
  const assessM = text.match(/ASSESSMENT:\s*([\s\S]+?)(?=RECOMMENDATION:|$)/i);
  const recM    = text.match(/RECOMMENDATION:\s*([\s\S]+?)$/i);
  const topicM  = text.match(/TOPIC_SCORES:[\s\S]*?Mindset=(\d+)[\s\S]*?Business=(\d+)[\s\S]*?Market=(\d+)[\s\S]*?Finance=(\d+)[\s\S]*?Problem=(\d+)[\s\S]*?Commitment=(\d+)/i);
  return {
    score:          scoreM  ? parseInt(scoreM[1], 10) : null,
    resultLabel:    resultM ? resultM[1].toUpperCase() : 'UNKNOWN',
    passed:         resultM ? resultM[1].toUpperCase() === 'PASS' : null,
    assessment:     assessM ? assessM[1].trim() : '',
    recommendation: recM    ? recM[1].trim() : '',
    topicScores: topicM ? {
      mindset:    parseInt(topicM[1], 10),
      business:   parseInt(topicM[2], 10),
      market:     parseInt(topicM[3], 10),
      finance:    parseInt(topicM[4], 10),
      problem:    parseInt(topicM[5], 10),
      commitment: parseInt(topicM[6], 10),
    } : null,
  };
}

const EXAM_STATES = { IDLE: 'idle', THINKING: 'thinking', SPEAKING: 'speaking', LISTENING: 'listening', DONE: 'done' };

/* ─── Detect abusive / profane language ─── */
const ABUSE_WORDS = [
  'fuck','fucked','fucker','fucking','fucks','f*ck','f**k',
  'shit','shits','shitting','bullshit','b*llshit',
  'bitch','bitches','bitching',
  'bastard','bastards',
  'asshole','assholes','ass hole',
  'cunt','cunts',
  'dick','dicks',
  'cock','cocks',
  'pussy','pussies',
  'whore','whores',
  'slut','sluts',
  'nigger','nigga','niggas',
  'faggot','fag','fags',
  'retard','retards',
  'motherfucker','motherfuckers','mf',
  'son of a bitch','sumbitch',
  'damn you','go to hell','go fuck',
  'chutiya','madarchod','bhenchod','bsdk','randi','harami','sala','saali','kamina','kaminey','gandu','lavde','lodu','bhosdi','bhosdike','mc','bc','mkc',
];
function detectAbuse(text) {
  const t = ' ' + text.toLowerCase().replace(/[*@#$!]/g, '') + ' ';
  return ABUSE_WORDS.some(w => t.includes(' ' + w + ' ') || t.includes(' ' + w + ',') || t.includes(' ' + w + '.'));
}

/* ─── Detect gibberish / non-serious answers ─── */
function detectGibberish(text) {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  // Too short for an exam answer (less than 4 meaningful characters)
  if (t.replace(/\s/g, '').length < 4) return true;

  // Repeated single character: "aaaa", "jjjjj"
  if (/^(.)\1{3,}$/.test(t.replace(/\s/g, ''))) return true;

  // Common keyboard mash patterns
  const keyboardMash = /^(asdf|qwer|zxcv|hjkl|uiop|bnm|asd|qwe|zxc|jkl|abc){2,}/i;
  if (keyboardMash.test(t.replace(/\s/g, ''))) return true;

  // Only non-letter characters (numbers/symbols/emojis only)
  if (/^[\d\W]+$/.test(t)) return true;

  // Very low unique character ratio — e.g. "abababab" (spam)
  const unique = new Set(t.replace(/\s/g, '')).size;
  const len = t.replace(/\s/g, '').length;
  if (len > 6 && unique / len < 0.2) return true;

  // Single-word non-answers (without at least one more word)
  const singleWordNonAnswers = ['yes', 'no', 'idk', 'ok', 'okay', 'lol', 'hmm', 'um', 'uh', 'hi', 'hello', 'nothing', 'nope', 'nah', 'dunno', 'none', 'na', 'n/a', 'skip', 'next', 'pass'];
  if (singleWordNonAnswers.includes(t) && t.split(/\s+/).length <= 2) return true;

  return false;
}

/* ─── Session persistence helpers ─── */
const TEET_SESSION_KEY = 'teet_exam_session';
function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(TEET_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.messages) && parsed.messages.length > 0 && parsed.interviewId) return parsed;
  } catch {}
  return null;
}
function clearStoredSession() {
  try { sessionStorage.removeItem(TEET_SESSION_KEY); } catch {}
}
function saveSession(messages, interviewId) {
  try { sessionStorage.setItem(TEET_SESSION_KEY, JSON.stringify({ messages, interviewId })); } catch {}
}

const SCORE_TOPICS = [
  { label: 'Entrepreneurship Mindset',   key: 'mindset',    max: 20 },
  { label: 'Business Idea Clarity',      key: 'business',   max: 20 },
  { label: 'Market Awareness',           key: 'market',     max: 15 },
  { label: 'Financial Thinking',         key: 'finance',    max: 15 },
  { label: 'Problem-Solving',            key: 'problem',    max: 15 },
  { label: 'Commitment & Communication', key: 'commitment', max: 15 },
];

/* ──────────────────────────────────── PREVIOUS RESULT CARD ──────────────────────────────────── */
function PreviousResultCard({ report, onRetake }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const passed = report.passed;
  const score  = report.score ?? 0;
  const date   = report.completedAt || report.createdAt;

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const msgs = (report.messages || []).filter(m => m.role !== 'assistant' || !m.content?.includes('SCORE:'));

  return (
    <div className={`rounded-3xl border p-6 space-y-4 ${passed ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${passed ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            <span className={`material-symbols-outlined text-2xl ${passed ? 'text-emerald-400' : 'text-red-400'}`}
              style={{ fontVariationSettings: "'FILL' 1" }}>
              {passed ? 'verified' : 'cancel'}
            </span>
          </div>
          <div>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Your Previous Result</p>
            <p className={`font-extrabold text-xl ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {passed ? 'PASSED' : 'FAILED'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-black ${passed ? 'text-emerald-300' : 'text-red-300'}`}>{score}<span className="text-lg font-normal text-white/30">/100</span></p>
          <p className="text-white/40 text-[10px] mt-0.5">{formattedDate}</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${passed ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-white/30">
        <span>0</span>
        <span className="text-white/50 font-semibold">Pass threshold: 60</span>
        <span>100</span>
      </div>

      {/* Per-topic scoring breakdown */}
      {report.topicScores && (
        <div className="bg-white/5 rounded-2xl p-4 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Scoring Breakdown</p>
          {SCORE_TOPICS.map(({ label, key, max }) => {
            const topicScore = report.topicScores[key];
            const hasScore = topicScore != null;
            const pct = hasScore ? Math.min(100, Math.round((topicScore / max) * 100)) : 0;
            const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-violet-500' : 'bg-red-500';
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">{label}</span>
                  <span className="text-xs font-bold text-white/80">{hasScore ? `${topicScore}/${max}` : `—/${max}`}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assessment */}
      {report.assessment && (
        <div className="bg-white/5 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Assessment</p>
          <p className="text-sm text-white/80 leading-relaxed">{report.assessment}</p>
        </div>
      )}

      {/* Recommendation */}
      {report.recommendation && (
        <div className={`rounded-2xl p-4 border ${passed ? 'bg-emerald-900/30 border-emerald-500/20' : 'bg-amber-900/30 border-amber-500/20'}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Recommendation</p>
          <p className={`text-sm leading-relaxed ${passed ? 'text-emerald-200' : 'text-amber-200'}`}>{report.recommendation}</p>
        </div>
      )}

      {/* Transcript toggle */}
      {msgs.length > 0 && (
        <div>
          <button
            onClick={() => setShowTranscript(p => !p)}
            className="flex items-center gap-2 text-white/50 hover:text-white/80 text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-sm">{showTranscript ? 'expand_less' : 'expand_more'}</span>
            {showTranscript ? 'Hide Transcript' : `View Full Transcript (${msgs.length} messages)`}
          </button>
          {showTranscript && (
            <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
              {msgs.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black ${
                    msg.role === 'assistant' ? 'bg-violet-600 text-white' : 'bg-white/20 text-white/70'
                  }`}>
                    {msg.role === 'assistant' ? 'P' : 'Me'}
                  </div>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'assistant' ? 'bg-white/8 text-white/80' : 'bg-violet-900/50 text-violet-100'
                  }`} style={{ backgroundColor: msg.role === 'assistant' ? 'rgba(255,255,255,0.06)' : '' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        {passed ? (
          <a href="/pricing" className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
            View Plans
          </a>
        ) : onRetake ? (
          <button onClick={onRetake} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>refresh</span>
            Retake Exam
          </button>
        ) : (
          <div className="flex-1 py-3 rounded-2xl bg-red-900/30 border border-red-500/20 text-red-400 font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
            Retake Locked
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────── MAIN COMPONENT ──────────────────────────────────── */
export default function TEET() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  /* restore session on mount — lazy initialisers run once */
  const [phase, setPhase] = useState(() => getStoredSession() ? 'exam' : 'landing');
  const [examState, setExamState] = useState(EXAM_STATES.IDLE);
  const [messages, setMessages] = useState(() => getStoredSession()?.messages ?? []);
  const [interviewId, setInterviewId] = useState(() => getStoredSession()?.interviewId ?? null);
  const [isResumed, setIsResumed] = useState(() => !!getStoredSession());
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('teet_tts') !== 'off'; } catch { return true; }
  });
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [gibberishWarning, setGibberishWarning] = useState('');
  const textInputRef      = useRef(null);
  const gibberishTimerRef = useRef(null);
  const abuseCountRef     = useRef(0);
  const [abuseWarning, setAbuseWarning] = useState('');
  const [retryIn, setRetryIn] = useState(0);
  const [previousReport, setPreviousReport] = useState(null);
  const [attemptStatus, setAttemptStatus] = useState(null); // null=loading
  const runningRef = useRef(false);
  const retryInfoRef = useRef(null);   // { msgs, id } pending auto-retry
  const retryCountRef = useRef(0);     // how many quota auto-retries we've done
  const messagesEndRef = useRef(null);
  const sentenceQueueRef = useRef([]);  // buffered sentences waiting for TTS
  const ttsRunningRef = useRef(false);  // true while TTS is draining the queue
  const ttsEnabledRef = useRef(ttsEnabled);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  const { speak, stop: stopSpeech, isSpeaking } = useSpeech();
  const { listen, stop: stopListening, isListening, micError, interimText } = useRecognition();

  const avatarState = isListening ? 'listening' : isSpeaking ? 'speaking' : examState === EXAM_STATES.THINKING ? 'thinking' : 'idle';
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* Save exam progress to sessionStorage on every message update */
  useEffect(() => {
    if (phase === 'exam' && messages.length > 0 && interviewId) {
      saveSession(messages, interviewId);
    }
  }, [phase, messages, interviewId]);

  /* Fetch attempt status for logged-in students */
  const fetchAttemptStatus = useCallback(async () => {
    if (!currentUser?.id) { setAttemptStatus({ blocked: false, attemptsUsed: 0, attemptsLeft: 2, hasPassed: false }); return; }
    try {
      const res = await fetch(`/api/teet/attempt-status?userId=${currentUser.id}`);
      const data = await res.json();
      setAttemptStatus(data);
    } catch { setAttemptStatus({ blocked: false, attemptsUsed: 0, attemptsLeft: 2, hasPassed: false }); }
  }, [currentUser?.id]);

  useEffect(() => { fetchAttemptStatus(); }, [fetchAttemptStatus]);

  /* ── Security: black screen + violation counter + auto-exit after 3 ── */
  const [securityWarning, setSecurityWarning] = useState('');
  const violationCountRef = useRef(0);
  const blackTimerRef     = useRef(null);
  const blurPendingRef    = useRef(null);
  const blackOverlayRef   = useRef(null); // direct DOM node — bypasses React render lag

  /* Create / destroy the DOM overlay when exam starts / ends */
  useEffect(() => {
    if (phase !== 'exam') {
      blackOverlayRef.current?.remove();
      blackOverlayRef.current = null;
      return;
    }
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'background:#000',
      'z-index:2147483647', 'display:none',
      'align-items:center', 'justify-content:center',
      'flex-direction:column', 'gap:12px',
      'pointer-events:none', 'user-select:none',
    ].join(';');
    const lockIcon = document.createElement('span');
    lockIcon.style.cssText = 'font-family:sans-serif;font-size:48px;color:rgba(255,255,255,0.12)';
    lockIcon.textContent = '\uD83D\uDD12';
    const lockLabel = document.createElement('p');
    lockLabel.style.cssText = 'font-family:sans-serif;font-size:13px;color:rgba(255,255,255,0.12);letter-spacing:0.1em';
    lockLabel.textContent = 'Content protected';
    el.appendChild(lockIcon);
    el.appendChild(lockLabel);
    document.body.appendChild(el);
    blackOverlayRef.current = el;
    return () => { el.remove(); blackOverlayRef.current = null; };
  }, [phase]);

  const showBlack = useCallback(() => {
    const el = blackOverlayRef.current;
    if (el) { el.style.display = 'flex'; }
  }, []);

  const hideBlack = useCallback((delay = 2000) => {
    clearTimeout(blackTimerRef.current);
    blackTimerRef.current = setTimeout(() => {
      const el = blackOverlayRef.current;
      if (el) el.style.display = 'none';
    }, delay);
  }, []);

  // Must be declared before doAutoExit and handleExit which both reference it
  const abandonSession = useCallback((id) => {
    if (!id) return;
    const url = `/api/interviews/${id}/abandon`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([JSON.stringify({})], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'PATCH', keepalive: true }).catch(() => {});
    }
  }, []);

  const doAutoExit = useCallback(() => {
    runningRef.current = false;
    stopSpeech(); stopListening();
    if (interviewId) abandonSession(interviewId);
    clearStoredSession();
    exitFullscreen();
    setIsResumed(false);
    setPhase('landing'); setMessages([]);
    setExamState(EXAM_STATES.IDLE);
  }, [stopSpeech, stopListening, interviewId, abandonSession]);

  const abuseTerminate = useCallback(async (currentMsgs, id, email) => {
    runningRef.current = false;
    stopSpeech(); stopListening();
    clearStoredSession();
    exitFullscreen();
    setExamState(EXAM_STATES.DONE);
    setPhase('evaluating');
    // Send the result email using the evaluate action (same as normal exam end)
    try { await fetchAIReply(currentMsgs, id, 'evaluate', email); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    setResult({
      passed: false,
      score: 0,
      resultLabel: 'FAIL',
      assessment: 'Your exam was immediately terminated because abusive or offensive language was detected multiple times. This is a professional assessment — all responses are monitored.',
      recommendation: 'Review our conduct policy and maintain respectful language in all future attempts.',
      topicScores: null,
    });
    setPhase('result');
    fetchAttemptStatus();
  }, [stopSpeech, stopListening, fetchAttemptStatus]);

  useEffect(() => {
    if (phase !== 'exam') return;

    const recordViolation = () => {
      violationCountRef.current += 1;
      const count = violationCountRef.current;
      setSecurityWarning(
        count >= MAX_VIOLATIONS
          ? `Exam terminated: ${MAX_VIOLATIONS} security violations detected.`
          : `Security warning ${count}/${MAX_VIOLATIONS}: screenshot or switch detected.`
      );
      if (count >= MAX_VIOLATIONS) setTimeout(doAutoExit, 2500);
    };

    const onBlur = () => {
      showBlack();                              // synchronous DOM update — no React lag
      clearTimeout(blurPendingRef.current);
      blurPendingRef.current = setTimeout(recordViolation, 200);
    };
    const onFocus = () => {
      clearTimeout(blurPendingRef.current);
      hideBlack(2000);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        showBlack();
        clearTimeout(blurPendingRef.current);
        blurPendingRef.current = setTimeout(recordViolation, 200);
      } else {
        clearTimeout(blurPendingRef.current);
        hideBlack(2000);
      }
    };
    // PC: PrintScreen (Windows) + Cmd+Shift+3/4/5 (Mac)
    const onKeyDown = (e) => {
      const isShot = e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key));
      if (!isShot) return;
      e.preventDefault();
      showBlack();                              // synchronous — fires before OS captures
      recordViolation();
      hideBlack(2000);
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(blackTimerRef.current);
      clearTimeout(blurPendingRef.current);
    };
  }, [phase, doAutoExit, showBlack, hideBlack]);

  /* ── Auto-focus text input when Priya finishes speaking/thinking ── */
  useEffect(() => {
    if (examState === EXAM_STATES.IDLE && phase === 'exam') {
      const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobileDevice) setTimeout(() => textInputRef.current?.focus(), 80);
    }
  }, [examState, phase]);

  /* ── Security: block copy / cut / paste / context-menu during exam ── */
  useEffect(() => {
    if (phase !== 'exam') return;
    const block = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('copy',        block, true);
    document.addEventListener('cut',         block, true);
    document.addEventListener('paste',       block, true);
    document.addEventListener('contextmenu', block, true);
    return () => {
      document.removeEventListener('copy',        block, true);
      document.removeEventListener('cut',         block, true);
      document.removeEventListener('paste',       block, true);
      document.removeEventListener('contextmenu', block, true);
    };
  }, [phase]);

  /* ── Abandon session if the user closes/navigates away during exam ── */
  useEffect(() => {
    if (phase !== 'exam' || !interviewId) return;
    const handleUnload = () => abandonSession(interviewId);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Also fires on React navigation (component unmount) — only if still in exam
      if (phase === 'exam') abandonSession(interviewId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, interviewId]);

  // Fetch this student's previous TEET report
  useEffect(() => {
    if (!currentUser?.email) return;
    fetch(`/api/my-teet-report?email=${encodeURIComponent(currentUser.email)}`)
      .then(r => r.json())
      .then(data => setPreviousReport(data || null))
      .catch(() => {});
  }, [currentUser?.email]);

  const isComplete = useCallback((text) => text.toLowerCase().includes('examination is now complete'), []);

  /* ── Process TTS sentence queue — runs concurrently with streaming ── */
  const processSentenceQueue = useCallback(async () => {
    if (ttsRunningRef.current) return;
    ttsRunningRef.current = true;
    while (sentenceQueueRef.current.length > 0) {
      const sentence = sentenceQueueRef.current.shift();
      if (ttsEnabledRef.current && sentence.trim()) await speak(sentence.trim());
    }
    ttsRunningRef.current = false;
  }, [speak]);

  const enqueueSentence = useCallback((text) => {
    if (!text?.trim()) return;
    sentenceQueueRef.current.push(text);
    processSentenceQueue();
  }, [processSentenceQueue]);

  const waitForTTSDrain = useCallback(() => new Promise(resolve => {
    const check = () => {
      if (!ttsRunningRef.current && sentenceQueueRef.current.length === 0) resolve();
      else setTimeout(check, 50);
    };
    check();
  }), []);

  // ── Auto-retry countdown ─────────────────────────────────────────────────────
  const runTurn = useCallback(async (currentMsgs, id) => {
    setExamState(EXAM_STATES.THINKING);
    setError('');

    // Reset sentence queue
    sentenceQueueRef.current = [];
    ttsRunningRef.current = false;

    try {
      let fullText = '';
      let sentenceBuffer = '';
      let firstChunk = true;

      // Add streaming placeholder — shows live typing in the chat
      setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

      const flushSentence = () => {
        const clean = sentenceBuffer.trim();
        if (clean) enqueueSentence(clean);
        sentenceBuffer = '';
      };

      for await (const chunk of streamAIReply(currentMsgs, id)) {
        if (!runningRef.current) break;

        fullText += chunk;
        sentenceBuffer += chunk;

        // Switch avatar to SPEAKING on very first chunk
        if (firstChunk) {
          firstChunk = false;
          setExamState(EXAM_STATES.SPEAKING);
        }

        // Update the streaming message in real-time
        setMessages(prev => prev.map(m => m.streaming ? { ...m, content: fullText } : m));

        // Detect sentence boundaries and fire TTS immediately
        const boundary = /[.!?।]\s+/g;
        let match;
        let lastIdx = 0;
        while ((match = boundary.exec(sentenceBuffer)) !== null) {
          const sentence = sentenceBuffer.slice(lastIdx, match.index + 1);
          enqueueSentence(sentence);
          lastIdx = match.index + match[0].length;
        }
        sentenceBuffer = sentenceBuffer.slice(lastIdx);
      }

      // Speak anything left in the buffer
      flushSentence();

      // Finalize message (remove streaming flag)
      const completedMsgs = [...currentMsgs, { role: 'assistant', content: fullText }];
      setMessages(prev => prev.map(m => m.streaming ? { role: 'assistant', content: fullText } : m));
      retryCountRef.current = 0;

      // Wait for all sentences to finish speaking
      await waitForTTSDrain();
      if (!runningRef.current) return;

      if (isComplete(fullText)) {
        // Show evaluating screen while we fetch the final score
        setPhase('evaluating');
        setExamState(EXAM_STATES.THINKING);
        await fetchAIReply(completedMsgs, id, 'evaluate', currentUser?.email);
        const parsed = parseResult(fullText);
        clearStoredSession();
        // Hold the evaluating screen for at least 2.5s so it feels deliberate
        await new Promise(r => setTimeout(r, 2500));
        setResult(parsed);
        setPhase('result');
        setExamState(EXAM_STATES.DONE);
        runningRef.current = false;
        // Refresh attempt count now that this attempt is finalized
        fetchAttemptStatus();
        return;
      }

      // After Priya finishes speaking, go IDLE — the user taps the mic button
      // (auto-calling listen() here fails on mobile because it's not a user gesture)
      setExamState(EXAM_STATES.IDLE);
    } catch (err) {
      // Remove any dangling streaming message
      setMessages(prev => prev.filter(m => !m.streaming || m.content));
      if (err?.isQuota && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        retryInfoRef.current = { msgs: currentMsgs, id };
        setExamState(EXAM_STATES.IDLE);
        setRetryIn(62);
        return;
      }
      setError('Something went wrong. Please press the mic or type to continue.');
      setExamState(EXAM_STATES.IDLE);
      runningRef.current = false;
    }
  }, [speak, isComplete, enqueueSentence, waitForTTSDrain, currentUser, fetchAttemptStatus]);

  // Countdown tick + fire retry when it reaches 0
  useEffect(() => {
    if (retryIn <= 0) return;
    if (retryIn === 1) {
      setRetryIn(0);
      const info = retryInfoRef.current;
      if (info) {
        retryInfoRef.current = null;
        runningRef.current = true;
        runTurn(info.msgs, info.id);
      }
      return;
    }
    const t = setTimeout(() => setRetryIn(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn, runTurn]);

  const startExam = useCallback(async () => {
    // Block if student has used all attempts and cooldown hasn't expired
    if (attemptStatus?.blocked) return;
    // Pre-warm mic permission while still inside the user-gesture call stack
    await requestMicPermission();
    await enterFullscreen();
    violationCountRef.current = 0;
    abuseCountRef.current = 0;
    setAbuseWarning('');
    setSecurityWarning('');
    if (blackOverlayRef.current) blackOverlayRef.current.style.display = 'none';
    clearStoredSession();
    setIsResumed(false);
    setPhase('exam');
    setMessages([]); setError(''); setResult(null);
    setRetryIn(0); retryInfoRef.current = null; retryCountRef.current = 0;
    runningRef.current = true;
    setExamState(EXAM_STATES.THINKING);
    try {
      const id = await fetchInterviewId(
        currentUser?.name || '',
        currentUser?.email || '',
        currentUser?.phone || '',
        currentUser?.id || null
      );
      setInterviewId(id);
      await runTurn([], id);
    } catch (err) {
      // Server returned 403 — exam is locked (attempt limit reached)
      if (err?.status === 403 || err?.message?.includes('exam_locked')) {
        exitFullscreen();
        setPhase('landing');
        setExamState(EXAM_STATES.IDLE);
        runningRef.current = false;
        await fetchAttemptStatus(); // refresh so locked state shows immediately
        return;
      }
      setError('Could not start the exam. Please try again.');
      setExamState(EXAM_STATES.IDLE);
      runningRef.current = false;
    }
  }, [runTurn, currentUser, attemptStatus, fetchAttemptStatus]);

  const showGibberishWarning = useCallback((msg) => {
    clearTimeout(gibberishTimerRef.current);
    setGibberishWarning(msg);
    gibberishTimerRef.current = setTimeout(() => setGibberishWarning(''), 5000);
  }, []);

  const handleTextSubmit = useCallback(async () => {
    const text = textInput.trim();
    if (!text || examState === EXAM_STATES.THINKING || examState === EXAM_STATES.SPEAKING) return;
    // Only warn for exam questions (not during registration phase — first 3 AI turns)
    const aiTurnCount = messages.filter(m => m.role === 'assistant').length;
    const isExamPhase = aiTurnCount >= 3 || (currentUser?.name && currentUser?.email);
    if (isExamPhase && detectGibberish(text)) {
      showGibberishWarning('⚠️ This looks like a non-serious answer. Priya is evaluating your responses — please give a genuine, thoughtful reply.');
    }
    // Abuse detection — 3 strikes and the exam terminates immediately
    if (isExamPhase && detectAbuse(text)) {
      abuseCountRef.current += 1;
      const count = abuseCountRef.current;
      if (count >= 3) {
        setTextInput('');
        const newMsgs = [...messages, { role: 'user', content: text }];
        setMessages(newMsgs);
        await abuseTerminate(newMsgs, interviewId, currentUser?.email);
        return;
      }
      setAbuseWarning(`⚠️ Abusive language detected — warning ${count}/3. One more violation will immediately terminate your exam.`);
      setTimeout(() => setAbuseWarning(''), 6000);
    }
    stopListening();
    setTextInput('');
    const newMsgs = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);
    runningRef.current = true;
    await runTurn(newMsgs, interviewId);
  }, [textInput, messages, interviewId, examState, runTurn, stopListening, showGibberishWarning, currentUser, abuseTerminate]);

  const handleMic = useCallback(async () => {
    // Locked while Priya is speaking or thinking
    if (examState === EXAM_STATES.THINKING || examState === EXAM_STATES.SPEAKING) return;
    // STOP — already listening, tap again to stop
    if (isListening) {
      stopListening();
      setExamState(EXAM_STATES.IDLE);
      return;
    }
    // START
    setExamState(EXAM_STATES.LISTENING);
    const transcript = await listen();
    if (transcript.trim()) {
      const aiTurnCount = messages.filter(m => m.role === 'assistant').length;
      const isExamPhase = aiTurnCount >= 3 || (currentUser?.name && currentUser?.email);
      if (isExamPhase && detectGibberish(transcript)) {
        showGibberishWarning('⚠️ That response didn\'t seem like a proper answer. Priya is evaluating your responses — please speak clearly and thoughtfully.');
      }
      // Abuse detection via mic — same 3-strike rule
      if (isExamPhase && detectAbuse(transcript)) {
        abuseCountRef.current += 1;
        const count = abuseCountRef.current;
        if (count >= 3) {
          const newMsgs = [...messages, { role: 'user', content: transcript }];
          setMessages(newMsgs);
          await abuseTerminate(newMsgs, interviewId, currentUser?.email);
          return;
        }
        setAbuseWarning(`⚠️ Abusive language detected — warning ${count}/3. One more violation will immediately terminate your exam.`);
        setTimeout(() => setAbuseWarning(''), 6000);
      }
      const newMsgs = [...messages, { role: 'user', content: transcript }];
      setMessages(newMsgs);
      runningRef.current = true;
      await runTurn(newMsgs, interviewId);
    } else {
      setExamState(EXAM_STATES.IDLE);
    }
  }, [examState, isListening, listen, stopListening, messages, interviewId, runTurn, showGibberishWarning, currentUser, abuseTerminate]);

  const handleExit = useCallback(() => {
    runningRef.current = false;
    stopSpeech(); stopListening();
    // Mark session as abandoned on the server before clearing local state
    if (interviewId) abandonSession(interviewId);
    clearStoredSession();
    exitFullscreen();
    setIsResumed(false);
    setPhase('landing'); setMessages([]);
    setExamState(EXAM_STATES.IDLE);
  }, [stopSpeech, stopListening, interviewId, abandonSession]);

  /* ── RESULT PAGE ── */
  if (phase === 'result' && result) {
    exitFullscreen();
    const passed = result.passed;
    const score  = result.score ?? 0;

    return (
      <div className="fixed inset-0 z-[9999] bg-[#09090b] flex flex-col text-white overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-violet-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            <span className="font-bold text-sm">TEET · Result</span>
          </div>
          <button onClick={() => { clearStoredSession(); setPhase('landing'); setResult(null); }}
            className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-all">
            Done
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          {/* Pass / Fail banner */}
          <div className={`w-full rounded-3xl p-5 text-center space-y-4 ${passed ? 'bg-gradient-to-br from-emerald-800/60 to-emerald-900/80 border border-emerald-500/30' : 'bg-gradient-to-br from-red-900/60 to-red-950/80 border border-red-500/30'}`}>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-black text-base uppercase tracking-widest ${passed ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                {passed ? 'verified' : 'cancel'}
              </span>
              {passed ? 'PASSED' : 'FAILED'}
            </div>
            <div className="flex justify-center">
              <ScoreCircle score={score} passed={passed} />
            </div>
            <p className={`text-sm font-semibold ${passed ? 'text-emerald-300' : 'text-red-300'}`}>
              {passed ? 'Congratulations! You are ready for T.E.R.M. Edu.' : `${60 - score > 0 ? `You needed ${60 - score} more points to pass.` : 'Keep practising and try again!'}`}
            </p>
          </div>

          {/* Score breakdown */}
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">Scoring Breakdown</p>
            {SCORE_TOPICS.map(({ label, key, max }) => {
              const topicScore = result.topicScores?.[key];
              const hasScore = topicScore != null;
              const pct = hasScore ? Math.min(100, Math.round((topicScore / max) * 100)) : null;
              const barColor = !hasScore ? 'bg-white/20'
                : pct >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : pct >= 60 ? 'bg-gradient-to-r from-violet-500 to-purple-400'
                : 'bg-gradient-to-r from-red-500 to-rose-400';
              return (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/70">{label}</span>
                    <span className="text-xs font-bold text-white/80">
                      {hasScore ? `${topicScore}/${max}` : `—/${max}`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: hasScore ? `${pct}%` : '0%' }} />
                  </div>
                </div>
              );
            })}
            {!result.topicScores && (
              <p className="text-center text-white/30 text-[10px] pt-1">Detailed per-topic scores are in your result report</p>
            )}
          </div>

          {/* Assessment */}
          {result.assessment && (
            <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-violet-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>assessment</span>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">Assessment</p>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{result.assessment}</p>
            </div>
          )}

          {/* Recommendation */}
          {result.recommendation && (
            <div className={`w-full rounded-2xl p-5 space-y-2 border ${passed ? 'bg-emerald-900/30 border-emerald-500/20' : 'bg-amber-900/30 border-amber-500/20'}`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">Recommendation</p>
              </div>
              <p className={`text-sm leading-relaxed ${passed ? 'text-emerald-200' : 'text-amber-200'}`}>{result.recommendation}</p>
            </div>
          )}

          {/* CTA buttons */}
          <div className="w-full space-y-3 pb-4">
            {passed ? (
              <button onClick={() => navigate('/pricing')}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                Enroll Now — View Plans
              </button>
            ) : attemptStatus?.blocked ? (
              <div className="w-full py-4 rounded-2xl bg-red-900/40 border border-red-500/30 text-red-300 font-extrabold text-sm flex flex-col items-center gap-1 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
                  Retake Locked — 2 Attempts Used
                </div>
                <p className="text-red-400/70 text-xs font-normal">
                  Unlocks {new Date(attemptStatus.unlocksAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            ) : (
              <button onClick={startExam}
                disabled={!attemptStatus}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-60">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>refresh</span>
                {attemptStatus?.attemptsLeft === 1 ? 'Retake — Final Attempt' : 'Retake Examination'}
              </button>
            )}
            <button onClick={() => { exitFullscreen(); setPhase('landing'); setResult(null); }}
              className="w-full py-3 rounded-2xl border border-white/10 text-white/50 font-semibold text-sm hover:bg-white/5 transition-all">
              Back to TEET
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── EVALUATING SCREEN — shown while results are being calculated ── */
  if (phase === 'evaluating') {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#09090b] flex flex-col items-center justify-center text-white gap-8 px-6">
        <div className="relative flex items-center justify-center w-40 h-40">
          <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-[-16px] rounded-full border-2 border-violet-400/10 animate-ping" style={{ animationDuration: '2.2s' }} />
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 flex items-center justify-center shadow-2xl shadow-violet-900/60">
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
          </div>
        </div>

        <div className="text-center space-y-3 max-w-xs">
          <h2 className="text-2xl font-extrabold font-headline">Evaluating Your Results</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Priya is carefully analysing your responses and calculating your score. Just a moment…
          </p>
        </div>

        <div className="w-56 space-y-2">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full animate-pulse" style={{ width: '100%' }} />
          </div>
          <p className="text-center text-white/30 text-[11px]">100% · Exam Complete</p>
        </div>
      </div>
    );
  }

  /* ── EXAM SCREEN ── */
  if (phase === 'exam') {
    const questionCount = messages.filter(m => m.role === 'assistant').length;
    // When user is logged in their info is pre-filled — no intro turns. Otherwise subtract 3 intro turns.
    const introOffset = currentUser?.name && currentUser?.email ? 0 : 3;
    // Cap at 95% while exam is running — only reaches 100% on the evaluating/result screen
    const progress = Math.min(95, Math.round(Math.max(0, questionCount - introOffset) / 8 * 100));

    return (
      <div
        className="fixed inset-0 z-[9999] bg-[#09090b] flex flex-col text-white"
        style={{ userSelect: 'none', WebkitUserSelect: 'none', height: '100dvh', touchAction: 'pan-y', overscrollBehavior: 'none', WebkitOverflowScrolling: 'touch' }}
        onCopy={e => e.preventDefault()}
        onCut={e => e.preventDefault()}
        onPaste={e => e.preventDefault()}
        onContextMenu={e => e.preventDefault()}
      >

        {/* Watermark — student identity always burned into the screen */}
        <div
          className="absolute inset-0 z-[9998] pointer-events-none select-none overflow-hidden"
          aria-hidden="true"
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute whitespace-nowrap text-white/[0.045] font-bold text-xs tracking-widest uppercase"
              style={{
                transform: 'rotate(-30deg)',
                top: `${(i * 12) - 10}%`,
                left: '-20%',
                width: '160%',
                letterSpacing: '0.15em',
              }}
            >
              {`${currentUser?.name || 'Student'} · ${currentUser?.email || ''} · TEET · T.E.R.M.Edu · `.repeat(6)}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-violet-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
            <span className="text-white font-bold text-sm">TEET Exam</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress — visible on all screen sizes */}
            <div className="flex items-center gap-1.5">
              <div className="w-20 sm:w-28 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-white/40 text-[10px] font-bold w-7 text-right">{progress}%</span>
            </div>

            {/* TTS toggle */}
            <button
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                try { localStorage.setItem('teet_tts', next ? 'on' : 'off'); } catch {}
                if (!next) stopSpeech();
              }}
              title={ttsEnabled ? 'Mute Priya (TTS off)' : 'Unmute Priya (TTS on)'}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                ttsEnabled ? 'bg-violet-600/30 text-violet-300 hover:bg-violet-600/50' : 'bg-white/10 text-white/30 hover:bg-white/20'
              }`}>
              <span className="material-symbols-outlined text-[18px]">
                {ttsEnabled ? 'volume_up' : 'volume_off'}
              </span>
            </button>

            <button onClick={handleExit}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">close</span>
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* Security warning — top of screen, below header */}
        {securityWarning && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-600 flex-shrink-0">
            <span className="material-symbols-outlined text-white text-sm flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
            <p className="text-white text-xs font-semibold flex-1 leading-snug">{securityWarning}</p>
            <button onClick={() => setSecurityWarning('')} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Gibberish / non-serious answer warning */}
        {gibberishWarning && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 border-b border-amber-500/30 flex-shrink-0 animate-pulse">
            <span className="material-symbols-outlined text-amber-400 text-sm flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <p className="text-amber-200 text-xs font-semibold flex-1 leading-snug">{gibberishWarning}</p>
            <button onClick={() => setGibberishWarning('')} className="text-amber-400/60 hover:text-amber-300 transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Abusive language warning */}
        {abuseWarning && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 border-b border-red-500/30 flex-shrink-0 animate-pulse">
            <span className="material-symbols-outlined text-red-400 text-sm flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>gpp_bad</span>
            <p className="text-red-200 text-xs font-semibold flex-1 leading-snug">{abuseWarning}</p>
            <button onClick={() => setAbuseWarning('')} className="text-red-400/60 hover:text-red-300 transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Avatar section — row on mobile, column on desktop */}
          <div className="sticky top-0 z-10 bg-[#09090b] border-b border-white/5">

            {/* Mobile: compact horizontal row */}
            <div className="flex sm:hidden items-center gap-3 px-4 py-2.5">
              <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-lg transition-colors ${
                avatarState === 'speaking'  ? 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700'
                : avatarState === 'listening' ? 'bg-gradient-to-br from-pink-500 via-rose-600 to-pink-700'
                : avatarState === 'thinking'  ? 'bg-gradient-to-br from-slate-600 to-slate-800'
                : 'bg-gradient-to-br from-violet-700 via-purple-800 to-indigo-900'
              }`}>
                {avatarState === 'thinking'
                  ? <div className="flex gap-0.5">{[0,1,2].map(i => <div key={i} className="w-1 h-1 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</div>
                  : <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: avatarState === 'listening' ? "'FILL' 1" : "'FILL' 0" }}>
                      {avatarState === 'listening' ? 'mic' : avatarState === 'speaking' ? 'record_voice_over' : 'face'}
                    </span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm leading-tight">Priya</p>
                <p className="text-white/30 text-[10px]">TEET Examiner · T.E.R.M. Edu</p>
              </div>
              <div className="flex-shrink-0">
                {avatarState === 'listening' && <span className="px-2 py-1 rounded-full bg-pink-500/20 border border-pink-500/30 text-pink-300 text-[10px] font-bold animate-pulse">🎤 Listening</span>}
                {avatarState === 'speaking'  && <span className="px-2 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-bold">💬 Speaking</span>}
                {avatarState === 'thinking'  && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold">Thinking…</span>}
                {avatarState === 'idle' && messages.length > 0 && <span className="text-white/25 text-[10px]">Tap mic or type</span>}
              </div>
            </div>

            {/* Desktop: column layout with full avatar */}
            <div className="hidden sm:flex flex-col items-center pt-3 pb-2">
              <Avatar state={avatarState} />
              <div className="mt-1.5 text-center">
                <p className="font-bold text-white text-sm leading-tight">Priya</p>
                <p className="text-white/30 text-[10px]">TEET Examiner · T.E.R.M. Edu</p>
              </div>
              <div className="mt-1.5 h-6 flex items-center justify-center">
                {examState === EXAM_STATES.LISTENING && (
                  <div className="px-3 py-1 rounded-full bg-pink-500/20 border border-pink-500/30">
                    <p className="text-pink-300 text-xs font-semibold animate-pulse">🎤 Listening…</p>
                  </div>
                )}
                {examState === EXAM_STATES.SPEAKING && (
                  <div className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30">
                    <p className="text-violet-300 text-xs font-semibold">💬 Priya is speaking…</p>
                  </div>
                )}
                {examState === EXAM_STATES.THINKING && (
                  <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    <p className="text-white/40 text-xs font-semibold">Thinking…</p>
                  </div>
                )}
                {examState === EXAM_STATES.IDLE && messages.length > 0 && (
                  <p className="text-white/25 text-xs">Press mic or type below</p>
                )}
              </div>
            </div>
          </div>

          {/* Conversation */}
          <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
            {/* Resumed session banner */}
            {isResumed && messages.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                <span className="material-symbols-outlined text-sm flex-shrink-0">history</span>
                <span>Session restored — continue from where you left off</span>
                <button onClick={() => setIsResumed(false)} className="ml-auto text-amber-400/60 hover:text-amber-300 transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
                  msg.role === 'assistant' ? 'bg-gradient-to-br from-violet-600 to-purple-700' : 'bg-white/15'
                }`}>
                  {msg.role === 'assistant'
                    ? <span className="material-symbols-outlined text-[13px] text-white">face</span>
                    : <span className="text-white/70">You</span>}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'assistant' ? 'bg-white/8 text-white border border-white/10' : 'bg-violet-600/70 text-white'
                }`} style={{ backgroundColor: msg.role === 'assistant' ? 'rgba(255,255,255,0.06)' : undefined }}>
                  {msg.content || (msg.streaming ? '' : '')}
                  {msg.streaming && (
                    <span className="inline-block w-[2px] h-[14px] bg-violet-300 ml-0.5 align-middle animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            {messages.length === 0 && examState === EXAM_STATES.THINKING && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[13px] text-white">face</span>
                </div>
                <div className="bg-white/6 border border-white/10 rounded-2xl px-4 py-3">
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Auto-retry countdown */}
        {retryIn > 0 && (
          <div className="px-4 py-3 bg-violet-950/80 border-t border-violet-500/30 flex-shrink-0">
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
              </span>
              <p className="text-violet-300 text-xs text-center">
                Priya is catching her breath — resuming automatically in <span className="font-bold text-violet-200">{retryIn}s</span>
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !retryIn && (
          <div className="px-4 py-2 bg-red-950/80 border-t border-red-500/30 flex-shrink-0">
            <p className="text-red-300 text-xs text-center">{error}</p>
          </div>
        )}

        {/* Input bar — safe-area aware for iPhone home indicator */}
        <div className="flex-shrink-0 border-t border-white/10 bg-[#09090b]"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>

          {/* Mic error */}
          {micError && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-red-950/60 border border-red-500/30 flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400 text-sm flex-shrink-0 mt-0.5">mic_off</span>
              <p className="text-red-300 text-xs leading-relaxed">{micError}</p>
            </div>
          )}

          {/* Interim speech preview */}
          {interimText && isListening && (
            <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-pink-950/40 border border-pink-500/20 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse flex-shrink-0" />
              <p className="text-pink-200 text-xs italic truncate">{interimText}</p>
            </div>
          )}

          <div className="flex items-center gap-2 max-w-lg mx-auto px-3 pt-2">
            {(() => {
              const locked = examState === EXAM_STATES.THINKING || examState === EXAM_STATES.SPEAKING;
              return (<>
            <button
              onClick={handleMic}
              disabled={locked}
              title={locked ? (examState === EXAM_STATES.SPEAKING ? 'Wait for Priya to finish' : 'Priya is thinking…') : isListening ? 'Tap to stop' : 'Tap to speak'}
              className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all active:scale-95 ${
                locked
                  ? 'bg-white/5 opacity-40 cursor-not-allowed'
                  : isListening
                    ? 'bg-pink-600 shadow-lg shadow-pink-500/40 scale-110 animate-pulse'
                    : 'bg-white/10 hover:bg-white/20'
              }`}>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isListening ? "'FILL' 1" : "'FILL' 0" }}>
                {locked ? (examState === EXAM_STATES.SPEAKING ? 'volume_up' : 'hourglass_top') : 'mic'}
              </span>
            </button>
            <input
              ref={textInputRef}
              type="text" value={textInput}
              disabled={locked}
              onChange={e => { setTextInput(e.target.value); if (isListening) stopListening(); }}
              onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
              placeholder={
                examState === EXAM_STATES.SPEAKING ? 'Priya is speaking…' :
                examState === EXAM_STATES.THINKING  ? 'Priya is thinking…' :
                isListening ? 'Listening… speak now' : 'Type your answer…'
              }
              className="flex-1 min-w-0 border rounded-2xl px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderColor: isListening ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.15)',
              }}
            />
            </>);
            })()}
            <button onClick={handleTextSubmit}
              disabled={!textInput.trim() || examState === EXAM_STATES.THINKING || examState === EXAM_STATES.SPEAKING}
              className="w-11 h-11 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 flex-shrink-0 flex items-center justify-center transition-all">
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
          <p className="text-center text-white/20 text-[10px] mt-1.5 pb-0.5">
            {isListening ? 'Speak clearly · tap mic or start typing to stop' : 'Tap mic to speak · Enter or tap send to type'}
          </p>
        </div>
      </div>
    );
  }

  /* ── LANDING PAGE ── */
  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar showBack title="TEET" />
      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto space-y-6">

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 p-6 text-white shadow-xl shadow-violet-900/40">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 right-6 w-40 h-40 rounded-full bg-white blur-3xl" />
            <div className="absolute bottom-4 left-6 w-28 h-28 rounded-full bg-violet-300 blur-2xl" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
          <div className="relative z-10 space-y-4">
            {/* Exclusivity badge */}
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-full w-fit">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              Exclusive — Required for Growth &amp; Premium plans
            </div>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center ring-1 ring-white/20">
                <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </div>
              <div>
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">T.E.R.M. Edu · AI Exam</p>
                <h1 className="font-extrabold text-2xl leading-none tracking-tight">TEET</h1>
                <p className="text-white/70 text-xs">Term Education Entrance Test</p>
              </div>
            </div>
            <p className="text-white/85 text-sm leading-relaxed">
              Meet Priya, your AI examiner. Answer 6–7 adaptive questions about entrepreneurship and get an instant scored report — <span className="font-semibold text-white">Pass ≥ 60/100 to unlock premium plans.</span>
            </p>

            {/* Attempt counter badge */}
            {attemptStatus && !attemptStatus.blocked && currentUser?.id && (
              <div className={`flex items-center gap-2 w-fit px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                attemptStatus.attemptsLeft === 1
                  ? 'bg-orange-400/10 border-orange-400/20 text-orange-300'
                  : 'bg-white/10 border-white/20 text-white/60'
              }`}>
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
                Attempt {attemptStatus.attemptsUsed + 1} of 2
                {attemptStatus.attemptsLeft === 1 && ' · Last chance'}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              {attemptStatus?.blocked ? (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-bold">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                  Exam Locked
                </div>
              ) : (
                <button onClick={startExam}
                  disabled={!attemptStatus}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-violet-700 font-extrabold text-sm hover:bg-violet-50 transition-all active:scale-95 shadow-lg shadow-black/20 disabled:opacity-60">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                  {previousReport ? 'Retake Examination' : 'Begin Examination'}
                </button>
              )}
              <div className="flex items-center gap-2 text-white/60 text-xs">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                ~10–15 minutes
              </div>
            </div>
          </div>
        </div>

        {/* What you unlock */}
        <div className="bg-[#0f0a1e] border border-violet-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-violet-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>lock_open</span>
            <p className="font-bold text-white text-sm">What passing TEET unlocks</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: 'trending_up',       label: 'Growth Plan',        desc: 'Advanced courses & mentorship',   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
              { icon: 'workspace_premium', label: 'Premium Plan',       desc: 'Full incubation & support',       color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
              { icon: 'verified',          label: 'TEET Certificate',   desc: 'Official scored report card',     color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { icon: 'groups',            label: 'Entrepreneur Network',desc: 'Peer & mentor community',        color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
            ].map(({ icon, label, desc, color, bg }) => (
              <div key={label} className={`rounded-xl border p-3 space-y-1 ${bg}`}>
                <span className={`material-symbols-outlined text-lg ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <p className="text-white text-xs font-bold leading-tight">{label}</p>
                <p className="text-white/40 text-[10px] leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Previous result card */}
        {previousReport && (
          <PreviousResultCard report={previousReport} onRetake={attemptStatus?.blocked ? null : startExam} />
        )}

        {/* Locked state card */}
        {attemptStatus?.blocked && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-red-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
              </div>
              <div>
                <p className="font-extrabold text-red-300 text-sm">Exam Access Locked</p>
                <p className="text-xs text-red-400/70 mt-0.5">2 of 2 attempts used</p>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              You have used both your TEET attempts. Your next attempt unlocks on{' '}
              <span className="font-bold text-on-surface">
                {new Date(attemptStatus.unlocksAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>.
            </p>
            <p className="text-xs text-on-surface-variant/60">
              Use this time to strengthen your entrepreneurship knowledge. Review the scoring rubric below and practice your answers before your next attempt.
            </p>
          </div>
        )}

        {/* Exam format */}
        <div className="space-y-3">
          <h2 className="font-bold text-lg">Examination Format</h2>
          <div className="grid gap-3">
            {[
              { step: '01', icon: 'badge', title: currentUser?.name ? 'Auto-Registered' : 'Registration (3 turns)', desc: currentUser?.name ? `You're registered as ${currentUser.name}. Priya will greet you by name and start the exam directly.` : 'Priya will ask for your name, email, and WhatsApp number to register you and send your results.', color: currentUser?.name ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600' },
              { step: '02', icon: 'quiz', title: '6–7 Oral Questions', desc: 'Priya asks questions on entrepreneurship mindset, your business idea, market awareness, finances, problem-solving, and commitment.', color: 'bg-violet-50 text-violet-600' },
              { step: '03', icon: 'fact_check', title: 'Follow-up Until Satisfied', desc: 'If your answer is vague, Priya will ask a follow-up question. She only moves on when she is satisfied with your response.', color: 'bg-amber-50 text-amber-700' },
              { step: '04', icon: 'workspace_premium', title: 'Instant Scored Report', desc: 'You receive a score out of 100, a clear PASS or FAIL verdict, a personal assessment, and a next-step recommendation.', color: 'bg-emerald-50 text-emerald-600' },
            ].map(({ step, icon, title, desc, color }) => (
              <div key={step} className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 flex gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mb-0.5">Step {step}</p>
                  <p className="font-bold text-sm">{title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring rubric */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-violet-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>bar_chart</span>
            <h3 className="font-bold text-sm">Scoring Rubric</h3>
            <span className="ml-auto text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">Pass ≥ 60/100</span>
          </div>
          <div className="space-y-2.5">
            {SCORE_TOPICS.map(({ label, max }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-on-surface-variant flex-1 min-w-0 truncate">{label}</span>
                  <span className="text-xs font-bold text-on-surface flex-shrink-0">/{max}</span>
                </div>
                <div className="h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400/60 rounded-full" style={{ width: `${max}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
            <p className="font-bold text-amber-900 text-sm">Before You Begin</p>
          </div>
          <ul className="space-y-2">
            {[
              'Find a quiet space — Priya listens through your microphone',
              'Speak clearly and give detailed answers — vague answers get follow-ups',
              'You need 60 or more out of 100 to pass',
              'Have your email and WhatsApp number ready for registration',
              'You can also type answers if you prefer not to speak',
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <span className="text-xs text-amber-800">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {attemptStatus?.blocked ? (
          <div className="w-full py-4 rounded-2xl bg-red-900/30 border border-red-500/30 text-red-300 font-extrabold text-base flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
            Exam Locked · Unlocks {new Date(attemptStatus.unlocksAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        ) : (
          <button onClick={startExam}
            disabled={!attemptStatus}
            className="w-full py-4 rounded-2xl signature-gradient text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-60">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            {attemptStatus?.attemptsLeft === 1 ? 'Start Final Attempt' : 'Start TEET Examination'}
          </button>
        )}
        <p className="text-center text-xs text-on-surface-variant">Free for all T.E.R.M. Edu students · Results saved to your profile</p>
      </main>
      <BottomNav />
    </div>
  );
}
