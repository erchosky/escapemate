import type { Locale } from "@/lib/i18n/config";

export type QuestCatalogEntry = {
  id: string;
  name: string;
  trader: string | null;
  map: string | null;
  requirements?: string[];
};

export function questCatalogPath(locale: Locale) {
  return `/data/tarkov/quests.${locale}.json`;
}

export function resolveQuestName(
  catalog: readonly QuestCatalogEntry[],
  questId: string | null | undefined,
  fallbackName: string,
) {
  if (!questId) return fallbackName;
  return catalog.find((quest) => quest.id === questId)?.name ?? fallbackName;
}

export function findQuestByDisplayName(catalog: readonly QuestCatalogEntry[], value: string) {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return catalog.find((quest) => quest.name.toLowerCase() === needle) ?? null;
}
