"use client";

import { createContext, useContext, useMemo } from "react";
import type { I18nPayload } from "@/lib/i18n/types";
import type { Namespace } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";

const emptyPayload: I18nPayload = {
  locale: "es",
  messages: {},
  fallbackMessages: {},
};

const I18nContext = createContext<I18nPayload>(emptyPayload);

export function I18nProvider({
  locale,
  messages,
  fallbackMessages,
  children,
}: I18nPayload & {
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages, fallbackMessages }), [locale, messages, fallbackMessages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useTranslations(namespace: Namespace) {
  const { messages, fallbackMessages } = useI18n();

  return useMemo(
    () => createTranslator(messages[namespace] ?? {}, fallbackMessages[namespace] ?? {}),
    [fallbackMessages, messages, namespace],
  );
}
