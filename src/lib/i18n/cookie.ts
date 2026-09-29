import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, normalizeLocale } from "@/lib/i18n/config";

export function parseLocaleCookie(cookieHeader: string | undefined) {
  if (!cookieHeader) return DEFAULT_LOCALE;

  const value = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  if (!value) return DEFAULT_LOCALE;

  try {
    return normalizeLocale(decodeURIComponent(value));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function serializeLocaleCookie(locale: Locale) {
  const maxAge = 60 * 60 * 24 * 365;
  return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
