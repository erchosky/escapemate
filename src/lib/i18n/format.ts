import type { Locale } from "@/lib/i18n/config";

export function dateTimeLocale(locale: Locale) {
  return locale === "en" ? "en-US" : "es-ES";
}

export function formatDateTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(dateTimeLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
];

// "hace 5 min" / "dentro de 40 min". Anything under a minute reads as "now".
export function formatRelativeTime(value: string | Date, locale: Locale, now = Date.now()) {
  const diff = (value instanceof Date ? value.getTime() : new Date(value).getTime()) - now;
  const formatter = new Intl.RelativeTimeFormat(dateTimeLocale(locale), { numeric: "auto", style: "short" });

  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= size) return formatter.format(Math.round(diff / size), unit);
  }

  return locale === "en" ? "just now" : "ahora mismo";
}

export function formatTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(dateTimeLocale(locale), { hour: "2-digit", minute: "2-digit" }).format(
    value instanceof Date ? value : new Date(value),
  );
}
