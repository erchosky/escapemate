export const LOCALES = ["es", "en"] as const;
export const DEFAULT_LOCALE = "es";
export const LOCALE_COOKIE = "escapemate_locale";

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
