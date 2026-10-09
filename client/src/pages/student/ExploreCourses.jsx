import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import { COURSES, CATEGORIES } from '../../data/mockData';
import { useApp } from '../../context/AppContext';
import { useCourses } from '../../context/CourseContext';

const PLAN_COLOR = {
  starter: 'bg-slate-600 text-white',
  growth:  'bg-violet-600 text-white',
  premium: 'bg-pink-600 text-white',
  none:    'bg-gray-500 text-white',
};
const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', premium: 'Premium', none: 'Free' };
const PLAN_LEVEL = { none: 0, starter: 1, growth: 2, premium: 3 };

/* ── Unified course card ─────────────────────────────────────────────────── */
function CourseCard({ item, accessible, enrolled, onClick }) {
  const thumbnail = item.thumbnail;
  const badgeColor = item.badgeColor || PLAN_COLOR[item.planKey] || PLAN_COLOR.none;
  const badgeLabel = item.badge || PLAN_LABEL[item.planKey] || 'Free';

  return (
    <div onClick={onClick} className="cursor-pointer group flex flex-col">
      {/* Thumbnail / Gradient */}
      <div className="relative h-48 rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl transition-all duration-300">
        <div className={`w-full h-full bg-gradient-to-br ${item.gradient || 'from-primary to-secondary'} flex items-center justify-center`}>
          {thumbnail
            ? <img src={thumbnail} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            : <span className="material-symbols-outlined text-white/20 text-6xl group-hover:scale-105 transition-transform duration-500" style={{ fontVariationSettings: "'FILL' 1" }}>{item.gradientIcon || 'school'}</span>
          }
        </div>

        {/* Dark gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Plan badge */}
        <div className="absolute top-3 left-3">
          <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg ${badgeColor}`}>{badgeLabel}</span>
        </div>

        {/* Enrolled / Access badge */}
        {enrolled && (
          <div className="absolute top-3 right-3 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            {accessible && !item._isMockEnrolled ? 'Plan Active' : 'Enrolled'}
          </div>
        )}

        {/* Rating badge (mock courses) */}
        {item.rating && (
          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded-lg text-xs font-bold text-amber-600 flex items-center gap-0.5 shadow">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            {item.rating}
          </div>
        )}

        {/* Lesson count (ctx courses with real content) */}
        {item._hasContent && accessible && (
          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded-lg text-xs font-bold text-on-surface flex items-center gap-1 shadow">
            <span className="material-symbols-outlined text-xs text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            {item._lessonCount} lessons
          </div>
        )}

        {/* Lock overlay for inaccessible */}
        {!accessible && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-white text-2xl">lock</span>
            </div>
          </div>
        )}

        {/* Play hover overlay for accessible */}
        {accessible && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
              <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </div>
          </div>
        )}
      </div>

      {/* Course info */}
      <div className="mt-3 flex-1 flex flex-col">
        <h3 className="font-bold text-on-surface leading-snug group-hover:text-primary transition-colors line-clamp-2">{item.title}</h3>
        {item.subtitle && <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{item.subtitle}</p>}
        {item.description && !item.subtitle && <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{item.description}</p>}

        {item.instructor && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">person</span>
            <span className="truncate">{item.instructor}</span>
          </div>
        )}

        {(item.duration || item._lessonCount > 0) && (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-on-surface-variant">
            {item.duration && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">schedule</span>
                {item.duration}
              </span>
            )}
            {item._lessonCount > 0 && item._type === 'ctx' && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">play_circle</span>
                {item._lessonCount} lectures
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          {enrolled ? (
            <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              Access Included
            </span>
          ) : item.price != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-primary">₹{item.price.toLocaleString()}</span>
              {item.originalPrice && item.originalPrice !== item.price && (
                <span className="text-xs text-outline line-through">₹{item.originalPrice.toLocaleString()}</span>
              )}
            </div>
          ) : (
            <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${PLAN_COLOR[item.planKey] || PLAN_COLOR.none}`}>
              {!accessible ? 'Upgrade' : PLAN_LABEL[item.planKey] || 'Free'}
            </span>
          )}
          {item.level && (
            <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">{item.level}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function ExploreCourses() {
  const navigate = useNavigate();
  const { enrolledCourses, currentPlan } = useApp();
  const { courses: ctxCourses, totalLessons } = useCourses();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const canAccess = (planKey) => {
    if (!planKey || planKey === 'none') return true;
    return (PLAN_LEVEL[currentPlan] || 0) >= (PLAN_LEVEL[planKey] || 0);
  };

  // Build planKey → thumbnail map from real DB courses
  const planThumbnailMap = {};
  ctxCourses.forEach(c => { if (c.planKey && c.thumbnail) planThumbnailMap[c.planKey] = c.thumbnail; });

  const q = search.toLowerCase();

  const mockItems = COURSES
    .filter(c => !activeCategory || activeCategory === 'All' || c.category === activeCategory)
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q))
    .map(c => ({
      ...c,
      _type: 'mock',
      // Pull real thumbnail from DB if admin has uploaded one
      thumbnail: planThumbnailMap[c.planKey] || c.thumbnail || null,
    }));

  const ctxItems = ctxCourses
    .filter(c => !c.isPlanProgram)
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
    .map(c => ({
      ...c,
      _type: 'ctx',
      // Prefer actual section/lesson count; fall back to admin-set lectures field
      _lessonCount: totalLessons(c) || c.lectures || 0,
      // Navigation guard: only navigate to VideoPlayer when actual video content exists
      _hasContent: totalLessons(c) > 0,
    }));

  const allItems = [...mockItems, ...ctxItems];
  const allCategories = ['All', ...CATEGORIES.map(c => c.name)];

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 md:left-64 right-0 z-50 bg-background shadow-sm border-b border-outline-variant/10 px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="md:hidden bg-black rounded-lg px-2 py-1.5 flex items-center shadow-md">
            <img src="/term-logo.png" alt="T.E.R.M. Edu" className="h-5 w-auto" />
          </div>
          <h1 className="font-headline font-bold text-lg">Courses</h1>
        </div>
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-outline text-xl">search</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search courses, instructors…"
            className="w-full pl-11 pr-4 py-3 bg-surface-container rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline hover:text-on-surface">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          )}
        </div>
      </header>

      <main className="pt-36 pb-32 px-5 max-w-7xl mx-auto space-y-6">
        {/* Category filters */}
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {allCategories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? 'signature-gradient text-white shadow-md'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Result count */}
        <p className="text-sm text-on-surface-variant font-medium">
          {allItems.length} course{allItems.length !== 1 ? 's' : ''} found
        </p>

        {/* Unified grid */}
        {allItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {allItems.map(item => {
              const accessible = canAccess(item.planKey);
              const enrolled = item._type === 'mock'
                ? (enrolledCourses.includes(item.id) || accessible)
                : false;

              const hasContent = item._type === 'ctx' ? item._hasContent : true;
              return (
                <CourseCard
                  key={`${item._type}-${item.id}`}
                  item={item}
                  accessible={accessible}
                  enrolled={enrolled}
                  onClick={() => {
                    if (item._type === 'mock') {
                      navigate(`/courses/${item.id}`);
                    } else if (!accessible) {
                      navigate(`/courses/${item.id}`);
                    } else if (hasContent) {
                      navigate(`/video/${item.id}`);
                    }
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
            <span className="material-symbols-outlined text-7xl mb-4 opacity-40">search_off</span>
            <p className="font-headline font-bold text-lg">No courses found</p>
            <p className="text-sm mt-1 text-center">Try a different search term or category</p>
            {search && (
              <button onClick={() => setSearch('')} className="mt-4 px-6 py-2 bg-primary text-white rounded-full text-sm font-semibold">
                Clear Search
              </button>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
