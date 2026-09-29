import { GAME_MODES, LANGUAGES, MAPS, OBJECTIVES, PLAY_STYLES, QUEST_HELP_TYPES, REGIONS, REPORT_REASONS, SCHEDULES } from "@/lib/constants";

export type I18nOption<TValue extends string = string> = {
  value: TValue;
  labelKey: string;
};

function option<TValue extends string>(value: TValue, labelKey: string): I18nOption<TValue> {
  return { value, labelKey };
}

export const REGION_OPTIONS = REGIONS.map((value) => option(value, `options.regions.${value.toLowerCase()}`));

export const GAME_MODE_OPTIONS = GAME_MODES.map((value) => option(value, `options.gameModes.${value.toLowerCase()}`));

export const REPORT_REASON_OPTIONS = REPORT_REASONS.map((value) => option(value, `options.reportReasons.${value}`));

export const LANGUAGE_OPTIONS = LANGUAGES.map((value) => option(value, `options.languages.${value.toLowerCase()}`));

export const MAP_OPTIONS = MAPS.map((value) =>
  option(
    value,
    `options.maps.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export const PLAY_STYLE_OPTIONS = PLAY_STYLES.map((value) =>
  option(
    value,
    `options.playStyles.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export const OBJECTIVE_OPTIONS = OBJECTIVES.map((value) =>
  option(
    value,
    `options.objectives.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export const SCHEDULE_OPTIONS = SCHEDULES.map((value) =>
  option(
    value,
    `options.schedules.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export const QUEST_HELP_TYPE_OPTIONS = QUEST_HELP_TYPES.map((value) =>
  option(
    value,
    `options.questHelpTypes.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export const QUEST_HELP_STATUS_OPTIONS = ["Activa", "Cerrada", "Expirada"] as const satisfies readonly string[];

export const QUEST_HELP_STATUS_LABEL_OPTIONS = QUEST_HELP_STATUS_OPTIONS.map((value) =>
  option(
    value,
    `options.questHelpStatuses.${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
  ),
);

export function isOptionSelected(value: string, selected?: readonly string[] | null) {
  return Boolean(selected?.includes(value));
}

export function findOptionLabelKey(options: readonly I18nOption[], value: string | null | undefined) {
  return options.find((option) => option.value === value)?.labelKey;
}

export function optionLabelKey(options: readonly I18nOption[], value: string | null | undefined) {
  return findOptionLabelKey(options, value) ?? null;
}

export function translateOption(
  t: (key: string, params?: Record<string, string | number>) => string,
  options: readonly I18nOption[],
  value: string | null | undefined,
) {
  if (!value) return null;
  const labelKey = optionLabelKey(options, value);
  return labelKey ? t(labelKey) : value;
}
