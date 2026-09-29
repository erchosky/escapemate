import type { Locale } from "@/lib/i18n/config";
import type { Namespace } from "@/lib/i18n/messages";
import type { MessageTree } from "@/lib/i18n/translate";

export type I18nMessageNamespaces = Partial<Record<Namespace, MessageTree>>;

export type I18nPayload = {
  locale: Locale;
  messages: I18nMessageNamespaces;
  fallbackMessages: I18nMessageNamespaces;
};
