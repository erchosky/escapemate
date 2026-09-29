"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { MatchSummary } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/app/avatar";
import { useTranslations } from "@/components/app/i18n-provider";
import { RelativeTime } from "@/components/app/relative-time";

const SEARCH_THRESHOLD = 6;

export function MatchList({ matches }: { matches: MatchSummary[] }) {
  const t = useTranslations("matches");
  const [query, setQuery] = useState("");

  // Tinder-style: fresh matches without messages sit in a row on top, chats below.
  const fresh = matches.filter((match) => !match.lastMessage);
  const conversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matches
      .filter((match) => match.lastMessage)
      .filter((match) => !needle || match.otherProfile.nickname.toLowerCase().includes(needle));
  }, [matches, query]);

  if (!matches.length) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-semibold text-zinc-50">{t("emptyTitle")}</h2>
        <p className="mt-2 text-sm text-zinc-400">{t("emptyDescription")}</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/swipe">{t("goToSwipe")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/raid-now">{t("goToRaidNow")}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {fresh.length ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-lime-300">{t("newMatches", { count: fresh.length })}</h2>
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
            {fresh.map((match) => (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                aria-label={`${t("openChat")}: ${match.otherProfile.nickname}`}
                className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
              >
                <Avatar
                  name={match.otherProfile.nickname}
                  src={match.otherProfile.avatar_url}
                  seed={match.otherProfile.id}
                  sizes="72px"
                  className="h-18 w-18 rounded-full ring-2 ring-lime-400/60 transition group-hover:ring-lime-300"
                  textClassName="text-xl"
                />
                <span className="w-full truncate text-xs font-medium text-zinc-200">{match.otherProfile.nickname}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("conversations")}</h2>
          {matches.length > SEARCH_THRESHOLD ? (
            <div className="relative w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-9 pl-8"
              />
            </div>
          ) : null}
        </div>
        {conversations.length ? (
          <Card className="divide-y divide-zinc-800/80 overflow-hidden p-0">
            {conversations.map((match) => (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                aria-label={`${t("openChat")}: ${match.otherProfile.nickname}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-900/70 focus-visible:bg-zinc-900 focus-visible:outline-none"
              >
                <Avatar
                  name={match.otherProfile.nickname}
                  src={match.otherProfile.avatar_url}
                  seed={match.otherProfile.id}
                  sizes="48px"
                  className="h-12 w-12 shrink-0 rounded-full"
                  textClassName="text-base"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate font-semibold", match.unread ? "text-zinc-50" : "text-zinc-200")}>
                      {match.otherProfile.nickname}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      <RelativeTime value={match.last_message_at ?? match.created_at} />
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={cn("line-clamp-1 flex-1 text-sm", match.unread ? "font-medium text-zinc-100" : "text-zinc-400")}>
                      {match.lastMessage}
                    </p>
                    {match.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lime-400" aria-label={t("unread")} /> : null}
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            {query ? t("noResults") : t("noConversations")}
          </p>
        )}
      </section>
    </div>
  );
}
