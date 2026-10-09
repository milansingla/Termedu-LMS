import { useState, useEffect, useCallback } from 'react';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';

const TYPE_META = {
  pdf:   { icon: 'picture_as_pdf', color: 'text-red-500',    bg: 'bg-red-50',    label: 'PDF' },
  video: { icon: 'play_circle',    color: 'text-blue-600',   bg: 'bg-blue-50',   label: 'Video' },
  doc:   { icon: 'description',    color: 'text-blue-500',   bg: 'bg-blue-50',   label: 'Doc' },
  image: { icon: 'image',          color: 'text-green-500',  bg: 'bg-green-50',  label: 'Image' },
  ppt:   { icon: 'slideshow',      color: 'text-orange-500', bg: 'bg-orange-50', label: 'PPT' },
  zip:   { icon: 'folder_zip',     color: 'text-gray-500',   bg: 'bg-gray-100',  label: 'ZIP' },
  other: { icon: 'insert_drive_file', color: 'text-gray-400', bg: 'bg-gray-100', label: 'File' },
};

const PLAN_BADGE = {
  all:     { label: 'All Plans',     cls: 'bg-gray-100 text-gray-600' },
  starter: { label: 'Starter',       cls: 'bg-slate-100 text-slate-600' },
  growth:  { label: 'Growth',        cls: 'bg-purple-100 text-purple-700' },
  premium: { label: 'Premium',       cls: 'bg-pink-100 text-pink-700' },
};

function getDrivePreviewUrl(url) {
  if (!url) return '';
  const match = url.match(/\/file\/d\/([^/?]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return url;
}

function getDriveDownloadUrl(url) {
  if (!url) return '';
  const match = url.match(/\/file\/d\/([^/?]+)/);
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  return url;
}

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}


export default function Downloads() {
  const { currentUser } = useApp();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeTab, setTypeTab]   = useState('all');
  const [subject, setSubject]   = useState('all');
  const [preview, setPreview]   = useState(null);

  const plan = (currentUser?.plan || 'free').toLowerCase().replace(/[^a-z]/g, '');

  const loadMaterials = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/data/materials?plan=${plan}`)
      .then(data => { setMaterials(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [plan]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const subjects = ['all', ...Array.from(new Set(materials.map(m => m.subject).filter(Boolean)))];
  const types    = ['all', 'pdf', 'video', 'doc', 'image', 'ppt', 'zip', 'other'];

  const filtered = materials.filter(m => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase()) &&
        !(m.subject || '').toLowerCase().includes(search.toLowerCase()) &&
        !(m.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (typeTab !== 'all' && (m.type || 'other') !== typeTab) return false;
    if (subject !== 'all' && m.subject !== subject) return false;
    return true;
  });

  const handleDownload = (m) => {
    apiFetch(`/api/data/materials/${m.id}`, { method: 'PATCH', body: JSON.stringify({ downloads: (m.downloads || 0) + 1 }) }).catch(() => {});
    setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, downloads: (x.downloads || 0) + 1 } : x));
    window.open(getDriveDownloadUrl(m.fileUrl), '_blank', 'noopener');
  };

  const handlePreview = (m) => {
    setPreview(m);
  };

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar showBack title="Study Materials" showBrand={false} />

      <main className="pt-20 pb-10 px-4 max-w-3xl mx-auto space-y-5">

        {/* Search */}
        <div className="relative mt-4">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 20, lineHeight: 1 }}>search</span>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, subject or keyword…"
            className="w-full pl-10 pr-4 py-3 bg-surface-container rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Subject filter */}
        {subjects.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {subjects.map(s => (
              <button key={s} onClick={() => setSubject(s)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all capitalize ${subject === s ? 'signature-gradient text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                {s === 'all' ? 'All Subjects' : s}
              </button>
            ))}
          </div>
        )}

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {types.map(t => {
            const meta = TYPE_META[t] || TYPE_META.other;
            return (
              <button key={t} onClick={() => setTypeTab(t)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${typeTab === t ? 'signature-gradient text-white shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                {t !== 'all' && (
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>{meta.icon}</span>
                )}
                {t === 'all' ? 'All Files' : meta.label}
              </button>
            );
          })}
        </div>

        {/* Count */}
        {!loading && (
          <p className="text-xs text-on-surface-variant font-medium px-1">
            {filtered.length} material{filtered.length !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Materials */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-on-surface-variant">Loading materials…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <span className="material-symbols-outlined text-5xl text-outline/30">folder_open</span>
            <p className="font-bold text-on-surface-variant">No materials found</p>
            <p className="text-xs text-on-surface-variant/60">
              {materials.length === 0 ? 'Your instructor hasn\'t uploaded any materials yet.' : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => {
              const meta = TYPE_META[m.type] || TYPE_META.other;
              const plan = PLAN_BADGE[m.planKey] || PLAN_BADGE.all;
              return (
                <div key={m.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-4 flex gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center ${meta.bg}`}>
                    <span className={`material-symbols-outlined text-2xl ${meta.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{meta.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm leading-snug">{m.title}</h3>
                      <span className={`flex-shrink-0 text-[9px] font-extrabold px-2 py-0.5 rounded-full ${plan.cls}`}>{plan.label}</span>
                    </div>
                    {m.subject && (
                      <p className="text-xs text-primary font-semibold mt-0.5">{m.subject}</p>
                    )}
                    {m.description && (
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">{m.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[10px] text-on-surface-variant/60">
                        {m.uploadedBy ? `By ${m.uploadedBy}` : ''} {m.createdAt ? `· ${fmtDate(m.createdAt)}` : ''}
                      </span>
                      {m.downloads > 0 && (
                        <span className="text-[10px] text-on-surface-variant/60 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">download</span>
                          {m.downloads}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {m.allowPreview !== false && m.fileUrl?.includes('/file/d/') && (
                        <button
                          onClick={() => handlePreview(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-semibold hover:bg-surface-container-high transition-colors">
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          View
                        </button>
                      )}
                      {m.allowDownload !== false && (
                        <button
                          onClick={() => handleDownload(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl signature-gradient text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity">
                          <span className="material-symbols-outlined text-[14px]">download</span>
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6">

          {/* Modal container */}
          <div className="w-full h-full md:h-[90vh] md:max-w-5xl rounded-2xl md:rounded-3xl overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10">

            {/* Branded header — brand | title | [download] | close */}
            <div style={{ background: 'linear-gradient(135deg,#3b0082,#6d28d9)', flexShrink: 0 }} className="flex items-center gap-2 px-4 py-3">
              {/* Brand mark */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'rgba(0,0,0,0.35)', borderRadius: 8, padding: '4px 8px' }}>
                <img src="/term-icon.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', display: 'block' }} />
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 12, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>T.E.R.M. Edu.</span>
              </div>

              {/* File title */}
              <div className="flex-1 min-w-0 mx-2">
                <p className="font-bold text-sm text-white leading-tight truncate">{preview.title}</p>
                {preview.subject && <p className="text-white/50 text-[11px] truncate mt-0.5">{preview.subject}</p>}
              </div>

              {/* Actions — download + close side by side, no overlap possible */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {preview.allowDownload !== false && (
                  <button onClick={() => handleDownload(preview)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors active:scale-95">
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/35 transition-all active:scale-90"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            </div>

            {/* Viewer area */}
            <div className="relative flex-1 overflow-hidden bg-[#f0f0f0]">
              <iframe
                src={getDrivePreviewUrl(preview.fileUrl)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                title={preview.title}
                allow="autoplay"
              />

              {/* Branding overlay — covers Drive toolbar top-right */}
              <div style={{ position: 'absolute', top: 6, right: 0, zIndex: 10, pointerEvents: 'none', width: 'clamp(56px, 9vw, 80px)', height: 'clamp(44px, 7vw, 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/term-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>

              {/* Watermark — bottom-center */}
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 12, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 5, opacity: 0.15 }}>
                <img src="/term-icon.png" alt="" style={{ height: 16, width: 'auto' }} />
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: '#4400a8', whiteSpace: 'nowrap' }}>T.E.R.M. EDU</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
