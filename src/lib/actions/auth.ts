"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorRedirectPath } from "@/lib/auth-errors";
import { isDemoBackend } from "@/lib/demo/mode";
import { getOAuthRedirectOrigin } from "@/lib/oauth-origin";
import { logActionError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export async function signInWithDiscord() {
  if (isDemoBackend()) redirect("/swipe");

  const supabase = await createClient();
  const headerStore = await headers();
  let origin: string;

  try {
    origin = getOAuthRedirectOrigin(headerStore.get("origin"));
  } catch (error) {
    logActionError("auth.signInWithDiscord.origin", error);
    redirect(authErrorRedirectPath("auth_unknown_error"));
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback?next=/onboarding`,
      scopes: "identify email",
    },
  });

  if (error) {
    logActionError("auth.signInWithDiscord", error);
    redirect(authErrorRedirectPath("discord_oauth_failed"));
  }

  if (data.url) {
    redirect(data.url);
  }

  redirect(authErrorRedirectPath("auth_unknown_error"));
}

export async function signOut() {
  if (isDemoBackend()) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logActionError("auth.signOut", error);
  redirect("/");
}
