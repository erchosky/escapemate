"use client";

import { useSyncExternalStore } from "react";
import { normalizeLocale, type Locale } from "@/lib/i18n/config";
import { getNamespaceMessages } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";

function subscribe() {
  return () => {};
}

// Error boundaries render outside any I18nProvider; <html lang> is set by the root layout.
export function useDocumentTranslator() {
  const locale = useSyncExternalStore<Locale>(
    subscribe,
    () => normalizeLocale(document.documentElement.lang),
    () => "es",
  );
  return createTranslator(getNamespaceMessages(locale, "common"), getNamespaceMessages("es", "common"));
}
