import Image from "next/image";
import { cn } from "@/lib/utils";

const PALETTE = [
  "from-lime-500/80 to-emerald-900",
  "from-amber-500/80 to-orange-950",
  "from-sky-500/80 to-slate-900",
  "from-rose-500/80 to-zinc-900",
  "from-violet-500/80 to-indigo-950",
  "from-teal-500/80 to-cyan-950",
];

function paletteFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initialsFor(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s_-]/gu, "").split(/[\s_-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

// Players without a Discord or uploaded avatar get a deterministic initials badge instead of a stock photo.
export function Avatar({
  name,
  src,
  seed,
  sizes,
  className,
  textClassName,
  priority = false,
}: {
  name: string;
  src?: string | null;
  seed?: string;
  sizes: string;
  className?: string;
  textClassName?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-zinc-900", className)}>
      {src ? (
        <Image src={src} alt={name} fill sizes={sizes} className="object-cover" priority={priority} />
      ) : (
        <div
          role="img"
          aria-label={name}
          className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", paletteFor(seed ?? name))}
        >
          <span className={cn("font-black tracking-wider text-white/90 drop-shadow", textClassName)}>{initialsFor(name)}</span>
        </div>
      )}
    </div>
  );
}
