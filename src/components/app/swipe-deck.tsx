"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Check, Clock, MessageSquare, RefreshCw, RotateCcw, Shield, SlidersHorizontal, Sparkles, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadMoreCandidates, swipeProfile } from "@/lib/actions/swipe";
import type { Profile } from "@/lib/constants";
import { normalizeCompatibilityReason, translateCompatibility } from "@/lib/compatibility";
import {
  GAME_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  OBJECTIVE_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REGION_OPTIONS,
  SCHEDULE_OPTIONS,
  translateOption,
} from "@/lib/i18n/options";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/app/avatar";
import { PlayerProfileModal } from "@/components/app/player-profile";
import { useTranslations } from "@/components/app/i18n-provider";
import { RelativeTime } from "@/components/app/relative-time";

const SWIPE_THRESHOLD = 120;

export function SwipeDeck({ initialProfiles }: { initialProfiles: Profile[] }) {
  const t = useTranslations("swipe");
  const errorsT = useTranslations("errors");
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [matchedWith, setMatchedWith] = useState<{ profile: Profile; matchId: string | null } | null>(null);
  const [lastPassed, setLastPassed] = useState<Profile | null>(null);
  const [exitDirection, setExitDirection] = useState(1);
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();
  const swipedIds = useRef(new Set<string>());
  const loadingMore = useRef(false);
  const exhausted = useRef(false);
  const current = profiles[0];
  const swipeLocked = Boolean(activeSwipeId) || isPending;

  // Prefetch the next batch when three cards are left, so the deck never empties while
  // more players exist. Stops once the server returns nothing new.
  useEffect(() => {
    if (profiles.length > 3 || loadingMore.current || exhausted.current) return;
    loadingMore.current = true;
    void loadMoreCandidates()
      .then((batch) => {
        setProfiles((items) => {
          const known = new Set([...items.map((item) => item.id), ...swipedIds.current]);
          const fresh = batch.filter((profile) => !known.has(profile.id));
          if (!fresh.length) exhausted.current = true;
          return fresh.length ? [...items, ...fresh] : items;
        });
      })
      .catch(() => {
        exhausted.current = true;
      })
      .finally(() => {
        loadingMore.current = false;
      });
  }, [profiles.length]);

  // A router refresh brings a new candidate batch; drop anyone already swiped this session.
  useEffect(() => {
    setProfiles(initialProfiles.filter((profile) => !swipedIds.current.has(profile.id)));
  }, [initialProfiles]);

  const vote = useCallback(
    (profile: Profile, decision: "like" | "pass") => {
      if (activeSwipeId) return;

      setActiveSwipeId(profile.id);
      setExitDirection(decision === "like" ? 1 : -1);
      setProfiles((items) => items.filter((item) => item.id !== profile.id));
      setNotice(null);
      swipedIds.current.add(profile.id);

      startTransition(async () => {
        const result = await swipeProfile(profile.id, decision);
        if (!result.ok) {
          swipedIds.current.delete(profile.id);
          setNotice({ tone: "error", text: errorsT(result.error) });
          setProfiles((items) => [profile, ...items]);
          setActiveSwipeId(null);
          return;
        }

        setLastPassed(decision === "pass" ? profile : null);
        if (result.matched) setMatchedWith({ profile, matchId: result.matchId });
        setActiveSwipeId(null);
      });
    },
    [activeSwipeId, errorsT],
  );

  // Passing is stored as an upsertable swipe, so bringing the card back lets the player like it instead.
  const undo = useCallback(() => {
    if (!lastPassed || swipeLocked) return;
    swipedIds.current.delete(lastPassed.id);
    setProfiles((items) => [lastPassed, ...items.filter((item) => item.id !== lastPassed.id)]);
    setLastPassed(null);
    setNotice(null);
  }, [lastPassed, swipeLocked]);

  const removeProfile = useCallback((profile: Profile, message: string) => {
    swipedIds.current.add(profile.id);
    setProfiles((items) => items.filter((item) => item.id !== profile.id));
    setSelectedProfile(null);
    setNotice({ tone: "info", text: message });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (selectedProfile || matchedWith || !current) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "ArrowRight") vote(current, "like");
      else if (event.key === "ArrowLeft") vote(current, "pass");
      else if (event.key === "ArrowUp" || event.key === "Enter") setSelectedProfile(current);
      else if (event.key === "Backspace" || event.key.toLowerCase() === "z") undo();
      else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, matchedWith, selectedProfile, undo, vote]);

  const closeProfile = useCallback(() => setSelectedProfile(null), []);

  return (
    <section className="relative mx-auto flex w-full max-w-5xl flex-col items-center overflow-hidden rounded-lg border border-zinc-800 bg-[radial-gradient(circle_at_50%_0%,rgba(163,230,53,0.14),transparent_32%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(9,9,11,1))] px-2 py-4 shadow-2xl shadow-black/40 sm:px-3 sm:py-5">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="pointer-events-none absolute -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl" />

      <div className="relative z-10 mb-3 flex w-full max-w-md items-center justify-between gap-3 px-1 sm:mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
            <Sparkles className="h-4 w-4" />
            {t("eyebrow")}
          </div>
          <h1 className="mt-1 text-xl font-bold text-zinc-50 sm:text-2xl">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="lime">{t("profilesCount", { count: profiles.length })}</Badge>
          <Button asChild variant="outline" size="icon" title={t("editPreferences")} aria-label={t("editPreferences")}>
            <Link href="/onboarding?edit=1">
              <SlidersHorizontal className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {notice ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className={cn(
            "relative z-20 mb-3 w-full max-w-md rounded-md border px-4 py-3 text-sm",
            notice.tone === "error"
              ? "border-red-400/30 bg-red-500/10 text-red-100"
              : "border-lime-400/30 bg-lime-400/10 text-lime-100",
          )}
        >
          {notice.text}
        </motion.div>
      ) : null}

      {current ? (
        <>
          <div className="relative z-10 h-[clamp(360px,calc(100dvh-23rem),560px)] w-full max-w-md">
            <AnimatePresence mode="popLayout">
              {profiles.slice(0, 3).map((profile, index) => (
                <SwipeCard
                  key={profile.id}
                  profile={profile}
                  index={index}
                  isTop={index === 0}
                  exitDirection={exitDirection}
                  disabled={swipeLocked}
                  onVote={vote}
                  onOpen={setSelectedProfile}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="relative z-20 mt-5 grid w-full max-w-md grid-cols-[1fr_auto_1.15fr] gap-3 px-1 sm:mt-6">
            <Button
              variant="secondary"
              size="lg"
              className="h-14 border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
              onClick={() => current && vote(current, "pass")}
              disabled={swipeLocked}
            >
              <X className="h-5 w-5" />
              {t("pass")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-14 w-14"
              onClick={undo}
              disabled={!lastPassed || swipeLocked}
              title={t("undo")}
              aria-label={t("undo")}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              className="h-14 bg-lime-400 text-zinc-950 shadow-lg shadow-lime-400/20 hover:bg-lime-300"
              onClick={() => current && vote(current, "like")}
              disabled={swipeLocked}
            >
              <Check className="h-5 w-5" />
              {t("like")}
            </Button>
          </div>
          <p className="relative z-10 mt-3 hidden text-xs text-zinc-500 md:block">{t("keyboardHint")}</p>
        </>
      ) : (
        <Card className="relative z-10 mt-6 flex w-full max-w-md flex-col items-center border-lime-400/20 bg-zinc-950/90 p-8 text-center">
          <Zap className="mb-4 h-10 w-10 text-lime-300" />
          <h2 className="text-2xl font-semibold text-zinc-50">{t("emptyTitle")}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">{t("emptyDescription")}</p>
          <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
            <Button
              onClick={() => {
                exhausted.current = false;
                startRefresh(() => router.refresh());
              }}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              {t("refresh")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/raid-now">{t("viewActiveGroups")}</Link>
            </Button>
          </div>
          {lastPassed ? (
            <Button variant="ghost" className="mt-3" onClick={undo}>
              <RotateCcw className="h-4 w-4" />
              {t("undoNamed", { nickname: lastPassed.nickname })}
            </Button>
          ) : null}
        </Card>
      )}

      <PlayerProfileModal
        profile={selectedProfile}
        onClose={closeProfile}
        onLike={(profile) => {
          setSelectedProfile(null);
          vote(profile, "like");
        }}
        onPass={(profile) => {
          setSelectedProfile(null);
          vote(profile, "pass");
        }}
        onBlocked={(profile) => removeProfile(profile, t("blockedNotice", { nickname: profile.nickname }))}
      />
      <MatchCelebration match={matchedWith} onClose={() => setMatchedWith(null)} />
    </section>
  );
}

function MatchCelebration({
  match,
  onClose,
}: {
  match: { profile: Profile; matchId: string | null } | null;
  onClose: () => void;
}) {
  const t = useTranslations("swipe");
  const reducedMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!match) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [match, onClose]);

  if (!match) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-lime-400/40 bg-zinc-950 p-6 text-center shadow-2xl shadow-lime-400/10"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-lime-300">{t("matchEyebrow")}</div>
        <h2 id="match-title" className="mt-2 text-4xl font-black text-white">
          {t("matchTitle")}
        </h2>
        <Avatar
          name={match.profile.nickname}
          src={match.profile.avatar_url}
          seed={match.profile.id}
          sizes="112px"
          className="mx-auto mt-5 h-28 w-28 rounded-full ring-4 ring-lime-400/40"
          textClassName="text-3xl"
        />
        <p className="mt-4 text-sm leading-6 text-zinc-300">{t("matchDescription", { nickname: match.profile.nickname })}</p>
        <div className="mt-6 grid gap-2">
          {match.matchId ? (
            <Button asChild size="lg">
              <Link href={`/matches/${match.matchId}`}>
                <MessageSquare className="h-4 w-4" />
                {t("openChat")}
              </Link>
            </Button>
          ) : null}
          <Button ref={closeRef} variant="outline" onClick={onClose}>
            {t("keepSwiping")}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function SwipeCard({
  profile,
  index,
  isTop,
  exitDirection,
  disabled,
  onVote,
  onOpen,
}: {
  profile: Profile;
  index: number;
  isTop: boolean;
  exitDirection: number;
  disabled: boolean;
  onVote: (profile: Profile, decision: "like" | "pass") => void;
  onOpen: (profile: Profile) => void;
}) {
  const t = useTranslations("swipe");
  const profileT = useTranslations("profile");
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const likeOpacity = useTransform(x, [20, 130], [0, 1]);
  const passOpacity = useTransform(x, [-130, -20], [1, 0]);
  const reducedMotion = useReducedMotion();
  const fallbackValue = profileT("stats.undefined");
  const primaryObjective = translateOption(profileT, OBJECTIVE_OPTIONS, profile.objectives?.[0]) ?? fallbackValue;
  const primaryStyle = translateOption(profileT, PLAY_STYLE_OPTIONS, profile.play_styles?.[0]) ?? fallbackValue;
  const primaryMap = translateOption(profileT, MAP_OPTIONS, profile.favorite_maps?.[0]) ?? fallbackValue;
  const primarySchedule = translateOption(profileT, SCHEDULE_OPTIONS, profile.schedule?.[0]) ?? fallbackValue;
  const region = translateOption(profileT, REGION_OPTIONS, profile.region) ?? "—";
  const primaryLanguage = translateOption(profileT, LANGUAGE_OPTIONS, profile.language) ?? profile.language ?? "—";
  const normalizedReasons = (profile.compatibility_reasons ?? []).map(normalizeCompatibilityReason);
  const speaksMyLanguage = normalizedReasons.some((reason) => reason.code === "compat.language.speaksYourLanguage");
  const gameModes = profile.game_modes?.length ? profile.game_modes : ["PvP"];

  return (
    <motion.article
      className="absolute inset-0"
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        zIndex: 10 - index,
        touchAction: "pan-y",
      }}
      initial={{ scale: 0.94, y: 32, opacity: 0 }}
      animate={{
        scale: 1 - index * 0.045,
        y: index * 12,
        opacity: 1 - index * 0.18,
      }}
      exit={{
        x: exitDirection * 620,
        rotate: exitDirection * 14,
        opacity: 0,
        transition: { duration: 0.28, ease: "easeOut" },
      }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
      drag={isTop && !disabled ? "x" : false}
      dragDirectionLock
      dragMomentum={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.72}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) onVote(profile, "like");
        if (info.offset.x < -SWIPE_THRESHOLD) onVote(profile, "pass");
      }}
      // onTap (unlike onClick) is cancelled when the pointer moved, so a drag never opens the profile.
      onTap={() => {
        if (isTop && !disabled) onOpen(profile);
      }}
      aria-hidden={!isTop}
    >
      <div className="relative h-full cursor-grab overflow-hidden rounded-[22px] border border-zinc-700/80 bg-zinc-950 shadow-2xl shadow-black/60 active:cursor-grabbing sm:rounded-[28px]">
        <div className="absolute inset-0 z-10 rounded-[28px] ring-1 ring-inset ring-white/10" />
        <div className="relative h-[58%] overflow-hidden bg-zinc-900">
          <Avatar
            name={profile.nickname}
            src={profile.avatar_url}
            seed={profile.id}
            sizes="(max-width: 768px) 100vw, 480px"
            className="h-full w-full"
            textClassName="-translate-y-10 text-8xl opacity-80"
            priority={isTop}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/10 to-transparent" />
          <div className="absolute left-4 right-4 top-4 flex flex-wrap gap-2">
            <Badge tone="lime">{region}</Badge>
            <Badge tone="amber">{profileT("primary", { language: primaryLanguage })}</Badge>
            {speaksMyLanguage ? <Badge tone="lime">{t("speaksYourLanguage")}</Badge> : null}
            {gameModes.map((mode) => (
              <Badge key={mode} tone={mode === "PvE" ? "sky" : "zinc"}>
                {translateOption(profileT, GAME_MODE_OPTIONS, mode)}
              </Badge>
            ))}
          </div>
          <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute right-5 top-20 rotate-12 rounded-lg border-4 border-lime-300 px-4 py-2 text-4xl font-black uppercase text-lime-200 shadow-lg shadow-lime-400/20"
          >
            {t("like")}
          </motion.div>
          <motion.div
            style={{ opacity: passOpacity }}
            className="absolute left-5 top-20 -rotate-12 rounded-lg border-4 border-red-400 px-4 py-2 text-4xl font-black uppercase text-red-200 shadow-lg shadow-red-500/20"
          >
            {t("pass")}
          </motion.div>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-3xl font-black text-white sm:text-4xl">{profile.nickname}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-300">
                  {t("levelLine", {
                    level: profile.tarkov_stats?.level ?? profile.approximate_level ?? "?",
                    region,
                    language: primaryLanguage,
                  })}
                  {profile.tarkov_stats?.is_public ? (
                    <span className="inline-flex items-center gap-1 text-xs text-lime-300">
                      <Shield className="h-3.5 w-3.5" />
                      {t("verifiedStats")}
                    </span>
                  ) : null}
                </p>
                {profile.last_active_at ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="h-3 w-3" />
                    <RelativeTime value={profile.last_active_at} prefix={(time) => t("activeAgo", { time })} />
                  </p>
                ) : null}
              </div>
              <CompatibilityGauge score={profile.compatibility_score ?? 0} />
            </div>
          </div>
        </div>

        <div className="relative h-[42%] space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2">
            <StatBadge label={t("objective")} value={primaryObjective} tone="lime" />
            <StatBadge label={t("style")} value={primaryStyle} tone="amber" />
            <StatBadge label={t("map")} value={primaryMap} tone="zinc" />
            <StatBadge label={t("schedule")} value={primarySchedule} tone="zinc" />
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-zinc-300">{profile.bio || t("fallbackBio")}</p>
          {normalizedReasons.length ? (
            <div className="flex flex-wrap gap-1.5">
              {normalizedReasons.slice(0, 3).map((reason, reasonIndex) => (
                <span key={`${reason.code}-${reasonIndex}`} className="rounded border border-lime-400/20 bg-lime-400/10 px-2 py-1 text-[11px] text-lime-100">
                  {translateCompatibility(t, profileT, reason)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function CompatibilityGauge({ score }: { score: number }) {
  const t = useTranslations("swipe");
  const reducedMotion = useReducedMotion();
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const stroke = value >= 75 ? "rgb(190,242,100)" : value >= 50 ? "rgb(252,211,77)" : "rgb(248,113,113)";

  return (
    <div
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950/70 text-zinc-50"
      role="img"
      aria-label={t("compatibilityPercent", { score: value })}
    >
      <svg className="absolute inset-0 h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(63,63,70,0.85)" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reducedMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
        />
      </svg>
      <div className="text-center">
        <div className="text-lg font-black leading-none">{value}</div>
        <div className="text-[9px] font-semibold uppercase text-zinc-300">{t("matchLabel")}</div>
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "lime" | "amber" | "zinc";
}) {
  const toneClass = {
    lime: "border-lime-400/30 bg-lime-400/10 text-lime-100",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    zinc: "border-zinc-700 bg-zinc-900 text-zinc-100",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-1.5 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
