import { useRef, useState } from 'react';
import ExcelJS from 'exceljs';

/* ── column name aliases (lowercased) ──────────────────────────── */
const ALIAS = {
  name:     ['name', 'full name', 'fullname', 'student name', 'username'],
  email:    ['email', 'email address', 'mail'],
  role:     ['role', 'type', 'user type', 'user role'],
  plans:    ['plans', 'plan', 'subscription', 'subscriptions'],
  password: ['password', 'pass', 'pwd'],
};

const detectKey = (header) => {
  const h = header.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(ALIAS)) {
    if (aliases.includes(h)) return key;
  }
  return null;
};

const VALID_ROLES  = ['student', 'lecturer', 'admin'];
const VALID_PLANS  = ['starter', 'growth', 'premium'];
const PLAN_ORDER   = ['starter', 'growth', 'premium'];

const normRole  = (v) => VALID_ROLES.includes((v || '').toLowerCase()) ? v.toLowerCase() : 'student';
const normPlans = (v) => {
  if (!v) return [];
  const raw = String(v).toLowerCase().split(/[|,;/\s]+/).map(s => s.trim()).filter(Boolean);
  return raw.filter(p => VALID_PLANS.includes(p));
};

const SAMPLE_CSV = `name,email,role,plans,password
Rahul Sharma,rahul@example.com,student,starter|growth,pass123
Priya Singh,priya@example.com,lecturer,,
Amit Kumar,amit@example.com,student,premium,
`;

async function downloadSample(format) {
  if (format === 'csv') {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bulk_import_sample.csv'; a.click();
  } else if (format === 'json') {
    const data = [
      { name: 'Rahul Sharma', email: 'rahul@example.com', role: 'student', plans: 'starter|growth', password: 'pass123' },
      { name: 'Priya Singh',  email: 'priya@example.com', role: 'lecturer', plans: '', password: '' },
    ];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bulk_import_sample.json'; a.click();
  } else {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users');
    worksheet.addRow(['name', 'email', 'role', 'plans', 'password']);
    worksheet.addRow(['Rahul Sharma', 'rahul@example.com', 'student', 'starter|growth', 'pass123']);
    worksheet.addRow(['Priya Singh', 'priya@example.com', 'lecturer', '', '']);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'bulk_import_sample.xlsx'; a.click();
  }
}

/* ────────────────────────────────────────────────────────────────── */
export default function BulkImportModal({ onClose, onImported }) {
  const fileRef   = useRef(null);
  const [stage,   setStage]   = useState('upload');      // upload | preview | progress | result
  const [rows,    setRows]    = useState([]);             // parsed + validated rows
  const [headers, setHeaders] = useState([]);             // original headers
  const [colMap,  setColMap]  = useState({});             // colIndex → field key
  const [drag,    setDrag]    = useState(false);
  const [progress,setProgress]= useState({ done: 0, total: 0 });
  const [results, setResults] = useState({ ok: [], fail: [] });
  const [sendWelcomeEmails, setSendWelcomeEmails] = useState(true);

  /* ── parse file ─────────────────────────────────── */
  const parseFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        if (ext === 'json') {
          const json = JSON.parse(e.target.result);
          const arr  = Array.isArray(json) ? json : (json.users || json.data || []);
          if (!arr.length) return alert('JSON file is empty or invalid.');
          const hdrs = Object.keys(arr[0]);
          const map  = {};
          hdrs.forEach((h, i) => { const k = detectKey(h); if (k) map[i] = k; });
          setHeaders(hdrs);
          setColMap(map);
          buildRows(arr, hdrs, map, true);
          return;
        }

        if (ext === 'csv') {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 2) return alert('File has no data rows.');
          const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const map  = {};
          hdrs.forEach((h, i) => { const k = detectKey(h); if (k) map[i] = k; });
          const objRows = lines.slice(1).map(line => {
            const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const obj = {}; hdrs.forEach((h, i) => { obj[h] = cells[i] ?? ''; }); return obj;
          }).filter(obj => Object.values(obj).some(v => v !== ''));
          setHeaders(hdrs);
          setColMap(map);
          buildRows(objRows, hdrs, map, false);
          return;
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(e.target.result);
        const ws = workbook.worksheets[0];
        if (!ws) return alert('File has no sheets.');
        const data = [];
        ws.eachRow((row) => {
          data.push(row.values.slice(1).map(v => (v === null || v === undefined) ? '' : String(v)));
        });
        if (data.length < 2) return alert('File has no data rows.');

        const hdrs = data[0];
        const map  = {};
        hdrs.forEach((h, i) => { const k = detectKey(h); if (k) map[i] = k; });
        const objRows = data.slice(1).filter(r => r.some(c => c !== '')).map(r => {
          const obj = {}; hdrs.forEach((h, i) => { obj[h] = r[i] ?? ''; }); return obj;
        });
        setHeaders(hdrs);
        setColMap(map);
        buildRows(objRows, hdrs, map, false);

      } catch (err) {
        alert('Could not parse file: ' + err.message);
      }
    };

    if (ext === 'json' || ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const buildRows = (objRows, hdrs, map, isJson) => {
    const keyOf = isJson
      ? (obj, field) => { const h = Object.keys(obj).find(k => detectKey(k) === field); return h ? obj[h] : ''; }
      : (obj, field) => { const idx = Object.entries(map).find(([, v]) => v === field)?.[0]; return idx !== undefined ? obj[hdrs[idx]] : ''; };

    const parsed = objRows.map((obj, idx) => {
      const name     = String(keyOf(obj, 'name')     || '').trim();
      const email    = String(keyOf(obj, 'email')    || '').trim().toLowerCase();
      const role     = normRole(String(keyOf(obj, 'role') || 'student'));
      const rawPlans = String(keyOf(obj, 'plans')    || '');
      const password = String(keyOf(obj, 'password') || '').trim();
      const plans    = normPlans(rawPlans);
      const plan     = PLAN_ORDER.filter(p => plans.includes(p)).pop() || 'none';
      const errors   = [];
      if (!name)  errors.push('Missing name');
      if (!email) errors.push('Missing email');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email');
      return { _row: idx + 2, name, email, role, plans, plan, password, errors };
    });

    const seen = new Set();
    parsed.forEach(r => {
      if (r.email && seen.has(r.email)) r.errors.push('Duplicate email in file');
      else if (r.email) seen.add(r.email);
    });

    setRows(parsed);
    setStage('preview');
  };

  const handleFile = (file) => {
    if (!file) return;
    const allowed = ['csv','xlsx','json'];
    if (!allowed.includes(file.name.split('.').pop().toLowerCase())) {
      return alert('Unsupported file type. Use CSV, XLSX, or JSON.');
    }
    parseFile(file);
  };

  /* ── import ─────────────────────────────────────── */
  const runImport = async () => {
    const valid = rows.filter(r => r.errors.length === 0);
    setProgress({ done: 0, total: valid.length });
    setStage('progress');
    const ok = [], fail = [];

    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      try {
        const payload = {
          name:   r.name,
          email:  r.email,
          role:   r.role,
          plans:  r.plans,
          plan:   r.plan,
          status: 'active',
          joined: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          sendWelcome: sendWelcomeEmails,
        };
        if (r.password) payload.password = r.password;

        const res  = await fetch('/api/data/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) ok.push({ ...r, id: data.id });
        else        fail.push({ ...r, reason: data.error || `HTTP ${res.status}` });
      } catch (e) {
        fail.push({ ...r, reason: 'Network error' });
      }
      setProgress({ done: i + 1, total: valid.length });
    }

    setResults({ ok, fail });
    setStage('result');
    if (ok.length) onImported(ok);
  };

  /* ── helpers ─────────────────────────────────────── */
  const validRows   = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length  > 0);

  const rolePill = (role) =>
    role === 'admin' ? 'bg-red-100 text-red-600' :
    role === 'lecturer' ? 'bg-violet-100 text-violet-700' :
    'bg-blue-50 text-blue-600';

  /* ─────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[210] flex items-end justify-center p-4 pb-6">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-headline font-bold text-xl">Bulk Import Users</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {stage === 'upload'   && 'Upload a file to create multiple users at once'}
              {stage === 'preview'  && `${rows.length} rows found — ${validRows.length} valid, ${invalidRows.length} with errors`}
              {stage === 'progress' && `Importing… ${progress.done} / ${progress.total}`}
              {stage === 'result'   && `Done — ${results.ok.length} created, ${results.fail.length} failed`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* ── UPLOAD STAGE ── */}
        {stage === 'upload' && (
          <div className="p-6 space-y-5">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-10 text-center transition-all ${drag ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'}`}
            >
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-3 block">upload_file</span>
              <p className="font-bold text-slate-600">Drag & drop your file here</p>
              <p className="text-sm text-slate-400 mt-1">or click to browse</p>
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                {['CSV','XLSX','JSON'].map(f => (
                  <span key={f} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">{f}</span>
                ))}
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.json" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            </div>

            {/* Column format guide */}
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Expected Columns</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { col: 'name',     req: true,  hint: 'Full name of the user' },
                  { col: 'email',    req: true,  hint: 'Valid email address' },
                  { col: 'role',     req: false, hint: 'student / lecturer / admin' },
                  { col: 'plans',    req: false, hint: 'starter|growth|premium (pipe-separated)' },
                  { col: 'password', req: false, hint: 'Leave blank for OTP-only login' },
                ].map(({ col, req, hint }) => (
                  <div key={col} className="flex items-start gap-2">
                    <code className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${req ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{col}</code>
                    <span className="text-[11px] text-slate-400 leading-tight">{req ? '* Required. ' : ''}{hint}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample downloads */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Download sample template:</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { fmt: 'csv',  icon: 'table', label: 'CSV' },
                  { fmt: 'xlsx', icon: 'description', label: 'Excel' },
                  { fmt: 'json', icon: 'data_object', label: 'JSON' },
                ].map(({ fmt, icon, label }) => (
                  <button
                    key={fmt}
                    onClick={() => downloadSample(fmt)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW STAGE ── */}
        {stage === 'preview' && (
          <div className="p-6 space-y-4">
            {/* Summary strip */}
            <div className="flex gap-3">
              <div className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{validRows.length}</p>
                <p className="text-[11px] text-green-700 font-semibold">Ready to import</p>
              </div>
              <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{invalidRows.length}</p>
                <p className="text-[11px] text-red-600 font-semibold">Will be skipped</p>
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-600">{rows.length}</p>
                <p className="text-[11px] text-slate-500 font-semibold">Total rows</p>
              </div>
            </div>

            {/* Rows table */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">#</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Email</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Role</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Plans</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Pass?</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.errors.length ? 'bg-red-50/60' : ''}>
                        <td className="px-3 py-2 text-slate-400">{r._row}</td>
                        <td className="px-3 py-2 font-medium text-slate-700 max-w-[100px] truncate">{r.name || <span className="text-red-400 italic">—</span>}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{r.email || <span className="text-red-400 italic">—</span>}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rolePill(r.role)}`}>{r.role}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {r.plans.length > 0
                            ? r.plans.map(p => <span key={p} className="mr-1 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold">{p.toUpperCase()}</span>)
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.password
                            ? <span className="material-symbols-outlined text-green-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            : <span className="text-slate-300 text-[10px]">OTP</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.errors.length === 0
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold" title={r.errors.join(', ')}>✕ {r.errors[0]}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {invalidRows.length > 0 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                Rows with errors will be skipped. Fix them in your file and re-upload to include them.
              </p>
            )}

            {/* Send welcome email toggle */}
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-violet-50 border border-violet-100 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendWelcomeEmails}
                onChange={e => setSendWelcomeEmails(e.target.checked)}
                className="accent-violet-600 w-4 h-4 flex-shrink-0"
              />
              <span className="text-xs font-semibold text-violet-800">Send welcome email with login credentials to each user</span>
            </label>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setStage('upload')} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm">
                Back
              </button>
              <button
                onClick={runImport}
                disabled={validRows.length === 0}
                className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">group_add</span>
                Import {validRows.length} User{validRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── PROGRESS STAGE ── */}
        {stage === 'progress' && (
          <div className="p-10 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-3xl animate-spin" style={{ animationDuration: '1.5s' }}>sync</span>
            </div>
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm font-semibold text-slate-600">
                <span>Importing users…</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full signature-gradient transition-all duration-300"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">Please don't close this window</p>
          </div>
        )}

        {/* ── RESULT STAGE ── */}
        {stage === 'result' && (
          <div className="p-6 space-y-5">
            {/* Big result numbers */}
            <div className="flex gap-3">
              <div className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{results.ok.length}</p>
                <p className="text-xs text-green-700 font-semibold mt-0.5">Successfully created</p>
              </div>
              <div className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-red-500">{results.fail.length}</p>
                <p className="text-xs text-red-600 font-semibold mt-0.5">Failed</p>
              </div>
            </div>

            {/* Success list */}
            {results.ok.length > 0 && (
              <div className="border border-green-100 rounded-2xl overflow-hidden">
                <div className="bg-green-50 px-4 py-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-xs font-bold text-green-700">Created</p>
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                  {results.ok.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-7 h-7 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[11px] font-bold">{(r.name || '?')[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{r.email}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${rolePill(r.role)}`}>{r.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failure list */}
            {results.fail.length > 0 && (
              <div className="border border-red-100 rounded-2xl overflow-hidden">
                <div className="bg-red-50 px-4 py-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                  <p className="text-xs font-bold text-red-600">Failed</p>
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                  {results.fail.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{r.name} <span className="text-slate-400 font-normal">({r.email})</span></p>
                        <p className="text-[10px] text-red-500">{r.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={onClose} className="w-full py-3.5 rounded-2xl signature-gradient text-white font-bold text-sm">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
