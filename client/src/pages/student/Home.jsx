import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import CourseCard from '../../components/CourseCard';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';
import { useComingSoon } from '../../context/ComingSoonContext';
import { COURSES } from '../../data/mockData';
import { SkeletonCourseCard, SkeletonBanner } from '../../components/Skeleton';

const PLAN_KEY_MAP = { 1: 'starter', 2: 'growth', 3: 'premium' };
const PLAN_COURSE_ID = { starter: 1, growth: 2, premium: 3 };
const PLAN_COLOR = {
  starter: 'bg-slate-500 text-white',
  growth:  'bg-purple-600 text-white',
  premium: 'bg-pink-600 text-white',
  none:    'bg-gray-400 text-white',
};
const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', premium: 'Premium', none: 'Free' };

const ANNOUNCE_GRADIENT = {
  starter: 'from-slate-700 to-slate-500',
  growth:  'from-violet-700 to-purple-500',
  premium: 'from-pink-700 to-rose-500',
  all:     'from-indigo-700 to-violet-600',
};

const PLAN_LEVEL = { none: 0, starter: 1, growth: 2, premium: 3 };

/* ─── Professional auto-rotating announcement carousel ─────────────────────── */
function BatchCarousel({ items, navigate, enrolledCourses }) {
  const count      = items.length;
  const [idx, setIdx]       = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeRef  = useRef(null);
  const touchX     = useRef(null);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const ms = (() => { try { return parseInt(localStorage.getItem('lms_carousel_ms') || '5000', 10); } catch { return 5000; } })();
    const t = setInterval(() => setIdx(i => (i + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, paused, idx]);

  const pause = () => {
    setPaused(true);
    clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(() => setPaused(false), 8000);
  };

  const goTo = (n) => { pause(); setIdx((n + count) % count); };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  if (count === 0) return null;

  const ann      = items[idx];
  const courseId = PLAN_COURSE_ID[ann.planKey];
  const enrolled = courseId ? enrolledCourses.includes(courseId) : false;
  const gradient = ANNOUNCE_GRADIENT[ann.planKey] || ANNOUNCE_GRADIENT.all;

  /* ─ Resolve where the CTA button goes ─ */
  const handleCta = () => {
    if (ann.ctaLink) { navigate(ann.ctaLink); return; }
    if (enrolled && courseId) { navigate(`/courses/${courseId}`); return; }
    if (courseId) { navigate(`/courses/${courseId}`); return; }
    navigate('/courses');
  };

  /* Fixed height tiers — no aspect-ratio so long descriptions never
     blow the card taller than the viewport on any device.           */
  const cardH = ann.size === 'small' ? 'h-40 sm:h-44'
              : ann.size === 'large'  ? 'h-64 sm:h-72'
              :                         'h-52 sm:h-60';

  return (
    <section className="lg:max-w-3xl lg:mx-auto">
      <div
        className={`group relative overflow-hidden rounded-3xl text-white shadow-2xl isolate ${cardH} ${ann.thumbnail ? 'bg-slate-900' : `bg-gradient-to-br ${gradient}`}`}
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 48) { dx < 0 ? next() : prev(); }
          touchX.current = null;
        }}
      >
        {/* Background image with layered gradient overlay */}
        {ann.thumbnail && (
          <>
            <img
              src={ann.thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/20 pointer-events-none" />
          </>
        )}

        {/* Gradient-only decorative blur blobs — contained inside the card */}
        {!ann.thumbnail && (
          <>
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 right-6 opacity-[0.08] pointer-events-none select-none">
              <span className="material-symbols-outlined text-[120px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {ann.icon || 'rocket_launch'}
              </span>
            </div>
          </>
        )}

        {/* Bottom gradient scrim — improves text legibility on both thumbnail and gradient cards */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none z-10" />

        {/* Zone 1 — Badge: top-left, always visible */}
        {ann.badge && (
          <div key={`badge-${ann.id}`} className="absolute top-4 left-5 z-20 animate-carousel-in">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[10px] uppercase font-bold tracking-widest border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
              {ann.badge}
            </span>
          </div>
        )}

        {/* Zone 2 — Title + description: anchored above the button zone */}
        <div
          key={`text-${ann.id}`}
          className="absolute left-5 right-5 bottom-[3.75rem] z-20 animate-carousel-in"
        >
          <h2 className="text-lg sm:text-xl font-extrabold font-headline leading-snug line-clamp-2 drop-shadow-sm">
            {ann.title}
          </h2>

          {(ann.startDate || ann.subtitle) && (
            <div className="mt-1 flex flex-col gap-0.5">
              {ann.subtitle && (
                <p className="text-white/80 text-xs leading-snug line-clamp-2">{ann.subtitle}</p>
              )}
              {ann.startDate && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-white/60 mt-0.5">
                  <span className="material-symbols-outlined text-[11px]">calendar_today</span>
                  {ann.startDate}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Zone 3 — CTA button: always pinned bottom-left */}
        <div className="absolute bottom-3.5 left-5 z-20 flex items-center gap-2">
          {enrolled && courseId ? (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 text-white font-bold text-xs">
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Enrolled
              </div>
              <button
                onClick={handleCta}
                className="px-4 py-1.5 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-lg active:scale-95 transition-transform"
              >
                View Content
              </button>
            </>
          ) : (
            <button
              onClick={handleCta}
              className="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-sm shadow-xl shadow-black/30 active:scale-95 transition-transform"
            >
              {ann.ctaLabel || 'Register Now'}
            </button>
          )}
        </div>

        {/* Prev / Next arrows — desktop hover */}
        {count > 1 && (
          <>
            <button onClick={prev}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all z-20 opacity-0 group-hover:opacity-100 duration-200">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <button onClick={next}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all z-20 opacity-0 group-hover:opacity-100 duration-200">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </>
        )}

        {/* Progress bar at the very bottom */}
        {count > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
            <div
              className="h-full bg-white/60 transition-all duration-300"
              style={{ width: `${((idx + 1) / count) * 100}%` }}
            />
          </div>
        )}

        {/* Dot indicators */}
        {count > 1 && (
          <div className="absolute bottom-3 right-4 flex items-center gap-1.5 z-20">
            {items.map((_, i) => (
              <span key={i} onClick={() => goTo(i)}
                className={`block rounded-full cursor-pointer transition-all duration-300 ${i === idx ? 'w-4 h-1 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { enrolledCourses, announcements, currentPlan, categories } = useApp();
  const { courses: ctxCourses, totalLessons, coursesLoading } = useCourses();
  const { visibleItems } = useComingSoon();

  const enrolled = ctxCourses.filter(c =>
    enrolledCourses.includes(c.id) || enrolledCourses.includes(Number(c.id))
  );
  const inProgress = enrolled.slice(0, 2).map(c => ({ ...c, progress: c.progress || 20 }));

  const canAccess = (planKey) => {
    if (!planKey || planKey === 'none') return true;
    return (PLAN_LEVEL[currentPlan] || 0) >= (PLAN_LEVEL[planKey] || 0);
  };

  const featuredCtxCourses = ctxCourses.filter(c => !c.isPlanProgram).slice(0, 6);

  // Build planKey → thumbnail map from real ctx courses so mock courses can show uploaded thumbnails
  const planThumbnailMap = {};
  ctxCourses.forEach(c => { if (c.planKey && c.thumbnail) planThumbnailMap[c.planKey] = c.thumbnail; });

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar />

      <main className="pt-24 pb-32 px-6 max-w-7xl mx-auto space-y-10">
        {/* Batch Announcements — auto-rotating carousel (excludes notification-only items) */}
        {coursesLoading
          ? <SkeletonBanner />
          : (announcements || []).filter(a => a.active && !a.notifOnly).length > 0 && (
              <BatchCarousel
                items={(announcements || []).filter(a => a.active && !a.notifOnly)}
                navigate={navigate}
                enrolledCourses={enrolledCourses}
              />
            )
        }

        {/* Category Chips */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-headline">Browse Categories</h2>
            <button onClick={() => navigate('/courses')} className="text-primary text-xs font-bold uppercase tracking-wider">See All</button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {(categories.length ? categories : []).map((cat, i) => (
              <button key={cat.id || cat.name} onClick={() => navigate('/courses')} className={`flex-shrink-0 px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 transition-colors ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>
                <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>
        </section>

        {/* TEET Banner */}
        <section
          onClick={() => navigate('/teet')}
          className="cursor-pointer relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 p-5 text-white shadow-xl hover:scale-[1.01] transition-all active:scale-99"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-violet-400/20 blur-xl pointer-events-none" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-3xl text-white" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
            <div className="flex-1">
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">New · Free for all students</p>
              <p className="font-extrabold text-base font-headline leading-tight">TEET — Entrance Test</p>
              <p className="text-white/75 text-xs mt-0.5">AI voice interview · Discover your learning path</p>
            </div>
            <div className="flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-lg">arrow_forward</span>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Batches — plan programs + any ctx courses mixed in */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-headline">Featured Batches</h2>
            <button onClick={() => navigate('/courses')} className="text-primary text-xs font-bold uppercase tracking-wider">See All</button>
          </div>
          {coursesLoading ? (
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 -mx-2 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-64"><SkeletonCourseCard /></div>
              ))}
            </div>
          ) : (
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 -mx-2 px-2">
            {COURSES.map(course => (
              <CourseCard
                key={`mock-${course.id}`}
                course={{ ...course, thumbnail: planThumbnailMap[course.planKey] || course.thumbnail }}
                isAccessible={canAccess(PLAN_KEY_MAP[course.id])}
              />
            ))}
            {featuredCtxCourses.map(c => {
              const accessible = canAccess(c.planKey);
              const badgeColor = PLAN_COLOR[c.planKey] || PLAN_COLOR.none;
              const badgeLabel = PLAN_LABEL[c.planKey] || 'Free';
              const lessonCount = totalLessons(c) || c.lectures || 0;
              const hasContent = totalLessons(c) > 0;
              return (
                <div key={`ctx-${c.id}`}
                  onClick={() => {
                    if (!accessible) { navigate('/courses'); return; }
                    if (hasContent) navigate(`/video/${c.id}`);
                  }}
                  className={`flex-shrink-0 w-64 group ${hasContent && accessible ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="relative h-40 rounded-2xl overflow-hidden mb-3 shadow-sm group-hover:shadow-xl transition-all duration-300">
                    <div className={`w-full h-full bg-gradient-to-br ${c.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                      {c.thumbnail
                        ? <img src={c.thumbnail} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        : <span className="material-symbols-outlined text-white/20 text-5xl group-hover:scale-105 transition-transform duration-500" style={{ fontVariationSettings: "'FILL' 1" }}>{c.gradientIcon || 'school'}</span>
                      }
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badgeLabel}</span>
                      {!hasContent && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/60 text-white/80">Coming Soon</span>}
                    </div>
                    {!accessible ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-xl">lock</span>
                        </div>
                      </div>
                    ) : hasContent ? (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                          <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-semibold">Content coming soon</div>
                      </div>
                    )}
                  </div>
                  <p className="font-bold text-sm leading-snug group-hover:text-primary transition-colors">{c.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-on-surface-variant">{lessonCount > 0 ? `${lessonCount} lectures` : 'No lectures yet'}</span>
                    {c.level && <span className="text-xs text-on-surface-variant">· {c.level}</span>}
                    {c.duration && <span className="text-xs text-on-surface-variant flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">schedule</span>{c.duration}</span>}
                  </div>
                  {c.instructor && <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1"><span className="material-symbols-outlined text-sm">person</span>{c.instructor}</p>}
                  {c.price != null && c.price > 0 && (
                    <p className="text-sm font-black text-primary mt-1">₹{c.price.toLocaleString()}</p>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </section>

        {/* Coming Soon */}
        {visibleItems.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold font-headline flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>hourglass_top</span>
                Coming Soon
              </h2>
              <span className="text-xs text-on-surface-variant">{visibleItems.length} item{visibleItems.length > 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleItems.map(item => {
                const GRAD = {
                  violet: 'from-violet-600 to-purple-500',
                  blue: 'from-blue-600 to-cyan-500',
                  rose: 'from-rose-600 to-pink-500',
                  amber: 'from-amber-500 to-orange-400',
                  emerald: 'from-emerald-600 to-teal-500',
                  slate: 'from-slate-700 to-slate-500',
                };
                const grad = GRAD[item.color] || GRAD.violet;
                const target = item.launchDate ? new Date(`${item.launchDate}T${item.launchTime || '00:00'}`) : null;
                const diff = target ? target - Date.now() : null;
                let cdText = null;
                if (diff !== null) {
                  if (diff <= 0) cdText = 'Launching soon!';
                  else {
                    const days = Math.floor(diff / 86400000);
                    const hrs = Math.floor((diff % 86400000) / 3600000);
                    const mins = Math.floor((diff % 3600000) / 60000);
                    cdText = days > 0 ? `${days}d ${hrs}h away` : hrs > 0 ? `${hrs}h ${mins}m away` : `${mins}m away`;
                  }
                }
                return (
                  <div key={item.id} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} text-white p-4 shadow-md flex items-center gap-3`}>
                    <div className="absolute inset-0 opacity-10 pointer-events-none">
                      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/30" />
                      <div className="absolute -left-6 -bottom-6 w-32 h-32 rounded-full bg-black/20" />
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 shadow-sm relative z-10">
                      <span className="material-symbols-outlined text-white text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon || 'rocket_launch'}</span>
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <p className="font-bold text-sm leading-snug truncate">{item.title}</p>
                      {item.description && <p className="text-xs text-white/80 truncate mt-0.5">{item.description}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">{item.category}</span>
                        {item.plan && item.plan !== 'all' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/30 capitalize">{item.plan}</span>
                        )}
                        {cdText && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-white/90">
                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                            {cdText}
                          </span>
                        )}
                        {item.tags?.slice(0, 2).map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/15 text-white/80">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex-shrink-0 relative z-10">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-[16px]">notifications</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Continue Learning */}
        {inProgress.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold font-headline">Continue Learning</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inProgress.map(course => (
                <div key={course.id} onClick={() => navigate(`/courses/${course.id}`)} className="bg-surface-container-lowest p-4 rounded-2xl flex items-center gap-4 border border-outline-variant/10 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <div className={`w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-gradient-to-br ${course.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
                    {(planThumbnailMap[course.planKey] || course.thumbnail)
                      ? <img src={planThumbnailMap[course.planKey] || course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined text-white/60 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{course.gradientIcon || 'school'}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{course.title}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{course.progress || 20}% complete</p>
                    <div className="mt-2 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full signature-gradient rounded-full" style={{ width: `${course.progress || 20}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
