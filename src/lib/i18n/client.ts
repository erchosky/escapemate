"use client";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { parseLocaleCookie, serializeLocaleCookie } from "@/lib/i18n/cookie";

export function readBrowserLocaleCookie() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  return parseLocaleCookie(document.cookie);
}

export function writeBrowserLocaleCookie(locale: Locale) {
  document.cookie = serializeLocaleCookie(locale);
}
