export default function Loading() {
  return (
    <div className="container-page py-20">
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-hover" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-surface-border bg-surface"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
