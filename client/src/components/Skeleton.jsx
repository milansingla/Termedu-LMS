function Shimmer({ className = '' }) {
  return (
    <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
  );
}

export function SkeletonLine({ width = 'w-full', height = 'h-4', className = '' }) {
  return <Shimmer className={`${width} ${height} ${className}`} />;
}

export function SkeletonCircle({ size = 'w-10 h-10' }) {
  return <div className={`animate-pulse bg-surface-container-high rounded-full ${size}`} />;
}

export function SkeletonStatCard() {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-3xl shadow-sm flex flex-col gap-3">
      <Shimmer className="w-12 h-12 rounded-2xl" />
      <div className="space-y-2">
        <SkeletonLine width="w-24" height="h-3" />
        <SkeletonLine width="w-16" height="h-8" />
      </div>
    </div>
  );
}

export function SkeletonCourseCard() {
  return (
    <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm">
      <Shimmer className="w-full h-36 rounded-none" />
      <div className="p-4 space-y-2.5">
        <SkeletonLine width="w-3/4" height="h-4" />
        <SkeletonLine width="w-1/2" height="h-3" />
        <div className="flex gap-2 pt-1">
          <Shimmer className="w-16 h-6 rounded-full" />
          <Shimmer className="w-20 h-6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonSessionCard() {
  return (
    <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <Shimmer className="w-10 h-10 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="w-3/5" height="h-4" />
          <SkeletonLine width="w-2/5" height="h-3" />
        </div>
        <Shimmer className="w-16 h-7 rounded-full" />
      </div>
      <SkeletonLine width="w-full" height="h-3" />
      <div className="flex gap-2 pt-1">
        <Shimmer className="w-24 h-9 rounded-xl" />
        <Shimmer className="w-24 h-9 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonListItem() {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4">
      <Shimmer className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="w-2/3" height="h-4" />
        <SkeletonLine width="w-1/3" height="h-3" />
      </div>
      <Shimmer className="w-8 h-8 rounded-full flex-shrink-0" />
    </div>
  );
}

export function SkeletonBanner() {
  return <Shimmer className="w-full h-44 rounded-3xl" />;
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-outline-variant/20">
      <SkeletonCircle size="w-9 h-9" />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine width="w-2/5" height="h-3.5" />
        <SkeletonLine width="w-1/4" height="h-3" />
      </div>
      <SkeletonLine width="w-20" height="h-6" />
      <SkeletonLine width="w-16" height="h-6" />
    </div>
  );
}

export function SkeletonAdminCard() {
  return (
    <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <SkeletonLine width="w-32" height="h-4" />
          <SkeletonLine width="w-20" height="h-7" />
        </div>
        <Shimmer className="w-12 h-12 rounded-2xl" />
      </div>
      <SkeletonLine width="w-full" height="h-1.5" />
    </div>
  );
}
