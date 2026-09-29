export const PROFILE_ERROR_CODES = ["profile.invalidFields", "profile.invalidPrimaryLanguage", "profile.rateLimited", "action.generic"] as const;
export const SETTINGS_ERROR_CODES = [
  "profile.invalidPrimaryLanguage",
  "settings.avatarInvalid",
  "settings.avatarUnavailable",
  "settings.deleteConfirmMismatch",
  "settings.invalidTarkovUrl",
  "settings.invalidStats",
  "settings.syncFailed",
  "settings.rateLimited",
  "action.generic",
] as const;
export const SETTINGS_SUCCESS_CODES = ["profile.saved", "settings.statsSaved", "settings.syncCompleted", "settings.avatarSaved"] as const;
export const SWIPE_ERROR_CODES = ["swipe.saveFailed", "swipe.rateLimited"] as const;
export const RESPONSE_ERROR_CODES = ["responses.failed", "responses.duplicate", "responses.rateLimited"] as const;
export const RESPONSE_SUCCESS_CODES = ["responses.sent", "responses.declined"] as const;
export const CHAT_ERROR_CODES = ["chat.invalidMessage", "chat.loadFailed", "chat.sendFailed", "chat.rateLimited", "action.generic"] as const;
export const RAID_NOW_ERROR_CODES = [
  "raidNow.invalidFields",
  "raidNow.invalidMap",
  "raidNow.activePostExists",
  "raidNow.rateLimited",
  ...RESPONSE_ERROR_CODES,
  "action.generic",
] as const;
export const RAID_NOW_SUCCESS_CODES = ["raidNow.created", "raidNow.closed", ...RESPONSE_SUCCESS_CODES] as const;
export const QUEST_HELP_ERROR_CODES = [
  "questHelp.invalidFields",
  "questHelp.invalidMap",
  "questHelp.incompatibleMap",
  "questHelp.rmtNotAllowed",
  "questHelp.rateLimited",
  ...RESPONSE_ERROR_CODES,
  "action.generic",
] as const;
export const QUEST_HELP_SUCCESS_CODES = ["questHelp.created", "questHelp.closed", ...RESPONSE_SUCCESS_CODES] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];
export type SettingsErrorCode = (typeof SETTINGS_ERROR_CODES)[number];
export type SettingsSuccessCode = (typeof SETTINGS_SUCCESS_CODES)[number];
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];
export type RaidNowErrorCode = (typeof RAID_NOW_ERROR_CODES)[number];
export type RaidNowSuccessCode = (typeof RAID_NOW_SUCCESS_CODES)[number];
export type QuestHelpErrorCode = (typeof QUEST_HELP_ERROR_CODES)[number];
export type QuestHelpSuccessCode = (typeof QUEST_HELP_SUCCESS_CODES)[number];
export type SwipeErrorCode = (typeof SWIPE_ERROR_CODES)[number];
export type ResponseErrorCode = (typeof RESPONSE_ERROR_CODES)[number];
export type ResponseSuccessCode = (typeof RESPONSE_SUCCESS_CODES)[number];

const LEGACY_PROFILE_ERRORS: Record<string, ProfileErrorCode> = {
  "Has hecho demasiados intentos. Espera un momento.": "profile.rateLimited",
  "Completa los campos obligatorios.": "profile.invalidFields",
  "Selecciona un idioma principal y al menos un idioma hablado.": "profile.invalidPrimaryLanguage",
  "Has hecho demasiados cambios seguidos. Espera un momento.": "profile.rateLimited",
};

const LEGACY_SETTINGS_ERRORS: Record<string, SettingsErrorCode> = {
  "El enlace de tarkov.dev o las stats no son válidos.": "settings.invalidStats",
  "El enlace debe ser de tarkov.dev o players.tarkov.dev.": "settings.invalidTarkovUrl",
  "Pega una URL de perfil tarkov.dev para sincronizar.": "settings.invalidTarkovUrl",
  "No se pudo sincronizar con tarkov.dev. Tus stats actuales no se han modificado.": "settings.syncFailed",
  "No se pudo completar la acción. Inténtalo de nuevo.": "action.generic",
  "Has hecho demasiadas acciones seguidas. Espera un momento.": "settings.rateLimited",
};

const LEGACY_SETTINGS_SUCCESS: Record<string, SettingsSuccessCode> = {
  languages: "profile.saved",
  stats: "settings.statsSaved",
};

const LEGACY_RAID_NOW_ERRORS: Record<string, RaidNowErrorCode> = {
  invalid: "action.generic",
  invalid_map: "raidNow.invalidMap",
  ACTION_ERROR: "action.generic",
  "Revisa los campos de la búsqueda.": "raidNow.invalidFields",
  "Selecciona un mapa válido.": "raidNow.invalidMap",
  "Ya tienes una búsqueda activa.": "raidNow.activePostExists",
  "Has hecho demasiadas acciones seguidas. Espera un momento.": "raidNow.rateLimited",
  "No se pudo completar la acción. Inténtalo de nuevo.": "action.generic",
};

const LEGACY_QUEST_HELP_ERRORS: Record<string, QuestHelpErrorCode> = {
  invalid: "action.generic",
  invalid_map: "questHelp.invalidMap",
  ACTION_ERROR: "action.generic",
  "Revisa los campos de la solicitud.": "questHelp.invalidFields",
  "No permitimos RMT ni pagos externos.": "questHelp.rmtNotAllowed",
  "Selecciona un mapa válido.": "questHelp.invalidMap",
  "El mapa no es compatible con la quest seleccionada.": "questHelp.incompatibleMap",
  "Has hecho demasiadas acciones seguidas. Espera un momento.": "questHelp.rateLimited",
  "No se pudo completar la acción. Inténtalo de nuevo.": "action.generic",
};

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function resolveProfileErrorCode(value: string | undefined | null): ProfileErrorCode | null {
  if (!value) return null;
  if (includes(PROFILE_ERROR_CODES, value)) return value;
  return LEGACY_PROFILE_ERRORS[value] ?? "action.generic";
}

export function resolveSettingsErrorCode(value: string | undefined | null): SettingsErrorCode | null {
  if (!value) return null;
  if (includes(SETTINGS_ERROR_CODES, value)) return value;
  return LEGACY_SETTINGS_ERRORS[value] ?? "action.generic";
}

export function resolveSettingsSuccessCode(value: string | undefined | null): SettingsSuccessCode | null {
  if (!value) return null;
  if (includes(SETTINGS_SUCCESS_CODES, value)) return value;
  return LEGACY_SETTINGS_SUCCESS[value] ?? null;
}

export function onboardingErrorRedirectPath(code: ProfileErrorCode) {
  return `/onboarding?error=${code}`;
}

export function settingsErrorRedirectPath(code: SettingsErrorCode) {
  return `/settings?error=${code}`;
}

export function settingsSuccessRedirectPath(code: SettingsSuccessCode) {
  return `/settings?success=${code}`;
}

export function resolveChatErrorCode(value: string | undefined | null): ChatErrorCode {
  if (!value) return "action.generic";
  if (includes(CHAT_ERROR_CODES, value)) return value;
  return "action.generic";
}

export function resolveRaidNowErrorCode(value: string | undefined | null): RaidNowErrorCode | null {
  if (!value) return null;
  if (includes(RAID_NOW_ERROR_CODES, value)) return value;
  return LEGACY_RAID_NOW_ERRORS[value] ?? "action.generic";
}

export function resolveRaidNowSuccessCode(value: string | undefined | null): RaidNowSuccessCode | null {
  if (!value) return null;
  if (includes(RAID_NOW_SUCCESS_CODES, value)) return value;
  return null;
}

export function resolveQuestHelpErrorCode(value: string | undefined | null): QuestHelpErrorCode | null {
  if (!value) return null;
  if (includes(QUEST_HELP_ERROR_CODES, value)) return value;
  return LEGACY_QUEST_HELP_ERRORS[value] ?? "action.generic";
}

export function resolveQuestHelpSuccessCode(value: string | undefined | null): QuestHelpSuccessCode | null {
  if (!value) return null;
  if (includes(QUEST_HELP_SUCCESS_CODES, value)) return value;
  return null;
}

export function raidNowErrorRedirectPath(code: RaidNowErrorCode) {
  return `/raid-now?error=${code}`;
}

export function raidNowSuccessRedirectPath(code: RaidNowSuccessCode) {
  return `/raid-now?success=${code}`;
}

export function questHelpErrorRedirectPath(code: QuestHelpErrorCode) {
  return `/quest-help?error=${code}`;
}

export function questHelpSuccessRedirectPath(code: QuestHelpSuccessCode) {
  return `/quest-help?success=${code}`;
}
