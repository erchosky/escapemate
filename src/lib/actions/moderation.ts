"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/constants";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoBlock, demoReport, getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

export type ModerationResult = { ok: true; error: null } | { ok: false; error: "action.generic" | "moderation.rateLimited" };

const reportSchema = z.object({
  reported_id: uuidSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});

export async function reportUser(formData: FormData): Promise<ModerationResult> {
  const parsed = reportSchema.safeParse({
    reported_id: String(formData.get("reported_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    details: String(formData.get("details") ?? "") || undefined,
  });

  if (!parsed.success) return { ok: false, error: "action.generic" };

  if (isDemoBackend()) {
    return demoReport(await getDemoState(), parsed.data.reported_id)
      ? { ok: true, error: null }
      : { ok: false, error: "action.generic" };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `report:${user.id}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) return { ok: false, error: "moderation.rateLimited" };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_id: parsed.data.reported_id,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  });

  if (error) {
    logActionError("reportUser", error);
    return { ok: false, error: "action.generic" };
  }

  return { ok: true, error: null };
}

export async function blockUser(formData: FormData): Promise<ModerationResult> {
  const blockedId = uuidSchema.safeParse(String(formData.get("blocked_id") ?? ""));
  if (!blockedId.success) return { ok: false, error: "action.generic" };

  if (isDemoBackend()) {
    const ok = demoBlock(await getDemoState(), blockedId.data);
    revalidatePath("/matches");
    return ok ? { ok: true, error: null } : { ok: false, error: "action.generic" };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `block:${user.id}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) return { ok: false, error: "moderation.rateLimited" };

  const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: blockedId.data });

  // A duplicate block means the user is already blocked, which is the outcome we want.
  if (error && error.code !== "23505") {
    logActionError("blockUser", error);
    return { ok: false, error: "action.generic" };
  }

  revalidatePath("/matches");
  return { ok: true, error: null };
}
