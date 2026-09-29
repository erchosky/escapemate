"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Server actions redirect back with ?success= / ?error= while keeping the scroll position,
// so feedback is shown as a fixed toast instead of text at the top of a long page.
export function FlashToast({ message, tone }: { message: string | null; tone: "success" | "error" }) {
  // The param (not the message) marks a fresh redirect: repeating the same action twice
  // produces the same text, but the param comes back after we strip it below.
  const flag = useSearchParams().get(tone);
  const [visible, setVisible] = useState(Boolean(message && flag));
  const [seenFlag, setSeenFlag] = useState(flag);

  if (flag !== seenFlag) {
    setSeenFlag(flag);
    if (flag && message) setVisible(true);
  }

  useEffect(() => {
    if (!message || !flag) return;

    // Drop the feedback params so a reload doesn't replay the toast.
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [flag, message]);

  if (!message || !visible) return null;

  const Icon = tone === "success" ? CheckCircle2 : TriangleAlert;

  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl shadow-black/50 backdrop-blur md:bottom-6",
        tone === "success" ? "border-lime-400/40 bg-zinc-950/95 text-lime-100" : "border-red-400/40 bg-zinc-950/95 text-red-100",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "success" ? "text-lime-300" : "text-red-300")} />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => setVisible(false)} className="text-zinc-400 hover:text-zinc-100" aria-label="OK">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
