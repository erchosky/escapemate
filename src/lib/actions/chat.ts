"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ChatErrorCode } from "@/lib/action-feedback";
import type { Message } from "@/lib/constants";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoMatchDetail, demoOlderMessages, demoSendMessage, getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

const messageSchema = z.object({
  match_id: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});

const olderMessagesSchema = z.object({
  match_id: z.string().uuid(),
  before: z.string().datetime({ offset: true }),
});

type SendResult = { ok: true; error: null; messages: Message[] } | { ok: false; error: ChatErrorCode; messages: [] };

export async function sendMessage(formData: FormData): Promise<SendResult> {
  const parsed = messageSchema.safeParse({
    match_id: formData.get("match_id"),
    body: formData.get("body"),
  });

  if (!parsed.success) return { ok: false, error: "chat.invalidMessage", messages: [] };

  if (isDemoBackend()) {
    const messages = demoSendMessage(await getDemoState(), parsed.data.match_id, parsed.data.body);
    return messages ? { ok: true, error: null, messages } : { ok: false, error: "chat.sendFailed", messages: [] };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `message:${user.id}:${parsed.data.match_id}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateLimit.ok) return { ok: false, error: "chat.rateLimited", messages: [] };

  // The insert policy enforces the same 10/min limit in the database, and a trigger updates
  // the match summary and the sender's read marker, so this is the only write needed.
  // Returning the inserted row lets the sender see the message even if Realtime is slow or down.
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      match_id: parsed.data.match_id,
      sender_id: user.id,
      body: parsed.data.body,
    })
    .select("id, match_id, sender_id, body, created_at")
    .single();

  if (error || !inserted) {
    logActionError("sendMessage.insert", error);
    return { ok: false, error: "chat.sendFailed", messages: [] };
  }

  return { ok: true, error: null, messages: [inserted as Message] };
}

// Used after a Realtime reconnect to pick up anything broadcast while the socket was down.
export async function loadRecentMessages(matchId: string) {
  const parsed = uuidSchema.safeParse(matchId);
  if (!parsed.success) return { ok: false, messages: [] as Message[] };

  if (isDemoBackend()) {
    const detail = demoMatchDetail(await getDemoState(), parsed.data);
    return { ok: Boolean(detail), messages: detail?.messages ?? [] };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `message-history:${user.id}:${parsed.data}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return { ok: false, messages: [] as Message[] };

  const { data, error } = await supabase
    .from("messages")
    .select("id, match_id, sender_id, body, created_at")
    .eq("match_id", parsed.data)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    logActionError("loadRecentMessages", error);
    return { ok: false, messages: [] as Message[] };
  }

  return { ok: true, messages: (data as Message[]).reverse() };
}

export async function loadOlderMessages(matchId: string, before: string) {
  const parsed = olderMessagesSchema.safeParse({
    match_id: matchId,
    before,
  });

  if (!parsed.success) return { ok: false, error: "chat.loadFailed" satisfies ChatErrorCode, messages: [], hasMore: false };

  if (isDemoBackend()) {
    const result = demoOlderMessages(await getDemoState(), parsed.data.match_id, parsed.data.before);
    return { ok: true, error: null, ...result };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `message-history:${user.id}:${parsed.data.match_id}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.ok) return { ok: false, error: "chat.rateLimited" satisfies ChatErrorCode, messages: [], hasMore: true };

  const { data, error } = await supabase
    .from("messages")
    .select("id, match_id, sender_id, body, created_at")
    .eq("match_id", parsed.data.match_id)
    .lt("created_at", parsed.data.before)
    .order("created_at", { ascending: false })
    .limit(31);

  if (error) {
    logActionError("loadOlderMessages", error);
    return { ok: false, error: "chat.loadFailed" satisfies ChatErrorCode, messages: [], hasMore: true };
  }

  const messages = data.slice(0, 30).reverse();
  return {
    ok: true,
    error: null,
    messages,
    hasMore: data.length > 30,
  };
}
