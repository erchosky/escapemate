# Internationalization plan

## Scope of phase 1

This phase only adds the i18n foundation for Spanish and English. It does not migrate the full UI and does not change stored values, Supabase enums, RLS, SQL functions, auth behavior, queries, or URLs.

Spanish (`es`) is the default locale and fallback.

## Runtime model

- Supported locales live in `src/lib/i18n/config.ts`.
- Message files live in `src/i18n/messages/{locale}/{namespace}.json`.
- Namespaces are:
  - `common`
  - `auth`
  - `onboarding`
  - `profile`
  - `swipe`
  - `matches`
  - `chat`
  - `raid-now`
  - `quest-help`
  - `settings`
  - `admin`
  - `errors`
  - `legal`
- The selected locale is persisted in the `escapemate_locale` cookie.
- The cookie is intentionally non-sensitive and readable by the browser. It avoids Supabase reads for language preference.
- `src/lib/i18n/server.ts` exposes server helpers for future Server Component migration.
- `src/components/app/language-selector.tsx` is a reusable Client Component for landing, login, legal pages, and AppShell.
- `src/components/app/i18n-provider.tsx` exposes `I18nProvider` and `useTranslations(namespace)` for interactive Client Components.

## Cookie and caching decisions

The selector receives `initialLocale` from the server render, writes the locale cookie from the client, and calls `router.refresh()`. This keeps URLs unchanged, avoids a route handler or server action for a non-sensitive preference, and prevents a first-render Spanish-to-English flicker when the cookie is already set to English.

`RootLayout` calls `getLocale()`, and `getLocale()` reads `cookies()` through `next/headers`. Because this happens in the root layout, the app tree is request/cookie dependent. This is intentional for now so the first server render, the `<html lang>` attribute, and mounted language selectors agree with the selected locale without a Supabase read.

Pages migrated to i18n read the locale cookie during server render and keep Spanish as the fallback when a key is missing.

## Client Components

Interactive components must not import locale JSON files directly. A Server Component should select the namespaces needed by that subtree and pass them to `I18nProvider`.

Example:

```tsx
import { I18nProvider } from "@/components/app/i18n-provider";
import { getI18nPayload, getLocale } from "@/lib/i18n/server";

export default async function Page() {
  const locale = await getLocale();
  const i18n = await getI18nPayload(["common", "onboarding"], locale);

  return (
    <I18nProvider {...i18n}>
      <InteractiveOnboardingForm />
    </I18nProvider>
  );
}
```

Inside the Client Component:

```tsx
"use client";

import { useTranslations } from "@/components/app/i18n-provider";

export function InteractiveOnboardingForm() {
  const t = useTranslations("onboarding");

  return <label>{t("form.nickname")}</label>;
}
```

Variables use the existing `{{variable}}` syntax:

```tsx
const t = useTranslations("onboarding");
t("welcome", { name: "PMC" });
```

`getI18nPayload()` sends only the requested namespaces to the browser and always includes the Spanish fallback for those namespaces. If the current locale is missing a key, `useTranslations()` resolves the Spanish key. If both locales are missing it, the key string is returned to make missing translations visible during development.

No Supabase read is used for i18n. Locale selection is a public cookie preference, not account data, so the server can render the correct language without querying auth or profiles.

## Interface Locale vs Profile Language

The interface locale is stored only in the `escapemate_locale` cookie and controls UI text.

The profile `language` field is different: it represents the player's main communication language for matching. The profile language and `spoken_languages` continue to be stored in Supabase and must not be used as the source of truth for the UI locale.

## Auth error codes

Login errors are represented by stable codes only:

- `discord_oauth_failed`
- `auth_unknown_error`

Auth actions and the OAuth callback redirect with `?error=<code>` and never place translated sentences or Supabase error messages in the URL. `src/lib/auth-errors.ts` contains the allowlist and compatibility resolver for the previous Spanish message. `src/app/login/page.tsx` resolves the query value to an allowed code and renders `auth.errors.<code>`. Unknown values resolve to `auth_unknown_error`.

Internal details continue to go through `logActionError`; the UI receives only the code.

## Profile and Settings Feedback Codes

Onboarding/profile/settings actions also redirect with stable codes:

- `profile.invalidFields`
- `profile.invalidPrimaryLanguage`
- `profile.rateLimited`
- `profile.saved`
- `settings.invalidTarkovUrl`
- `settings.invalidStats`
- `settings.syncFailed`
- `settings.rateLimited`
- `settings.statsSaved`
- `settings.syncCompleted`
- `action.generic`

`src/lib/action-feedback.ts` contains allowlists and compatibility mappings for old URLs that may still contain legacy Spanish messages or older success values such as `success=stats`.

Pages resolve codes through `errors.json`. Unknown error values resolve to `action.generic`; unknown success values are ignored.

## Stable Values and Label Keys

Options that are stored or validated by Supabase keep their current `value`. Only the visible label is translated through `labelKey`.

Example:

```ts
{
  value: "Misiones",
  labelKey: "options.objectives.misiones"
}
```

Forms must submit `value`, not translated labels:

```tsx
<option value={option.value}>{t(option.labelKey)}</option>
```

This preserves existing data, SQL enums, RPCs, and validation schemas. It also lets existing values remain selected because comparisons still use stored values such as `"Misiones"` or `"ES"`.

Phase 3 adds compatible descriptors in `src/lib/i18n/options.ts` for:

- regions;
- languages;
- maps;
- play styles;
- objectives;
- schedules.

Phase 4 applies these descriptors in Profile, Matches badges, and Swipe. These modules still submit and compare stored values such as `"Misiones"`, `"Mañana"`, `"EU"` or `"ES"`; only the rendered labels are translated.

Phase 5 applies the same model in Raid Now and Quest Help. It also adds descriptors for:

- quest help request types;
- quest help statuses.

To add a new option:

1. Add the stored value to the existing constants if it is a real data value.
2. Add matching translation keys in `profile.json` for both `es` and `en`.
3. Keep form `value` equal to the stored value.
4. Use `labelKey` only for display.

## Date Formatting

Use `src/lib/i18n/format.ts` for localized dates. Current mapping:

- `es` -> `es-ES`
- `en` -> `en-US`

Settings uses this helper for `last_synced_at`. Numeric form values remain raw technical values in inputs; presentation should be localized only where a formatted display is needed.

## Chat and Match Text

Chat message bodies and user bios are user-generated content and are never translated. The UI around them is translated:

- connection state;
- empty state;
- placeholders;
- load-more actions;
- send button;
- error codes.

Chat server actions return stable codes:

- `chat.invalidMessage`
- `chat.loadFailed`
- `chat.sendFailed`
- `chat.rateLimited`
- `action.generic`

`src/lib/action-feedback.ts` resolves unknown chat errors to `action.generic`; the UI renders those codes through `errors.json`.

## Raid Now and Quest Help Feedback Codes

Raid Now actions redirect with stable codes only:

- `raidNow.invalidFields`
- `raidNow.invalidMap`
- `raidNow.activePostExists`
- `raidNow.rateLimited`
- `raidNow.created`
- `raidNow.closed`
- `action.generic`

Quest Help actions redirect with stable codes only:

- `questHelp.invalidFields`
- `questHelp.invalidMap`
- `questHelp.incompatibleMap`
- `questHelp.rmtNotAllowed`
- `questHelp.rateLimited`
- `questHelp.created`
- `questHelp.closed`
- `action.generic`

`src/lib/action-feedback.ts` contains allowlists and temporary mappings for old Spanish query-string messages. Unknown errors resolve to `action.generic`; unknown success values are ignored. Supabase and tarkov.dev error details stay in internal logs through `logActionError`.

## Quest Catalogs

Quest names are resolved by `quest_id` before falling back to stored `quest_name`.

Static catalogs live in:

- `public/data/tarkov/quests.es.json`
- `public/data/tarkov/quests.en.json`

Each entry contains:

```json
{
  "id": "5936d90786f7742b1420ba5b",
  "name": "Debut",
  "trader": "Prapor",
  "map": null,
  "requirements": ["Disparando Latas"]
}
```

The browser fetches only the active locale catalog through `/data/tarkov/quests.<locale>.json`, so both languages are not loaded at once. These JSON files are public static assets and do not use Supabase. If `quest_id` is unknown or missing, the UI renders the stored `quest_name` snapshot. Manual quest names written by users are not translated.

Run:

```bash
npm run tarkov:sync
npm run tarkov:sync -- --check
```

The sync script:

- fetches tasks from tarkov.dev GraphQL with `lang: es` and `lang: en`;
- generates both static catalogs;
- compares IDs between languages;
- reports new, changed and removed quests compared with the checked-in catalogs;
- reports potentially missing translations when localized names match the fallback language;
- exits non-zero for severe inconsistencies such as ID mismatches, or when `--check` detects catalog drift.

Current known limitation: tarkov.dev currently returned 9 potentially untranslated quest names per language during the phase 5 sync. These are not invented or machine-translated; `quest_name` remains the fallback.

## Quest Help Schedule Debt

Historically, Quest Help appended schedule into free text as `Horario: ...`. Phase 5 stops generating new descriptions with localized schedule text embedded. Existing posts that already contain `Horario:` remain visible as historical user/content text.

There is no structured schedule column on `quest_help_posts`. Since v1.1 the Quest Help form no longer shows a schedule field at all (it was collected but never stored). Add a column first if schedules come back.

## Compatibility Reasons

Phase 4 introduces a transitional frontend normalizer in `src/lib/compatibility.ts`.

Current state:

- `get_swipe_candidates` still returns Spanish phrases in `compatibility_reasons` and `compatibility_warnings`.
- SQL and migrations are intentionally unchanged in this phase.
- The UI must not use Spanish phrases as business logic.

The normalizer maps known current phrases to stable codes, for example:

- `Habla tu idioma` -> `compat.language.speaksYourLanguage`
- `También habla inglés` -> `compat.language.sharedEnglish`
- `Misma región EU` -> `compat.region.same` with `{ region: "EU" }`
- `Horario de noche compatible` -> `compat.schedule.shared` with `{ schedule: "Noche" }`
- `Ambos buscáis misiones` -> `compat.objective.sharedQuests`
- `Coincidís en Customs` -> `compat.map.shared` with `{ map: "Customs" }`
- `Diferencia grande de experiencia` -> `compat.warning.largeExperienceGap`

Dynamic params are rendered through existing option descriptors where possible. For example, `{ language: "ES" }` displays as `Español` in Spanish and `Spanish` in English.

Since v1.1 `tests/unit/features.test.mjs` extracts every phrase from `get_swipe_candidates` in `supabase/schema.sql` and fails if one has no code or no ES/EN translation, so new SQL reasons cannot silently fall back.

Unknown legacy phrases are logged in development as `[i18n] Unknown compatibility text` without sensitive data. Unknown reasons render with `compat.unknown.reason`; unknown warnings render with `compat.unknown.warning`. In English this avoids leaking old Spanish UI text. The original phrase is kept only as a temporary `fallbackText` for debugging/future migration.

Future SQL work should make the RPC return codes and params directly, then remove the phrase normalizer after a compatibility window.

## Scope of phase 2

Phase 2 migrates only these surfaces:

- AppShell and the main navigation.
- Section loading skeleton text.
- Landing page.
- Login page.
- Privacy page.
- Terms page.
- General metadata in `src/app/layout.tsx`.
- `public/manifest.webmanifest` default description.
- Language selector text.

The app still does not implement `/es` or `/en` routes. General metadata remains Spanish-first and the manifest is a static Spanish default. Locale-specific Open Graph, Twitter metadata, dynamic web manifests, and per-locale canonical URLs are intentionally deferred until URL-based locale routing is introduced.

## Adding translations

Add the same key to both locale files:

```json
{
  "example": "Hola {{name}}"
}
```

The matching English file must preserve variables:

```json
{
  "example": "Hello {{name}}"
}
```

Run:

```bash
npm run i18n:check
```

The check validates:

- missing namespaces;
- invalid JSON;
- missing keys in `es` or `en`;
- empty string values;
- variable mismatches such as `{{name}}`.

## Future migration rules

- Do not use translated labels as identifiers.
- Keep stored values stable and translate labels at render time.
- Keep Spanish as fallback for missing runtime data.
- Prefer server-side translation for Server Components and client-side translation only where interactivity requires it.
- Do not translate database enum values in-place in this first phase.

## Proposal: remaining server errors as codes

Current state:

- Auth login errors already use stable codes.
- Profile onboarding, profile language settings, and Tarkov stats settings already use stable codes.
- Admin and some generic/moderation paths may still return or redirect with Spanish text.
- Some pages map raw strings such as `invalid_map`, `invalid`, and `ACTION_ERROR`.

Proposed model:

1. Define stable error codes in `src/lib/errors/codes.ts`, for example:
   - `action.generic`
   - `action.rateLimited`
   - `profile.invalidFields`
   - `raidNow.invalidMap`
   - `questHelp.incompatibleMap`
2. Server actions return or redirect with codes only.
3. UI resolves codes through `errors.json`.
4. Logs keep internal operation names and sanitized metadata; UI never receives SQL messages.

Compatibility:

- Keep accepting current Spanish strings and legacy codes during transition.
- Add a small `resolveErrorCode(input)` helper that maps old values to new codes.

## Proposal: SQL compatibility reasons as translatable codes

Current state:

- `get_swipe_candidates` returns Spanish phrases in `compatibility_reasons` and `compatibility_warnings`.
- Phase 4 normalizes those phrases on the frontend as a temporary compatibility layer.

Proposed model:

1. Add new RPC output columns in a future migration:
   - `compatibility_reason_codes text[]`
   - `compatibility_warning_codes text[]`
   - optional `compatibility_reason_params jsonb`
2. Keep existing Spanish text columns during transition.
3. Example codes:
   - `compat.language.speaksYourLanguage`
   - `compat.language.sharedEnglish`
   - `compat.region.same`
   - `compat.schedule.weekends`
   - `compat.style.sherpaNewPlayer`
4. UI renders codes through `swipe.json` or a future `compatibility.json` namespace.

Compatibility:

- If SQL codes are missing, normalize the existing Spanish phrases through `src/lib/compatibility.ts`.
- Do not parse Spanish phrases inside UI components as business logic.

## Proposal: stable select values + label keys

Current state:

- Some visible values are stored directly as enum/string labels:
  - objectives;
  - schedules;
  - play styles;
  - quest help types;
  - statuses.
- `src/lib/i18n/options.ts` already provides descriptors for regions, languages, maps, play styles, objectives, schedules, quest help request types and quest help statuses.
- Implemented usage: Onboarding, Settings, Profile badges/details, Swipe, Raid Now and Quest Help.
- Admin (reports page) is translated through the `admin` namespace and renders report reasons through `options.reportReasons` since v1.1.

Proposed model:

1. Keep current stored values for now.
2. Continue using option descriptors:

```ts
{
  value: "Misiones",
  labelKey: "options.objectives.misiones"
}
```

3. Forms submit `value`.
4. UI displays `labelKey`.
5. Finish applying descriptors to Admin.
6. Future database migration can move from Spanish values to stable slugs only after compatibility views/mappers exist.

Compatibility:

- Existing data remains valid.
- Never store translated labels as new identifiers.

## Quest names by quest_id

Current state:

- `quest_help_posts` stores `quest_id` and `quest_name`.
- `quest_name` is a snapshot/fallback.
- Phase 5 resolves visible names from static ES/EN catalogs by `quest_id`.

Implemented model:

1. Keep `quest_name` as fallback snapshot.
2. When `quest_id` exists, resolve display metadata from `public/data/tarkov/quests.<locale>.json`.
3. Fetch only the active locale catalog in the browser.
4. If catalog fetch fails or `quest_id` is unknown, render the stored `quest_name`.

Compatibility:

- No migration was needed in phase 5.
- Existing posts continue to display correctly.
