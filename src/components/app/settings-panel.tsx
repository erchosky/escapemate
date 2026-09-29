"use client";

import Link from "next/link";
import { ExternalLink, ImageUp, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { SettingsErrorCode, SettingsSuccessCode } from "@/lib/action-feedback";
import { deleteAccount, updateProfileLanguages, uploadAvatar } from "@/lib/actions/profile";
import { syncTarkovStats } from "@/lib/actions/tarkov";
import type { Profile, ProfileTarkovStats } from "@/lib/constants";
import { formatDateTime } from "@/lib/i18n/format";
import { GAME_MODE_OPTIONS, LANGUAGE_OPTIONS, MAP_OPTIONS, REGION_OPTIONS, translateOption } from "@/lib/i18n/options";
import { useI18n, useTranslations } from "@/components/app/i18n-provider";
import { FlashToast } from "@/components/app/flash-toast";
import { Avatar } from "@/components/app/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/ui/pending-button";

export function SettingsPanel({
  profile,
  stats,
  errorCode,
  successCode,
}: {
  profile: Profile;
  stats: ProfileTarkovStats | null;
  errorCode?: SettingsErrorCode | null;
  successCode?: SettingsSuccessCode | null;
}) {
  const { locale } = useI18n();
  const t = useTranslations("settings");
  const profileT = useTranslations("profile");
  const feedbackT = useTranslations("errors");
  const source = getStatsSource(stats, t);
  const lastSyncedAt = stats?.last_synced_at
    ? formatDateTime(stats.last_synced_at, locale)
    : t("tarkov.notSynced");

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <FlashToast message={errorCode ? feedbackT(errorCode) : null} tone="error" />
      <FlashToast message={successCode ? feedbackT(successCode) : null} tone="success" />
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar
              name={profile.nickname}
              src={profile.avatar_url}
              seed={profile.id}
              sizes="80px"
              className="h-20 w-20 shrink-0 rounded-xl"
              textClassName="text-2xl"
            />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-zinc-50">{profile.nickname}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.region ? <Badge tone="lime">{translateOption(profileT, REGION_OPTIONS, profile.region)}</Badge> : null}
                {(profile.game_modes?.length ? profile.game_modes : ["PvP"]).map((mode) => (
                  <Badge key={mode} tone={mode === "PvE" ? "sky" : "zinc"}>{translateOption(profileT, GAME_MODE_OPTIONS, mode)}</Badge>
                ))}
                {(profile.favorite_maps ?? []).slice(0, 3).map((map) => (
                  <Badge key={map}>{translateOption(profileT, MAP_OPTIONS, map)}</Badge>
                ))}
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/onboarding?edit=1">
                <Pencil className="h-4 w-4" />
                {t("profile.edit")}
              </Link>
            </Button>
          </div>
          <form action={uploadAvatar} className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="avatar">{t("profile.avatar")}</Label>
              <Input
                id="avatar"
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                className="pt-2 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1 file:text-zinc-100"
              />
              <p className="text-xs text-zinc-500">{t("profile.avatarHint")}</p>
            </div>
            <PendingButton variant="secondary" pendingText={t("tarkov.saving")}>
              <ImageUp className="h-4 w-4" />
              {t("profile.avatarSubmit")}
            </PendingButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("languages.title")}</CardTitle>
          <CardDescription>{t("languages.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileLanguages} className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t("languages.primary")}</Label>
              <select
                id="language"
                name="language"
                defaultValue={profile.language ?? "ES"}
                className="flex h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.value} value={language.value}>{profileT(language.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              <Label>{t("languages.spoken")}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LANGUAGE_OPTIONS.map((language) => (
                  <label
                    key={language.value}
                    className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
                  >
                    <input
                      type="checkbox"
                      name="spoken_languages"
                      value={language.value}
                      defaultChecked={(profile.spoken_languages?.length ? profile.spoken_languages : [profile.language ?? "ES"]).includes(language.value)}
                      className="h-4 w-4 accent-lime-400"
                    />
                    <span>{profileT(language.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
            <PendingButton className="w-full sm:w-fit" pendingText={t("tarkov.saving")}>
              {t("languages.save")}
            </PendingButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("tarkov.title")}</CardTitle>
          <CardDescription>{t("tarkov.description")}</CardDescription>
          <div className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300 sm:grid-cols-2">
            <p>
              <span className="text-zinc-500">{t("tarkov.source")}</span> {source}
            </p>
            <p>
              <span className="text-zinc-500">{t("tarkov.lastSync")}</span> {lastSyncedAt}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={syncTarkovStats} className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="tarkov_profile_url">{t("tarkov.profileUrl")}</Label>
              <Input
                id="tarkov_profile_url"
                name="tarkov_profile_url"
                type="url"
                defaultValue={stats?.tarkov_profile_url ?? ""}
                placeholder={t("tarkov.profileUrlPlaceholder")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField label={t("tarkov.stats.level")} name="level" value={stats?.level} max={79} />
              <NumberField label={t("tarkov.stats.survivalRate")} name="survival_rate" value={stats?.survival_rate} max={100} step="0.01" />
              <NumberField label={t("tarkov.stats.kd")} name="kd" value={stats?.kd} step="0.01" />
              <NumberField label={t("tarkov.stats.raids")} name="raids" value={stats?.raids} />
              <NumberField label={t("tarkov.stats.hours")} name="hours" value={stats?.hours} />
              <NumberField label={t("tarkov.stats.pmcKills")} name="pmc_kills" value={stats?.pmc_kills} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={stats?.is_public ?? true}
                className="h-4 w-4 accent-lime-400"
              />
              {t("tarkov.showBeforeMatch")}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PendingButton name="intent" value="manual" pendingText={t("tarkov.saving")}>
                <ExternalLink className="h-4 w-4" />
                {t("tarkov.saveManual")}
              </PendingButton>
              <PendingButton name="intent" value="sync" variant="secondary" pendingText={t("tarkov.syncing")}>
                <RefreshCw className="h-4 w-4" />
                {t("tarkov.syncNow")}
              </PendingButton>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle>{t("danger.title")}</CardTitle>
          <CardDescription>{t("danger.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deleteAccount} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="confirmation">{t("danger.confirmLabel", { word: t("danger.confirmWord") })}</Label>
              <Input id="confirmation" name="confirmation" autoComplete="off" required placeholder={t("danger.confirmWord")} />
            </div>
            <PendingButton variant="danger" pendingText={t("danger.deleting")}>
              <Trash2 className="h-4 w-4" />
              {t("danger.submit")}
            </PendingButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function getStatsSource(stats: ProfileTarkovStats | null, t: (key: string) => string) {
  const source = stats?.stats_json?.source;
  if (source === "tarkov.dev") return t("tarkov.sources.tarkovDev");
  if (source === "manual_fallback") return t("tarkov.sources.manualFallback");
  return t("tarkov.sources.manual");
}

function NumberField({
  label,
  name,
  value,
  max,
  step = "1",
}: {
  label: string;
  name: string;
  value?: number | null;
  max?: number;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min={0} max={max} step={step} defaultValue={value ?? ""} />
    </div>
  );
}
