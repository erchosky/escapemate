"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, ExternalLink, MessageSquare, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { Profile } from "@/lib/constants";
import {
  normalizeCompatibilityReason,
  normalizeCompatibilityWarning,
  translateCompatibility,
} from "@/lib/compatibility";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/avatar";
import { ModerationActions } from "@/components/app/moderation-actions";
import { useTranslations } from "@/components/app/i18n-provider";
import { RelativeTime } from "@/components/app/relative-time";

export function PlayerProfileModal({
  profile,
  matched = false,
  onClose,
  onLike,
  onPass,
  onBlocked,
}: {
  profile: Profile | null;
  matched?: boolean;
  onClose: () => void;
  onLike?: (profile: Profile) => void;
  onPass?: (profile: Profile) => void;
  onBlocked?: (profile: Profile) => void;
}) {
  const commonT = useTranslations("common");
  const profileT = useTranslations("profile");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keyed on the profile only: re-running on every parent render used to steal focus back to the close button.
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [profileId]);

  if (!profile) return null;

  const discordHref = matched && profile.discord_id ? `https://discord.com/users/${profile.discord_id}` : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-3 py-6 backdrop-blur"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black"
      >
        <div className="relative h-72 overflow-hidden">
          <Avatar
            name={profile.nickname}
            src={profile.avatar_url}
            seed={profile.id}
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-full w-full opacity-80"
            textClassName="text-8xl"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-zinc-950/10" />
          <Button
            ref={closeRef}
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4"
            onClick={onClose}
            aria-label={commonT("actions.close")}
            title={commonT("actions.close")}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <Badge tone={matched ? "lime" : "amber"}>{matched ? profileT("matchUnlocked") : profileT("publicProfile")}</Badge>
            <h2 id={titleId} className="mt-3 text-4xl font-black text-white">{profile.nickname}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-300">
              <span>
                {profileT("level")} {profile.tarkov_stats?.level ?? profile.approximate_level ?? "?"}
              </span>
              {profile.last_active_at ? (
                <span className="flex items-center gap-1 text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  <RelativeTime value={profile.last_active_at} prefix={(time) => profileT("activeAgo", { time })} />
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <PlayerProfileBadges profile={profile} />
          <PlayerCompatibilityDetails profile={profile} />
          <PlayerProfileStats profile={profile} />
          <PlayerTarkovStats profile={profile} />
          <PlayerQuestNeeds profile={profile} />
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-300">
            {profile.bio || profileT("emptyBio")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {matched ? (
              <>
                {discordHref ? (
                  <Button asChild variant="secondary">
                    <Link href={discordHref} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      {profileT("openDiscord")}
                    </Link>
                  </Button>
                ) : null}
                <div className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/50 px-4 text-sm font-semibold text-zinc-100">
                  <MessageSquare className="h-4 w-4" />
                  {profileT("chatAvailable")}
                </div>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onPass?.(profile)}>
                  {profileT("pass")}
                </Button>
                <Button onClick={() => onLike?.(profile)}>{profileT("like")}</Button>
              </>
            )}
          </div>
          <ModerationActions profile={profile} onBlocked={(blocked) => (onBlocked ? onBlocked(blocked) : onClose())} />
        </div>
      </motion.div>
    </div>
  );
}

function PlayerCompatibilityDetails({ profile }: { profile: Profile }) {
  const profileT = useTranslations("profile");
  const swipeT = useTranslations("swipe");
  const hasDetails =
    profile.compatibility_reasons?.length ||
    profile.compatibility_warnings?.length ||
    profile.shared_languages?.length ||
    profile.shared_maps?.length ||
    profile.shared_objectives?.length ||
    profile.shared_styles?.length;

  if (!hasDetails) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-lime-300">{profileT("compatibility")}</h3>
      <SharedBadges label={profileT("languages")} values={profile.shared_languages} options={LANGUAGE_OPTIONS} />
      <SharedBadges label={profileT("maps")} values={profile.shared_maps} options={MAP_OPTIONS} />
      <SharedBadges label={profileT("objectives")} values={profile.shared_objectives} options={OBJECTIVE_OPTIONS} />
      <SharedBadges label={profileT("styles")} values={profile.shared_styles} options={PLAY_STYLE_OPTIONS} />
      {profile.compatibility_reasons?.length ? (
        <div className="flex flex-wrap gap-2">
          {profile.compatibility_reasons.map((reason, index) => {
            const normalized = normalizeCompatibilityReason(reason);
            return (
            <Badge key={`${normalized.code}-${index}`} tone="lime">
              {translateCompatibility(swipeT, profileT, normalized)}
            </Badge>
            );
          })}
        </div>
      ) : null}
      {profile.compatibility_warnings?.length ? (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{profileT("warnings")}</div>
          <div className="flex flex-wrap gap-2">
            {profile.compatibility_warnings.map((warning, index) => {
              const normalized = normalizeCompatibilityWarning(warning);
              return (
              <Badge key={`${normalized.code}-${index}`} tone="amber">
                {translateCompatibility(swipeT, profileT, normalized)}
              </Badge>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SharedBadges({
  label,
  values,
  options,
}: {
  label: string;
  values?: readonly string[] | null;
  options: readonly { value: string; labelKey: string }[];
}) {
  const profileT = useTranslations("profile");
  if (!values?.length) return null;

  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value}>{translateOption(profileT, options, value)}</Badge>
        ))}
      </div>
    </div>
  );
}

export function PlayerProfileBadges({ profile }: { profile: Profile }) {
  const profileT = useTranslations("profile");
  const spokenLanguages = profile.spoken_languages?.length ? profile.spoken_languages : [profile.language ?? "ES"];
  const primaryLanguage = translateOption(profileT, LANGUAGE_OPTIONS, profile.language) ?? profile.language ?? "ES";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {profile.region ? <Badge tone="lime">{translateOption(profileT, REGION_OPTIONS, profile.region)}</Badge> : null}
        {(profile.game_modes?.length ? profile.game_modes : ["PvP"]).map((mode) => (
          <Badge key={mode} tone={mode === "PvE" ? "sky" : "zinc"}>
            {translateOption(profileT, GAME_MODE_OPTIONS, mode)}
          </Badge>
        ))}
        {profile.language ? <Badge tone="amber">{profileT("primary", { language: primaryLanguage })}</Badge> : null}
        {spokenLanguages.map((language) => (
          <Badge key={language} tone={language === profile.language ? "lime" : "zinc"}>
            {profileT("speaks", { language: translateOption(profileT, LANGUAGE_OPTIONS, language) ?? language })}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(profile.favorite_maps ?? []).map((map) => (
          <Badge key={map}>{translateOption(profileT, MAP_OPTIONS, map)}</Badge>
        ))}
        {(profile.play_styles ?? []).map((style) => (
          <Badge key={style} tone="amber">
            {translateOption(profileT, PLAY_STYLE_OPTIONS, style)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function PlayerProfileStats({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const profileT = useTranslations("profile");
  const stats = [
    [profileT("stats.level"), profile.approximate_level ?? "?"],
    [profileT("stats.objective"), translateOption(profileT, OBJECTIVE_OPTIONS, profile.objectives?.[0]) ?? profileT("stats.undefined")],
    [profileT("stats.mainMap"), translateOption(profileT, MAP_OPTIONS, profile.favorite_maps?.[0]) ?? profileT("stats.undefined")],
    [profileT("stats.schedule"), translateOption(profileT, SCHEDULE_OPTIONS, profile.schedule?.[0]) ?? profileT("stats.undefined")],
  ];

  return (
    <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
          <div className="mt-2 truncate text-lg font-bold text-zinc-50">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function PlayerTarkovStats({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const profileT = useTranslations("profile");
  const stats = profile.tarkov_stats;
  if (!stats?.is_public) {
    return (
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-lime-300">{profileT("stats.tarkovTitle")}</h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-400">
          {profileT("stats.emptyTarkov")}
        </div>
      </section>
    );
  }

  const items = [
    [profileT("stats.survivalRate"), stats.survival_rate != null ? `${stats.survival_rate}%` : profileT("stats.notAvailable")],
    [profileT("stats.kd"), stats.kd ?? profileT("stats.notAvailable")],
    [profileT("stats.raids"), stats.raids ?? profileT("stats.notAvailable")],
    [profileT("stats.hours"), stats.hours ?? profileT("stats.notAvailable")],
    [profileT("stats.pmcKills"), stats.pmc_kills ?? profileT("stats.notAvailable")],
  ];

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-lime-300">{profileT("stats.tarkovTitle")}</h3>
      <div className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-5"}>
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-lime-400/20 bg-lime-400/10 p-3">
            <div className="text-[10px] font-semibold uppercase text-lime-200/70">{label}</div>
            <div className="mt-2 text-lg font-bold text-lime-50">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PlayerQuestNeeds({ profile }: { profile: Profile }) {
  const profileT = useTranslations("profile");
  const objectives = profile.objectives?.length ? profile.objectives : ["Misiones"];

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">{profileT("questNeeds.title")}</h3>
      <div className="flex flex-wrap gap-2">
        {objectives.map((objective) => (
          <Badge key={objective} tone="zinc">
            {translateOption(profileT, OBJECTIVE_OPTIONS, objective)}
          </Badge>
        ))}
      </div>
    </section>
  );
}
