import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { validateI18n } from "../../scripts/i18n-check.mjs";
import { diffCatalog } from "../../scripts/tarkov-sync.mjs";

const nodeRequire = createRequire(import.meta.url);

function loadTsModule(filePath, requireMap = {}, compilerOptions = {}) {
  const source = readFileSync(filePath, "utf8");
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, ...compilerOptions },
  }).outputText;
  const cjsModule = { exports: {} };
  const sandbox = {
    exports: cjsModule.exports,
    module: cjsModule,
    process,
    require: (id) => {
      if (id in requireMap) return requireMap[id];
      return nodeRequire(id);
    },
  };
  vm.runInNewContext(outputText, sandbox);
  return sandbox.module.exports;
}

const config = loadTsModule("src/lib/i18n/config.ts");
const cookie = loadTsModule("src/lib/i18n/cookie.ts", {
  "@/lib/i18n/config": config,
});
const translate = loadTsModule("src/lib/i18n/translate.ts");
const authErrors = loadTsModule("src/lib/auth-errors.ts");
const constants = loadTsModule("src/lib/constants.ts");
const options = loadTsModule("src/lib/i18n/options.ts", {
  "@/lib/constants": constants,
});
const actionFeedback = loadTsModule("src/lib/action-feedback.ts");
const format = loadTsModule("src/lib/i18n/format.ts");
const compatibility = loadTsModule("src/lib/compatibility.ts", {
  "@/lib/i18n/options": options,
});
const questCatalog = loadTsModule("src/lib/tarkov/quest-catalog.ts");

test("Spanish is the initial locale when no cookie exists", () => {
  assert.equal(config.DEFAULT_LOCALE, "es");
  assert.equal(cookie.parseLocaleCookie(undefined), "es");
  assert.equal(cookie.parseLocaleCookie("other=value"), "es");
});

test("escapemate_locale=en cookie activates English", () => {
  assert.equal(cookie.parseLocaleCookie("theme=dark; escapemate_locale=en"), "en");
});

function loadClientI18nModules({ cookieLocale = "en", writes = [] } = {}) {
  const React = nodeRequire("react");
  const client = {
    readBrowserLocaleCookie: () => cookieLocale,
    writeBrowserLocaleCookie: (locale) => writes.push(cookie.serializeLocaleCookie(locale)),
  };
  const provider = loadTsModule(
    "src/components/app/i18n-provider.tsx",
    {
      react: React,
      "@/lib/i18n/translate": translate,
    },
    { jsx: ts.JsxEmit.ReactJSX },
  );
  const selector = loadTsModule(
    "src/components/app/language-selector.tsx",
    {
      react: React,
      "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
      "@/lib/i18n/config": config,
      "@/lib/i18n/client": client,
      "@/components/app/i18n-provider": provider,
      "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    },
    { jsx: ts.JsxEmit.ReactJSX },
  );

  return { React, provider, selector };
}

test("language selector writes Spanish, English, and refreshes on change", () => {
  const writes = [];
  const { selector } = loadClientI18nModules({ writes });
  const selected = [];
  let refreshCount = 0;

  selector.applyLocaleSelection("es", (locale) => selected.push(locale), () => {
    refreshCount += 1;
  });
  selector.applyLocaleSelection("en", (locale) => selected.push(locale), () => {
    refreshCount += 1;
  });

  assert.deepEqual(selected, ["es", "en"]);
  assert.match(writes[0], /escapemate_locale=es/);
  assert.match(writes[1], /escapemate_locale=en/);
  assert.equal(refreshCount, 2);
  assert.match(cookie.serializeLocaleCookie("en"), /SameSite=Lax/);
});

test('initialLocale="en" renders the selector in English initially', () => {
  const { renderToStaticMarkup } = nodeRequire("react-dom/server");
  const esCommon = JSON.parse(readFileSync("src/i18n/messages/es/common.json", "utf8"));
  const enCommon = JSON.parse(readFileSync("src/i18n/messages/en/common.json", "utf8"));
  const { React, provider, selector } = loadClientI18nModules();
  const markup = renderToStaticMarkup(
    React.createElement(
      provider.I18nProvider,
      { locale: "en", messages: { common: enCommon }, fallbackMessages: { common: esCommon } },
      React.createElement(selector.LanguageSelector, { initialLocale: "en" }),
    ),
  );

  assert.match(markup, /Language/);
  assert.match(markup, /Select language/);
});

test("auth error codes resolve to translated messages and unknown errors use the generic code", () => {
  const esAuth = JSON.parse(readFileSync("src/i18n/messages/es/auth.json", "utf8"));
  const authT = translate.createTranslator(esAuth, esAuth);

  assert.equal(authErrors.resolveAuthErrorCode("discord_oauth_failed"), "discord_oauth_failed");
  assert.equal(authT(`errors.${authErrors.resolveAuthErrorCode("discord_oauth_failed")}`), "No se pudo iniciar sesión con Discord. Inténtalo de nuevo.");
  assert.equal(authErrors.resolveAuthErrorCode("valor_arbitrario"), "auth_unknown_error");
  assert.equal(authT(`errors.${authErrors.resolveAuthErrorCode("valor_arbitrario")}`), "No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
  assert.equal(authErrors.resolveAuthErrorCode("No se pudo iniciar sesión con Discord."), "discord_oauth_failed");
});

test("client i18n hook loads the requested namespace, falls back to Spanish, and interpolates", () => {
  const { renderToStaticMarkup } = nodeRequire("react-dom/server");
  const { React, provider } = loadClientI18nModules();

  function OnboardingProbe() {
    const t = provider.useTranslations("onboarding");
    return React.createElement(
      "span",
      null,
      `${t("welcome", { name: "PMC" })}|${t("fallbackOnly")}`,
    );
  }

  const markup = renderToStaticMarkup(
    React.createElement(
      provider.I18nProvider,
      {
        locale: "en",
        messages: { onboarding: { welcome: "Welcome {{name}}" } },
        fallbackMessages: { onboarding: { welcome: "Bienvenido {{name}}", fallbackOnly: "Solo en español" } },
      },
      React.createElement(OnboardingProbe),
    ),
  );

  assert.match(markup, /Welcome PMC\|Solo en español/);
});

test("onboarding translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/onboarding.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/onboarding.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("title"), "Configura tu perfil de raid");
  assert.equal(translate.createTranslator(en, es)("title"), "Set up your raid profile");
  assert.equal(translate.createTranslator(en, es)("fields.bioPlaceholder"), "What you are looking for, how you play, and what you expect from a squad.");
});

test("settings translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/settings.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/settings.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("title"), "Ajustes");
  assert.equal(translate.createTranslator(en, es)("title"), "Settings");
  assert.equal(translate.createTranslator(en, es)("tarkov.notSynced"), "Not synced");
});

test("public profile translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/profile.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/profile.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("publicProfile"), "Perfil público");
  assert.equal(translate.createTranslator(en, es)("publicProfile"), "Public profile");
  assert.equal(translate.createTranslator(en, es)("speaks", { language: "Spanish" }), "Speaks Spanish");
});

test("matches translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/matches.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/matches.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("emptyTitle"), "Todavía no hay matches");
  assert.equal(translate.createTranslator(en, es)("emptyTitle"), "No matches yet");
  assert.equal(translate.createTranslator(en, es)("openChat"), "Open chat");
});

test("chat translations and error codes render in Spanish and English", () => {
  const esChat = JSON.parse(readFileSync("src/i18n/messages/es/chat.json", "utf8"));
  const enChat = JSON.parse(readFileSync("src/i18n/messages/en/chat.json", "utf8"));
  const esErrors = JSON.parse(readFileSync("src/i18n/messages/es/errors.json", "utf8"));
  const enErrors = JSON.parse(readFileSync("src/i18n/messages/en/errors.json", "utf8"));

  assert.equal(translate.createTranslator(esChat, esChat)("loadOlder"), "Cargar mensajes anteriores");
  assert.equal(translate.createTranslator(enChat, esChat)("loadOlder"), "Load older messages");
  assert.equal(translate.createTranslator(esErrors, esErrors)(actionFeedback.resolveChatErrorCode("chat.sendFailed")), "No se pudo enviar el mensaje.");
  assert.equal(translate.createTranslator(enErrors, esErrors)(actionFeedback.resolveChatErrorCode("unknown")), "The action could not be completed. Try again.");
});

test("swipe translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/swipe.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/swipe.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("title"), "Compatibilidad de raid");
  assert.equal(translate.createTranslator(en, es)("title"), "Raid compatibility");
  assert.equal(translate.createTranslator(en, es)("profilesCount", { count: 3 }), "3 profiles");
  assert.equal(translate.createTranslator(en, es)("matchTitle"), "It's a match!");
  assert.equal(translate.createTranslator(es, es)("undoNamed", { nickname: "Kilo" }), "Recuperar a Kilo");
});

test("raid now translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/raid-now.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/raid-now.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("title"), "Busco grupo para raid ahora");
  assert.equal(translate.createTranslator(en, es)("title"), "Looking for Raid Now");
  assert.equal(translate.createTranslator(en, es)("filters.clear"), "Clear filters");
});

test("quest help translations render in Spanish and English", () => {
  const es = JSON.parse(readFileSync("src/i18n/messages/es/quest-help.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/messages/en/quest-help.json", "utf8"));

  assert.equal(translate.createTranslator(es, es)("title"), "Ayuda con misiones");
  assert.equal(translate.createTranslator(en, es)("title"), "Quest Help");
  assert.equal(translate.createTranslator(en, es)("questInfo.requirements", { requirements: "Debut" }), "Requirements: Debut");
});

test("translated options keep stored values and select existing values", () => {
  const enProfile = JSON.parse(readFileSync("src/i18n/messages/en/profile.json", "utf8"));
  const profileT = translate.createTranslator(enProfile, enProfile);
  const questOption = options.OBJECTIVE_OPTIONS.find((item) => item.value === "Misiones");
  const languageOption = options.LANGUAGE_OPTIONS.find((item) => item.value === "ES");

  assert.equal(questOption.value, "Misiones");
  assert.equal(profileT(questOption.labelKey), "Quests");
  assert.equal(languageOption.value, "ES");
  assert.equal(profileT(languageOption.labelKey), "Spanish");
  assert.equal(options.isOptionSelected("Misiones", ["Misiones"]), true);
  assert.equal(options.isOptionSelected("Quests", ["Misiones"]), false);
});

test("raid now and quest help options keep stored values with English labels", () => {
  const enProfile = JSON.parse(readFileSync("src/i18n/messages/en/profile.json", "utf8"));
  const profileT = translate.createTranslator(enProfile, enProfile);
  const typeOption = options.QUEST_HELP_TYPE_OPTIONS.find((item) => item.value === "Necesito ayuda");
  const statusOption = options.QUEST_HELP_STATUS_LABEL_OPTIONS.find((item) => item.value === "Activa");

  assert.equal(typeOption.value, "Necesito ayuda");
  assert.equal(profileT(typeOption.labelKey), "Need help");
  assert.equal(statusOption.value, "Activa");
  assert.equal(profileT(statusOption.labelKey), "Active");
  assert.equal(options.isOptionSelected("Necesito ayuda", ["Necesito ayuda"]), true);
  assert.equal(options.isOptionSelected("Need help", ["Necesito ayuda"]), false);
});

test("raid now and quest help feedback codes translate and unknown errors fall back", () => {
  const esErrors = JSON.parse(readFileSync("src/i18n/messages/es/errors.json", "utf8"));
  const enErrors = JSON.parse(readFileSync("src/i18n/messages/en/errors.json", "utf8"));
  const esT = translate.createTranslator(esErrors, esErrors);
  const enT = translate.createTranslator(enErrors, esErrors);

  assert.equal(esT(actionFeedback.resolveRaidNowErrorCode("raidNow.activePostExists")), "Ya tienes una búsqueda activa.");
  assert.equal(enT(actionFeedback.resolveRaidNowSuccessCode("raidNow.created")), "Search published.");
  assert.equal(esT(actionFeedback.resolveQuestHelpErrorCode("questHelp.incompatibleMap")), "El mapa no es compatible con la quest seleccionada.");
  assert.equal(enT(actionFeedback.resolveQuestHelpErrorCode("unknown")), "The action could not be completed. Try again.");
  assert.equal(actionFeedback.resolveRaidNowErrorCode("Selecciona un mapa válido."), "raidNow.invalidMap");
  assert.equal(actionFeedback.resolveQuestHelpErrorCode("No permitimos RMT ni pagos externos."), "questHelp.rmtNotAllowed");
});

test("quest catalog resolves localized names by quest_id and falls back to quest_name", () => {
  const esCatalog = JSON.parse(readFileSync("public/data/tarkov/quests.es.json", "utf8"));
  const enCatalog = JSON.parse(readFileSync("public/data/tarkov/quests.en.json", "utf8"));
  const first = esCatalog[0];
  const enMatch = enCatalog.find((entry) => entry.id === first.id);

  assert.equal(questCatalog.resolveQuestName(esCatalog, first.id, "Fallback"), first.name);
  assert.equal(questCatalog.resolveQuestName(enCatalog, first.id, "Fallback"), enMatch.name);
  assert.equal(questCatalog.resolveQuestName(esCatalog, "missing-id", "Manual quest"), "Manual quest");
  assert.equal(questCatalog.questCatalogPath("en"), "/data/tarkov/quests.en.json");
});

test("tarkov sync diff detects new and modified quests", () => {
  const existing = [{ id: "1", name: "Old", trader: "Prapor", map: "Customs", requirements: [] }];
  const next = [
    { id: "1", name: "Changed", trader: "Prapor", map: "Customs", requirements: [] },
    { id: "2", name: "New", trader: "Therapist", map: null, requirements: [] },
  ];
  const diff = diffCatalog(existing, next);

  assert.equal(diff.newQuests.length, 1);
  assert.equal(diff.changedQuests.length, 1);
  assert.equal(diff.removedQuests.length, 0);
});

test("profile and swipe options use stable stored values with localized labels", () => {
  const enProfile = JSON.parse(readFileSync("src/i18n/messages/en/profile.json", "utf8"));
  const profileT = translate.createTranslator(enProfile, enProfile);
  const scheduleOption = options.SCHEDULE_OPTIONS.find((item) => item.value === "Mañana");
  const mapOption = options.MAP_OPTIONS.find((item) => item.value === "The Lab");

  assert.equal(scheduleOption.value, "Mañana");
  assert.equal(profileT(scheduleOption.labelKey), "Morning");
  assert.equal(mapOption.value, "The Lab");
  assert.equal(profileT(mapOption.labelKey), "The Lab");
});

test("compatibility phrases normalize to stable translatable codes", () => {
  const enSwipe = JSON.parse(readFileSync("src/i18n/messages/en/swipe.json", "utf8"));
  const enProfile = JSON.parse(readFileSync("src/i18n/messages/en/profile.json", "utf8"));
  const swipeT = translate.createTranslator(enSwipe, enSwipe);
  const profileT = translate.createTranslator(enProfile, enProfile);
  const speaks = compatibility.normalizeCompatibilityReason("Habla español");
  const sameRegion = compatibility.normalizeCompatibilityReason("Misma región EU");
  const warning = compatibility.normalizeCompatibilityWarning("Diferencia grande de experiencia");

  assert.equal(speaks.code, "compat.language.speaks");
  assert.equal(speaks.params.language, "ES");
  assert.equal(swipeT(speaks.code, { language: profileT(compatibility.compatibilityParamToLabelKey("language", "ES")) }), "Speaks Spanish");
  assert.equal(sameRegion.code, "compat.region.same");
  assert.equal(warning.code, "compat.warning.largeExperienceGap");
  assert.equal(swipeT(warning.code), "Large experience gap");
});

test("compatibility codes from the database keep their parameters", () => {
  const enSwipe = JSON.parse(readFileSync("src/i18n/messages/en/swipe.json", "utf8"));
  const swipeT = translate.createTranslator(enSwipe, enSwipe);
  const region = compatibility.normalizeCompatibilityReason("compat.region.same:region=EU");
  const objective = compatibility.normalizeCompatibilityReason("compat.objective.shared:objective=Loot runs");
  const warning = compatibility.normalizeCompatibilityWarning("compat.warning.poorSchedule");

  assert.equal(region.code, "compat.region.same");
  assert.equal(region.params.region, "EU");
  assert.equal(objective.params.objective, "Loot runs");
  assert.equal(warning.code, "compat.warning.poorSchedule");
  assert.notEqual(swipeT(warning.code), warning.code);
});

test("legacy Spanish phrases and new codes produce the same result", () => {
  const pairs = [
    ["Misma región EU", "compat.region.same:region=EU"],
    ["Coincidís en Customs", "compat.map.shared:map=Customs"],
    ["Habla tu idioma", "compat.language.speaksYourLanguage"],
  ];
  for (const [legacy, coded] of pairs) {
    assert.equal(
      JSON.stringify(compatibility.normalizeCompatibilityReason(legacy)),
      JSON.stringify(compatibility.normalizeCompatibilityReason(coded)),
    );
  }
});

test("unknown compatibility phrases use safe generic codes", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const unknown = compatibility.normalizeCompatibilityReason("Motivo antiguo no catalogado");
  const unknownWarning = compatibility.normalizeCompatibilityWarning("Aviso antiguo no catalogado");
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }

  assert.equal(unknown.code, "compat.unknown.reason");
  assert.equal(unknown.fallbackText, "Motivo antiguo no catalogado");
  assert.equal(unknownWarning.code, "compat.unknown.warning");
});

test("swipe component does not use Spanish compatibility phrases as logic", () => {
  const source = readFileSync("src/components/app/swipe-deck.tsx", "utf8");

  assert.doesNotMatch(source, /startsWith\(["']Habla/);
  assert.doesNotMatch(source, /includes\(["']Habla/);
  assert.doesNotMatch(source, /Misma región|No compartís|Coincidís|Ambos buscáis/);
});

test("profile and settings feedback codes translate and unknown errors fall back", () => {
  const esErrors = JSON.parse(readFileSync("src/i18n/messages/es/errors.json", "utf8"));
  const enErrors = JSON.parse(readFileSync("src/i18n/messages/en/errors.json", "utf8"));
  const esT = translate.createTranslator(esErrors, esErrors);
  const enT = translate.createTranslator(enErrors, esErrors);

  assert.equal(esT(actionFeedback.resolveProfileErrorCode("profile.invalidFields")), "Completa los campos obligatorios.");
  assert.equal(esT(actionFeedback.resolveProfileErrorCode("legacy-value")), "No se pudo completar la acción. Inténtalo de nuevo.");
  assert.equal(enT(actionFeedback.resolveSettingsErrorCode("settings.syncFailed")), "Could not sync with tarkov.dev. Your current stats were not changed.");
  assert.equal(enT(actionFeedback.resolveSettingsSuccessCode("settings.syncCompleted")), "Stats synced from tarkov.dev.");
});

test("settings dates use the active locale", () => {
  const iso = "2026-06-11T10:30:00.000Z";

  assert.equal(format.dateTimeLocale("es"), "es-ES");
  assert.equal(format.dateTimeLocale("en"), "en-US");
  assert.match(format.formatDateTime(iso, "es"), /2026|11/);
  assert.match(format.formatDateTime(iso, "en"), /2026|Jun|June/);
});

test("missing English keys use Spanish fallback", () => {
  const t = translate.createTranslator({ present: "English" }, { present: "Español", missing: "Texto español" });

  assert.equal(t("present"), "English");
  assert.equal(t("missing"), "Texto español");
});

test("translation variables are interpolated", () => {
  const t = translate.createTranslator({ greeting: "Hola {{name}}, nivel {{level}}" });

  assert.equal(t("greeting", { name: "PMC", level: 42 }), "Hola PMC, nivel 42");
});

test("i18n check detects missing keys and inconsistent variables", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "escapemate-i18n-"));

  try {
    mkdirSync(join(tempDir, "es"), { recursive: true });
    mkdirSync(join(tempDir, "en"), { recursive: true });
    writeFileSync(join(tempDir, "es", "common.json"), JSON.stringify({ hello: "Hola {{name}}", onlyEs: "Solo ES" }));
    writeFileSync(join(tempDir, "en", "common.json"), JSON.stringify({ hello: "Hello {{user}}" }));

    const errors = validateI18n({ baseDir: tempDir, locales: ["es", "en"], namespaces: ["common"] });

    assert(errors.some((error) => error.includes("Missing English key: common.onlyEs")));
    assert(errors.some((error) => error.includes("Variable mismatch at common.hello")));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
