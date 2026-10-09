import { useState, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { parseVideoUrl, getVideoThumbnail } from '../../lib/courseUtils';

function compressImage(file, maxW = 640, maxH = 360, quality = 0.65) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const PLAN_ORDER = ['starter', 'growth', 'premium'];

const PLAN_ACCENT = {
  starter: { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600', card: 'border-slate-200' },
  growth:  { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700', card: 'border-purple-200' },
  premium: { dot: 'bg-pink-500',   badge: 'bg-pink-100 text-pink-700',     card: 'border-pink-200'   },
};

const PLAN_LABELS = { starter: 'STARTER', growth: 'GROWTH', premium: 'PREMIUM', none: 'No Plan' };

function normPlan(plan) { return (plan || '').toLowerCase().replace(/[^a-z]/g, ''); }

export default function AdminCourses() {
  const { planConfigs, appUsers } = useApp();
  const { courses: ctxCourses, addCourse: ctxAddCourse, updateCourse, updateThumbnail, deleteCourse: ctxDeleteCourse, addSection, updateSection, deleteSection, addLesson, updateLesson, deleteLesson, totalLessons } = useCourses();
  const [activeTab, setActiveTab] = useState('courses');

  /* ── Content tab state ── */
  const [contentCourseId, setContentCourseId] = useState(null);
  const contentCourse = ctxCourses.find(c => c.id === contentCourseId);
  const [addSecModal, setAddSecModal] = useState(false);
  const [newSecTitle, setNewSecTitle] = useState('');
  const [editSecModal, setEditSecModal] = useState(null);
  const [lessonModal, setLessonModal] = useState(null);
  const [lessonForm, setLessonForm] = useState({ title: '', videoUrl: '', duration: '', description: '' });
  const [urlPreview, setUrlPreview] = useState(null);
  const [contentView, setContentView] = useState('list');

  const CONTENT_GRADIENTS = [
    { gradient: 'from-violet-700 via-purple-700 to-indigo-900', icon: 'code', label: 'Violet' },
    { gradient: 'from-cyan-600 via-teal-600 to-slate-800', icon: 'science', label: 'Teal' },
    { gradient: 'from-orange-600 via-red-600 to-pink-900', icon: 'psychology', label: 'Orange' },
    { gradient: 'from-green-600 via-emerald-600 to-teal-900', icon: 'eco', label: 'Green' },
    { gradient: 'from-blue-600 via-indigo-600 to-violet-900', icon: 'school', label: 'Blue' },
    { gradient: 'from-pink-600 via-rose-600 to-red-900', icon: 'favorite', label: 'Pink' },
  ];

  const [addCtxCourseModal, setAddCtxCourseModal] = useState(false);
  const [newCtxCourse, setNewCtxCourse] = useState({ title: '', description: '', level: 'Beginner', instructor: '', planKey: 'none', gradientIdx: 0 });
  const [newCtxThumbnail, setNewCtxThumbnail] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editThumbnailCourseId, setEditThumbnailCourseId] = useState(null);
  const thumbInputRef = useRef(null);
  const editThumbInputRef = useRef(null);

  const handleThumbFile = async (file, setter) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await compressImage(file);
    setter(dataUrl);
  };

  const handleAddCtxCourse = () => {
    if (!newCtxCourse.title.trim()) return;
    const g = CONTENT_GRADIENTS[newCtxCourse.gradientIdx];
    const id = ctxAddCourse({ title: newCtxCourse.title.trim(), description: newCtxCourse.description.trim(), instructor: newCtxCourse.instructor.trim() || 'Admin', level: newCtxCourse.level, planKey: newCtxCourse.planKey, gradient: g.gradient, gradientIcon: g.icon, thumbnail: newCtxThumbnail || null });
    setAddCtxCourseModal(false);
    setNewCtxCourse({ title: '', description: '', level: 'Beginner', instructor: '', planKey: 'none', gradientIdx: 0 });
    setNewCtxThumbnail(null);
    showToast('Course created!');
    setContentCourseId(id);
    setContentView('edit');
  };

  const openLessonModal = (sectionId, lesson = null) => {
    setLessonModal({ sectionId, lessonId: lesson?.id || null });
    setLessonForm(lesson ? { title: lesson.title, videoUrl: lesson.videoUrl || lesson.youtubeUrl || '', duration: lesson.duration, description: lesson.description || '' } : { title: '', videoUrl: '', duration: '', description: '' });
    setUrlPreview(lesson?.videoId ? { type: lesson.videoType || 'youtube', id: lesson.videoId } : null);
  };
  const handleUrlChange = (url) => {
    setLessonForm(f => ({ ...f, videoUrl: url }));
    setUrlPreview(parseVideoUrl(url));
  };
  const handleSaveLesson = () => {
    if (!lessonForm.title.trim() || !lessonForm.videoUrl.trim()) return;
    if (lessonModal.lessonId) { updateLesson(contentCourseId, lessonModal.sectionId, lessonModal.lessonId, lessonForm); showToast('Lesson updated'); }
    else { addLesson(contentCourseId, lessonModal.sectionId, lessonForm); showToast('Lesson added'); }
    setLessonModal(null);
  };

  /* ── Courses state ── */
  const [editModal, setEditModal] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: '', price: '', duration: '', level: 'Beginner', description: '', planKey: 'none' });
  const [toast, setToast] = useState(null);
  const [analyticsModal, setAnalyticsModal] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const toggleActive = (id) => {
    const c = ctxCourses.find(x => x.id === id);
    if (c) updateCourse(id, { published: !(c.published ?? true), active: !(c.published ?? true) });
    showToast('Course status updated');
  };

  const saveEdit = () => {
    updateCourse(editModal.id, editModal);
    setEditModal(null);
    showToast('Course updated successfully');
  };

  const addCourse = () => {
    const g = { gradient: 'from-[#3b0082] via-[#5b21b6] to-[#0f1940]', gradientIcon: 'school' };
    ctxAddCourse({
      title: newCourse.title || 'New Course',
      price: parseInt(newCourse.price) || 0,
      duration: newCourse.duration || '0 hrs',
      level: newCourse.level,
      description: newCourse.description || '',
      planKey: newCourse.planKey || 'none',
      students: 0, rating: 0, lectures: 0,
      gradient: g.gradient,
      gradientIcon: g.gradientIcon,
      instructor: 'T.E.R.M. Edu Team',
      badge: 'New', badgeColor: 'bg-secondary', published: true, active: true,
    });
    setNewCourse({ title: '', price: '', duration: '', level: 'Beginner', description: '', planKey: 'none' });
    setAddModal(false);
    showToast('Course added successfully');
  };



  const fmtRev = (v) => v >= 10000000 ? `₹${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`;
  const realStudentCount  = appUsers.filter(u => u.role === 'student' && u.status === 'active').length;
  const realRevenue       = appUsers.reduce((sum, u) => sum + (planConfigs[normPlan(u.plan)]?.priceNum || 0), 0);
  const realActiveCourses = ctxCourses.filter(c => totalLessons(c) > 0).length;

  return (
    <AdminLayout>
      <div className="space-y-6 pt-2">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Courses & Plans</h1>
          </div>
          {activeTab === 'courses' && (
            <button onClick={() => setAddModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95">
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Course
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-surface-container p-1 rounded-2xl">
          {[
            { key: 'courses', label: 'Courses', icon: 'menu_book' },
            { key: 'content', label: 'Content', icon: 'video_library' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-base" style={activeTab === tab.key ? { fontVariationSettings: "'FILL' 1" } : {}}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── COURSES TAB ─── */}
        {activeTab === 'courses' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Active Courses',  value: realActiveCourses,                   icon: 'menu_book',       color: 'text-primary' },
                { label: 'Active Students', value: realStudentCount.toLocaleString(),    icon: 'group',           color: 'text-secondary' },
                { label: 'Est. Revenue',    value: fmtRev(realRevenue),                 icon: 'currency_rupee',  color: 'text-green-600' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
                  <span className={`material-symbols-outlined text-2xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  <p className="text-xl font-bold font-headline mt-1">{value}</p>
                  <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {ctxCourses.map(c => {
                const planKey = c.planKey || 'none';
                const accent = PLAN_ACCENT[planKey];
                const isActive = c.published ?? c.active ?? true;
                return (
                  <div key={c.id} className={`bg-surface-container-lowest p-4 rounded-2xl border shadow-sm transition-all ${isActive ? 'border-outline-variant/10' : 'border-outline-variant/5 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-xl flex-shrink-0 bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                        <span className="material-symbols-outlined text-white/70 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{c.title}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                          {accent && planKey !== 'none' && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${accent.badge}`}>
                              {PLAN_LABELS[planKey]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">₹{(c.price || 0).toLocaleString()} • {(c.students || 0).toLocaleString()} students • {c.level || 'All levels'}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {c.rating > 0 && <>
                            <span className="material-symbols-outlined text-yellow-400 text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            <span className="text-xs font-bold">{c.rating}</span>
                          </>}
                          <span className="text-xs text-on-surface-variant">{c.lectures || (c.sections || []).reduce((s, sec) => s + (sec.lessons || []).length, 0)} lessons • {c.duration || `${(c.sections || []).length} sections`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setEditModal({ ...c, active: isActive })} className="flex-1 py-2 rounded-xl signature-gradient text-white text-xs font-bold">Edit</button>
                      <button onClick={() => toggleActive(c.id)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${isActive ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary'}`}>
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setAnalyticsModal({ ...c, active: isActive })} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-bold">Analytics</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── CONTENT TAB ─── */}
        {activeTab === 'content' && (
          <div className="space-y-4">
            {contentView === 'list' || !contentCourse ? (
              <>
                {/* ── Plan Programs section ── */}
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                  <p className="font-bold text-sm">Plan Programs</p>
                  <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">3 Programs</span>
                </div>
                <p className="text-xs text-on-surface-variant -mt-2">Add sections and lessons to each plan program. Students see this content based on their plan.</p>

                {PLAN_ORDER.map(planKey => {
                  const c = ctxCourses.find(x => x.isPlanProgram && x.planKey === planKey);
                  if (!c) return null;
                  const accent = PLAN_ACCENT[planKey];
                  return (
                    <div key={c.id} className={`bg-surface-container-lowest rounded-2xl border-2 ${accent.card} overflow-hidden`}>
                      <div className={`relative w-full overflow-hidden bg-gradient-to-br ${c.gradient}`} style={{ aspectRatio: '16/5', maxHeight: '140px' }}>
                        {c.thumbnail
                          ? <img src={c.thumbnail} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-white/30 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon}</span>
                            </div>
                        }
                        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-4 gap-3">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${accent.badge}`}>{planKey}</span>
                          <p className="text-white font-extrabold font-headline">{c.title}</p>
                        </div>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between">
                        <p className="text-xs text-on-surface-variant">{(c.sections || []).length} sections · {totalLessons(c)} lessons</p>
                        <button onClick={() => { setContentCourseId(c.id); setContentView('edit'); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white text-xs font-bold">
                          <span className="material-symbols-outlined text-sm">edit_note</span>Edit Content
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* ── Regular courses section ── */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>video_library</span>
                    <p className="font-bold text-sm">Additional Courses</p>
                  </div>
                  <button onClick={() => setAddCtxCourseModal(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl signature-gradient text-white text-xs font-bold flex-shrink-0 shadow-md">
                    <span className="material-symbols-outlined text-sm">add</span>New Course
                  </button>
                </div>

                {ctxCourses.filter(c => !c.isPlanProgram).length === 0 && (
                  <div className="text-center py-10 text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-4xl opacity-30">video_library</span>
                    <p className="text-sm">No additional courses yet. Tap "New Course" to create one.</p>
                  </div>
                )}

                {ctxCourses.filter(c => !c.isPlanProgram).map(c => {
                  const planLabel = PLAN_LABELS[c.planKey] || 'No Plan';
                  const planColor = c.planKey === 'premium' ? 'bg-pink-100 text-pink-700' : c.planKey === 'growth' ? 'bg-purple-100 text-purple-700' : c.planKey === 'starter' ? 'bg-slate-100 text-slate-600' : 'bg-gray-100 text-gray-500';
                  return (
                    <div key={c.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                      <div className={`relative w-full overflow-hidden bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'}`} style={{ aspectRatio: '16/9', maxHeight: '180px' }}>
                        {c.thumbnail
                          ? <img src={c.thumbnail} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-white/30 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                            </div>
                        }
                        <span className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${planColor}`}>{planLabel}</span>
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-sm">{c.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{(c.sections || []).length} sections · {totalLessons(c)} lessons · {c.level || 'All levels'}</p>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { setContentCourseId(c.id); setContentView('edit'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl signature-gradient text-white text-xs font-bold">
                            <span className="material-symbols-outlined text-sm">edit_note</span>Manage Content
                          </button>
                          <button onClick={() => setDeleteConfirm(c)} className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-sm text-error">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <button onClick={() => setContentView('list')} className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high">
                    <span className="material-symbols-outlined text-on-surface">arrow_back</span>
                  </button>
                  <div className="flex-1">
                    <p className="text-xs text-on-surface-variant font-medium">Editing content for</p>
                    <h2 className="font-bold font-headline">{contentCourse.title}</h2>
                  </div>
                  <button onClick={() => setAddSecModal(true)} className="flex items-center gap-1 px-3 py-2 rounded-xl signature-gradient text-white text-xs font-bold">
                    <span className="material-symbols-outlined text-sm">add</span>Section
                  </button>
                </div>

                {/* Thumbnail card */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                  <div className={`relative w-full overflow-hidden bg-gradient-to-br ${contentCourse.gradient || 'from-primary to-secondary'}`} style={{ aspectRatio: '16/9', maxHeight: '240px' }}>
                    {contentCourse.thumbnail
                      ? <img src={contentCourse.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                          <span className="material-symbols-outlined text-white/30 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{contentCourse.gradientIcon || 'school'}</span>
                          <p className="text-white/30 text-xs">No thumbnail</p>
                        </div>
                    }
                    <input
                      ref={editThumbInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const dataUrl = await compressImage(e.target.files[0]);
                        updateThumbnail(contentCourse.id, dataUrl);
                        showToast('Thumbnail updated');
                      }}
                    />
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      {contentCourse.thumbnail && (
                        <button onClick={() => { updateThumbnail(contentCourse.id, null); showToast('Thumbnail removed'); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-bold">
                          <span className="material-symbols-outlined text-xs">delete</span>Remove
                        </button>
                      )}
                      <button onClick={() => editThumbInputRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-bold">
                        <span className="material-symbols-outlined text-xs">add_photo_alternate</span>
                        {contentCourse.thumbnail ? 'Change' : 'Upload Thumbnail'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl text-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>video_library</span>
                  {(contentCourse.sections || []).length} sections · {totalLessons(contentCourse)} lessons
                </div>

                {(contentCourse.sections || []).length === 0 && (
                  <div className="text-center py-10 text-on-surface-variant">
                    <p className="text-sm">No sections yet. Add a section to start uploading lessons.</p>
                  </div>
                )}

                {(contentCourse.sections || []).map((section, si) => (
                  <div key={section.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface-variant">S{si + 1}</span>
                        <p className="font-semibold text-sm">{section.title}</p>
                        <span className="text-xs text-on-surface-variant">({section.lessons.length})</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditSecModal({ id: section.id, title: section.title })} className="p-1.5 rounded-lg hover:bg-surface-container-high">
                          <span className="material-symbols-outlined text-sm text-on-surface-variant">edit</span>
                        </button>
                        <button onClick={() => { deleteSection(contentCourseId, section.id); showToast('Section deleted'); }} className="p-1.5 rounded-lg hover:bg-red-50">
                          <span className="material-symbols-outlined text-sm text-error">delete</span>
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-outline-variant/10">
                      {section.lessons.map(lesson => (
                        <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-12 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                            {lesson.videoId
                              ? <img src={getVideoThumbnail(lesson.videoId, lesson.videoType)} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                              : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-slate-400 text-sm">play_circle</span></div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{lesson.title}</p>
                            <p className="text-xs text-on-surface-variant">{lesson.duration || '—'}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openLessonModal(section.id, lesson)} className="p-1.5 rounded-lg hover:bg-surface-container-high">
                              <span className="material-symbols-outlined text-sm text-on-surface-variant">edit</span>
                            </button>
                            <button onClick={() => { deleteLesson(contentCourseId, section.id, lesson.id); showToast('Lesson deleted'); }} className="p-1.5 rounded-lg hover:bg-red-50">
                              <span className="material-symbols-outlined text-sm text-error">delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => openLessonModal(section.id)} className="w-full flex items-center gap-2 px-4 py-3 text-primary text-sm font-semibold hover:bg-primary-fixed/30">
                        <span className="material-symbols-outlined text-sm">add_circle</span>Add Lesson
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 bg-on-surface text-surface text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold">
          {toast}
        </div>
      )}

      {/* ─── Content: Add New Course Modal ─── */}
      {addCtxCourseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">New Course</h3>
              <button onClick={() => setAddCtxCourseModal(false)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Course Title *</label>
              <input value={newCtxCourse.title} onChange={e => setNewCtxCourse(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Python for Beginners" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description</label>
              <textarea value={newCtxCourse.description} onChange={e => setNewCtxCourse(p => ({ ...p, description: e.target.value }))} placeholder="Brief overview of the course…" rows={2} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Instructor</label>
                <input value={newCtxCourse.instructor} onChange={e => setNewCtxCourse(p => ({ ...p, instructor: e.target.value }))} placeholder="Instructor name" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Level</label>
                <select value={newCtxCourse.level} onChange={e => setNewCtxCourse(p => ({ ...p, level: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm appearance-none">
                  {['Beginner', 'Intermediate', 'Advanced'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Plan Tier</label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {[{ key: 'none', label: 'No Plan' }, { key: 'starter', label: 'Starter' }, { key: 'growth', label: 'Growth' }, { key: 'premium', label: 'Premium' }].map(p => (
                  <button key={p.key} onClick={() => setNewCtxCourse(prev => ({ ...prev, planKey: p.key }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${newCtxCourse.planKey === p.key ? 'bg-primary text-white border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/20'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Course Thumbnail</label>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleThumbFile(e.target.files[0], setNewCtxThumbnail)}
              />
              {newCtxThumbnail ? (
                <div className="relative mt-1.5 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img src={newCtxThumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setNewCtxThumbnail(null)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                  <button
                    onClick={() => thumbInputRef.current?.click()}
                    className="absolute bottom-2 right-2 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-black/60 text-white text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-xs">edit</span>Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => thumbInputRef.current?.click()}
                  className="w-full mt-1.5 border-2 border-dashed border-outline-variant/40 rounded-2xl flex flex-col items-center justify-center gap-2 py-6 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  style={{ aspectRatio: '16/9' }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant text-2xl">add_photo_alternate</span>
                  </div>
                  <p className="text-on-surface-variant text-xs font-semibold">Tap to upload thumbnail</p>
                  <p className="text-on-surface-variant/60 text-[10px]">JPG, PNG, WEBP · Auto-compressed</p>
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Color Theme <span className="font-normal text-on-surface-variant/60">(used when no thumbnail)</span></label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {CONTENT_GRADIENTS.map((g, i) => (
                  <button key={i} onClick={() => setNewCtxCourse(p => ({ ...p, gradientIdx: i }))}
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${g.gradient} flex items-center justify-center transition-all ${newCtxCourse.gradientIdx === i ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'opacity-60'}`}>
                    <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>{g.icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddCtxCourseModal(false)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={handleAddCtxCourse} disabled={!newCtxCourse.title.trim()} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold disabled:opacity-40">Create Course</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Content: Delete Course Confirm ─── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-error text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
            </div>
            <div className="text-center">
              <h3 className="font-headline font-bold text-lg">Delete Course?</h3>
              <p className="text-on-surface-variant text-sm mt-1">This will permanently delete <span className="font-bold text-on-surface">"{deleteConfirm.title}"</span> and all its sections and lessons.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={() => { ctxDeleteCourse(deleteConfirm.id); setDeleteConfirm(null); if (contentCourseId === deleteConfirm.id) { setContentCourseId(null); setContentView('list'); } showToast('Course deleted'); }} className="flex-1 py-3 rounded-2xl bg-error text-white font-bold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Content: Add Section Modal ─── */}
      {addSecModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-headline font-bold text-xl">Add Section</h3>
            <input value={newSecTitle} onChange={e => setNewSecTitle(e.target.value)} placeholder="e.g., Introduction to React" className="w-full px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setAddSecModal(false)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={() => { if (!newSecTitle.trim()) return; addSection(contentCourseId, newSecTitle.trim()); setNewSecTitle(''); setAddSecModal(false); showToast('Section added'); }} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Content: Rename Section Modal ─── */}
      {editSecModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-headline font-bold text-xl">Rename Section</h3>
            <input value={editSecModal.title} onChange={e => setEditSecModal(p => ({ ...p, title: e.target.value }))} className="w-full px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setEditSecModal(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={() => { updateSection(contentCourseId, editSecModal.id, editSecModal.title); setEditSecModal(null); showToast('Section renamed'); }} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Content: Lesson Modal ─── */}
      {lessonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">{lessonModal.lessonId ? 'Edit Lesson' : 'Add Lesson'}</h3>
              <button onClick={() => setLessonModal(null)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Lesson Title</label>
              <input value={lessonForm.title} onChange={e => setLessonForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Variables and Data Types" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Video URL</label>
              <p className="text-[10px] text-on-surface-variant/60 mb-1">Paste a YouTube or Vimeo link</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm text-on-surface-variant">link</span>
                <input value={lessonForm.videoUrl} onChange={e => handleUrlChange(e.target.value)} placeholder="youtube.com/watch?v=…  or  vimeo.com/123456" className="w-full pl-9 pr-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              {urlPreview && (
                <div className="mt-2 rounded-xl overflow-hidden relative">
                  <img src={getVideoThumbnail(urlPreview.id, urlPreview.type)} alt="" className="w-full h-28 object-cover" onError={e => { e.target.style.opacity = 0; }} />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    {urlPreview.type === 'vimeo' ? 'Vimeo' : 'YouTube'} video found
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Duration</label>
                <input value={lessonForm.duration} onChange={e => setLessonForm(p => ({ ...p, duration: e.target.value }))} placeholder="15:30" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Description</label>
                <input value={lessonForm.description} onChange={e => setLessonForm(p => ({ ...p, description: e.target.value }))} placeholder="Short summary" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setLessonModal(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={handleSaveLesson} disabled={!lessonForm.title.trim() || !urlPreview} className="flex-1 py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-40">
                {lessonModal.lessonId ? 'Save Changes' : 'Add Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Course Modal ─── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Edit Course</h3>
              <button onClick={() => setEditModal(null)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Title</label>
                <input value={editModal.title} onChange={e => setEditModal(p => ({ ...p, title: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Description</label>
                <textarea value={editModal.description || ''} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Price (₹)</label>
                  <input type="number" value={editModal.price} onChange={e => setEditModal(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Duration</label>
                  <input value={editModal.duration} onChange={e => setEditModal(p => ({ ...p, duration: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Lectures</label>
                  <input type="number" value={editModal.lectures} onChange={e => setEditModal(p => ({ ...p, lectures: parseInt(e.target.value) || 0 }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Level</label>
                  <select value={editModal.level} onChange={e => setEditModal(p => ({ ...p, level: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                    <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                  </select>
                </div>
              </div>

              {/* Plan assignment */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Assign to Plan</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[...PLAN_ORDER, 'none'].map(key => {
                    const label = PLAN_LABELS[key];
                    const accent = PLAN_ACCENT[key];
                    const selected = editModal.planKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setEditModal(p => ({ ...p, planKey: key }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          selected ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {accent && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} />}
                        {label}
                        {selected && <span className="ml-auto material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button onClick={saveEdit} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">Save Changes</button>
          </div>
        </div>
      )}

      {/* ─── Add Course Modal ─── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Add New Course</h3>
              <button onClick={() => setAddModal(false)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Course Title</label>
                <input value={newCourse.title} onChange={e => setNewCourse(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Advanced Design Program" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Description</label>
                <textarea value={newCourse.description} onChange={e => setNewCourse(p => ({ ...p, description: e.target.value }))} placeholder="Brief course description..." rows={2} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Price (₹)</label>
                  <input type="number" value={newCourse.price} onChange={e => setNewCourse(p => ({ ...p, price: e.target.value }))} placeholder="5500" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-on-surface-variant">Duration</label>
                  <input value={newCourse.duration} onChange={e => setNewCourse(p => ({ ...p, duration: e.target.value }))} placeholder="90 hrs" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Level</label>
                <select value={newCourse.level} onChange={e => setNewCourse(p => ({ ...p, level: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                </select>
              </div>
              {/* Plan assignment */}
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Assign to Plan</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[...PLAN_ORDER, 'none'].map(key => {
                    const label = PLAN_LABELS[key];
                    const accent = PLAN_ACCENT[key];
                    const selected = newCourse.planKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setNewCourse(p => ({ ...p, planKey: key }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          selected ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {accent && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} />}
                        {label}
                        {selected && <span className="ml-auto material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button onClick={addCourse} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold">Add Course</button>
          </div>
        </div>
      )}

      {/* ── Analytics Modal ── */}
      {analyticsModal && (() => {
        const am = analyticsModal;
        const planKey = normPlan(am.planKey);
        const dbCourse = ctxCourses.find(c => normPlan(c.planKey) === planKey);
        const planThumbnail = dbCourse?.thumbnail || null;
        const enrolledStudents = planKey && planKey !== 'none'
          ? appUsers.filter(u => u.role === 'student' && normPlan(u.plan) === planKey).length
          : (am.students || 0);
        const revenue = enrolledStudents * (am.price || 0);
        const totalSecs = dbCourse?.sections?.length || 0;
        const totalLess = dbCourse ? totalLessons(dbCourse) : (am.lectures || 0);
        const accent = PLAN_ACCENT[planKey] || PLAN_ACCENT['starter'];

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-black/40 backdrop-blur-sm" onClick={() => setAnalyticsModal(null)}>
            <div className="w-full max-w-lg bg-surface rounded-t-3xl overflow-hidden shadow-2xl pb-safe" onClick={e => e.stopPropagation()}>
              {/* Header strip */}
              <div className="relative h-36 overflow-hidden">
                {planThumbnail || am.thumbnail
                  ? <img src={planThumbnail || am.thumbnail} alt={am.title} className="w-full h-full object-cover" />
                  : <div className={`w-full h-full bg-gradient-to-br ${am.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-white/20 text-7xl" style={{ fontVariationSettings: "'FILL' 1" }}>{am.gradientIcon || 'school'}</span>
                    </div>
                }
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <button onClick={() => setAnalyticsModal(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-base">close</span>
                </button>
                <div className="absolute bottom-0 left-0 p-4 right-0">
                  <div className="flex items-center gap-2">
                    {planKey && planKey !== 'none' && (
                      <span className={`${accent.badge} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full`}>{PLAN_LABELS[planKey]}</span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${am.active ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>{am.active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="text-white font-bold text-lg mt-1 leading-tight line-clamp-2">{am.title}</p>
                </div>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
                {/* Primary stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: 'groups', label: 'Students', value: enrolledStudents.toLocaleString(), color: 'text-primary', bg: 'bg-primary/10' },
                    { icon: 'currency_rupee', label: 'Revenue', value: fmtRev(revenue), color: 'text-green-600', bg: 'bg-green-50' },
                    { icon: 'star', label: 'Rating', value: am.rating > 0 ? am.rating : '—', color: 'text-yellow-500', bg: 'bg-yellow-50' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-3 flex flex-col items-center gap-1`}>
                      <span className={`material-symbols-outlined text-2xl ${s.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                      <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-on-surface-variant font-semibold">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Content stats */}
                <div className="bg-surface-container rounded-2xl p-4">
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Course Content</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: 'folder_open', label: 'Sections', value: totalSecs || '—' },
                      { icon: 'play_circle', label: 'Lessons', value: totalLess || '—' },
                      { icon: 'schedule', label: 'Duration', value: am.duration || '—' },
                      { icon: 'bar_chart', label: 'Level', value: am.level || '—' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">{s.icon}</span>
                        <div>
                          <p className="text-xs text-on-surface-variant">{s.label}</p>
                          <p className="text-sm font-bold text-on-surface">{s.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price info */}
                <div className="bg-surface-container rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">local_offer</span>
                    <div>
                      <p className="text-xs text-on-surface-variant">Course Price</p>
                      <p className="text-lg font-black text-on-surface">₹{(am.price || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {am.originalPrice && am.originalPrice > am.price && (
                    <div className="text-right">
                      <p className="text-xs text-on-surface-variant line-through">₹{am.originalPrice.toLocaleString()}</p>
                      <p className="text-xs font-bold text-green-600">{Math.round(100 - (am.price / am.originalPrice) * 100)}% off</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {am.description && (
                  <div className="bg-surface-container rounded-2xl p-4">
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">About</p>
                    <p className="text-sm text-on-surface leading-relaxed">{am.description}</p>
                  </div>
                )}

                <button onClick={() => setAnalyticsModal(null)} className="w-full py-4 rounded-2xl bg-surface-container text-on-surface font-bold text-sm">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

    </AdminLayout>
  );
}
