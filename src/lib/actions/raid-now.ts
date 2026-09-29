"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  raidNowErrorRedirectPath,
  raidNowSuccessRedirectPath,
  type RaidNowErrorCode,
} from "@/lib/action-feedback";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoCloseRaidPost, demoCreateRaidPost, getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { GAME_MODES, LANGUAGES, normalizeMapName, OBJECTIVES, PLAY_STYLES, REGIONS } from "@/lib/constants";

const raidNowSchema = z.object({
  map: z.string().trim().min(2).max(80),
  objective: z.enum(OBJECTIVES),
  players_needed: z.coerce.number().int().min(1).max(4),
  language: z.enum(LANGUAGES),
  region: z.enum(REGIONS),
  style: z.enum(PLAY_STYLES),
  game_mode: z.enum(GAME_MODES).default("PvP"),
  notes: z.string().trim().max(180).optional(),
});

export async function createRaidNowPost(formData: FormData) {
  const parsed = raidNowSchema.safeParse({
    map: formData.get("map"),
    objective: formData.get("objective"),
    players_needed: formData.get("players_needed"),
    language: formData.get("language"),
    region: formData.get("region"),
    style: formData.get("style"),
    game_mode: formData.get("game_mode") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    redirect(raidNowErrorRedirectPath("raidNow.invalidFields"));
  }

  const map = normalizeMapName(parsed.data.map);
  if (!map) redirect(raidNowErrorRedirectPath("raidNow.invalidMap"));

  if (isDemoBackend()) {
    const error = demoCreateRaidPost(await getDemoState(), { ...parsed.data, map });
    redirect(error ? raidNowErrorRedirectPath(error) : raidNowSuccessRedirectPath("raidNow.created"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `raid-now:create:${user.id}`,
    limit: 6,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) {
    redirect(raidNowErrorRedirectPath("raidNow.rateLimited"));
  }

  // Expired posts are closed by a database trigger before the insert, so only live posts count here.
  const { count, error: activeCountError } = await supabase
    .from("raid_now_posts")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString());

  if (activeCountError) {
    logActionError("createRaidNowPost.activeCount", activeCountError);
    redirect(raidNowErrorRedirectPath("action.generic"));
  }

  if ((count ?? 0) >= 1) {
    redirect(raidNowErrorRedirectPath("raidNow.activePostExists"));
  }

  const { error } = await supabase.from("raid_now_posts").insert({
    profile_id: user.id,
    ...parsed.data,
    notes: parsed.data.notes || null,
    map,
    expires_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  });

  if (error) {
    logActionError("createRaidNowPost.insert", error);
    redirect(raidNowErrorRedirectPath(error.code === "23505" ? "raidNow.activePostExists" : "action.generic"));
  }

  revalidatePath("/raid-now");
  redirect(raidNowSuccessRedirectPath("raidNow.created"));
}

export async function closeRaidNowPost(formData: FormData) {
  const id = uuidSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    redirect(raidNowErrorRedirectPath("action.generic" satisfies RaidNowErrorCode));
  }

  if (isDemoBackend()) {
    const closed = demoCloseRaidPost(await getDemoState(), id.data);
    redirect(closed ? raidNowSuccessRedirectPath("raidNow.closed") : raidNowErrorRedirectPath("action.generic"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `raid-now:close:${user.id}`,
    limit: 30,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) {
    redirect(raidNowErrorRedirectPath("raidNow.rateLimited"));
  }

  const { error } = await supabase.rpc("close_raid_now_post", {
    post_id: id.data,
  });

  if (error) {
    logActionError("closeRaidNowPost", error);
    redirect(raidNowErrorRedirectPath("action.generic"));
  }
  revalidatePath("/raid-now");
  redirect(raidNowSuccessRedirectPath("raidNow.closed"));
}
