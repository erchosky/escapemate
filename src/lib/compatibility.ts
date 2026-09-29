import {
  LANGUAGE_OPTIONS,
  MAP_OPTIONS,
  OBJECTIVE_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REGION_OPTIONS,
  SCHEDULE_OPTIONS,
  optionLabelKey,
} from "@/lib/i18n/options";

export type CompatibilityKind = "reason" | "warning";

export type NormalizedCompatibility = {
  code: string;
  params?: Record<string, string | number>;
  fallbackText?: string;
  kind: CompatibilityKind;
};

const languageWords: Record<string, string> = {
  español: "ES",
  espanol: "ES",
  inglés: "EN",
  ingles: "EN",
  francés: "FR",
  frances: "FR",
  alemán: "DE",
  aleman: "DE",
  portugués: "PT",
  portugues: "PT",
  ruso: "RU",
  italiano: "IT",
};

const objectiveWords: Record<string, string> = {
  misiones: "Misiones",
  aprender: "Aprender",
  pvp: "PvP",
  "loot runs": "Loot runs",
  "farmear dinero": "Farmear dinero",
  labs: "Labs",
  "boss hunting": "Boss hunting",
  "scav runs": "Scav runs",
  "night raids": "Night raids",
};

export function normalizeCompatibilityReason(reason: string): NormalizedCompatibility {
  return normalizeCompatibilityText(reason, "reason");
}

export function normalizeCompatibilityWarning(warning: string): NormalizedCompatibility {
  return normalizeCompatibilityText(warning, "warning");
}

/**
 * Formato que devuelve get_swipe_candidates desde la migración 20260930100000:
 * "compat.region.same:region=EU" (código y, opcionalmente, parámetros clave=valor separados por "&").
 */
function parseCompatibilityCode(value: string, kind: CompatibilityKind): NormalizedCompatibility | null {
  if (!value.startsWith("compat.")) return null;
  const separator = value.indexOf(":");
  const code = separator === -1 ? value : value.slice(0, separator);
  if (separator === -1) return { kind, code };

  const params: Record<string, string> = {};
  for (const pair of value.slice(separator + 1).split("&")) {
    const equals = pair.indexOf("=");
    if (equals > 0) params[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return { kind, code, params };
}

export function normalizeCompatibilityText(text: string, kind: CompatibilityKind): NormalizedCompatibility {
  const value = text.trim();
  const coded = parseCompatibilityCode(value, kind);
  if (coded) return coded;

  // Frases en español de bases de datos sin la migración de códigos (compatibilidad hacia atrás).
  const lower = value.toLowerCase();

  if (kind === "warning") {
    if (value === "No compartís idioma") return { kind, code: "compat.warning.noSharedLanguage" };
    if (value === "Región lejana") return { kind, code: "compat.warning.distantRegion" };
    if (value === "Horarios poco compatibles") return { kind, code: "compat.warning.poorSchedule" };
    if (value === "Diferencia grande de experiencia") return { kind, code: "compat.warning.largeExperienceGap" };
    if (value === "Ritmo de juego distinto") return { kind, code: "compat.warning.differentPace" };
    if (value === "Objetivos PvP y aprendizaje pueden chocar") return { kind, code: "compat.warning.pvpVsLearning" };
    if (value === "PvP con jugador nuevo puede ser duro") return { kind, code: "compat.warning.pvpWithNewPlayer" };
    return unknownCompatibility(value, kind);
  }

  if (value === "Habla tu idioma") return { kind, code: "compat.language.speaksYourLanguage" };
  if (value === "Ambos jugáis PvE") return { kind, code: "compat.gameMode.sharedPve" };
  if (value === "Compartís inglés") return { kind, code: "compat.language.sharedEnglish" };
  if (value === "También habla inglés") return { kind, code: "compat.language.sharedEnglish" };
  if (value === "Compartís idioma") return { kind, code: "compat.language.sharedLanguage" };
  if (value === "Región compatible") return { kind, code: "compat.region.compatible" };
  if (value === "Coincidís fines de semana") return { kind, code: "compat.schedule.sharedWeekends" };
  if (value === "Horario compatible") return { kind, code: "compat.schedule.compatible" };
  if (value === "Horario de fines de semana compatible") return { kind, code: "compat.schedule.sharedWeekends" };
  if (value === "Sherpa ideal para novato") return { kind, code: "compat.style.sherpaNewPlayer" };
  if (value === "Estilos parecidos") return { kind, code: "compat.style.similar" };
  if (value === "Veterano dispuesto a ayudar") return { kind, code: "compat.experience.veteranHelper" };
  if (value === "Experiencia parecida" || value === "Nivel parecido") return { kind, code: "compat.experience.similar" };

  const speaksLanguage = lower.match(/^habla (.+)$/);
  if (speaksLanguage) {
    const language = languageWords[speaksLanguage[1]];
    return language
      ? { kind, code: "compat.language.speaks", params: { language } }
      : { kind, code: "compat.language.speaks", params: { language: speaksLanguage[1] } };
  }

  const sameRegion = value.match(/^Misma región (.+)$/);
  if (sameRegion) return { kind, code: "compat.region.same", params: { region: sameRegion[1] } };

  const sharedWeekend = value.match(/^Horario de fines de semana compatible$/);
  if (sharedWeekend) return { kind, code: "compat.schedule.sharedWeekends" };

  const schedule = value.match(/^Horario de (.+) compatible$/);
  if (schedule) return { kind, code: "compat.schedule.shared", params: { schedule: schedule[1] } };

  if (value === "Ambos buscáis misiones") return { kind, code: "compat.objective.sharedQuests" };
  if (value === "Ambos vais a PvP") return { kind, code: "compat.objective.sharedPvp" };

  const sharedObjective = lower.match(/^ambos buscáis (.+)$/);
  if (sharedObjective) {
    const objective = objectiveWords[sharedObjective[1]] ?? sharedObjective[1];
    return { kind, code: "compat.objective.shared", params: { objective } };
  }

  const compatibleObjective = value.match(/^Objetivo compatible: (.+)$/);
  if (compatibleObjective) {
    return { kind, code: "compat.objective.compatible", params: { objective: compatibleObjective[1] } };
  }

  const sharedMap = value.match(/^Coincidís en (.+)$/);
  if (sharedMap) return { kind, code: "compat.map.shared", params: { map: sharedMap[1] } };

  const compatibleStyle = value.match(/^Estilo compatible: (.+)$/);
  if (compatibleStyle) return { kind, code: "compat.style.compatible", params: { style: compatibleStyle[1] } };

  return unknownCompatibility(value, kind);
}

function unknownCompatibility(text: string, kind: CompatibilityKind): NormalizedCompatibility {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[i18n] Unknown compatibility text", { kind, text });
  }

  return {
    kind,
    code: kind === "warning" ? "compat.unknown.warning" : "compat.unknown.reason",
    fallbackText: text,
  };
}

export function compatibilityParamToLabelKey(param: string, value: string) {
  if (param === "language") return optionLabelKey(LANGUAGE_OPTIONS, value);
  if (param === "region") return optionLabelKey(REGION_OPTIONS, value);
  if (param === "map") return optionLabelKey(MAP_OPTIONS, value);
  if (param === "objective") return optionLabelKey(OBJECTIVE_OPTIONS, value);
  if (param === "style") return optionLabelKey(PLAY_STYLE_OPTIONS, value);
  if (param === "schedule") return optionLabelKey(SCHEDULE_OPTIONS, value);
  return null;
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

// Compatibility copy lives in the "swipe" namespace; option labels inside params come from "profile".
export function translateCompatibility(swipeT: Translator, profileT: Translator, item: NormalizedCompatibility) {
  const params = Object.fromEntries(
    Object.entries(item.params ?? {}).map(([key, value]) => {
      if (typeof value !== "string") return [key, value];
      const labelKey = compatibilityParamToLabelKey(key, value);
      return [key, labelKey ? profileT(labelKey) : value];
    }),
  );

  return swipeT(item.code, params);
}
