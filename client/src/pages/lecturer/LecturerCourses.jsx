import { useState, useRef } from 'react';
import LecturerLayout from './LecturerLayout';
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
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function VideoThumb({ videoId, videoType = 'youtube', className = '' }) {
  const thumb = getVideoThumbnail(videoId, videoType);
  return thumb
    ? <img src={thumb} alt="" className={`object-cover ${className}`} onError={e => { e.target.style.display = 'none'; }} />
    : <div className={`bg-slate-200 flex items-center justify-center ${className}`}><span className="material-symbols-outlined text-slate-400">play_circle</span></div>;
}

export default function LecturerCourses() {
  const { currentUser } = useApp();
  const { courses, addCourse, updateCourse, updateThumbnail, deleteCourse, addSection, updateSection, deleteSection, addLesson, updateLesson, deleteLesson, totalLessons } = useCourses();

  const programCourses = courses.filter(c => c.isPlanProgram);
  const myCourses = courses.filter(c => !c.isPlanProgram && (c.instructor === currentUser?.name || c.createdBy === 'lecturer' || c.createdBy === currentUser?.name));

  const PROG_ACCENT = {
    starter: { badge: 'bg-slate-100 text-slate-600', border: 'border-slate-200' },
    growth:  { badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
    premium: { badge: 'bg-pink-100 text-pink-700', border: 'border-pink-200' },
  };

  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const [view, setView] = useState('list');
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const [addCourseModal, setAddCourseModal] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: '', description: '', level: 'Beginner' });
  const [newCourseThumbnail, setNewCourseThumbnail] = useState(null);
  const newThumbRef = useRef(null);
  const editThumbRef = useRef(null);

  const handleThumbFile = async (file, setter) => {
    if (!file || !file.type.startsWith('image/')) return;
    setter(await compressImage(file));
  };

  const [addSectionModal, setAddSectionModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editSectionModal, setEditSectionModal] = useState(null);

  const [lessonModal, setLessonModal] = useState(null);
  const [lessonForm, setLessonForm] = useState({ title: '', videoUrl: '', duration: '', description: '' });
  const [urlPreview, setUrlPreview] = useState(null);

  const openLessonModal = (sectionId, lesson = null) => {
    setLessonModal({ sectionId, lessonId: lesson?.id || null });
    setLessonForm(lesson ? { title: lesson.title, videoUrl: lesson.videoUrl || lesson.youtubeUrl || '', duration: lesson.duration, description: lesson.description || '' } : { title: '', videoUrl: '', duration: '', description: '' });
    setUrlPreview(lesson?.videoId ? { type: lesson.videoType || 'youtube', id: lesson.videoId } : null);
  };

  const handleUrlChange = (url) => {
    setLessonForm(f => ({ ...f, videoUrl: url }));
    setUrlPreview(parseVideoUrl(url));
  };

  const handleCreateCourse = () => {
    if (!newCourse.title.trim()) return;
    addCourse({ ...newCourse, instructor: currentUser?.name, createdBy: currentUser?.name, thumbnail: newCourseThumbnail || null });
    setNewCourse({ title: '', description: '', level: 'Beginner' });
    setNewCourseThumbnail(null);
    setAddCourseModal(false);
    showToast('Course created!');
  };

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;
    addSection(selectedCourseId, newSectionTitle.trim());
    setNewSectionTitle('');
    setAddSectionModal(false);
    showToast('Section added');
  };

  const handleSaveLesson = () => {
    if (!lessonForm.title.trim() || !lessonForm.videoUrl.trim()) return;
    if (lessonModal.lessonId) {
      updateLesson(selectedCourseId, lessonModal.sectionId, lessonModal.lessonId, lessonForm);
      showToast('Lesson updated');
    } else {
      addLesson(selectedCourseId, lessonModal.sectionId, lessonForm);
      showToast('Lesson added');
    }
    setLessonModal(null);
  };

  if (view === 'content' && selectedCourse) {
    return (
      <LecturerLayout>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high">
              <span className="material-symbols-outlined text-on-surface">arrow_back</span>
            </button>
            <div className="flex-1">
              <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">Course Content</p>
              <h2 className="font-extrabold font-headline text-lg leading-tight">{selectedCourse.title}</h2>
            </div>
            <button onClick={() => setAddSectionModal(true)} className="flex items-center gap-1 px-3 py-2 rounded-xl signature-gradient text-white text-xs font-bold">
              <span className="material-symbols-outlined text-sm">add</span>Section
            </button>
          </div>

          {/* Thumbnail card */}
          <div className={`relative w-full rounded-2xl overflow-hidden bg-gradient-to-br ${selectedCourse.gradient || 'from-primary to-secondary'}`} style={{ aspectRatio: '16/9' }}>
            {selectedCourse.thumbnail
              ? <img src={selectedCourse.thumbnail} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-white/30 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>{selectedCourse.gradientIcon || 'school'}</span>
                  <p className="text-white/30 text-xs">No thumbnail uploaded</p>
                </div>
            }
            <input
              ref={editThumbRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const dataUrl = await compressImage(e.target.files[0]);
                updateThumbnail(selectedCourse.id, dataUrl);
                showToast('Thumbnail updated');
              }}
            />
            <div className="absolute bottom-2 right-2 flex gap-2">
              {selectedCourse.thumbnail && (
                <button onClick={() => { updateThumbnail(selectedCourse.id, null); showToast('Thumbnail removed'); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-bold">
                  <span className="material-symbols-outlined text-xs">delete</span>Remove
                </button>
              )}
              <button onClick={() => editThumbRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-bold">
                <span className="material-symbols-outlined text-xs">add_photo_alternate</span>
                {selectedCourse.thumbnail ? 'Change' : 'Upload Thumbnail'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-2xl text-sm">
            <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>video_library</span>
            <span className="text-on-surface-variant">{(selectedCourse.sections || []).length} sections • {totalLessons(selectedCourse)} lessons</span>
          </div>

          {(selectedCourse.sections || []).length === 0 && (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-40">folder_open</span>
              <p className="font-semibold">No sections yet</p>
              <p className="text-sm mt-1">Add a section to start adding lessons</p>
            </div>
          )}

          {(selectedCourse.sections || []).map((section, si) => (
            <div key={section.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-surface-variant w-5">S{si + 1}</span>
                  <p className="font-semibold text-sm">{section.title}</p>
                  <span className="text-xs text-on-surface-variant">({section.lessons.length})</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditSectionModal({ id: section.id, title: section.title })} className="p-1.5 rounded-lg hover:bg-surface-container-high">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">edit</span>
                  </button>
                  <button onClick={() => { deleteSection(selectedCourseId, section.id); showToast('Section deleted'); }} className="p-1.5 rounded-lg hover:bg-red-50">
                    <span className="material-symbols-outlined text-sm text-error">delete</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-outline-variant/10">
                {section.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-12 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                      <VideoThumb videoId={lesson.videoId} videoType={lesson.videoType} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                      <p className="text-xs text-on-surface-variant">{lesson.duration || '—'}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openLessonModal(section.id, lesson)} className="p-1.5 rounded-lg hover:bg-surface-container-high">
                        <span className="material-symbols-outlined text-sm text-on-surface-variant">edit</span>
                      </button>
                      <button onClick={() => { deleteLesson(selectedCourseId, section.id, lesson.id); showToast('Lesson deleted'); }} className="p-1.5 rounded-lg hover:bg-red-50">
                        <span className="material-symbols-outlined text-sm text-error">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => openLessonModal(section.id)} className="w-full flex items-center gap-2 px-4 py-3 text-primary text-sm font-semibold hover:bg-primary-fixed/30 transition-colors">
                  <span className="material-symbols-outlined text-sm">add_circle</span>Add Lesson
                </button>
              </div>
            </div>
          ))}
        </div>

        {addSectionModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
              <h3 className="font-headline font-bold text-xl">Add Section</h3>
              <input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="e.g., Introduction to React" className="w-full px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
              <div className="flex gap-3">
                <button onClick={() => setAddSectionModal(false)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
                <button onClick={handleAddSection} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm">Add Section</button>
              </div>
            </div>
          </div>
        )}

        {editSectionModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
              <h3 className="font-headline font-bold text-xl">Rename Section</h3>
              <input value={editSectionModal.title} onChange={e => setEditSectionModal(p => ({ ...p, title: e.target.value }))} className="w-full px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
              <div className="flex gap-3">
                <button onClick={() => setEditSectionModal(null)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
                <button onClick={() => { updateSection(selectedCourseId, editSectionModal.id, editSectionModal.title); setEditSectionModal(null); showToast('Section renamed'); }} className="flex-1 py-3 rounded-2xl signature-gradient text-white font-bold text-sm">Save</button>
              </div>
            </div>
          </div>
        )}

        {lessonModal && <LessonModal lessonForm={lessonForm} setLessonForm={setLessonForm} urlPreview={urlPreview} handleUrlChange={handleUrlChange} onSave={handleSaveLesson} onClose={() => setLessonModal(null)} isEdit={!!lessonModal.lessonId} />}
        {toast && <Toast msg={toast} />}
      </LecturerLayout>
    );
  }

  return (
    <LecturerLayout>
      <div className="space-y-5 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Lecturer Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Courses</h1>
          </div>
          <button onClick={() => setAddCourseModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white font-semibold text-sm shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[18px]">add</span>New Course
          </button>
        </div>

        {/* ── Plan Programs ── */}
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
          <p className="font-bold text-sm">Plan Programs</p>
        </div>
        <p className="text-xs text-on-surface-variant -mt-3">Add lessons to plan programs. Students see content based on their enrolled plan.</p>

        {programCourses.map(c => {
          const accent = PROG_ACCENT[c.planKey] || PROG_ACCENT.starter;
          return (
            <div key={c.id} className={`bg-surface-container-lowest rounded-2xl border-2 ${accent.border} overflow-hidden`}>
              <div className={`relative w-full bg-gradient-to-br ${c.gradient}`} style={{ aspectRatio: '16/5' }}>
                {c.thumbnail
                  ? <img src={c.thumbnail} alt={c.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white/25 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon}</span>
                    </div>
                }
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-4 gap-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${accent.badge}`}>{c.planKey}</span>
                  <p className="text-white font-bold text-sm">{c.title}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-on-surface-variant">{(c.sections || []).length} sections · {totalLessons(c)} lessons</p>
                <button onClick={() => { setSelectedCourseId(c.id); setView('content'); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl signature-gradient text-white text-xs font-bold">
                  <span className="material-symbols-outlined text-sm">edit_note</span>Edit Content
                </button>
              </div>
            </div>
          );
        })}

        {/* ── My Courses ── */}
        <div className="flex items-center gap-2 pt-1">
          <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>video_library</span>
          <p className="font-bold text-sm">My Courses</p>
        </div>

        {myCourses.length === 0 && (
          <div className="text-center py-10 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-40">menu_book</span>
            <p className="text-sm">No courses yet. Tap "New Course" to create one.</p>
          </div>
        )}

        {myCourses.map(c => (
          <div key={c.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className={`relative w-full bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'}`} style={{ aspectRatio: '16/9' }}>
              {c.thumbnail
                ? <img src={c.thumbnail} alt={c.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white/20 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                  </div>
              }
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-white font-bold text-sm truncate drop-shadow">{c.title}</p>
                <p className="text-white/70 text-xs">{(c.sections || []).length} sections • {totalLessons(c)} lessons</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {c.description && <p className="text-sm text-on-surface-variant line-clamp-2">{c.description}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setSelectedCourseId(c.id); setView('content'); }} className="flex-1 py-2.5 rounded-xl signature-gradient text-white text-xs font-bold flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">edit_note</span>Manage Content
                </button>
                <button onClick={() => { deleteCourse(c.id); showToast('Course deleted'); }} className="py-2.5 px-3 rounded-xl bg-error/10 text-error text-xs font-bold">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Add Course Modal ─── */}
      {addCourseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">New Course</h3>
              <button onClick={() => setAddCourseModal(false)} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Title *</label>
              <input value={newCourse.title} onChange={e => setNewCourse(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Advanced Python" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Description</label>
              <textarea value={newCourse.description} onChange={e => setNewCourse(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Brief course description..." className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Level</label>
              <select value={newCourse.level} onChange={e => setNewCourse(p => ({ ...p, level: e.target.value }))} className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-on-surface-variant">Course Thumbnail</label>
              <input ref={newThumbRef} type="file" accept="image/*" className="hidden" onChange={e => handleThumbFile(e.target.files[0], setNewCourseThumbnail)} />
              {newCourseThumbnail ? (
                <div className="relative mt-1.5 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img src={newCourseThumbnail} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setNewCourseThumbnail(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                  <button onClick={() => newThumbRef.current?.click()} className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-bold">
                    <span className="material-symbols-outlined text-xs">edit</span>Change
                  </button>
                </div>
              ) : (
                <button onClick={() => newThumbRef.current?.click()} className="w-full mt-1.5 border-2 border-dashed border-outline-variant/40 rounded-2xl flex flex-col items-center justify-center gap-2 py-6 hover:border-primary/40 hover:bg-primary/5 transition-colors" style={{ aspectRatio: '16/9' }}>
                  <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant text-2xl">add_photo_alternate</span>
                  </div>
                  <p className="text-on-surface-variant text-xs font-semibold">Tap to upload thumbnail</p>
                  <p className="text-on-surface-variant/60 text-[10px]">JPG, PNG, WEBP · Auto-compressed</p>
                </button>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddCourseModal(false)} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
              <button onClick={handleCreateCourse} disabled={!newCourse.title.trim()} className="flex-1 py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-40">Create</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </LecturerLayout>
  );
}

function LessonModal({ lessonForm, setLessonForm, urlPreview, handleUrlChange, onSave, onClose, isEdit }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center p-4 pb-6">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-bold text-xl">{isEdit ? 'Edit Lesson' : 'Add Lesson'}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><span className="material-symbols-outlined">close</span></button>
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
              <img src={getVideoThumbnail(urlPreview.id, urlPreview.type)} alt="Preview" className="w-full h-32 object-cover" onError={e => { e.target.style.opacity = 0; }} />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
              <div className="absolute bottom-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                {urlPreview.type === 'vimeo' ? 'Vimeo' : 'YouTube'} video found
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold text-on-surface-variant">Duration (optional)</label>
          <input value={lessonForm.duration} onChange={e => setLessonForm(p => ({ ...p, duration: e.target.value }))} placeholder="e.g., 15:30" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-on-surface-variant">Description (optional)</label>
          <textarea value={lessonForm.description} onChange={e => setLessonForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="What will students learn?" className="w-full mt-1 px-4 py-3 bg-surface-container rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant font-semibold text-sm">Cancel</button>
          <button onClick={onSave} disabled={!lessonForm.title.trim() || !urlPreview} className="flex-1 py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-40">
            {isEdit ? 'Save Changes' : 'Add Lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 bg-on-surface text-surface text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap">
      {msg}
    </div>
  );
}
