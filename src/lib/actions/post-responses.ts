"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ResponseErrorCode, ResponseSuccessCode } from "@/lib/action-feedback";
import type { PostKind } from "@/lib/constants";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoDecideResponse, demoRespond, getDemoState } from "@/lib/demo/store";
import { containsForbiddenTradeText } from "@/lib/moderation/text";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

const kindSchema = z.enum(["raid_now", "quest_help"]);

const respondSchema = z.object({
  kind: kindSchema,
  post_id: uuidSchema,
  message: z.string().trim().max(280).optional(),
});

const decideSchema = z.object({
  kind: kindSchema,
  response_id: uuidSchema,
  decision: z.enum(["accept", "decline"]),
});

const BOARD_PATH: Record<PostKind, string> = {
  raid_now: "/raid-now",
  quest_help: "/quest-help",
};

const TABLE: Record<PostKind, "raid_now_responses" | "quest_help_responses"> = {
  raid_now: "raid_now_responses",
  quest_help: "quest_help_responses",
};

function feedback(kind: PostKind, type: "error" | "success", code: ResponseErrorCode | ResponseSuccessCode): never {
  redirect(`${BOARD_PATH[kind]}?${type}=${code}`);
}

export async function respondToPost(formData: FormData) {
  const parsed = respondSchema.safeParse({
    kind: formData.get("kind"),
    post_id: formData.get("post_id"),
    message: String(formData.get("message") ?? "") || undefined,
  });

  if (!parsed.success) {
    const kind = kindSchema.safeParse(formData.get("kind"));
    feedback(kind.success ? kind.data : "raid_now", "error", "responses.failed");
  }

  const { kind, post_id: postId } = parsed.data;
  const message = parsed.data.message || null;

  if (message && containsForbiddenTradeText(message)) {
    feedback(kind, "error", "responses.failed");
  }

  if (isDemoBackend()) {
    const error = demoRespond(await getDemoState(), kind, postId, message);
    if (error) feedback(kind, "error", error);
    feedback(kind, "success", "responses.sent");
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `post-response:${user.id}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) feedback(kind, "error", "responses.rateLimited");

  const { error } = await supabase.from(TABLE[kind]).insert({
    post_id: postId,
    responder_id: user.id,
    message,
  });

  if (error) {
    if (error.code === "23505") feedback(kind, "error", "responses.duplicate");
    logActionError("respondToPost", error, { kind });
    feedback(kind, "error", "responses.failed");
  }

  revalidatePath(BOARD_PATH[kind]);
  feedback(kind, "success", "responses.sent");
}

export async function decidePostResponse(formData: FormData) {
  const parsed = decideSchema.safeParse({
    kind: formData.get("kind"),
    response_id: formData.get("response_id"),
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    const kind = kindSchema.safeParse(formData.get("kind"));
    feedback(kind.success ? kind.data : "raid_now", "error", "responses.failed");
  }

  const { kind, response_id: responseId } = parsed.data;
  const accept = parsed.data.decision === "accept";

  if (isDemoBackend()) {
    const result = demoDecideResponse(await getDemoState(), kind, responseId, accept);
    if (!result.ok) feedback(kind, "error", "responses.failed");
    if (result.matchId) redirect(`/matches/${result.matchId}`);
    feedback(kind, "success", "responses.declined");
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `post-response:decide:${user.id}`,
    limit: 60,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) feedback(kind, "error", "responses.rateLimited");

  const { data: matchId, error } = await supabase.rpc("decide_post_response", {
    p_kind: kind,
    p_response_id: responseId,
    p_accept: accept,
  });

  if (error) {
    logActionError("decidePostResponse", error, { kind });
    feedback(kind, "error", "responses.failed");
  }

  revalidatePath(BOARD_PATH[kind]);
  revalidatePath("/matches");

  // Accepting jumps straight into the chat that the match just unlocked.
  if (accept && typeof matchId === "string") redirect(`/matches/${matchId}`);
  feedback(kind, "success", "responses.declined");
}
