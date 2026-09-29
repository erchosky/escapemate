"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  GAME_MODES,
  LANGUAGES,
  normalizeMapName,
  PLAY_STYLES,
  QUEST_HELP_TYPES,
  REGIONS,
} from "@/lib/constants";
import {
  questHelpErrorRedirectPath,
  questHelpSuccessRedirectPath,
  type QuestHelpErrorCode,
} from "@/lib/action-feedback";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoCloseQuestPost, demoCreateQuestPost, getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { getTaskById, getTaskByName } from "@/lib/tarkov/client";
import { containsForbiddenTradeText } from "@/lib/moderation/text";

const questHelpSchema = z.object({
  quest_id: z.string().trim().max(80).optional(),
  quest_name: z.string().trim().min(2).max(120),
  map: z.string().trim().min(2).max(80),
  region: z.enum(REGIONS),
  language: z.enum(LANGUAGES),
  playstyle: z.enum(PLAY_STYLES).optional(),
  game_mode: z.enum(GAME_MODES).default("PvP"),
  request_type: z.enum(QUEST_HELP_TYPES),
  description: z.string().trim().max(500).optional(),
});

export async function createQuestHelpPost(formData: FormData) {
  const parsed = questHelpSchema.safeParse({
    quest_id: formData.get("quest_id") || undefined,
    quest_name: formData.get("quest_name"),
    map: formData.get("map"),
    region: formData.get("region"),
    language: formData.get("language"),
    playstyle: formData.get("playstyle") || undefined,
    game_mode: formData.get("game_mode") || undefined,
    request_type: formData.get("request_type"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirect(questHelpErrorRedirectPath("questHelp.invalidFields"));
  }

  const description = parsed.data.description ?? "";
  if (containsForbiddenTradeText(`${parsed.data.quest_name} ${description}`)) {
    redirect(questHelpErrorRedirectPath("questHelp.rmtNotAllowed"));
  }

  const map = normalizeMapName(parsed.data.map);
  if (!map) redirect(questHelpErrorRedirectPath("questHelp.invalidMap"));

  const task = parsed.data.quest_id
    ? await getTaskById(parsed.data.quest_id)
    : await getTaskByName(parsed.data.quest_name);
  if (task) {
    const compatibleMaps = new Set<string>();
    if (task.map?.name) {
      const normalized = normalizeMapName(task.map.name);
      if (normalized) compatibleMaps.add(normalized);
    }
    task.objectives?.forEach((objective) => {
      objective.maps.forEach((objectiveMap) => {
        const normalized = normalizeMapName(objectiveMap.name);
        if (normalized) compatibleMaps.add(normalized);
      });
    });

    if (compatibleMaps.size > 0 && !compatibleMaps.has(map)) {
      redirect(questHelpErrorRedirectPath("questHelp.incompatibleMap"));
    }
  }

  const post = {
    quest_id: parsed.data.quest_id || null,
    quest_name: parsed.data.quest_name,
    map,
    region: parsed.data.region,
    language: parsed.data.language,
    playstyle: parsed.data.playstyle ?? null,
    game_mode: parsed.data.game_mode,
    request_type: parsed.data.request_type,
    description: description || null,
  };

  if (isDemoBackend()) {
    demoCreateQuestPost(await getDemoState(), post);
    redirect(questHelpSuccessRedirectPath("questHelp.created"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `quest-help:create:${user.id}`,
    limit: 10,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) redirect(questHelpErrorRedirectPath("questHelp.rateLimited"));

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("quest_help_posts").insert({
    user_id: user.id,
    ...post,
    expires_at: expiresAt,
  });

  if (error) {
    logActionError("createQuestHelpPost", error);
    redirect(questHelpErrorRedirectPath("action.generic"));
  }

  revalidatePath("/quest-help");
  redirect(questHelpSuccessRedirectPath("questHelp.created"));
}

export async function closeQuestHelpPost(formData: FormData) {
  const id = uuidSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) redirect(questHelpErrorRedirectPath("action.generic" satisfies QuestHelpErrorCode));

  if (isDemoBackend()) {
    const closed = demoCloseQuestPost(await getDemoState(), id.data);
    redirect(closed ? questHelpSuccessRedirectPath("questHelp.closed") : questHelpErrorRedirectPath("action.generic"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `quest-help:close:${user.id}`,
    limit: 30,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) redirect(questHelpErrorRedirectPath("questHelp.rateLimited"));

  const { error } = await supabase.rpc("close_quest_help_post", {
    post_id: id.data,
  });

  if (error) {
    logActionError("closeQuestHelpPost", error);
    redirect(questHelpErrorRedirectPath("action.generic"));
  }
  revalidatePath("/quest-help");
  redirect(questHelpSuccessRedirectPath("questHelp.closed"));
}
