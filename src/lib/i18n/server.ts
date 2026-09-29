import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, getNamespaceMessages, type Namespace } from "@/lib/i18n/messages";
import type { I18nPayload } from "@/lib/i18n/types";
import { createTranslator } from "@/lib/i18n/translate";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export async function getServerMessages() {
  return getMessages(await getLocale());
}

export async function getServerNamespace(namespace: Namespace) {
  return getNamespaceMessages(await getLocale(), namespace);
}

export async function getServerTranslator(namespace: Namespace, locale?: Locale) {
  locale ??= await getLocale();
  return createTranslator(getNamespaceMessages(locale, namespace), getNamespaceMessages(DEFAULT_LOCALE, namespace));
}

export async function getI18nPayload(namespaces: readonly Namespace[], locale?: Locale): Promise<I18nPayload> {
  locale ??= await getLocale();

  return {
    locale,
    messages: Object.fromEntries(namespaces.map((namespace) => [namespace, getNamespaceMessages(locale, namespace)])),
    fallbackMessages: Object.fromEntries(
      namespaces.map((namespace) => [namespace, getNamespaceMessages(DEFAULT_LOCALE, namespace)]),
    ),
  };
}
