"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { createQuestHelpPost } from "@/lib/actions/quest-help";
import { MAPS, normalizeMapName, type Profile } from "@/lib/constants";
import {
  GAME_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  PLAY_STYLE_OPTIONS,
  QUEST_HELP_TYPE_OPTIONS,
  REGION_OPTIONS,
  translateOption,
  type I18nOption,
} from "@/lib/i18n/options";
import {
  findQuestByDisplayName,
  type QuestCatalogEntry,
} from "@/lib/tarkov/quest-catalog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/ui/pending-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/components/app/i18n-provider";

export type QuestTaskOption = {
  id: string;
  name: string;
  normalizedName?: string;
  trader?: { name: string } | null;
  map?: { name: string } | null;
  wikiLink?: string | null;
  minPlayerLevel?: number | null;
  taskRequirements?: { task?: { id: string; name: string } | null }[];
  objectives?: {
    id?: string | null;
    type: string;
    description: string;
    optional: boolean;
    maps: { id?: string; name: string }[];
  }[];
};

export function QuestHelpForm({
  tasks: liveTasks,
  catalog,
  profile,
}: {
  tasks: QuestTaskOption[];
  catalog: QuestCatalogEntry[];
  profile: Profile;
}) {
  const t = useTranslations("quest-help");
  const profileT = useTranslations("profile");
  const [questName, setQuestName] = useState("");
  // If tarkov.dev is down the bundled catalog (npm run tarkov:sync) still gives names, traders and maps.
  const tasks = useMemo(() => (liveTasks.length ? liveTasks : catalog.map(catalogEntryToTask)), [catalog, liveTasks]);
  const [manualMap, setManualMap] = useState<string>(MAPS[0]);

  const selectedTask = useMemo(() => {
    const needle = questName.trim().toLowerCase();
    if (!needle) return null;
    const catalogEntry = findQuestByDisplayName(catalog, questName);
    if (catalogEntry) return tasks.find((task) => task.id === catalogEntry.id) ?? null;
    return tasks.find((task) => displayTaskName(task, catalog).toLowerCase() === needle || task.name.toLowerCase() === needle) ?? null;
  }, [catalog, questName, tasks]);

  const compatibleMaps = useMemo(() => {
    if (!selectedTask) return [];

    const names = new Set<string>();
    if (selectedTask.map?.name) names.add(selectedTask.map.name);
    selectedTask.objectives?.forEach((objective) => {
      objective.maps.forEach((map) => names.add(map.name));
    });

    return Array.from(names)
      .map((name) => normalizeMapName(name))
      .filter((name): name is (typeof MAPS)[number] => Boolean(name));
  }, [selectedTask]);

  const uniqueCompatibleMaps = Array.from(new Set(compatibleMaps));
  const lockedMap = uniqueCompatibleMaps.length === 1 ? uniqueCompatibleMaps[0] : null;
  const mapOptions = uniqueCompatibleMaps.length > 1 ? uniqueCompatibleMaps : MAPS;
  const mapValue = lockedMap ?? (mapOptions.includes(manualMap as (typeof MAPS)[number]) ? manualMap : mapOptions[0]);
  const tasksLoaded = tasks.length > 0;
  const visibleTasks = useMemo(() => {
    const needle = questName.trim().toLowerCase();
    const pool = needle.length >= 2
      ? tasks.filter((task) => displayTaskName(task, catalog).toLowerCase().includes(needle) || task.name.toLowerCase().includes(needle))
      : tasks;
    return pool.slice(0, 80);
  }, [catalog, questName, tasks]);

  return (
    <form action={createQuestHelpPost} className="grid gap-4">
      {!tasksLoaded ? (
        <p className="flex gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t("form.manualFallback")}
        </p>
      ) : null}
      <input type="hidden" name="quest_id" value={selectedTask?.id ?? ""} />
      {lockedMap ? <input type="hidden" name="map" value={lockedMap} /> : null}
      <div className="space-y-2">
        <Label htmlFor="quest_name">{t("form.quest")}</Label>
        <Input
          id="quest_name"
          name="quest_name"
          list="quest-options"
          value={questName}
          onChange={(event) => setQuestName(event.target.value)}
          placeholder={t("form.questPlaceholder")}
          required
        />
        <datalist id="quest-options">
          {visibleTasks.map((task) => (
            <option key={task.id} value={displayTaskName(task, catalog)} />
          ))}
        </datalist>
      </div>

      {selectedTask ? <QuestInfo task={selectedTask} compatibleMaps={uniqueCompatibleMaps} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="space-y-2">
          <Label htmlFor="map">{t("form.map")}</Label>
          <Select
            id="map"
            name="map"
            value={mapValue}
            disabled={Boolean(lockedMap)}
            onChange={(event) => setManualMap(event.target.value)}
          >
            {mapOptions.map((option) => (
              <option key={option} value={option}>{translateOption(profileT, MAP_OPTIONS, option)}</option>
            ))}
          </Select>
          {lockedMap ? (
            <p className="text-xs text-zinc-500">{t("form.lockedMap")}</p>
          ) : uniqueCompatibleMaps.length > 1 ? (
            <p className="text-xs text-zinc-500">{t("form.multiMap")}</p>
          ) : null}
        </div>
        <FieldSelect label={t("form.type")} name="request_type" options={QUEST_HELP_TYPE_OPTIONS} />
        <FieldSelect label={t("form.gameMode")} name="game_mode" options={GAME_MODE_OPTIONS} defaultValue={profile.game_modes?.[0]} />
        <FieldSelect label={t("form.language")} name="language" options={LANGUAGE_OPTIONS} defaultValue={profile.language ?? undefined} />
        <FieldSelect label={t("form.region")} name="region" options={REGION_OPTIONS} defaultValue={profile.region ?? undefined} />
        <FieldSelect label={t("form.style")} name="playstyle" options={PLAY_STYLE_OPTIONS} optional />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{t("form.description")}</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={500}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </div>
      <PendingButton pendingText={t("form.submitting")}>{t("form.submit")}</PendingButton>
    </form>
  );
}

function QuestInfo({
  task,
  compatibleMaps,
}: {
  task: QuestTaskOption;
  compatibleMaps: string[];
}) {
  const t = useTranslations("quest-help");
  const profileT = useTranslations("profile");
  const requiresItem = task.objectives?.some((objective) => /item/i.test(objective.type)) ?? false;
  const requiresExtraction = task.objectives?.some((objective) => /extract|survive/i.test(objective.type + objective.description)) ?? false;
  const pvpRelevant = task.objectives?.some((objective) => /kill|pmc|player|pvp/i.test(objective.description)) ?? false;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
      <div className="flex flex-wrap gap-2">
        {task.trader?.name ? <Badge tone="lime">{task.trader.name}</Badge> : null}
        {compatibleMaps.map((map) => (
          <Badge key={map}>{translateOption(profileT, MAP_OPTIONS, map)}</Badge>
        ))}
        {task.minPlayerLevel ? <Badge tone="amber">{t("questInfo.level", { level: task.minPlayerLevel })}</Badge> : null}
        {requiresItem ? <Badge>{t("questInfo.itemRequired")}</Badge> : null}
        {requiresExtraction ? <Badge>{t("questInfo.extraction")}</Badge> : null}
        {task.objectives?.length ? (
          pvpRelevant ? <Badge tone="red">{t("questInfo.pvp")}</Badge> : <Badge>{t("questInfo.pve")}</Badge>
        ) : null}
      </div>
      {task.objectives?.length ? (
        <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-300">
          {task.objectives.slice(0, 4).map((objective, index) => (
            <li key={objective.id ?? index}>- {objective.description}</li>
          ))}
        </ul>
      ) : null}
      {task.taskRequirements?.length ? (
        <p className="mt-3 text-xs text-zinc-500">
          {t("questInfo.requirements", {
            requirements: task.taskRequirements.map((requirement) => requirement.task?.name).filter(Boolean).join(", "),
          })}
        </p>
      ) : null}
      {task.wikiLink ? (
        <a
          href={task.wikiLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-lime-300"
        >
          {t("questInfo.wiki")} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}

function FieldSelect({
  label,
  name,
  options,
  optional = false,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly I18nOption[];
  optional?: boolean;
  defaultValue?: string;
}) {
  const t = useTranslations("quest-help");
  const profileT = useTranslations("profile");

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select id={name} name={name} defaultValue={defaultValue}>
        {optional ? <option value="">{t("form.noPreference")}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{profileT(option.labelKey)}</option>
        ))}
      </Select>
    </div>
  );
}

function catalogEntryToTask(entry: QuestCatalogEntry): QuestTaskOption {
  return {
    id: entry.id,
    name: entry.name,
    trader: entry.trader ? { name: entry.trader } : null,
    map: entry.map ? { name: entry.map } : null,
    taskRequirements: (entry.requirements ?? []).map((name) => ({ task: { id: name, name } })),
    objectives: [],
  };
}

function displayTaskName(task: QuestTaskOption, catalog: readonly QuestCatalogEntry[]) {
  return catalog.find((entry) => entry.id === task.id)?.name ?? task.name;
}
