import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';

function formatDate(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return str; }
}

function ScoreRing({ score, passed, size = 48 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const dash = (pct / 100) * circ;
  const color = passed === true ? '#22c55e' : passed === false ? '#ef4444' : '#a78bfa';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span className="z-10 text-[11px] font-black" style={{ color }}>{pct}</span>
    </div>
  );
}

function ReportDetail({ report, onClose, onSummaryUpdate }) {
  const passed = report.passed;
  const [summary, setSummary] = useState(report.summary || null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [activeTab, setActiveTab] = useState(report.summary ? 'summary' : 'transcript');

  const msgs = (report.messages || []).filter(m => m.content && m.role);
  const qaPairs = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'assistant') {
      qaPairs.push({ priya: msgs[i].content, student: msgs[i + 1]?.role === 'user' ? msgs[i + 1].content : null, idx: i });
      if (msgs[i + 1]?.role === 'user') i++;
    }
  }

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    setSummaryError('');
    try {
      const res = await fetch(`/api/teet-reports/${report.id}/summary`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setSummary(data.summary);
      setActiveTab('summary');
      onSummaryUpdate?.(report.id, data.summary);
    } catch (err) {
      setSummaryError('Could not generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl my-8">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-outline-variant/20">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              passed === true ? 'bg-emerald-100' : passed === false ? 'bg-red-100' : 'bg-slate-100'
            }`}>
              <span className={`material-symbols-outlined text-2xl ${
                passed === true ? 'text-emerald-600' : passed === false ? 'text-red-600' : 'text-slate-400'
              }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {passed === true ? 'verified' : passed === false ? 'cancel' : 'psychology'}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">{report.studentName || 'Unknown Student'}</h2>
              <p className="text-xs text-on-surface-variant">{formatDate(report.completedAt || report.createdAt)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-container transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Contact + Score row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: 'person', label: 'Full Name', value: report.studentName },
              { icon: 'mail', label: 'Email', value: report.studentEmail },
              { icon: 'phone', label: 'Phone / WhatsApp', value: report.studentPhone },
              { icon: 'calendar_today', label: 'Exam Date', value: formatDate(report.completedAt || report.createdAt) },
            ].filter(f => f.value).map(({ icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 border border-outline-variant/20">
                <span className="material-symbols-outlined text-[16px] text-violet-500 flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-on-surface truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Score + Result */}
          <div className="flex items-center gap-4 flex-wrap bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
            {report.score != null && (
              <>
                <div className="flex items-center gap-3">
                  <ScoreRing score={report.score} passed={report.passed} size={56} />
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wide">Score</p>
                    <p className="text-2xl font-black text-on-surface">{report.score}<span className="text-sm font-normal text-on-surface-variant">/100</span></p>
                  </div>
                </div>
                <div className="h-10 w-px bg-slate-200" />
              </>
            )}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest ${
              passed === true ? 'bg-emerald-100 text-emerald-700' : passed === false ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'
            }`}>
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                {passed === true ? 'verified' : passed === false ? 'cancel' : 'help'}
              </span>
              {report.resultLabel || 'UNKNOWN'}
            </div>
            {/* Pass threshold indicator */}
            <div className="flex-1 min-w-[120px]">
              <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                <span>0</span>
                <span className="font-semibold text-on-surface-variant">Pass ≥ 60</span>
                <span>100</span>
              </div>
              <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${passed === true ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, report.score ?? 0)}%` }} />
              </div>
            </div>
          </div>

          {/* Assessment + Recommendation */}
          {(report.assessment || report.recommendation) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.assessment && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-[14px] text-violet-500" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Assessment</p>
                  </div>
                  <p className="text-sm text-on-surface leading-relaxed">{report.assessment}</p>
                </div>
              )}
              {report.recommendation && (
                <div className={`rounded-xl p-4 space-y-1 border ${passed === true ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-symbols-outlined text-[14px] text-amber-600" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Recommendation</p>
                  </div>
                  <p className="text-sm text-on-surface leading-relaxed">{report.recommendation}</p>
                </div>
              )}
            </div>
          )}

          {/* Tab bar: Summary | Transcript */}
          <div className="border-b border-slate-100">
            <div className="flex gap-1">
              {[
                { id: 'summary', label: 'AI Summary', icon: 'auto_awesome' },
                { id: 'transcript', label: `Q&A Transcript (${qaPairs.length} exchanges)`, icon: 'forum' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'text-violet-600 border-violet-500 bg-violet-50'
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}>
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Summary tab */}
          {activeTab === 'summary' && (
            <div className="space-y-3">
              {summary ? (
                <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-violet-500 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                      <p className="text-sm font-bold text-violet-700">AI-Generated Evaluation Summary</p>
                    </div>
                    <button onClick={handleGenerateSummary} disabled={generatingSummary}
                      className="text-[10px] font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1 disabled:opacity-40">
                      <span className="material-symbols-outlined text-[12px]">refresh</span>
                      Regenerate
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    {summary.split('\n').map((line, i) => {
                      const isHeading = /^\d+\.\s+[A-Z]/.test(line) || /^[A-Z ]{4,}:/.test(line);
                      return line.trim() ? (
                        <p key={i} className={`mb-1.5 text-sm leading-relaxed ${isHeading ? 'font-bold text-violet-800' : 'text-slate-700'}`}>
                          {line}
                        </p>
                      ) : <div key={i} className="h-1" />;
                    })}
                  </div>
                  {report.summaryGeneratedAt && (
                    <p className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-violet-100">
                      Generated {formatDate(report.summaryGeneratedAt)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="material-symbols-outlined text-[40px] text-violet-300 mb-3" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <p className="text-sm font-semibold text-slate-600">No summary yet</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs">
                    Generate an AI evaluation summary of this student's exam for quick admin review.
                  </p>
                  <button onClick={handleGenerateSummary} disabled={generatingSummary}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-60">
                    {generatingSummary ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                        Generate AI Summary
                      </>
                    )}
                  </button>
                  {summaryError && <p className="text-xs text-red-500 mt-2">{summaryError}</p>}
                </div>
              )}
              {generatingSummary && summary && (
                <div className="flex items-center gap-2 text-xs text-violet-500">
                  <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  Regenerating summary…
                </div>
              )}
            </div>
          )}

          {/* Q&A Transcript tab */}
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {qaPairs.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No transcript available for this session.</p>
              ) : (
                qaPairs.map(({ priya, student, idx }, turn) => (
                  <div key={idx} className="rounded-2xl border border-slate-100 overflow-hidden">
                    {/* Turn header */}
                    <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                        {turn + 1}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exchange {turn + 1}</span>
                    </div>
                    {/* Priya's message */}
                    <div className="flex gap-3 px-4 py-3 bg-white">
                      <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 mt-0.5">P</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-0.5">Priya (Examiner)</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{priya}</p>
                      </div>
                    </div>
                    {/* Student's response */}
                    {student && (
                      <div className="flex gap-3 px-4 py-3 bg-slate-50 border-t border-slate-100">
                        <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 text-[11px] font-black flex-shrink-0 mt-0.5">S</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Student Response</p>
                          <p className="text-sm text-slate-800 leading-relaxed">{student}</p>
                        </div>
                      </div>
                    )}
                    {!student && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-500 italic">No student response recorded for this turn</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function AdminTEET() {
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('reports');
  const [studentSearch, setStudentSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadReports = () => {
    fetch('/api/teet-reports')
      .then(r => r.json())
      .then(data => {
        setReports(Array.isArray(data) ? data : []);
        setLoading(false);
        setLastRefresh(new Date());
        setSelected(prev => {
          if (!prev) return prev;
          const fresh = Array.isArray(data) ? data.find(r => r.id === prev.id) : null;
          return fresh || prev;
        });
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
    const interval = setInterval(loadReports, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch registered students once on mount
  useEffect(() => {
    fetch('/api/data/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data.filter(u => u.role === 'student') : []))
      .catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this report?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/teet-reports/${id}`, { method: 'DELETE' });
      setReports(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) setSelected(null);
    } finally { setDeleting(null); }
  };

  const handleSummaryUpdate = (id, newSummary) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, summary: newSummary } : r));
    setSelected(prev => prev?.id === id ? { ...prev, summary: newSummary } : prev);
  };

  const inProgress = reports.filter(r => r.status === 'in_progress');
  const abandoned  = reports.filter(r => r.status === 'abandoned');
  const passed     = reports.filter(r => r.passed === true);
  const failed     = reports.filter(r => r.passed === false);
  const avgScore   = reports.filter(r => r.score != null).reduce((a, r, _, arr) => a + r.score / arr.length, 0);

  const filtered =
    filter === 'ALL'       ? reports :
    filter === 'LIVE'      ? inProgress :
    filter === 'ABANDONED' ? abandoned :
    filter === 'PASS'      ? passed :
    filter === 'FAIL'      ? failed : reports;

  // Cross-reference registered students with TEET reports (match by email)
  const studentRows = users.map(user => {
    const email = (user.email || '').toLowerCase().trim();
    const userReports = reports.filter(r =>
      email && (r.studentEmail || '').toLowerCase().trim() === email
    );
    const liveReport      = userReports.find(r => r.status === 'in_progress');
    const abandonedReport = userReports.find(r => r.status === 'abandoned');
    const completed       = userReports.filter(r => r.status === 'completed').sort((a, b) => (b.score || 0) - (a.score || 0));
    const best = completed[0] || null;
    const report = liveReport || best || abandonedReport || null;
    let status = 'not_started';
    if (liveReport)              status = 'live';
    else if (best?.passed === true)  status = 'passed';
    else if (best?.passed === false) status = 'failed';
    else if (abandonedReport)    status = 'exited';
    else if (userReports.length > 0) status = 'attempted';
    return { user, report, status, score: best?.score ?? null };
  });

  const filteredStudents = studentRows.filter(row => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (row.user.name || '').toLowerCase().includes(q) || (row.user.email || '').toLowerCase().includes(q);
  });

  const studentsNotStarted  = studentRows.filter(r => r.status === 'not_started').length;
  const studentsLive        = studentRows.filter(r => r.status === 'live').length;
  const studentsPassed      = studentRows.filter(r => r.status === 'passed').length;
  const studentsFailed      = studentRows.filter(r => r.status === 'failed' || r.status === 'attempted').length;

  return (
    <AdminLayout>
      {selected && (
        <ReportDetail
          report={selected}
          onClose={() => setSelected(null)}
          onSummaryUpdate={handleSummaryUpdate}
        />
      )}

      <div className="px-4 py-6 md:px-8 space-y-6 max-w-5xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">TEET Management</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-on-surface-variant">Entrance exam reports &amp; student tracking</p>
              {inProgress.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  {inProgress.length} LIVE
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-[10px] text-on-surface-variant">
                Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span className="material-symbols-outlined text-[32px] text-violet-400" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl w-fit">
          {[
            { id: 'reports',  label: 'Exam Reports', icon: 'fact_check', count: reports.length },
            { id: 'students', label: 'All Students',  icon: 'group',     count: users.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-surface-container text-on-surface-variant'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── EXAM REPORTS TAB ── */}
        {activeTab === 'reports' && (<>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { key: 'ALL',       label: 'Total Tests', value: reports.length,     icon: 'bar_chart',      color: 'text-slate-600 bg-slate-50 border-slate-200' },
              { key: 'LIVE',      label: 'Live Now',    value: inProgress.length,  icon: 'sensors',        color: 'text-amber-700 bg-amber-50 border-amber-200' },
              { key: 'ABANDONED', label: 'Exited',      value: abandoned.length,   icon: 'exit_to_app',    color: 'text-slate-500 bg-slate-50 border-slate-200' },
              { key: 'PASS',      label: 'Passed',      value: passed.length,      icon: 'verified',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { key: 'FAIL',      label: 'Failed',      value: failed.length,      icon: 'cancel',         color: 'text-red-700 bg-red-50 border-red-200' },
              { key: null,        label: 'Avg Score',   value: reports.filter(r => r.score != null).length ? `${Math.round(avgScore)}/100` : '—', icon: 'leaderboard', color: 'text-violet-700 bg-violet-50 border-violet-200' },
            ].map(c => (
              <button
                key={c.key ?? 'avg'}
                onClick={() => c.key && setFilter(c.key)}
                className={`rounded-xl border p-4 text-left transition-all ${c.color} ${filter === c.key ? 'ring-2 ring-violet-400 shadow-sm' : c.key ? 'hover:shadow-sm' : 'cursor-default'}`}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide">{c.label}</p>
              </button>
            ))}
          </div>

          {/* Report list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined text-[40px] text-violet-300 animate-spin">progress_activity</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="material-symbols-outlined text-[48px] text-slate-300 mb-3" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              <p className="text-on-surface-variant font-semibold">No TEET reports yet</p>
              <p className="text-sm text-on-surface-variant mt-1">Completed examinations will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((report) => {
                const isLive      = report.status === 'in_progress';
                const isAbandoned = report.status === 'abandoned';
                const rpassed = report.passed;
                const hasSummary = !!report.summary;
                const msgCount = (report.messages || []).filter(m => m.role === 'user').length;
                return (
                  <div key={report.id} className={`border rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm transition-all ${
                    isLive      ? 'border-amber-300 bg-amber-50/30' :
                    isAbandoned ? 'border-slate-200 bg-slate-50/50' :
                    'bg-surface-container-lowest border-outline-variant/20'
                  }`}>
                    {isLive
                      ? <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-amber-300 opacity-40"></span>
                          <div className="relative w-10 h-10 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px] text-amber-600" style={{ fontVariationSettings: "'FILL' 1" }}>sensors</span>
                          </div>
                        </div>
                      : isAbandoned
                        ? <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-[18px] text-slate-400" style={{ fontVariationSettings: "'FILL' 1" }}>exit_to_app</span>
                          </div>
                        : report.score != null
                          ? <ScoreRing score={report.score} passed={report.passed} size={48} />
                          : <div className="w-12 h-12 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-[18px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                            </div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-sm truncate ${isAbandoned ? 'text-slate-500' : 'text-on-surface'}`}>{report.studentName || 'Unknown Student'}</p>
                        {isLive      && <span className="text-[9px] font-black text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded-full shrink-0">LIVE</span>}
                        {isAbandoned && <span className="text-[9px] font-black text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-full shrink-0">EXITED</span>}
                        {hasSummary && !isLive && !isAbandoned && (
                          <span className="flex items-center gap-1 text-[9px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full shrink-0">
                            <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                            Summary
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <p className="text-xs text-on-surface-variant">
                          {isLive      ? `Started ${formatDate(report.createdAt)}`       :
                           isAbandoned ? `Exited ${formatDate(report.abandonedAt || report.createdAt)}` :
                           formatDate(report.completedAt || report.createdAt)}
                        </p>
                        {report.studentEmail && <p className="text-xs text-violet-500 truncate">{report.studentEmail}</p>}
                        {report.studentPhone && <p className="text-xs text-emerald-600">{report.studentPhone}</p>}
                      </div>
                      {(isLive || isAbandoned) && msgCount > 0 && (
                        <p className={`text-[10px] mt-1 truncate ${isAbandoned ? 'text-slate-400' : 'text-amber-700'}`}>
                          {msgCount} student response{msgCount !== 1 ? 's' : ''} recorded
                        </p>
                      )}
                    </div>
                    {isLive
                      ? <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-100 text-amber-700">
                          <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>pending</span>
                          In Exam
                        </span>
                      : isAbandoned
                        ? <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0 bg-slate-100 text-slate-500">
                            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>exit_to_app</span>
                            Exited
                          </span>
                        : <span className={`flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0 ${
                            rpassed === true ? 'bg-emerald-100 text-emerald-700' : rpassed === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {rpassed === true ? 'verified' : rpassed === false ? 'cancel' : 'help'}
                            </span>
                            {report.resultLabel || 'UNKNOWN'}
                          </span>
                    }
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setSelected(report)}
                        className="p-2 rounded-xl hover:bg-violet-50 hover:text-violet-600 text-on-surface-variant transition-colors" title="View full report">
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
                      <button onClick={() => handleDelete(report.id)} disabled={deleting === report.id}
                        className="p-2 rounded-xl hover:bg-red-50 hover:text-red-600 text-on-surface-variant transition-colors disabled:opacity-40" title="Delete report">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* ── ALL STUDENTS TAB ── */}
        {activeTab === 'students' && (<>

          {/* Student stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Registered',  value: users.length,        icon: 'group',     color: 'text-slate-600  bg-slate-50  border-slate-200'  },
              { label: 'Not Started', value: studentsNotStarted,   icon: 'hourglass', color: 'text-slate-500  bg-slate-50  border-slate-100'  },
              { label: 'Passed',      value: studentsPassed,       icon: 'verified',  color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'Failed / WIP',value: studentsFailed + studentsLive, icon: 'cancel', color: 'text-red-700 bg-red-50 border-red-200' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
            <input
              type="text"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-violet-400 transition-colors"
            />
          </div>

          {/* Student list */}
          {filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-slate-300 mb-3" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
              <p className="text-on-surface-variant font-semibold">No students found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStudents.map(({ user, report, status, score }) => {
                const initials = (user.name || 'S').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                const statusConfig = {
                  not_started: { label: 'Not Started', icon: 'hourglass',     bg: 'bg-slate-100',    text: 'text-slate-500'   },
                  live:        { label: 'In Exam',     icon: 'sensors',       bg: 'bg-amber-100',    text: 'text-amber-700'   },
                  exited:      { label: 'Exited',      icon: 'exit_to_app',   bg: 'bg-slate-100',    text: 'text-slate-500'   },
                  attempted:   { label: 'Started',     icon: 'pending',       bg: 'bg-blue-100',     text: 'text-blue-700'    },
                  passed:      { label: 'Passed',      icon: 'verified',      bg: 'bg-emerald-100',  text: 'text-emerald-700' },
                  failed:      { label: 'Failed',      icon: 'cancel',        bg: 'bg-red-100',      text: 'text-red-700'     },
                }[status] || { label: status, icon: 'help', bg: 'bg-slate-100', text: 'text-slate-500' };

                return (
                  <div key={user.email}
                    className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${
                      status === 'live' ? 'border-amber-300 bg-amber-50/20' : 'bg-surface-container-lowest border-outline-variant/20 hover:shadow-sm'
                    } ${report ? 'cursor-pointer' : ''}`}
                    onClick={() => report && setSelected(report)}
                  >
                    {/* Avatar with score ring if available */}
                    {score != null
                      ? <ScoreRing score={score} passed={status === 'passed'} size={48} />
                      : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-extrabold">{initials}</span>
                        </div>
                    }

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-surface truncate">{user.name || '—'}</p>
                      <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
                      {report && (
                        <p className="text-[10px] text-on-surface-variant mt-0.5">
                          {status === 'live' ? `Live since ${formatDate(report.createdAt)}` : formatDate(report.completedAt || report.createdAt)}
                        </p>
                      )}
                    </div>

                    <span className={`flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0 ${statusConfig.bg} ${statusConfig.text}`}>
                      <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusConfig.icon}</span>
                      {statusConfig.label}
                      {score != null && ` · ${score}/100`}
                    </span>

                    {status === 'live' && (
                      <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-300 opacity-40"></span>
                        <span className="relative material-symbols-outlined text-[16px] text-amber-600" style={{ fontVariationSettings: "'FILL' 1" }}>sensors</span>
                      </div>
                    )}
                    {report && status !== 'live' && (
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant flex-shrink-0">chevron_right</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </div>
    </AdminLayout>
  );
}
