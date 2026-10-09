import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import { COURSES } from '../../data/mockData';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { buyCourse, buildWhatsAppUrl } from '../../utils/buyCourse';

function StarRow({ value, max = 5, size = 'text-lg', filled = 'text-yellow-400', empty = 'text-outline' }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map(s => (
        <span key={s} className={`material-symbols-outlined ${size} ${s <= value ? filled : empty}`}
          style={{ fontVariationSettings: s <= value ? "'FILL' 1" : "'FILL' 0" }}>star</span>
      ))}
    </div>
  );
}

function RatingSummary({ avg, count, ratings }) {
  const dist = [5, 4, 3, 2, 1].map(s => ({
    star: s,
    pct: count ? Math.round((Object.values(ratings).filter(v => v === s).length / count) * 100) : 0,
  }));
  return (
    <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-2xl">
      <div className="text-center flex-shrink-0">
        <p className="text-5xl font-black text-primary leading-none">{avg > 0 ? avg : '—'}</p>
        <div className="flex gap-0.5 mt-2 justify-center">
          <StarRow value={Math.round(avg)} size="text-sm" />
        </div>
        <p className="text-[10px] text-on-surface-variant mt-1">{count} rating{count !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex-1 space-y-1">
        {dist.map(({ star, pct }) => (
          <div key={star} className="flex items-center gap-2">
            <span className="text-[10px] text-on-surface-variant w-3 text-right">{star}</span>
            <span className="material-symbols-outlined text-yellow-400 text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            <div className="flex-1 bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div className="bg-yellow-400 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StarRatingWidget({ courseId, userId, ratingData, onRated }) {
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const myRating = userId ? (ratingData.ratings[userId] || 0) : 0;
  const display = hover || myRating;

  const submit = async (stars) => {
    if (!userId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/data/ratings/${courseId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, stars }),
      });
      const data = await res.json();
      onRated(data);
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="p-4 bg-surface-container-low rounded-2xl text-center space-y-3">
      <p className="text-sm font-semibold text-on-surface">
        {myRating ? 'Your rating' : 'Rate this course'}
      </p>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => submit(s)}
            disabled={submitting}
            className="transition-transform active:scale-90 disabled:opacity-50"
            style={{ touchAction: 'manipulation' }}
          >
            <span
              className="material-symbols-outlined text-4xl transition-colors"
              style={{
                color: s <= display ? '#facc15' : 'var(--color-outline)',
                fontVariationSettings: s <= display ? "'FILL' 1" : "'FILL' 0",
              }}
            >star</span>
          </button>
        ))}
      </div>
      {myRating > 0 && (
        <p className="text-xs text-on-surface-variant">
          You rated this {myRating} star{myRating !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

/* ── Shared top nav ─────────────────────────────────────────────────────── */
function CourseNav({ onBack, actions }) {
  return (
    <nav className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-surface/90 backdrop-blur-md flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <span className="text-base font-extrabold tracking-tight text-on-surface font-headline">Course Details</span>
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </nav>
  );
}

/* ── Shared bottom CTA bar ───────────────────────────────────────────────── */
function CtaBar({ children }) {
  return (
    <div className="fixed bottom-[72px] md:bottom-0 left-0 md:left-64 right-0 z-[55] px-4 py-3 md:py-5 bg-surface/95 backdrop-blur-xl border-t border-outline-variant/10">
      {children}
    </div>
  );
}

const PLAN_KEY_MAP  = { 1: 'starter', 2: 'growth', 3: 'premium' };
const PLAN_COLOR    = { starter: 'bg-slate-500 text-white', growth: 'bg-purple-600 text-white', premium: 'bg-pink-600 text-white', none: 'bg-gray-400 text-white' };
const PLAN_LABEL    = { starter: 'Starter', growth: 'Growth', premium: 'Premium', none: 'Free' };
const PLAN_LEVEL    = { none: 0, starter: 1, growth: 2, premium: 3 };

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enrolledCourses, currentUser, currentPlan } = useApp();
  const { courses: ctxCourses, totalLessons } = useCourses();

  const canAccess = (planKey) => {
    if (!planKey || planKey === 'none') return true;
    return (PLAN_LEVEL[currentPlan] || 0) >= (PLAN_LEVEL[planKey] || 0);
  };

  const numericId   = Number(id);
  const isMockCourse = Number.isInteger(numericId) && !isNaN(numericId) && numericId > 0 && COURSES.find(c => c.id === numericId);
  const mockCourse  = isMockCourse ? COURSES.find(c => c.id === numericId) : null;
  const ctxCourse   = !isMockCourse ? ctxCourses.find(c => c.id === id) : null;

  const [activeTab, setActiveTab]       = useState('overview');
  const [showAdvisor, setShowAdvisor]   = useState(false);
  const [waLoading, setWaLoading]       = useState(false);
  const [ratingData, setRatingData]     = useState({ ratings: {}, avg: 0, count: 0 });
  const buyLockRef                      = useRef(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/data/ratings/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRatingData(d); })
      .catch(() => {});
  }, [id]);

  /* ════════════════════════════════════════════════════════════════
     CtxCourse — admin-created course
  ════════════════════════════════════════════════════════════════ */
  if (ctxCourse) {
    const accessible = canAccess(ctxCourse.planKey);
    const accent     = PLAN_COLOR[ctxCourse.planKey] || PLAN_COLOR.none;
    const planLabel  = PLAN_LABEL[ctxCourse.planKey] || 'Free';

    return (
      <>
        <BottomNav />
        <div className="bg-background min-h-screen text-on-surface md:ml-64">
          <CourseNav onBack={() => navigate(-1)} />

          <main className="pt-16 pb-36 md:pb-28">
            {/* Hero */}
            <div className="relative overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: 260 }}>
              <div className={`w-full h-full bg-gradient-to-br ${ctxCourse.gradient || 'from-primary to-secondary'}`}>
                {ctxCourse.thumbnail
                  ? <img src={ctxCourse.thumbnail} alt={ctxCourse.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white/20 text-8xl" style={{ fontVariationSettings: "'FILL' 1" }}>{ctxCourse.gradientIcon || 'school'}</span>
                    </div>
                }
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${accent}`}>{planLabel}</span>
              </div>
              {accessible && (
                <button onClick={() => navigate(`/video/${ctxCourse.id}`)} className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                </button>
              )}
            </div>

            <div className="px-4 pt-5 space-y-5">
              {/* Title + meta */}
              <div>
                <h1 className="text-xl font-extrabold font-headline leading-snug text-on-surface">{ctxCourse.title}</h1>
                {ctxCourse.description && <p className="text-on-surface-variant text-sm mt-2 leading-relaxed">{ctxCourse.description}</p>}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">video_library</span>
                    {totalLessons(ctxCourse)} Lessons
                  </div>
                  <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">folder_copy</span>
                    {(ctxCourse.sections || []).length} Sections
                  </div>
                  {ctxCourse.level && (
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>
                      {ctxCourse.level}
                    </div>
                  )}
                </div>
                {ctxCourse.instructor && (
                  <div className="flex items-center gap-3 mt-4 p-4 bg-surface-container-low rounded-2xl">
                    <div className="w-11 h-11 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant font-medium">Instructor</p>
                      <p className="font-bold text-on-surface text-sm">{ctxCourse.instructor}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Curriculum */}
              <div>
                <h3 className="font-bold font-headline text-base mb-3 text-on-surface">Curriculum</h3>
                {(ctxCourse.sections || []).length === 0 ? (
                  <div className="text-center py-8 text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-4xl opacity-30">video_library</span>
                    <p className="text-sm">Curriculum being updated</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(ctxCourse.sections || []).map((section, si) => (
                      <div key={section.id} className="rounded-2xl border border-outline-variant/20 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low">
                          <p className="font-semibold text-sm text-on-surface">{section.title}</p>
                          <span className="text-xs text-on-surface-variant">{section.lessons.length} lessons</span>
                        </div>
                        {section.lessons.map((lesson, li) => (
                          <div
                            key={lesson.id}
                            onClick={() => accessible && navigate(`/video/${ctxCourse.id}`, { state: { sectionIdx: si, lessonIdx: li } })}
                            className={`flex items-center gap-3 px-4 py-3 border-t border-outline-variant/10 transition-all ${accessible ? 'cursor-pointer hover:bg-surface-container' : ''}`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${accessible ? 'bg-primary-fixed' : 'bg-surface-container-high'}`}>
                              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0", color: accessible ? '#4400a8' : 'var(--color-outline)' }}>
                                {accessible ? 'play_circle' : 'lock'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-on-surface truncate">{lesson.title}</p>
                              {lesson.duration && <p className="text-xs text-on-surface-variant mt-0.5">{lesson.duration}</p>}
                            </div>
                            {!accessible && <span className="material-symbols-outlined text-outline text-sm flex-shrink-0">lock</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ratings */}
              <div className="space-y-3 pb-4">
                <h3 className="font-bold font-headline text-base text-on-surface">Ratings</h3>
                <RatingSummary avg={ratingData.avg} count={ratingData.count} ratings={ratingData.ratings} />
                {accessible && currentUser && (
                  <StarRatingWidget
                    courseId={ctxCourse.id}
                    userId={currentUser.id}
                    ratingData={ratingData}
                    onRated={setRatingData}
                  />
                )}
              </div>
            </div>
          </main>

          {/* CTA */}
          <CtaBar>
            {accessible ? (
              <button onClick={() => navigate(`/video/${ctxCourse.id}`)} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]">
                Start Learning
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-center text-xs text-on-surface-variant">Requires the <strong className="text-on-surface">{PLAN_LABEL[ctxCourse.planKey] || 'higher'}</strong> plan</p>
                <button onClick={() => navigate('/courses')} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]">
                  Upgrade Plan to Access
                </button>
              </div>
            )}
          </CtaBar>
        </div>
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     Mock course — plan purchase flow
  ════════════════════════════════════════════════════════════════ */
  const course        = mockCourse || COURSES[0];
  const planProgramKey = PLAN_KEY_MAP[course.id];
  const planThumbnail = ctxCourses.find(c => c.planKey === planProgramKey)?.thumbnail || null;
  const isEnrolled    = enrolledCourses.includes(course.id) || canAccess(planProgramKey);
  const normKey       = (k) => (k || '').toLowerCase().replace(/[^a-z]/g, '');
  const allPlanCourses = ctxCourses.filter(c => normKey(c.planKey) === planProgramKey);
  const planSections  = allPlanCourses.flatMap(c => c.sections || []);
  const planVideoSource = allPlanCourses.find(c => (c.sections || []).some(s => s.lessons?.length > 0)) || allPlanCourses[0];
  const planVideoTarget = planVideoSource ? `/video/${planVideoSource.id}` : `/video/${course.id}`;

  const handleEnroll = () => {
    if (isEnrolled) { navigate(planVideoTarget); return; }
    if (!currentUser) { navigate('/login'); return; }
    if (buyLockRef.current) return;
    setShowAdvisor(true);
  };

  const handleWhatsAppRedirect = () => {
    if (buyLockRef.current) return;
    buyLockRef.current = true;
    setWaLoading(true);
    buyCourse({
      courseName: course.title,
      userEmail: currentUser?.email,
      userName: currentUser?.name,
    });
    setTimeout(() => {
      setWaLoading(false);
      setShowAdvisor(false);
      buyLockRef.current = false;
    }, 1800);
  };

  return (
    <>
      <BottomNav />
      <div className="bg-background min-h-screen text-on-surface md:ml-64">
        <CourseNav
          onBack={() => navigate(-1)}
          actions={
            <>
              <button className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">share</span>
              </button>
              <button className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">bookmark_border</span>
              </button>
            </>
          }
        />

        <main className="pt-16 pb-36 md:pb-28">
          {/* Hero */}
          <div className="relative h-56 sm:h-64 overflow-hidden">
            {(planThumbnail || course.thumbnail)
              ? <img src={planThumbnail || course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
              : <div className={`w-full h-full bg-gradient-to-br ${course.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-white/20 text-8xl" style={{ fontVariationSettings: "'FILL' 1" }}>{course.gradientIcon || 'school'}</span>
                </div>
            }
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-4">
              <span className={`${course.badgeColor} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg`}>{course.badge}</span>
            </div>
            {/* Play / buy overlay */}
            <button
              onClick={() => isEnrolled ? navigate(planVideoTarget) : setShowAdvisor(true)}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={isEnrolled ? 'Play' : 'Buy'}
            >
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isEnrolled ? 'play_arrow' : 'shopping_cart'}
                </span>
              </div>
            </button>
          </div>

          <div className="px-4 pt-5 space-y-5">
            {/* Title + price (stacked, never side-by-side overflow) */}
            <div>
              <h1 className="text-xl font-extrabold font-headline leading-snug text-on-surface">{course.title}</h1>
              <div className="flex items-baseline gap-3 mt-2 flex-wrap">
                <span className="text-2xl font-black text-primary">₹{course.price.toLocaleString()}</span>
                <span className="text-sm text-outline line-through">₹{course.originalPrice.toLocaleString()}</span>
                <span className="text-xs font-bold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                  {Math.round((1 - course.price / course.originalPrice) * 100)}% off
                </span>
              </div>
              <p className="text-on-surface-variant text-sm mt-2 leading-relaxed">{course.subtitle}</p>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-3 mt-3">
                <div className="flex items-center gap-1 text-xs">
                  <span className="material-symbols-outlined text-yellow-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="font-bold text-on-surface">{ratingData.avg > 0 ? ratingData.avg : course.rating}</span>
                  <span className="text-on-surface-variant">({ratingData.count > 0 ? `${ratingData.count} ratings` : `${course.students.toLocaleString()} students`})</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">video_library</span>{course.lectures} Lectures
                </div>
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">schedule</span>{course.duration}
                </div>
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>{course.level}
                </div>
              </div>

              {/* Instructor */}
              <div className="flex items-center gap-3 mt-4 p-4 bg-surface-container-low rounded-2xl">
                {course.instructorAvatar
                  ? <img src={course.instructorAvatar} alt={course.instructor} className="w-11 h-11 rounded-full object-cover border-2 border-primary-fixed flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-full signature-gradient flex items-center justify-center border-2 border-primary-fixed flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                    </div>
                }
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">Instructor</p>
                  <p className="font-bold text-on-surface text-sm">{course.instructor}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-container p-1 rounded-xl">
              {['overview', 'curriculum', 'reviews'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all capitalize ${
                    activeTab === t
                      ? 'bg-surface-container-lowest shadow-sm text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <h3 className="font-bold font-headline text-base text-on-surface">About this Course</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{course.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Lectures',  value: course.lectures,    icon: 'play_circle' },
                    { label: 'Duration',  value: course.duration,    icon: 'schedule' },
                    { label: 'Level',     value: course.level,       icon: 'signal_cellular_alt' },
                    { label: 'Language',  value: 'Hindi / English',  icon: 'translate' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="bg-surface-container-low p-4 rounded-2xl flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary flex-shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-on-surface-variant">{label}</p>
                        <p className="font-bold text-sm text-on-surface truncate">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Curriculum tab */}
            {activeTab === 'curriculum' && (
              <div className="space-y-3">
                {planSections.length > 0 ? (
                  planSections.map((section, si) => (
                    <div key={section.id || si} className="rounded-2xl border border-outline-variant/20 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low">
                        <p className="font-semibold text-sm text-on-surface">{section.title}</p>
                        <span className="text-xs text-on-surface-variant">{section.lessons?.length || 0} lessons</span>
                      </div>
                      {(section.lessons || []).map((lesson, li) => (
                        <div
                          key={lesson.id || li}
                          onClick={() => isEnrolled && navigate(planVideoTarget)}
                          className={`flex items-center gap-3 px-4 py-3 border-t border-outline-variant/10 transition-all ${isEnrolled ? 'cursor-pointer hover:bg-surface-container' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isEnrolled ? 'bg-primary-fixed' : 'bg-surface-container'}`}>
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1", color: isEnrolled ? '#4400a8' : 'var(--color-outline)' }}>
                              {isEnrolled ? 'play_circle' : 'lock'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-on-surface truncate">{lesson.title}</p>
                            {lesson.duration && <p className="text-xs text-on-surface-variant mt-0.5">{lesson.duration}</p>}
                          </div>
                          {!isEnrolled && <span className="material-symbols-outlined text-outline text-sm flex-shrink-0">lock</span>}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-4xl opacity-30">video_library</span>
                    <p className="text-sm font-medium">Curriculum coming soon</p>
                    <p className="text-xs">Content is being uploaded. Check back shortly.</p>
                  </div>
                )}
              </div>
            )}

            {/* Reviews tab */}
            {activeTab === 'reviews' && (
              <div className="space-y-4 pb-4">
                <RatingSummary avg={ratingData.avg} count={ratingData.count} ratings={ratingData.ratings} />
                {isEnrolled && currentUser ? (
                  <StarRatingWidget
                    courseId={String(course.id)}
                    userId={currentUser.id}
                    ratingData={ratingData}
                    onRated={setRatingData}
                  />
                ) : !isEnrolled && (
                  <p className="text-center text-xs text-on-surface-variant py-2">Enroll to rate this course</p>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Buy / Continue CTA */}
        <CtaBar>
          {isEnrolled ? (
            <button onClick={() => navigate(planVideoTarget)} className="w-full py-4 rounded-2xl signature-gradient text-white font-bold text-base shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]">
              Continue Learning
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-surface-variant leading-tight">Starting from</p>
                <p className="font-black text-primary text-lg leading-tight">₹{course.price.toLocaleString()}</p>
              </div>
              <button
                onClick={handleEnroll}
                className="flex-1 py-4 rounded-2xl signature-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98] whitespace-nowrap"
              >
                Buy Now
              </button>
            </div>
          )}
        </CtaBar>

        {/* WhatsApp Advisor Modal */}
        {showAdvisor && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6"
            onClick={(e) => { if (e.target === e.currentTarget && !waLoading) setShowAdvisor(false); }}
          >
            <div className="bg-surface w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-outline-variant" />
              </div>

              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#25D366]/15 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-headline font-bold text-base text-on-surface">Talk to an Advisor</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">We'll guide you through enrollment</p>
                    </div>
                  </div>
                  {!waLoading && (
                    <button onClick={() => setShowAdvisor(false)} className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors flex-shrink-0">
                      <span className="material-symbols-outlined text-on-surface-variant text-xl">close</span>
                    </button>
                  )}
                </div>

                {/* Course summary chip */}
                <div className="bg-surface-container-low rounded-2xl p-3 flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex-shrink-0 bg-gradient-to-br ${course.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                    <span className="material-symbols-outlined text-white/70 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{course.gradientIcon || 'school'}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-on-surface truncate">{course.title}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">₹{course.price.toLocaleString()} onwards</p>
                  </div>
                </div>

                {/* Info note */}
                <div className="bg-primary/8 rounded-xl px-4 py-3">
                  <p className="text-sm text-on-surface leading-relaxed">
                    Our advisor will contact you on <strong>WhatsApp</strong> to complete your enrollment and share payment details.
                  </p>
                </div>

                {/* CTA button */}
                <button
                  onClick={handleWhatsAppRedirect}
                  disabled={waLoading}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-70"
                  style={{ background: waLoading ? '#128c7e' : 'linear-gradient(135deg,#25d366,#128c7e)' }}
                >
                  {waLoading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Opening WhatsApp…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      Chat on WhatsApp
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-on-surface-variant leading-relaxed">
                  You'll be redirected to WhatsApp · No payment collected here
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
