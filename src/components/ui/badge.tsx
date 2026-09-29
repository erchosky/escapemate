import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "lime" | "amber" | "zinc" | "red" | "sky";
};

const tones = {
  lime: "border-lime-400/30 bg-lime-400/10 text-lime-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  zinc: "border-zinc-700 bg-zinc-900 text-zinc-200",
  red: "border-red-400/30 bg-red-400/10 text-red-200",
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-200",
};

export function Badge({ className, tone = "zinc", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
