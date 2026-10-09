import { memo } from 'react';
import { useNavigate } from 'react-router-dom';

function CourseThumbnail({ course, className = '', children }) {
  // Thumbnail always takes priority over gradient
  if (course.thumbnail) {
    return (
      <div className={`${className} relative`}>
        <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
        {children}
      </div>
    );
  }
  return (
    <div className={`bg-gradient-to-br ${course.gradient} ${className} flex flex-col items-center justify-center gap-1 relative`}>
      <span className="material-symbols-outlined text-white/40 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
        {course.gradientIcon || 'school'}
      </span>
      {children}
    </div>
  );
}

function CourseCard({ course, compact = false, isAccessible = false }) {
  const navigate = useNavigate();

  if (compact) {
    return (
      <div
        onClick={() => navigate(`/courses/${course.id}`)}
        className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm hover:shadow-md transition-all cursor-pointer flex gap-3 p-3"
      >
        <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
          <CourseThumbnail course={course} className="w-full h-full">
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </div>
          </CourseThumbnail>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">{course.category}</p>
          <h4 className="font-bold text-sm leading-snug line-clamp-2">{course.title}</h4>
          {course.progress !== undefined && (
            <>
              <div className="mt-2 w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${course.progress}%` }} />
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1 font-medium">{course.progress}% complete</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(`/courses/${course.id}`)}
      className="flex-shrink-0 w-72 group cursor-pointer"
    >
      <div className="relative h-44 rounded-2xl overflow-hidden mb-4 shadow-sm group-hover:shadow-xl transition-all duration-300">
        <CourseThumbnail course={course} className="w-full h-full group-hover:scale-105 transition-transform duration-500">
          <div className={`absolute top-3 left-3 ${course.badgeColor} px-2 py-1 rounded-lg text-[10px] font-bold text-white uppercase tracking-tighter`}>
            {course.badge}
          </div>
          {course.rating && (
            <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-bold text-on-surface">
              {course.rating} ★
            </div>
          )}
        </CourseThumbnail>
      </div>
      <h3 className="font-bold text-on-surface leading-snug group-hover:text-primary transition-colors">{course.title}</h3>
      <p className="text-xs text-on-surface-variant mt-1">{course.subtitle}</p>
      <div className="mt-3 flex items-center justify-between">
        {isAccessible ? (
          <span className="text-sm font-bold text-green-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            Access Included
          </span>
        ) : (
          <>
            <span className="text-lg font-black text-primary">₹{course.price.toLocaleString()}</span>
            {course.originalPrice !== course.price && (
              <span className="text-xs text-outline line-through">₹{course.originalPrice.toLocaleString()}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(CourseCard);
