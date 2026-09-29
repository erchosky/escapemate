"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Clock, ShieldAlert } from "lucide-react";
import type { QuestHelpErrorCode, QuestHelpSuccessCode } from "@/lib/action-feedback";
import { closeQuestHelpPost } from "@/lib/actions/quest-help";
import type { GameMode, Language, MapName, Profile, QuestHelpPost, QuestHelpType, Region } from "@/lib/constants";
import {
  GAME_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  QUEST_HELP_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAY_STYLE_OPTIONS,
  translateOption,
  type I18nOption,
} from "@/lib/i18n/options";
import {
  questCatalogPath,
  resolveQuestName,
  type QuestCatalogEntry,
} from "@/lib/tarkov/quest-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuestHelpForm, type QuestTaskOption } from "@/components/app/quest-help-form";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/ui/pending-button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/app/avatar";
import { CollapsibleFormCard } from "@/components/app/collapsible-form-card";
import { PostResponsesList, RespondToPost } from "@/components/app/post-responses";
import { useI18n, useTranslations } from "@/components/app/i18n-provider";
import { FlashToast } from "@/components/app/flash-toast";
import { RelativeTime } from "@/components/app/relative-time";

export function QuestHelpBoard({
  posts,
  currentUserId,
  profile,
  filters,
  errorCode,
  successCode,
}: {
  posts: QuestHelpPost[];
  currentUserId: string;
  profile: Profile;
  filters: {
    region?: Region;
    language?: Language;
    map?: MapName;
    request_type?: QuestHelpType;
    game_mode?: GameMode;
  };
  errorCode?: QuestHelpErrorCode | null;
  successCode?: QuestHelpSuccessCode | null;
}) {
  const { locale } = useI18n();
  const t = useTranslations("quest-help");
  const profileT = useTranslations("profile");
  const errorsT = useTranslations("errors");
  const [catalog, setCatalog] = useState<QuestCatalogEntry[]>([]);
  const [tasks, setTasks] = useState<QuestTaskOption[]>([]);
  const hasFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    let cancelled = false;

    const load = (url: string, apply: (data: never[]) => void) =>
      fetch(url)
        .then((response) => (response.ok ? response.json() : []))
        .then((data) => {
          if (!cancelled) apply(Array.isArray(data) ? (data as never[]) : []);
        })
        .catch(() => {
          if (!cancelled) apply([]);
        });

    // Both are static per locale and cached by the browser/CDN.
    void load(questCatalogPath(locale), setCatalog);
    void load(`/api/tarkov/tasks?locale=${locale}`, setTasks);

    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <FlashToast message={errorCode ? errorsT(errorCode) : null} tone="error" />
      <FlashToast message={successCode ? errorsT(successCode) : null} tone="success" />
      <CollapsibleFormCard
        title={t("board.title")}
        description={t("board.description")}
        toggleLabel={t("board.toggle")}
        defaultOpen={Boolean(errorCode)}
        extra={
          <p className="flex gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t("board.antiRmt")}
          </p>
        }
      >
        <QuestHelpForm tasks={tasks} catalog={catalog} profile={profile} />
      </CollapsibleFormCard>

      <div className="grid h-fit gap-4">
        <Card className="p-4">
          <form className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <FilterSelect label={t("filters.region")} name="region" options={REGION_OPTIONS} value={filters.region} />
            <FilterSelect label={t("filters.language")} name="language" options={LANGUAGE_OPTIONS} value={filters.language} />
            <FilterSelect label={t("filters.map")} name="map" options={MAP_OPTIONS} value={filters.map} />
            <FilterSelect label={t("filters.type")} name="request_type" options={QUEST_HELP_TYPE_OPTIONS} value={filters.request_type} />
            <FilterSelect label={t("filters.gameMode")} name="game_mode" options={GAME_MODE_OPTIONS} value={filters.game_mode} />
            <div className="col-span-2 flex gap-2 lg:col-span-5">
              <Button className="flex-1">{t("filters.apply")}</Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/quest-help">
                  {t("filters.clear")}
                </Link>
              </Button>
            </div>
          </form>
        </Card>
        {posts.length ? (
          posts.map((post) => {
            const mine = post.user_id === currentUserId;
            const name = post.profile?.nickname ?? t("post.fallbackPlayer");
            return (
              <Card key={post.id} className={mine ? "border-lime-400/40 p-4" : "p-4"}>
                <div className="flex gap-4">
                  <Avatar
                    name={name}
                    src={post.profile?.avatar_url}
                    seed={post.user_id}
                    sizes="56px"
                    className="h-14 w-14 shrink-0 rounded-md"
                    textClassName="text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold text-zinc-50">{resolveQuestName(catalog, post.quest_id, post.quest_name)}</h2>
                      <Badge tone="lime">{translateOption(profileT, QUEST_HELP_TYPE_OPTIONS, post.request_type)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">
                      {name}
                      {mine ? <span className="ml-1 text-lime-300">({t("post.yours")})</span> : null} · {translateOption(profileT, MAP_OPTIONS, post.map)}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {post.description || t("post.fallbackDescription")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={post.game_mode === "PvE" ? "sky" : "zinc"}>{translateOption(profileT, GAME_MODE_OPTIONS, post.game_mode)}</Badge>
                      <Badge>{translateOption(profileT, REGION_OPTIONS, post.region)}</Badge>
                      <Badge>{translateOption(profileT, LANGUAGE_OPTIONS, post.language)}</Badge>
                      {post.playstyle ? <Badge>{translateOption(profileT, PLAY_STYLE_OPTIONS, post.playstyle)}</Badge> : null}
                      <Badge tone="amber">
                        <Clock className="mr-1 h-3 w-3" />
                        <RelativeTime value={post.expires_at} prefix={(time) => t("post.expires", { time })} />
                      </Badge>
                    </div>
                  </div>
                </div>
                {mine ? (
                  <>
                    <PostResponsesList kind="quest_help" responses={post.responses ?? []} />
                    <form action={closeQuestHelpPost} className="mt-4">
                      <input type="hidden" name="id" value={post.id} />
                      <PendingButton variant="outline" className="w-full" pendingText={t("post.closing")}>
                        {t("post.close")}
                      </PendingButton>
                    </form>
                  </>
                ) : (
                  <RespondToPost kind="quest_help" postId={post.id} myResponse={post.myResponse} />
                )}
              </Card>
            );
          })
        ) : (
          <Card className="p-8 text-center">
            <BookOpen className="mx-auto mb-4 h-8 w-8 text-lime-300" />
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
  const t = useTranslations("quest-help");
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
