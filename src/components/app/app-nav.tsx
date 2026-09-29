"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, MessageSquare, Radio, Settings, Shield, Swords } from "lucide-react";
import type { AppBadges } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useShellBadges } from "@/components/app/shell-status";

export type AppNavLabels = {
  mainAria: string;
  mobileAria: string;
  items: {
    swipe: string;
    matches: string;
    raidNow: string;
    questHelp: string;
    settings: string;
    admin: string;
  };
};

const navItems = [
  { href: "/swipe", labelKey: "swipe", icon: Swords },
  { href: "/matches", labelKey: "matches", icon: MessageSquare },
  { href: "/raid-now", labelKey: "raidNow", icon: Radio },
  { href: "/quest-help", labelKey: "questHelp", icon: BookOpen },
  { href: "/settings", labelKey: "settings", icon: Settings },
] as const;

const adminItem = { href: "/admin/reports", labelKey: "admin", icon: Shield } as const;

const emptyBadges: AppBadges = {
  unread_messages: 0,
  new_matches: 0,
  quest_help_responses: 0,
  raid_now_responses: 0,
  open_reports: 0,
  is_admin: false,
};

// Rendered twice by AppShell: the desktop bar inside the header and the mobile bar outside it,
// because the header's backdrop-filter would otherwise become the containing block of the
// fixed bottom bar and pin it to the top of the screen.
export function AppNav({ labels, variant }: { labels: AppNavLabels; variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const badges: AppBadges = useShellBadges() ?? emptyBadges;
  const items = badges.is_admin ? [...navItems, adminItem] : navItems;

  function badgeFor(href: string) {
    if (href === "/matches") return badges.unread_messages + badges.new_matches;
    if (href === "/quest-help") return badges.quest_help_responses;
    if (href === "/raid-now") return badges.raid_now_responses;
    if (href === "/admin/reports") return badges.open_reports;
    return 0;
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (variant === "desktop") {
    return (
      <nav className="hidden items-center gap-1 md:flex" aria-label={labels.mainAria}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const badge = badgeFor(item.href);
          return (
            <Button asChild variant={active ? "outline" : "ghost"} size="sm" key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative border border-transparent",
                  active && "border-lime-400/30 bg-lime-400/10 text-lime-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {labels.items[item.labelKey]}
                <NavBadge value={badge} />
              </Link>
            </Button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden" aria-label={labels.mobileAria}>
      <div className={`mx-auto grid max-w-md gap-1 ${items.length === 6 ? "grid-cols-6" : "grid-cols-5"}`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const badge = badgeFor(item.href);
          return (
            <Link
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md border border-transparent text-[11px] font-medium text-zinc-400 active:bg-zinc-900 active:text-lime-300",
                active && "border-lime-400/25 bg-lime-400/10 text-lime-100",
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                <NavBadge value={badge} compact />
              </span>
              <span>{labels.items[item.labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavBadge({ value, compact = false }: { value: number; compact?: boolean }) {
  if (!value) return null;
  return (
    <span
      className={
        compact
          ? "absolute -right-2 -top-2 min-w-4 rounded-full bg-lime-300 px-1 text-center text-[10px] font-bold leading-4 text-zinc-950"
          : "ml-1 min-w-5 rounded-full bg-lime-300 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950"
      }
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
