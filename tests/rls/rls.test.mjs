import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error(
    "NO EJECUTADO: define SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY para ejecutar tests RLS.",
  );
  process.exit(1);
}

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function createUser(label) {
  const email = `rls-${label}-${randomUUID()}@example.test`;
  const password = `Rls-${randomUUID()}!`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  assert.ok(data.user?.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);

  return { id: data.user.id, email, password, client };
}

async function seedProfile(id, nickname) {
  const { error } = await service.from("profiles").upsert({
    id,
    nickname,
    region: "EU",
    language: "ES",
    spoken_languages: ["ES", "EN"],
    approximate_level: 20,
    favorite_maps: ["Customs"],
    play_styles: ["Chill"],
    objectives: ["Misiones"],
    schedule: ["Noche"],
    onboarding_complete: true,
  });
  assert.ifError(error);

  assert.ifError((await service.from("profile_contacts").upsert({
    profile_id: id,
    discord_username: `${nickname}#0001`,
    discord_id: `discord-${id}`,
  })).error);
}

async function expectEmpty(promise, message) {
  const { data, error } = await promise;
  assert.ifError(error);
  assert.equal((data ?? []).length, 0, message);
}

const users = [];

try {
  const a = await createUser("a");
  const b = await createUser("b");
  const c = await createUser("c");
  const admin = await createUser("admin");
  users.push(a, b, c, admin);

  await seedProfile(a.id, "RlsA");
  await seedProfile(b.id, "RlsB");
  await seedProfile(c.id, "RlsC");
  await seedProfile(admin.id, "RlsAdmin");

  assert.ifError((await service.from("user_roles").insert({ user_id: admin.id, role: "admin" })).error);
  assert.ifError((await service.from("profile_tarkov_stats").upsert({
    user_id: b.id,
    tarkov_profile_url: "https://players.tarkov.dev/profile/2421869.json",
    tarkov_player_id: "2421869",
    stats_json: { private: true },
    level: 30,
    is_public: true,
  })).error);

  await expectEmpty(
    a.client.from("profile_contacts").select("discord_username").eq("profile_id", b.id),
    "A must not read B contact before match",
  );

  const ab = await service.from("matches").insert({ profile_one: a.id < b.id ? a.id : b.id, profile_two: a.id < b.id ? b.id : a.id }).select("id").single();
  assert.ifError(ab.error);
  const bc = await service.from("matches").insert({ profile_one: b.id < c.id ? b.id : c.id, profile_two: b.id < c.id ? c.id : b.id }).select("id").single();
  assert.ifError(bc.error);

  const contactAfterMatch = await a.client.from("profile_contacts").select("discord_username").eq("profile_id", b.id);
  assert.ifError(contactAfterMatch.error);
  assert.equal(contactAfterMatch.data?.length, 1, "A must read B contact after match");

  assert.ifError((await service.from("messages").insert([
    { match_id: bc.data.id, sender_id: b.id, body: "B-C private" },
    ...Array.from({ length: 20 }, (_, index) => ({ match_id: ab.data.id, sender_id: a.id, body: `A-B ${index}` })),
  ])).error);

  await expectEmpty(a.client.from("messages").select("body").eq("match_id", bc.data.id), "A must not read B-C messages");

  const forbiddenMessage = await a.client.from("messages").insert({ match_id: bc.data.id, sender_id: a.id, body: "intrusion" });
  assert.ok(forbiddenMessage.error, "A must not insert in B-C match");

  const report = await a.client.from("reports").insert({ reporter_id: a.id, reported_id: b.id, reason: "unsafe_behavior" }).select("id").single();
  assert.ifError(report.error);
  await expectEmpty(c.client.from("reports").select("id").eq("id", report.data.id), "C must not read A report");
  assert.ok((await c.client.from("reports").update({ status: "reviewed" }).eq("id", report.data.id)).error, "C must not update report");

  await expectEmpty(a.client.from("user_roles").select("role"), "A must not read user_roles");
  await expectEmpty(a.client.from("profile_tarkov_stats").select("stats_json,tarkov_player_id").eq("user_id", b.id), "A must not read B private stats");

  assert.ok((await a.client.from("raid_now_posts").insert({
    profile_id: b.id,
    map: "Customs",
    objective: "Misiones",
    players_needed: 2,
    language: "ES",
    region: "EU",
    style: "Chill",
  })).error, "A must not create Raid Now as B");

  assert.ok((await a.client.from("quest_help_posts").insert({
    user_id: b.id,
    quest_name: "The Extortionist",
    map: "Customs",
    region: "EU",
    language: "ES",
    request_type: "Necesito ayuda",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })).error, "A must not create Quest Help as B");

  const ownRaid = await a.client.from("raid_now_posts").insert({
    profile_id: a.id,
    map: "Customs",
    objective: "Misiones",
    players_needed: 2,
    language: "ES",
    region: "EU",
    style: "Chill",
  }).select("id").single();
  assert.ifError(ownRaid.error);

  for (const patch of [
    { notes: "edited" },
    { map: "Factory" },
    { objective: "PvP" },
    { language: "EN" },
    { region: "NA" },
    { expires_at: new Date(Date.now() + 7200_000).toISOString() },
    { closed_at: new Date().toISOString() },
  ]) {
    assert.ok(
      (await a.client.from("raid_now_posts").update(patch).eq("id", ownRaid.data.id)).error,
      `direct Raid Now update must fail for ${Object.keys(patch).join(",")}`,
    );
  }

  assert.ok(
    (await b.client.rpc("close_raid_now_post", { post_id: ownRaid.data.id })).error,
    "B must not close A Raid Now post",
  );
  assert.ifError((await a.client.rpc("close_raid_now_post", { post_id: ownRaid.data.id })).error);
  assert.ok((await a.client.rpc("close_raid_now_post", { post_id: ownRaid.data.id })).error, "closed Raid Now post must not reopen or close twice");

  const ownQuest = await a.client.from("quest_help_posts").insert({
    user_id: a.id,
    quest_name: "The Extortionist",
    map: "Customs",
    region: "EU",
    language: "ES",
    request_type: "Necesito ayuda",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  }).select("id").single();
  assert.ifError(ownQuest.error);

  for (const patch of [
    { description: "edited" },
    { quest_name: "Debut" },
    { quest_id: randomUUID() },
    { map: "Factory" },
    { language: "EN" },
    { region: "NA" },
    { expires_at: new Date(Date.now() + 7200_000).toISOString() },
    { status: "Cerrada" },
  ]) {
    assert.ok(
      (await a.client.from("quest_help_posts").update(patch).eq("id", ownQuest.data.id)).error,
      `direct Quest Help update must fail for ${Object.keys(patch).join(",")}`,
    );
  }

  assert.ok(
    (await b.client.rpc("close_quest_help_post", { post_id: ownQuest.data.id })).error,
    "B must not close A Quest Help post",
  );
  assert.ifError((await a.client.rpc("close_quest_help_post", { post_id: ownQuest.data.id })).error);
  assert.ok((await a.client.rpc("close_quest_help_post", { post_id: ownQuest.data.id })).error, "closed Quest Help post must not reopen or close twice");

  const avatarBucket = a.client.storage.from("avatars");
  assert.ok(
    (await avatarBucket.upload(`${a.id}/nested/avatar.png`, new Blob(["x"], { type: "image/png" }), { contentType: "image/png" })).error,
    "avatar storage must reject nested paths",
  );
  assert.ok(
    (await avatarBucket.upload(`${b.id}/avatar.png`, new Blob(["x"], { type: "image/png" }), { contentType: "image/png" })).error,
    "avatar storage must reject another user's path",
  );
  assert.ok(
    (await avatarBucket.upload(`${a.id}/profile.png`, new Blob(["x"], { type: "image/png" }), { contentType: "image/png" })).error,
    "avatar storage must reject non-canonical filenames",
  );
  assert.ok(
    (await avatarBucket.upload(`${a.id}/avatar.txt`, new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" })).error,
    "avatar storage must reject non-image MIME types",
  );
  assert.ok(
    (await avatarBucket.upload(`${a.id}/avatar.png`, new Uint8Array(5 * 1024 * 1024 + 1), { contentType: "image/png" })).error,
    "avatar storage must reject files above 5MB",
  );

  assert.ok((await a.client.from("blocks").insert({ blocker_id: b.id, blocked_id: c.id })).error, "A must not block as B");
  assert.ok((await a.client.from("reports").insert({ reporter_id: b.id, reported_id: c.id, reason: "fake" })).error, "A must not report as B");
  assert.ok((await a.client.from("user_roles").insert({ user_id: a.id, role: "admin" })).error, "A must not self-assign admin");

  const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
  assert.ok((await anonymous.from("profile_contacts").select("discord_username")).error, "anonymous must not read private contacts");

  const invalidKey = await a.client.rpc("check_rate_limit", {
    p_key: `spam:${a.id}:${randomUUID()}`,
    p_limit: 9999,
    p_window_seconds: 9999,
  });
  assert.ifError(invalidKey.error);
  assert.equal(Array.isArray(invalidKey.data) ? invalidKey.data[0]?.allowed : invalidKey.data?.allowed, false);

  for (let index = 0; index < 11; index += 1) {
    await a.client.rpc("check_rate_limit", {
      p_key: `message:${a.id}:${ab.data.id}`,
      p_limit: 10,
      p_window_seconds: 60,
    });
  }
  const limited = await a.client.rpc("check_rate_limit", {
    p_key: `message:${a.id}:${ab.data.id}`,
    p_limit: 10,
    p_window_seconds: 60,
  });
  assert.equal(Array.isArray(limited.data) ? limited.data[0]?.allowed : limited.data?.allowed, false);

  assert.ifError((await a.client.from("blocks").insert({ blocker_id: a.id, blocked_id: b.id })).error);
  await expectEmpty(a.client.from("matches").select("id").eq("id", ab.data.id), "blocked users must lose match visibility");
  await expectEmpty(a.client.from("messages").select("id").eq("match_id", ab.data.id), "blocked users must lose message visibility");

  console.log("RLS integration tests passed.");
} finally {
  await Promise.allSettled(users.map((user) => service.auth.admin.deleteUser(user.id)));
}
