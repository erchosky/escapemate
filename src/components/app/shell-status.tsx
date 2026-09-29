"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AppBadges } from "@/lib/constants";
import type { ShellStatus } from "@/lib/supabase/queries";
import { Avatar } from "@/components/app/avatar";

// Badges and avatar are refreshed from /api/me/shell at most every 20 s (on navigation), when
// the tab regains focus and once a minute while visible — instead of on every server render.
const MIN_INTERVAL_MS = 20_000;
const POLL_MS = 60_000;

const ShellStatusContext = createContext<ShellStatus | null>(null);

// One fetch at a time per tab; results arrive through promise callbacks, not effect bodies.
let lastFetch = 0;
let inFlight: Promise<ShellStatus | null> | null = null;

function loadShell(force: boolean): Promise<ShellStatus | null> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetch < MIN_INTERVAL_MS) return Promise.resolve(null);
  lastFetch = Date.now();
  inFlight = fetch("/api/me/shell", { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<ShellStatus>) : null))
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function ShellStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const pathname = usePathname();
  const apply = useRef((next: ShellStatus | null) => {
    if (next) setStatus(next);
  });

  useEffect(() => {
    // Force the very first load of each mount; later navigations respect the interval.
    void loadShell(lastFetch === 0).then(apply.current);
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadShell(true).then(apply.current);
    };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <ShellStatusContext.Provider value={status}>{children}</ShellStatusContext.Provider>;
}

export function useShellBadges(): AppBadges | undefined {
  return useContext(ShellStatusContext)?.badges;
}

export function ShellAvatar({ label }: { label: string }) {
  const profile = useContext(ShellStatusContext)?.profile;

  return (
    <Link href="/settings" title={label} aria-label={label} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
      {profile ? (
        <Avatar
          name={profile.nickname}
          src={profile.avatar_url}
          seed={profile.id}
          sizes="36px"
          className="h-9 w-9 rounded-full ring-1 ring-zinc-700"
          textClassName="text-xs"
        />
      ) : (
        <div className="h-9 w-9 rounded-full bg-zinc-900 ring-1 ring-zinc-800" />
      )}
    </Link>
  );
}
