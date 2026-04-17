export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border bg-white p-6 space-y-4 ${className}`}>
      <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-2/3 bg-gray-200 rounded animate-pulse" />
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="h-8 bg-gray-200 rounded animate-pulse" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}
