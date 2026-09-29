"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SwipeErrorCode } from "@/lib/action-feedback";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoSwipe, getDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import type { Profile } from "@/lib/constants";
import { getSwipeCandidates } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

type SwipeResult =
  | { ok: true; error: null; matched: boolean; matchId: string | null }
  | { ok: false; error: SwipeErrorCode; matched: false; matchId: null };

const failed = (error: SwipeErrorCode): SwipeResult => ({ ok: false, error, matched: false, matchId: null });

export async function swipeProfile(targetId: string, decision: "like" | "pass"): Promise<SwipeResult> {
  const target = uuidSchema.safeParse(targetId);
  if (!target.success || !["like", "pass"].includes(decision)) return failed("swipe.saveFailed");

  if (isDemoBackend()) {
    const result = demoSwipe(await getDemoState(), target.data, decision);
    if (!result.ok) return failed("swipe.saveFailed");
    revalidatePath("/matches");
    return { ok: true, error: null, matched: result.matched, matchId: result.matchId };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `swipe:${user.id}`,
    limit: 80,
    windowMs: 60_000,
  });

  if (!rateLimit.ok) return failed("swipe.rateLimited");

  const { data, error } = await supabase.rpc("create_swipe", {
    p_target_id: target.data,
    p_decision: decision,
  });

  if (error) {
    logActionError("swipeProfile", error);
    return failed("swipe.saveFailed");
  }

  revalidatePath("/matches");

  const result = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    error: null,
    matched: Boolean(result?.matched),
    matchId: result?.match_id ?? null,
  };
}

// Fetches the next batch while the player still has cards left, so the deck never stalls.
export async function loadMoreCandidates(): Promise<Profile[]> {
  return getSwipeCandidates();
}
