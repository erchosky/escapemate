import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const migration = readFileSync("supabase/migrations/20260611123000_final_beta_hardening.sql", "utf8");
const p0Migration = readFileSync("supabase/migrations/20260612010000_p0_beta_hardening.sql", "utf8");
const queries = readFileSync("src/lib/supabase/queries.ts", "utf8");
const moderationSource = readFileSync("src/lib/moderation/text.ts", "utf8");
const rateLimitSource = readFileSync("src/lib/rate-limit.ts", "utf8");
const oauthOriginSource = readFileSync("src/lib/oauth-origin.ts", "utf8");
const transpiledRateLimit = ts.transpileModule(rateLimitSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const rateLimitModule = { exports: {} };
const rateLimitSandbox = {
  exports: rateLimitModule.exports,
  module: rateLimitModule,
  process,
  require: (id) => {
    if (id === "@/lib/security") {
      return { logActionError() {} };
    }
    return nodeRequire(id);
  },
};
vm.runInNewContext(transpiledRateLimit, rateLimitSandbox);
const rateLimit = rateLimitModule.exports;
const transpiledOauthOrigin = ts.transpileModule(oauthOriginSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const oauthOriginModule = { exports: {} };
vm.runInNewContext(transpiledOauthOrigin, {
  exports: oauthOriginModule.exports,
  module: oauthOriginModule,
  process,
  require: nodeRequire,
  URL,
});
const oauthOrigin = oauthOriginModule.exports;
const transpiledModeration = ts.transpileModule(moderationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moderationSandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(transpiledModeration, moderationSandbox);
const moderationText = moderationSandbox.exports;

test("rate limit migration rejects arbitrary keys and manipulated limits", () => {
  assert.match(migration, /char_length\(p_key\) > 140/);
  assert.match(migration, /p_limit <> v_limit/);
  assert.match(migration, /p_window_seconds <> v_window_seconds/);
  assert.match(migration, /p_key = 'swipe:' \|\| v_uid/);
  assert.match(migration, /p_key = 'db:swipe:' \|\| v_uid/);
  assert.match(migration, /message-history:' \|\| v_uid/);
  assert.doesNotMatch(migration, /position\(auth\.uid\(\)::text in p_key\) = 0/);
});

test("security definer functions have explicit revoke and grants", () => {
  for (const fn of [
    "check_rate_limit",
    "touch_match_activity",
    "create_swipe",
    "get_app_badges",
    "get_public_tarkov_stats",
    "get_latest_match_messages",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn.replace("_", "_")}\\(`));
  }
});

test("match list reads the trigger-maintained summary instead of scanning messages", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");
  assert.match(schema, /last_message_preview = left\(new\.body, 140\)/);
  assert.match(queries, /last_message_preview/);
  assert.doesNotMatch(queries, /get_latest_match_messages/);
});

test("anti-RMT helper blocks payment contexts without blocking legitimate quest text", () => {
  assert.equal(moderationText.containsForbiddenTradeText("pago por carry con paypal"), true);
  assert.equal(moderationText.containsForbiddenTradeText("vendo rublos por bizum"), true);
  assert.equal(moderationText.containsForbiddenTradeText("necesito rublos para pagar el extracto de la quest"), false);
  assert.equal(moderationText.containsForbiddenTradeText("hacemos la misión y extraemos sin prisa"), false);
});

test("persistent rate limiter fails closed in production on RPC errors and malformed responses", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    for (const rpc of [
      async () => ({ data: null, error: { message: "rpc failed" } }),
      async () => { throw new Error("network failed"); },
      async () => ({ data: null, error: null }),
      async () => ({ data: { allowed: "yes" }, error: null }),
    ]) {
      const result = await rateLimit.checkPersistentRateLimit({ rpc }, { key: "message:user:match", limit: 10, windowMs: 60_000 });
      assert.equal(result.ok, false);
      assert.equal(result.remaining, 0);
    }
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("persistent rate limiter uses memory fallback outside production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  rateLimit.clearRateLimitBucketsForTests();

  try {
    const failingSupabase = { rpc: async () => ({ data: null, error: { message: "rpc failed" } }) };
    assert.equal((await rateLimit.checkPersistentRateLimit(failingSupabase, { key: "dev-rate", limit: 1, windowMs: 60_000 })).ok, true);
    assert.equal((await rateLimit.checkPersistentRateLimit(failingSupabase, { key: "dev-rate", limit: 1, windowMs: 60_000 })).ok, false);
  } finally {
    rateLimit.clearRateLimitBucketsForTests();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("OAuth canonical origin is required in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const previousAllowed = process.env.OAUTH_ALLOWED_ORIGINS;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.OAUTH_ALLOWED_ORIGINS;

    assert.throws(() => oauthOrigin.getCanonicalOrigin(), /NEXT_PUBLIC_SITE_URL is required/);
    assert.throws(() => oauthOrigin.getOAuthRedirectOrigin("https://preview.example.com"), /NEXT_PUBLIC_SITE_URL is required/);

    process.env.NEXT_PUBLIC_SITE_URL = "https://escapemate.example.com/app";
    assert.equal(oauthOrigin.getCanonicalOrigin(), "https://escapemate.example.com");
    assert.equal(oauthOrigin.getOAuthRedirectOrigin("https://evil.example.com"), "https://escapemate.example.com");
    assert.equal(oauthOrigin.assertAllowedOAuthOrigin("https://escapemate.example.com/auth/callback"), "https://escapemate.example.com");
    assert.throws(() => oauthOrigin.assertAllowedOAuthOrigin("https://evil.example.com"), /OAuth origin is not allowed/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    if (previousAllowed === undefined) delete process.env.OAUTH_ALLOWED_ORIGINS;
    else process.env.OAUTH_ALLOWED_ORIGINS = previousAllowed;
  }
});

test("raid now and quest help close through security definer RPCs only", () => {
  assert.match(p0Migration, /drop policy if exists "Users update own raid posts"/);
  assert.match(p0Migration, /drop policy if exists "Users update own quest help posts"/);
  assert.match(p0Migration, /create or replace function public\.close_raid_now_post\(post_id uuid\)/);
  assert.match(p0Migration, /create or replace function public\.close_quest_help_post\(post_id uuid\)/);
  assert.match(p0Migration, /set closed_at = coalesce\(closed_at, now\(\)\)/);
  assert.match(p0Migration, /set status = 'Cerrada'/);
  assert.doesNotMatch(p0Migration, /set .*map|set .*quest_name|set .*language|set .*region|set .*expires_at/);
});

test("avatar storage is constrained to canonical owner path and image types", () => {
  assert.match(p0Migration, /allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  assert.match(p0Migration, /file_size_limit = 5242880/);
  assert.match(p0Migration, /storage\.filename\(name\) ~ '\^avatar\\\.\(jpg\|jpeg\|png\|webp\)\$'/);
  assert.match(p0Migration, /create policy "Users delete own avatar"/);
});
