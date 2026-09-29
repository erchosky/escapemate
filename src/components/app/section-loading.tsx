export function SectionLoading({ title }: { title: string }) {
  return (
    <div>
      <div className="mb-5">
        <div className="skeleton-shimmer h-7 w-44 rounded-md bg-zinc-800" />
        <div className="skeleton-shimmer mt-2 h-4 w-72 max-w-full rounded-md bg-zinc-900" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-h-80 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="skeleton-shimmer h-48 rounded-md bg-zinc-900" />
          <div className="skeleton-shimmer mt-4 h-5 w-2/3 rounded-md bg-zinc-800" />
          <div className="skeleton-shimmer mt-3 h-4 w-full rounded-md bg-zinc-900" />
          <div className="skeleton-shimmer mt-2 h-4 w-4/5 rounded-md bg-zinc-900" />
        </div>
        <div className="min-h-80 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="skeleton-shimmer h-48 rounded-md bg-zinc-900" />
          <div className="skeleton-shimmer mt-4 h-5 w-1/2 rounded-md bg-zinc-800" />
          <div className="skeleton-shimmer mt-3 h-4 w-full rounded-md bg-zinc-900" />
          <div className="skeleton-shimmer mt-2 h-4 w-3/5 rounded-md bg-zinc-900" />
        </div>
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}
