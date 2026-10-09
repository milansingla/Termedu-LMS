import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiGet, apiPatch, apiDelete } from '../lib/api';
import { parseVideoUrl } from '../lib/courseUtils';

function uid() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT_COURSES = [
  { id: 'plan_starter', isPlanProgram: true, planKey: 'starter', title: 'STARTER Program', description: 'Get started with curated recorded courses.', instructor: 'Admin', level: 'Beginner', gradient: 'from-[#1a0533] via-[#2d1060] to-[#0d0d1a]', gradientIcon: 'menu_book', thumbnail: null, sections: [] },
  { id: 'plan_growth',  isPlanProgram: true, planKey: 'growth',  title: 'GROWTH Program',  description: 'Everything in Starter plus live classes and mentor sessions.', instructor: 'Admin', level: 'Intermediate', gradient: 'from-[#3b0082] via-[#5b21b6] to-[#0f1940]', gradientIcon: 'live_tv', thumbnail: null, sections: [] },
  { id: 'plan_premium', isPlanProgram: true, planKey: 'premium', title: 'PREMIUM Program', description: 'Everything in Growth plus guaranteed internship.', instructor: 'Admin', level: 'Advanced', gradient: 'from-[#1a0020] via-[#4a0e6e] to-[#1a1040]', gradientIcon: 'diamond', thumbnail: null, sections: [] },
];

const PLAN_PROGRAM_DEFAULTS = Object.fromEntries(DEFAULT_COURSES.map(p => [p.id, p]));

function mergePlanProgram(serverCourse) {
  const defaults = PLAN_PROGRAM_DEFAULTS[serverCourse.id];
  if (!defaults) return serverCourse;
  return {
    ...defaults,
    ...serverCourse,
    isPlanProgram: true,
    planKey:      serverCourse.planKey      || defaults.planKey,
    title:        serverCourse.title        || defaults.title,
    description:  serverCourse.description  || defaults.description,
    gradient:     serverCourse.gradient     || defaults.gradient,
    gradientIcon: serverCourse.gradientIcon || defaults.gradientIcon,
    instructor:   serverCourse.instructor   || defaults.instructor,
    level:        serverCourse.level        || defaults.level,
    sections:     Array.isArray(serverCourse.sections) ? serverCourse.sections : [],
  };
}

const CourseContext = createContext(null);

const SAVE_TIMEOUT = 90000;

export function CourseProvider({ children }) {
  const [courses, setCourses] = useState(DEFAULT_COURSES);
  const [coursesLoading, setCoursesLoading] = useState(true);

  // Set of course IDs currently being saved — poll skips these courses
  const savingIds = useRef(new Set());

  // ── Merge server data, preserving any in-flight local state ──────────────
  const mergeServerCourses = useCallback((data) => {
    const fixed = data.map(c => PLAN_PROGRAM_DEFAULTS[c.id] ? mergePlanProgram(c) : c);
    const serverById = Object.fromEntries(fixed.map(c => [c.id, c]));
    setCourses(prev => {
      const prevIds = new Set(prev.map(c => c.id));
      // Keep local version for any course currently being saved
      const merged = prev.map(c =>
        savingIds.current.has(c.id) ? c : (serverById[c.id] ?? c)
      );
      // Add new courses from server not yet in local state
      const newFromServer = fixed.filter(c => !prevIds.has(c.id));
      // Restore any default plan programs missing from both server and local
      const missingDefaults = DEFAULT_COURSES.filter(d =>
        !serverById[d.id] && !prevIds.has(d.id)
      );
      return [...missingDefaults, ...merged, ...newFromServer];
    });
  }, []);

  // ── Boot ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet('/api/data/courses')
      .then(data => { if (Array.isArray(data) && data.length > 0) mergeServerCourses(data); })
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, [mergeServerCourses]);

  // ── Poll every 60 s (staggered 3 s after mount to avoid startup burst) ───
  useEffect(() => {
    let timer;
    const start = () => {
      timer = setInterval(() => {
        if (!navigator.onLine) return;
        apiGet('/api/data/courses')
          .then(data => { if (Array.isArray(data) && data.length > 0) mergeServerCourses(data); })
          .catch(() => {});
      }, 60_000);
    };
    const delay = setTimeout(start, 3000);
    return () => { clearTimeout(delay); clearInterval(timer); };
  }, [mergeServerCourses]);

  // ── Core per-course save ──────────────────────────────────────────────────
  // Sends a PATCH with the full course data EXCLUDING the thumbnail so that
  // section saves and thumbnail saves can never race and overwrite each other.
  // The server merges req.body into existing data, so the already-saved
  // thumbnail in the DB is always preserved by section PATCHes.
  //
  // When saveThumbnail=true (used only by addCourse for initial creation),
  // a second PATCH with just the thumbnail is chained after the first so that
  // the thumbnail is persisted to the DB in a single atomic sequence.
  const persistCourse = useCallback((courseData, { saveThumbnail = false } = {}) => {
    const { id } = courseData;
    savingIds.current.add(id);
    // eslint-disable-next-line no-unused-vars
    const { thumbnail, ...body } = courseData;
    apiPatch(`/api/data/courses/${id}`, body, SAVE_TIMEOUT)
      .then(() => {
        if (saveThumbnail && thumbnail) {
          return apiPatch(`/api/data/courses/${id}`, { thumbnail }, SAVE_TIMEOUT).catch(() => {});
        }
      })
      .catch(err => console.error('[CourseContext] save failed:', err?.message || err))
      .finally(() => savingIds.current.delete(id));
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addCourse = useCallback((data) => {
    const course = { id: uid(), sections: [], ...data };
    setCourses(prev => [...prev, course]);
    // saveThumbnail:true chains a thumbnail PATCH after the identity PATCH so
    // both fields are committed in sequence under the same savingIds guard.
    persistCourse(course, { saveThumbnail: true });
    return course.id;
  }, [persistCourse]);

  const updateCourse = useCallback((courseId, data) => {
    const updated = courses.map(c => c.id === courseId ? { ...c, ...data } : c);
    setCourses(updated);
    const changed = updated.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
  }, [courses, persistCourse]);

  const deleteCourse = useCallback((courseId) => {
    setCourses(prev => prev.filter(c => c.id !== courseId));
    apiDelete(`/api/data/courses/${courseId}`)
      .catch(err => console.error('[CourseContext] delete failed:', err?.message || err));
  }, []);

  const addSection = useCallback((courseId, title) => {
    const sectionId = uid();
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: [...(c.sections || []), { id: sectionId, title, lessons: [] }] } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
    return sectionId;
  }, [courses, persistCourse]);

  const updateSection = useCallback((courseId, sectionId, title) => {
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: c.sections.map(s => s.id === sectionId ? { ...s, title } : s) } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
  }, [courses, persistCourse]);

  const deleteSection = useCallback((courseId, sectionId) => {
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: c.sections.filter(s => s.id !== sectionId) } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
  }, [courses, persistCourse]);

  const addLesson = useCallback((courseId, sectionId, lessonData) => {
    const parsed = parseVideoUrl(lessonData.videoUrl || lessonData.youtubeUrl);
    const videoId = parsed?.id || lessonData.videoId || '';
    const videoType = parsed?.type || lessonData.videoType || 'youtube';
    const lesson = { id: uid(), title: '', duration: '', description: '', ...lessonData, videoId, videoType };
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: c.sections.map(s => s.id === sectionId
          ? { ...s, lessons: [...s.lessons, lesson] } : s) } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
    return lesson.id;
  }, [courses, persistCourse]);

  const updateLesson = useCallback((courseId, sectionId, lessonId, data) => {
    const parsed = parseVideoUrl(data.videoUrl || data.youtubeUrl);
    const videoId = parsed?.id || data.videoId;
    const videoType = parsed?.type || data.videoType || 'youtube';
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: c.sections.map(s => s.id === sectionId
          ? { ...s, lessons: s.lessons.map(l => l.id === lessonId
              ? { ...l, ...data, videoId: videoId ?? l.videoId, videoType: videoType ?? l.videoType } : l) }
          : s) } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
  }, [courses, persistCourse]);

  const deleteLesson = useCallback((courseId, sectionId, lessonId) => {
    const next = courses.map(c => c.id === courseId
      ? { ...c, sections: c.sections.map(s => s.id === sectionId
          ? { ...s, lessons: s.lessons.filter(l => l.id !== lessonId) } : s) } : c);
    setCourses(next);
    const changed = next.find(c => c.id === courseId);
    if (changed) persistCourse(changed);
  }, [courses, persistCourse]);

  // ── Thumbnail ─────────────────────────────────────────────────────────────
  // Sends identity fields (planKey, title, etc.) so plan programs are always
  // created in the DB with complete metadata even before their first section.
  // Deliberately excludes `sections` — sections already in the DB are
  // preserved via the server's merge-with-existing, so thumbnail and section
  // saves can never race and overwrite each other.
  const updateThumbnail = useCallback((courseId, thumbnail) => {
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, thumbnail } : c));
    const course = courses.find(c => c.id === courseId);
    savingIds.current.add(courseId);
    const patchBody = {
      thumbnail,
      ...(course ? {
        title:         course.title,
        description:   course.description,
        planKey:       course.planKey,
        isPlanProgram: course.isPlanProgram ?? false,
        instructor:    course.instructor,
        level:         course.level,
        gradient:      course.gradient,
        gradientIcon:  course.gradientIcon,
      } : {}),
    };
    apiPatch(`/api/data/courses/${courseId}`, patchBody, SAVE_TIMEOUT)
      .catch(err => console.error('[CourseContext] thumbnail save failed:', err?.message || err))
      .finally(() => savingIds.current.delete(courseId));
  }, [courses]);

  const getCourse = useCallback((courseId) => courses.find(c => c.id === courseId), [courses]);
  const totalLessons = (course) => (course?.sections || []).reduce((s, sec) => s + (sec.lessons || []).length, 0);
  const totalLessonsAll = courses.reduce((sum, c) => sum + totalLessons(c), 0);

  return (
    <CourseContext.Provider value={{
      courses, coursesLoading, getCourse,
      addCourse, updateCourse, updateThumbnail, deleteCourse,
      addSection, updateSection, deleteSection,
      addLesson, updateLesson, deleteLesson,
      totalLessons, totalLessonsAll,
    }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourses() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourses must be used inside CourseProvider');
  return ctx;
}
