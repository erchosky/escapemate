import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as nodeCrypto from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);

function loadTsModule(filePath, requireMap = {}, globals = {}) {
  const outputText = ts.transpileModule(readFileSync(filePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    process,
    Intl,
    structuredClone,
    ...globals,
    require: (id) => (id in requireMap ? requireMap[id] : nodeRequire(id)),
  });
  return cjsModule.exports;
}

const constants = loadTsModule("src/lib/constants.ts");
const options = loadTsModule("src/lib/i18n/options.ts", { "@/lib/constants": constants });
const compatibility = loadTsModule("src/lib/compatibility.ts", { "@/lib/i18n/options": options });
const format = loadTsModule("src/lib/i18n/format.ts");
const translate = loadTsModule("src/lib/i18n/translate.ts");

function swipeCandidatesSql() {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const start = schema.indexOf("create or replace function public.get_swipe_candidates(");
  return schema.slice(start, schema.indexOf("\n$$;\n", start));
}

test("every compatibility text produced by get_swipe_candidates has a translation", () => {
  const sql = swipeCandidatesSql();
  // Literals followed by || are prefixes of concatenated texts, covered by the samples below.
  const literals = Array.from(sql.matchAll(/then '([^']+)'(?!\s*\|\|)/g), (match) => match[1]);
  const concatenated = [
    "compat.region.same:region=EU",
    "compat.objective.shared:objective=Loot runs",
    "compat.objective.compatible:objective=Misiones",
    "compat.map.shared:map=Customs",
  ];
  const warnings = new Set(Array.from(sql.slice(sql.indexOf("as compatibility_reasons")).matchAll(/then '([^']+)'(?!\s*\|\|)/g), (m) => m[1]));
  const catalogs = ["es", "en"].map((locale) => JSON.parse(readFileSync(`src/i18n/messages/${locale}/swipe.json`, "utf8")));

  assert.ok(literals.length >= 15, "expected to find the SQL reason/warning literals");
  for (const text of [...literals, ...concatenated]) {
    const kind = warnings.has(text) ? "warning" : "reason";
    const normalized = compatibility.normalizeCompatibilityText(text, kind);
    assert.doesNotMatch(normalized.code, /^compat\.unknown/, `no client mapping for SQL text "${text}"`);
    for (const catalog of catalogs) {
      assert.notEqual(translate.createTranslator(catalog)(normalized.code), normalized.code, `missing translation for ${normalized.code}`);
    }
  }
});

test("relative time reads naturally in Spanish and English", () => {
  const now = Date.parse("2026-09-25T10:00:00Z");
  assert.equal(format.formatRelativeTime("2026-09-25T09:55:00Z", "es", now), "hace 5 min");
  assert.equal(format.formatRelativeTime("2026-09-25T10:40:00Z", "es", now), "dentro de 40 min");
  assert.equal(format.formatRelativeTime("2026-09-25T09:59:40Z", "es", now), "ahora mismo");
  assert.equal(format.formatRelativeTime("2026-09-25T09:59:40Z", "en", now), "just now");
  assert.equal(format.formatRelativeTime("2026-09-25T07:00:00Z", "es", now), "hace 3 h");
});

test("map aliases cover the names used by the bundled quest catalog", () => {
  const catalog = JSON.parse(readFileSync("public/data/tarkov/quests.es.json", "utf8"));
  const unknown = [...new Set(catalog.map((quest) => quest.map).filter(Boolean))].filter((map) => !constants.normalizeMapName(map));
  assert.deepEqual(unknown, []);
});

function loadDemoStore(sessionId = "test-session") {
  const mode = loadTsModule("src/lib/demo/mode.ts");
  const seed = loadTsModule("src/lib/demo/seed.ts");
  const headers = { cookies: async () => ({ get: () => ({ value: sessionId }) }) };
  const store = loadTsModule(
    "src/lib/demo/store.ts",
    { "next/headers": headers, "@/lib/demo/mode": mode, "@/lib/demo/seed": seed, "node:crypto": nodeCrypto },
    { globalThis: {} },
  );
  return { store, seed };
}

test("demo backend: liking a player who liked you back opens a match; passing never does", async () => {
  const { store, seed } = loadDemoStore();
  const state = await store.getDemoState();
  const candidates = store.demoSwipeCandidates(state, 50);
  const fan = candidates.find((profile) => state.people.get(profile.id).likesYou);
  const stranger = candidates.find((profile) => !state.people.get(profile.id).likesYou);

  assert.equal(store.demoSwipe(state, stranger.id, "like").matched, false);
  assert.equal(store.demoSwipe(state, fan.id, "pass").matched, false);
  const liked = candidates.find((profile) => profile.id !== fan.id && state.people.get(profile.id).likesYou);
  const result = store.demoSwipe(state, liked.id, "like");
  assert.equal(result.matched, true);
  assert.ok(store.demoMatches(state).some((match) => match.id === result.matchId));
  assert.ok(!store.demoSwipeCandidates(state, 50).some((profile) => [stranger.id, fan.id, liked.id].includes(profile.id)));
  assert.ok(store.demoMatchDetail(state, result.matchId).otherProfile.discord_username, "Discord unlocks after the match");
  assert.equal(seed.DEMO_USER_ID, state.profile.id);
});

test("demo backend: PvE-only players never see PvP-only candidates", async () => {
  const { store } = loadDemoStore("pve-session");
  const state = await store.getDemoState();
  state.profile.game_modes = ["PvE"];
  const modes = store.demoSwipeCandidates(state, 50).map((profile) => profile.game_modes);
  assert.ok(modes.length > 0);
  assert.ok(modes.every((list) => list.includes("PvE")));
});

test("demo backend: raid posts allow one active post, collect a response and accepting opens a chat", async () => {
  const { store } = loadDemoStore("raid-session");
  const state = await store.getDemoState();
  const input = { map: "Woods", objective: "Misiones", players_needed: 2, language: "ES", region: "EU", style: "Chill", game_mode: "PvP" };

  assert.equal(store.demoCreateRaidPost(state, input), null);
  assert.equal(store.demoCreateRaidPost(state, input), "raidNow.activePostExists");
  assert.equal(store.demoBadges(state).raid_now_responses, 1);

  const mine = store.demoRaidPosts(state, {}).find((post) => post.profile_id === state.profile.id);
  const [response] = mine.responses;
  const decision = store.demoDecideResponse(state, "raid_now", response.id, true);
  assert.ok(decision.matchId);
  assert.equal(store.demoBadges(state).raid_now_responses, 0);
  assert.ok(store.demoMatchDetail(state, decision.matchId).messages.some((message) => message.body === response.message));

  assert.equal(store.demoCloseRaidPost(state, mine.id), true);
  assert.equal(store.demoCreateRaidPost(state, input), null, "closing frees the slot");
});

test("demo backend: responding to someone else's post is accepted once and blocks hide the player everywhere", async () => {
  const { store } = loadDemoStore("respond-session");
  const state = await store.getDemoState();
  const post = store.demoRaidPosts(state, {}).find((item) => item.profile_id !== state.profile.id);

  assert.equal(store.demoRespond(state, "raid_now", post.id, "Voy con comms"), null);
  assert.equal(store.demoRespond(state, "raid_now", post.id, "otra vez"), "responses.duplicate");
  const updated = store.demoRaidPosts(state, {}).find((item) => item.id === post.id);
  assert.equal(updated.myResponse.status, "accepted");

  assert.equal(store.demoBlock(state, post.profile_id), true);
  assert.ok(!store.demoRaidPosts(state, {}).some((item) => item.profile_id === post.profile_id));
  assert.ok(!store.demoMatches(state).some((match) => match.otherProfile.id === post.profile_id));
});

test("demo backend: sending a chat message returns it plus the scripted reply", async () => {
  const { store, seed } = loadDemoStore("chat-session");
  const state = await store.getDemoState();
  const sent = store.demoSendMessage(state, seed.DEMO_MATCH_ID, "¿Customs a las 22?");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].sender_id, seed.DEMO_USER_ID);
  assert.notEqual(sent[1].sender_id, seed.DEMO_USER_ID);
  assert.equal(store.demoSendMessage(state, "00000000-0000-4000-8000-00000000ffff", "hola"), null);
});

test("demo backend: full raid posts reject new requests and report their seats", async () => {
  const { store } = loadDemoStore("seats-session");
  const state = await store.getDemoState();
  const solo = store.demoRaidPosts(state, {}).find((post) => post.players_needed === 1);

  assert.equal(solo.accepted_count, 0);
  assert.equal(store.demoRespond(state, "raid_now", solo.id, "voy"), null);
  assert.equal(store.demoRaidPosts(state, {}).find((post) => post.id === solo.id).accepted_count, 1);

  state.responses = state.responses.filter((response) => response.responder_id !== state.profile.id || response.post_id !== solo.id);
  state.responses.push({ kind: "raid_now", id: "x", post_id: solo.id, responder_id: "someone", message: null, status: "accepted", match_id: null, created_at: new Date().toISOString() });
  assert.equal(store.demoRespond(state, "raid_now", solo.id, "otra"), "responses.failed");
});

test("demo backend: deleting the account starts over as a new player", async () => {
  const { store } = loadDemoStore("reset-session");
  await store.resetDemoState({ asNewPlayer: true });
  const state = await store.getDemoState();
  assert.equal(state.profile.onboarding_complete, false);
  assert.equal(state.profile.favorite_maps.length, 0);
  assert.equal(store.demoMatches(state).length, 0);
});

test("swipe candidates map public stats returned by the RPC", () => {
  const queries = readFileSync("src/lib/supabase/queries.ts", "utf8");
  assert.match(queries, /has_public_stats\s*\?/);
  assert.doesNotMatch(queries.slice(queries.indexOf("export async function getSwipeCandidates"), queries.indexOf("type RawCandidate")), /get_public_tarkov_stats/);
});
