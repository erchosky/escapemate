"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { settingsErrorRedirectPath, settingsSuccessRedirectPath } from "@/lib/action-feedback";
import type { ProfileTarkovStats } from "@/lib/constants";
import { isDemoBackend } from "@/lib/demo/mode";
import { DEMO_USER_ID } from "@/lib/demo/seed";
import { getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { getPlayerByUrl, parseTarkovPlayerUrl } from "@/lib/tarkov/client";

const manualStatsSchema = z.object({
  tarkov_profile_url: optionalUrl(),
  level: optionalNumber(z.number().int().min(1).max(79)),
  survival_rate: optionalNumber(z.number().min(0).max(100)),
  kd: optionalNumber(z.number().min(0).max(999)),
  raids: optionalNumber(z.number().int().min(0)),
  hours: optionalNumber(z.number().int().min(0)),
  pmc_kills: optionalNumber(z.number().int().min(0)),
  is_public: z.boolean().default(true),
});

function optionalNumber(schema: z.ZodType<number>) {
  return z.preprocess((value) => {
    if (value === "" || value == null) return undefined;
    return Number(value);
  }, schema.optional());
}

function optionalUrl() {
  return z.preprocess((value) => {
    if (value === "" || value == null) return undefined;
    return value;
  }, z.string().trim().url().optional());
}

export async function syncTarkovStats(formData: FormData) {
  const demo = isDemoBackend();
  const supabase = demo ? null : await createClient();
  const user = supabase ? await getSessionUser(supabase) : { id: DEMO_USER_ID };

  if (!user) redirect("/login");

  if (supabase) {
    const rateLimit = await checkPersistentRateLimit(supabase, {
      key: `tarkov-sync:${user.id}`,
      limit: 8,
      windowMs: 60 * 60_000,
    });

    if (!rateLimit.ok) {
      redirect(settingsErrorRedirectPath("settings.rateLimited"));
    }
  }

  const parsed = manualStatsSchema.safeParse({
    tarkov_profile_url: formData.get("tarkov_profile_url"),
    level: formData.get("level") ?? "",
    survival_rate: formData.get("survival_rate") ?? "",
    kd: formData.get("kd") ?? "",
    raids: formData.get("raids") ?? "",
    hours: formData.get("hours") ?? "",
    pmc_kills: formData.get("pmc_kills") ?? "",
    is_public: formData.get("is_public") === "on",
  });

  if (!parsed.success) {
    redirect(settingsErrorRedirectPath("settings.invalidStats"));
  }

  const parsedUrl = parsed.data.tarkov_profile_url ? parseTarkovPlayerUrl(parsed.data.tarkov_profile_url) : null;
  if (parsed.data.tarkov_profile_url && !parsedUrl) {
    redirect(settingsErrorRedirectPath("settings.invalidTarkovUrl"));
  }

  const intent = formData.get("intent") === "sync" ? "sync" : "manual";
  if (intent === "sync" && !parsedUrl) {
    redirect(settingsErrorRedirectPath("settings.invalidTarkovUrl"));
  }

  const remoteStats = intent === "sync" && parsedUrl ? await getPlayerByUrl(parsedUrl.url) : null;
  if (intent === "sync" && parsedUrl && !remoteStats) {
    redirect(settingsErrorRedirectPath("settings.syncFailed"));
  }

  const now = new Date().toISOString();
  const source = remoteStats ? "tarkov.dev" : parsedUrl ? "manual_fallback" : "manual";

  const record = {
    user_id: user.id,
    tarkov_profile_url: parsedUrl?.url ?? null,
    tarkov_player_id: parsedUrl?.playerId ?? null,
    profile_mode: parsedUrl?.mode ?? null,
    stats_json: remoteStats ?? { source },
    level: remoteStats?.level ?? parsed.data.level ?? null,
    survival_rate: remoteStats?.survival_rate ?? parsed.data.survival_rate ?? null,
    kd: remoteStats?.kd ?? parsed.data.kd ?? null,
    raids: remoteStats?.raids ?? parsed.data.raids ?? null,
    hours: remoteStats?.hours ?? parsed.data.hours ?? null,
    pmc_kills: remoteStats?.pmc_kills ?? parsed.data.pmc_kills ?? null,
    last_synced_at: now,
    is_public: parsed.data.is_public,
  };

  if (!supabase) {
    const state = await getDemoState();
    state.stats = { ...(state.stats ?? {}), ...record } as ProfileTarkovStats;
    redirect(settingsSuccessRedirectPath(remoteStats ? "settings.syncCompleted" : "settings.statsSaved"));
  }

  const { error } = await supabase.from("profile_tarkov_stats").upsert(record);

  if (error) {
    logActionError("syncTarkovStats", error);
    redirect(settingsErrorRedirectPath("action.generic"));
  }

  revalidatePath("/settings");
  revalidatePath("/swipe");
  redirect(settingsSuccessRedirectPath(remoteStats ? "settings.syncCompleted" : "settings.statsSaved"));
}
