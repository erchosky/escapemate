"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { saveOnboarding } from "@/lib/actions/profile";
import { PROFILE_LIMITS, type Profile } from "@/lib/constants";
import type { ProfileErrorCode } from "@/lib/action-feedback";
import {
  GAME_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  OBJECTIVE_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REGION_OPTIONS,
  SCHEDULE_OPTIONS,
  type I18nOption,
} from "@/lib/i18n/options";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/app/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/ui/pending-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const DRAFT_KEY = "escapemate:onboarding-draft:v2";
const STEP_KEYS = ["you", "play", "when"] as const;

type GroupName = "spoken_languages" | "game_modes" | "favorite_maps" | "play_styles" | "objectives" | "schedule";

type FormValues = {
  nickname: string;
  discord_username: string;
  region: string;
  language: string;
  approximate_level: string;
  bio: string;
} & Record<GroupName, string[]>;

const GROUP_LIMITS: Record<GroupName, number> = {
  spoken_languages: LANGUAGE_OPTIONS.length,
  game_modes: GAME_MODE_OPTIONS.length,
  ...PROFILE_LIMITS,
};

function subscribeNever() {
  return () => {};
}

function readDraft() {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode or blocked storage: nothing to clear.
  }
}

function initialValues(profile?: Profile | null): FormValues {
  return {
    nickname: profile?.nickname ?? "",
    discord_username: profile?.discord_username ?? "",
    region: profile?.region ?? "EU",
    language: profile?.language ?? "ES",
    approximate_level: String(profile?.approximate_level ?? 15),
    bio: profile?.bio ?? "",
    spoken_languages: profile?.spoken_languages?.length ? profile.spoken_languages : [profile?.language ?? "ES"],
    game_modes: profile?.game_modes?.length ? profile.game_modes : ["PvP"],
    favorite_maps: profile?.favorite_maps ?? [],
    play_styles: profile?.play_styles ?? [],
    objectives: profile?.objectives ?? [],
    schedule: profile?.schedule ?? [],
  };
}

function CheckboxGroup({
  name,
  options,
  selected,
  max,
  label,
  onToggle,
}: {
  name: GroupName;
  options: readonly I18nOption[];
  selected: string[];
  max: number;
  label: (key: string) => string;
  onToggle: (name: GroupName, value: string) => void;
}) {
  const full = selected.length >= max;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const checked = selected.includes(option.value);
        const disabled = !checked && full;
        return (
          <label
            key={option.value}
            className={cn(
              "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition",
              checked ? "border-lime-400/50 bg-lime-400/10 text-lime-50" : "border-zinc-800 bg-zinc-950 text-zinc-200",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(name, option.value)}
              className="h-4 w-4 accent-lime-400"
            />
            <span>{label(option.labelKey)}</span>
          </label>
        );
      })}
    </div>
  );
}

export function OnboardingForm({
  profile,
  errorCode,
  editing = false,
}: {
  profile?: Profile | null;
  errorCode?: ProfileErrorCode | null;
  editing?: boolean;
}) {
  const t = useTranslations("onboarding");
  const profileT = useTranslations("profile");
  const errorsT = useTranslations("errors");
  const [values, setValues] = useState<FormValues>(() => initialValues(profile));
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [missing, setMissing] = useState<GroupName[]>([]);
  const [step, setStep] = useState(0);
  const [basicsError, setBasicsError] = useState(false);
  // Read once on the client; the server snapshot is "no draft" so hydration always matches.
  const savedDraft = useSyncExternalStore(subscribeNever, readDraft, () => null);
  // Wizard navigation is client-only; keep it disabled until hydration so an early tap
  // on a slow connection is never silently lost.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const offerDraft = !editing && !draftDismissed && savedDraft !== null;

  function restoreDraft() {
    try {
      const draft = JSON.parse(savedDraft ?? "{}") as Partial<FormValues>;
      setValues((current) => ({ ...current, ...draft, discord_username: current.discord_username }));
    } catch {
      clearDraft();
    }
    setDraftDismissed(true);
  }

  function update(next: FormValues) {
    setValues(next);
    // Once the player starts filling the form, the saved draft is theirs; stop offering it.
    setDraftDismissed(true);
    setMissing((current) => current.filter((group) => next[group].length === 0));
    if (editing) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the draft is a convenience only.
    }
  }

  function toggle(name: GroupName, value: string) {
    const current = values[name];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(0, GROUP_LIMITS[name]);
    update({ ...values, [name]: next });
  }

  function field(name: keyof Omit<FormValues, GroupName>) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        update({ ...values, [name]: event.target.value }),
    };
  }

  const groups: { name: GroupName; label: string; options: readonly I18nOption[]; step: number }[] = [
    { name: "game_modes", label: t("fields.gameModes"), options: GAME_MODE_OPTIONS, step: 0 },
    { name: "spoken_languages", label: t("fields.spokenLanguages"), options: LANGUAGE_OPTIONS, step: 0 },
    { name: "play_styles", label: t("fields.playStyles"), options: PLAY_STYLE_OPTIONS, step: 1 },
    { name: "objectives", label: t("fields.objectives"), options: OBJECTIVE_OPTIONS, step: 1 },
    { name: "favorite_maps", label: t("fields.favoriteMaps"), options: MAP_OPTIONS, step: 1 },
    { name: "schedule", label: t("fields.schedule"), options: SCHEDULE_OPTIONS, step: 2 },
  ];

  // New players get a three-step wizard; editing shows every section at once. Every field
  // stays mounted (only hidden), so the final submit still carries the whole profile.
  const wizard = !editing;
  const lastStep = STEP_KEYS.length - 1;
  const visible = (sectionStep: number) => !wizard || sectionStep === step;

  function stepProblems(target: number): GroupName[] {
    return groups.filter((group) => group.step === target && values[group.name].length === 0).map((group) => group.name);
  }

  function basicsValid() {
    const level = Number(values.approximate_level);
    return values.nickname.trim().length >= 2 && Number.isInteger(level) && level >= 1 && level <= 79;
  }

  function goNext() {
    const empty = stepProblems(step);
    if (step === 0 && !basicsValid()) {
      setBasicsError(true);
      return;
    }
    if (empty.length) {
      setMissing(empty);
      return;
    }
    setBasicsError(false);
    setStep((current) => Math.min(lastStep, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>{editing ? t("editTitle") : t("title")}</CardTitle>
        <CardDescription>{editing ? t("editDescription") : t("description")}</CardDescription>
        {offerDraft ? (
          <div className="flex flex-col gap-2 rounded-md border border-lime-400/30 bg-lime-400/10 p-3 text-sm text-lime-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("draftAvailable")}</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={restoreDraft}>
                {t("draftRestore")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearDraft();
                  setDraftDismissed(true);
                }}
              >
                {t("draftDiscard")}
              </Button>
            </div>
          </div>
        ) : null}
        {errorCode ? <p role="alert" className="text-sm text-red-300">{errorsT(errorCode)}</p> : null}
        {wizard ? (
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
              <span>{t("steps.progress", { current: step + 1, total: STEP_KEYS.length })}</span>
              <span className="text-lime-300">{t(`steps.${STEP_KEYS[step]}`)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden="true">
              {STEP_KEYS.map((key, index) => (
                <div key={key} className={cn("h-1.5 rounded-full", index <= step ? "bg-lime-400" : "bg-zinc-800")} />
              ))}
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <form
          action={saveOnboarding}
          className="grid gap-6"
          onSubmit={(event) => {
            if (wizard && step < lastStep) {
              event.preventDefault();
              goNext();
              return;
            }
            const empty = groups.map((group) => group.name).filter((name) => values[name].length === 0);
            if (wizard && empty.length) {
              event.preventDefault();
              setMissing(empty);
              setStep(Math.min(...empty.map((name) => groups.find((group) => group.name === name)?.step ?? 0)));
              return;
            }
            if (empty.length) {
              event.preventDefault();
              setMissing(empty);
              document.getElementById(`group-${empty[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
            clearDraft();
          }}
        >
          {editing ? <input type="hidden" name="mode" value="edit" /> : null}
          <div className={cn("grid gap-4 sm:grid-cols-2", !visible(0) && "hidden")}>
            <div className="space-y-2">
              <Label htmlFor="nickname">{t("fields.nickname")}</Label>
              <Input id="nickname" {...field("nickname")} required minLength={2} maxLength={32} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discord_username">{t("fields.discord")}</Label>
              <Input
                id="discord_username"
                {...field("discord_username")}
                placeholder={t("fields.discordPlaceholder")}
                maxLength={64}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">{t("fields.region")}</Label>
              <Select id="region" {...field("region")}>
                {REGION_OPTIONS.map((region) => (
                  <option key={region.value} value={region.value}>{profileT(region.labelKey)}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">{t("fields.primaryLanguage")}</Label>
              <Select id="language" {...field("language")}>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.value} value={language.value}>{profileT(language.labelKey)}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approximate_level">{t("fields.approximateLevel")}</Label>
              <Input id="approximate_level" {...field("approximate_level")} type="number" min={1} max={79} required />
            </div>
            {basicsError ? <p role="alert" className="text-sm text-red-300 sm:col-span-2">{t("validation.basics")}</p> : null}
          </div>

          {groups.map((group) => {
            const limit = GROUP_LIMITS[group.name];
            const isMissing = missing.includes(group.name);
            return (
              <fieldset key={group.name} id={`group-${group.name}`} className={cn("space-y-3", !visible(group.step) && "hidden")}>
                <legend className="flex w-full items-center justify-between gap-3 text-sm font-medium text-zinc-200">
                  <span>{group.label}</span>
                  <span className={cn("text-xs", isMissing ? "text-red-300" : "text-zinc-500")}>
                    {isMissing
                      ? t("validation.pickOne")
                      : limit < group.options.length
                        ? t("validation.count", { count: values[group.name].length, max: limit })
                        : null}
                  </span>
                </legend>
                <CheckboxGroup
                  name={group.name}
                  options={group.options}
                  selected={values[group.name]}
                  max={limit}
                  label={profileT}
                  onToggle={toggle}
                />
              </fieldset>
            );
          })}

          <div className={cn("space-y-2", !visible(2) && "hidden")}>
            <Label htmlFor="bio">{t("fields.bio")}</Label>
            <Textarea id="bio" {...field("bio")} placeholder={t("fields.bioPlaceholder")} maxLength={240} />
            <p className="text-right text-xs text-zinc-500">{values.bio.length}/240</p>
          </div>
          {missing.length ? <p role="alert" className="text-sm text-red-300">{t("validation.missingGroups")}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            {wizard && step > 0 ? (
              <Button type="button" size="lg" variant="outline" className="w-full sm:w-fit" disabled={!hydrated} onClick={() => setStep(step - 1)}>
                {t("actions.back")}
              </Button>
            ) : null}
            {wizard && step < lastStep ? (
              <Button type="button" size="lg" className="w-full sm:w-fit" disabled={!hydrated} onClick={goNext}>
                {t("actions.next")}
              </Button>
            ) : (
              <PendingButton size="lg" className="w-full sm:w-fit" pendingText={t("actions.saving")}>
                {editing ? t("actions.saveChanges") : t("actions.submit")}
              </PendingButton>
            )}
            {editing ? (
              <Button asChild size="lg" variant="outline" className="w-full sm:w-fit">
                <Link href="/settings">{t("actions.cancel")}</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
