"use client";

import Link from "next/link";
import { Clock, Users } from "lucide-react";
import type { RaidNowErrorCode, RaidNowSuccessCode } from "@/lib/action-feedback";
import { closeRaidNowPost, createRaidNowPost } from "@/lib/actions/raid-now";
import type { GameMode, Language, MapName, Objective, Profile, RaidNowPost, Region } from "@/lib/constants";
import {
  GAME_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  OBJECTIVE_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REGION_OPTIONS,
  translateOption,
  type I18nOption,
} from "@/lib/i18n/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/ui/pending-button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/app/avatar";
import { CollapsibleFormCard } from "@/components/app/collapsible-form-card";
import { PostResponsesList, RespondToPost } from "@/components/app/post-responses";
import { useTranslations } from "@/components/app/i18n-provider";
import { FlashToast } from "@/components/app/flash-toast";
import { RelativeTime } from "@/components/app/relative-time";

export function RaidNowBoard({
  posts,
  currentUserId,
  profile,
  filters,
  errorCode,
  successCode,
}: {
  posts: RaidNowPost[];
  currentUserId: string;
  profile: Profile;
  filters: {
    region?: Region;
    language?: Language;
    map?: MapName;
    objective?: Objective;
    game_mode?: GameMode;
  };
  errorCode?: RaidNowErrorCode | null;
  successCode?: RaidNowSuccessCode | null;
}) {
  const t = useTranslations("raid-now");
  const profileT = useTranslations("profile");
  const errorsT = useTranslations("errors");
  const myPost = posts.find((post) => post.profile_id === currentUserId);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <FlashToast message={errorCode ? errorsT(errorCode) : null} tone="error" />
      <FlashToast message={successCode ? errorsT(successCode) : null} tone="success" />
      <CollapsibleFormCard
        title={t("form.title")}
        description={t("form.description")}
        toggleLabel={t("form.toggle")}
        defaultOpen={Boolean(errorCode)}
      >
        {myPost ? (
          <div className="grid gap-3 rounded-lg border border-lime-400/30 bg-lime-400/10 p-4 text-sm text-lime-100">
            <p>{t("form.activePost", { map: translateOption(profileT, MAP_OPTIONS, myPost.map) ?? myPost.map })}</p>
            <p className="text-xs text-lime-100/70">{t("form.activePostHint")}</p>
          </div>
        ) : (
          <form action={createRaidNowPost} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <FieldSelect label={t("form.map")} name="map" options={MAP_OPTIONS} defaultValue={profile.favorite_maps?.[0]} />
              <FieldSelect label={t("form.objective")} name="objective" options={OBJECTIVE_OPTIONS} defaultValue={profile.objectives?.[0]} />
              <FieldSelect label={t("form.gameMode")} name="game_mode" options={GAME_MODE_OPTIONS} defaultValue={profile.game_modes?.[0]} />
              <FieldSelect label={t("form.language")} name="language" options={LANGUAGE_OPTIONS} defaultValue={profile.language ?? undefined} />
              <FieldSelect label={t("form.region")} name="region" options={REGION_OPTIONS} defaultValue={profile.region ?? undefined} />
              <FieldSelect label={t("form.style")} name="style" options={PLAY_STYLE_OPTIONS} defaultValue={profile.play_styles?.[0]} />
              <div className="space-y-2">
                <Label htmlFor="players_needed">{t("form.playersNeeded")}</Label>
                <Input id="players_needed" name="players_needed" type="number" min={1} max={4} defaultValue={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{t("form.notes")}</Label>
              <Input id="notes" name="notes" maxLength={180} placeholder={t("form.notesPlaceholder")} />
            </div>
            <PendingButton pendingText={t("form.submitting")}>{t("form.submit")}</PendingButton>
          </form>
        )}
      </CollapsibleFormCard>

      <div className="grid h-fit gap-4">
        <Card className="p-4">
          <form className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <FilterSelect label={t("filters.region")} name="region" options={REGION_OPTIONS} value={filters.region} />
            <FilterSelect label={t("filters.language")} name="language" options={LANGUAGE_OPTIONS} value={filters.language} />
            <FilterSelect label={t("filters.map")} name="map" options={MAP_OPTIONS} value={filters.map} />
            <FilterSelect label={t("filters.objective")} name="objective" options={OBJECTIVE_OPTIONS} value={filters.objective} />
            <FilterSelect label={t("filters.gameMode")} name="game_mode" options={GAME_MODE_OPTIONS} value={filters.game_mode} />
            <div className="col-span-2 flex gap-2 lg:col-span-5">
              <Button className="flex-1">{t("filters.apply")}</Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/raid-now">
                  {t("filters.clear")}
                </Link>
              </Button>
            </div>
          </form>
        </Card>
        {posts.length ? (
          posts.map((post) => {
            const mine = post.profile_id === currentUserId;
            const name = post.profile?.nickname ?? t("post.fallbackPlayer");
            const full = post.accepted_count >= post.players_needed;
            return (
              <Card key={post.id} className={mine ? "border-lime-400/40 p-4" : "p-4"}>
                <div className="flex gap-4">
                  <Avatar
                    name={name}
                    src={post.profile?.avatar_url}
                    seed={post.profile_id}
                    sizes="56px"
                    className="h-14 w-14 shrink-0 rounded-md"
                    textClassName="text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold text-zinc-50">
                        {name}
                        {mine ? <span className="ml-2 text-xs font-normal text-lime-300">{t("post.yours")}</span> : null}
                      </h2>
                      <Badge tone="lime">{translateOption(profileT, MAP_OPTIONS, post.map)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-300">{post.notes || t("post.fallbackNote")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={post.game_mode === "PvE" ? "sky" : "zinc"}>{translateOption(profileT, GAME_MODE_OPTIONS, post.game_mode)}</Badge>
                      <Badge>{translateOption(profileT, OBJECTIVE_OPTIONS, post.objective)}</Badge>
                      <Badge>{translateOption(profileT, PLAY_STYLE_OPTIONS, post.style)}</Badge>
                      <Badge>{translateOption(profileT, REGION_OPTIONS, post.region)}</Badge>
                      <Badge>{translateOption(profileT, LANGUAGE_OPTIONS, post.language)}</Badge>
                      <Badge tone={full ? "lime" : "amber"}>
                        <Users className="mr-1 h-3 w-3" />
                        {full ? t("post.full") : t("post.seats", { accepted: post.accepted_count, needed: post.players_needed })}
                      </Badge>
                      <Badge tone="amber">
                        <Clock className="mr-1 h-3 w-3" />
                        <RelativeTime value={post.expires_at} prefix={(time) => t("post.expires", { time })} />
                      </Badge>
                    </div>
                  </div>
                </div>
                {mine ? (
                  <>
                    <PostResponsesList kind="raid_now" responses={post.responses ?? []} />
                    <form action={closeRaidNowPost} className="mt-4">
                      <input type="hidden" name="id" value={post.id} />
                      <PendingButton variant="outline" className="w-full" pendingText={t("post.closing")}>
                        {t("post.close")}
                      </PendingButton>
                    </form>
                  </>
                ) : (
                  <RespondToPost kind="raid_now" postId={post.id} myResponse={post.myResponse} full={full} />
                )}
              </Card>
            );
          })
        ) : (
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-50">{t("empty.title")}</h2>
            <p className="mt-2 text-sm text-zinc-400">{hasFilters ? t("empty.filtered") : t("empty.description")}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  name,
  options,
  value,
}: {
  label: string;
  name: string;
  options: readonly I18nOption[];
  value?: string;
}) {
  const t = useTranslations("raid-now");
  const profileT = useTranslations("profile");

  return (
    <div className="space-y-2">
      <Label htmlFor={`filter-${name}`}>{label}</Label>
      <Select id={`filter-${name}`} name={name} defaultValue={value ?? ""}>
        <option value="">{t("filters.all")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{profileT(option.labelKey)}</option>
        ))}
      </Select>
    </div>
  );
}

function FieldSelect({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly I18nOption[];
  defaultValue?: string;
}) {
  const profileT = useTranslations("profile");

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} name={name} defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{profileT(option.labelKey)}</option>
        ))}
      </Select>
    </div>
  );
}
