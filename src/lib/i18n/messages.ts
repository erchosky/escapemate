import esAdmin from "@/i18n/messages/es/admin.json";
import esAuth from "@/i18n/messages/es/auth.json";
import esChat from "@/i18n/messages/es/chat.json";
import esCommon from "@/i18n/messages/es/common.json";
import esErrors from "@/i18n/messages/es/errors.json";
import esLegal from "@/i18n/messages/es/legal.json";
import esMatches from "@/i18n/messages/es/matches.json";
import esOnboarding from "@/i18n/messages/es/onboarding.json";
import esProfile from "@/i18n/messages/es/profile.json";
import esQuestHelp from "@/i18n/messages/es/quest-help.json";
import esRaidNow from "@/i18n/messages/es/raid-now.json";
import esSettings from "@/i18n/messages/es/settings.json";
import esSwipe from "@/i18n/messages/es/swipe.json";
import enAdmin from "@/i18n/messages/en/admin.json";
import enAuth from "@/i18n/messages/en/auth.json";
import enChat from "@/i18n/messages/en/chat.json";
import enCommon from "@/i18n/messages/en/common.json";
import enErrors from "@/i18n/messages/en/errors.json";
import enLegal from "@/i18n/messages/en/legal.json";
import enMatches from "@/i18n/messages/en/matches.json";
import enOnboarding from "@/i18n/messages/en/onboarding.json";
import enProfile from "@/i18n/messages/en/profile.json";
import enQuestHelp from "@/i18n/messages/en/quest-help.json";
import enRaidNow from "@/i18n/messages/en/raid-now.json";
import enSettings from "@/i18n/messages/en/settings.json";
import enSwipe from "@/i18n/messages/en/swipe.json";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export const NAMESPACES = [
  "common",
  "auth",
  "onboarding",
  "profile",
  "swipe",
  "matches",
  "chat",
  "raid-now",
  "quest-help",
  "settings",
  "admin",
  "errors",
  "legal",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const messages = {
  es: {
    common: esCommon,
    auth: esAuth,
    onboarding: esOnboarding,
    profile: esProfile,
    swipe: esSwipe,
    matches: esMatches,
    chat: esChat,
    "raid-now": esRaidNow,
    "quest-help": esQuestHelp,
    settings: esSettings,
    admin: esAdmin,
    errors: esErrors,
    legal: esLegal,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    onboarding: enOnboarding,
    profile: enProfile,
    swipe: enSwipe,
    matches: enMatches,
    chat: enChat,
    "raid-now": enRaidNow,
    "quest-help": enQuestHelp,
    settings: enSettings,
    admin: enAdmin,
    errors: enErrors,
    legal: enLegal,
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

export function getNamespaceMessages(locale: Locale, namespace: Namespace) {
  return getMessages(locale)[namespace] ?? messages[DEFAULT_LOCALE][namespace];
}
