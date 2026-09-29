import { NextResponse } from "next/server";
import { authErrorRedirectPath } from "@/lib/auth-errors";
import { assertAllowedOAuthOrigin, getCanonicalOrigin } from "@/lib/oauth-origin";
import { logActionError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  let redirectOrigin: string;

  try {
    redirectOrigin = assertAllowedOAuthOrigin(requestUrl.origin);
  } catch (error) {
    logActionError("auth.callback.origin", error);
    return NextResponse.redirect(new URL(authErrorRedirectPath("auth_unknown_error"), getCanonicalOrigin()));
  }

  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    logActionError("auth.callback.provider", new Error("Discord OAuth provider callback failed"), {
      code: providerError,
    });
    return NextResponse.redirect(new URL(authErrorRedirectPath("discord_oauth_failed"), redirectOrigin));
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logActionError("auth.callback.exchangeCode", error);
      return NextResponse.redirect(new URL(authErrorRedirectPath("discord_oauth_failed"), redirectOrigin));
    }

    if (data.user) {
      const metadata = data.user.user_metadata ?? {};
      const discordAvatar = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

      // Only seed rows on first login: upserting here used to overwrite the nickname and
      // Discord handle the player chose during onboarding every time they signed in again.
      const { data: existing, error: existingError } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();

      if (existingError) {
        logActionError("auth.callback.profileLookup", existingError);
        return NextResponse.redirect(new URL(authErrorRedirectPath("auth_unknown_error"), redirectOrigin));
      }

      if (!existing) {
        const { error: profileError } = await supabase.from("profiles").insert({
          id: data.user.id,
          nickname: normalizeDiscordNickname(
            metadata.preferred_username || metadata.full_name || data.user.email?.split("@")[0] || "PMC",
          ),
          avatar_url: discordAvatar,
          last_active_at: new Date().toISOString(),
        });

        if (profileError && profileError.code !== "23505") {
          logActionError("auth.callback.profile", profileError);
          return NextResponse.redirect(new URL(authErrorRedirectPath("auth_unknown_error"), redirectOrigin));
        }
      } else {
        // Keep Discord avatars fresh, but never replace one uploaded from Settings.
        const refreshAvatar = discordAvatar && (!existing.avatar_url || isDiscordAvatar(existing.avatar_url));
        const { error: touchError } = await supabase
          .from("profiles")
          .update({
            last_active_at: new Date().toISOString(),
            ...(refreshAvatar ? { avatar_url: discordAvatar } : {}),
          })
          .eq("id", data.user.id);

        if (touchError) logActionError("auth.callback.touch", touchError);
      }

      const { error: contactError } = await supabase.from("profile_contacts").upsert(
        {
          profile_id: data.user.id,
          discord_username: metadata.full_name || metadata.preferred_username || null,
          discord_id: metadata.provider_id ?? metadata.sub ?? null,
        },
        { onConflict: "profile_id", ignoreDuplicates: true },
      );

      if (contactError) {
        logActionError("auth.callback.contact", contactError);
        return NextResponse.redirect(new URL(authErrorRedirectPath("auth_unknown_error"), redirectOrigin));
      }

      if (existing && next === "/onboarding") {
        return NextResponse.redirect(new URL("/swipe", redirectOrigin));
      }
    }

    return NextResponse.redirect(new URL(next, redirectOrigin));
  }

  logActionError("auth.callback.missingCode", new Error("Discord OAuth callback missing code"));
  return NextResponse.redirect(new URL(authErrorRedirectPath("auth_unknown_error"), redirectOrigin));
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";

  try {
    const parsed = new URL(value, "http://escapemate.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/onboarding";
  }
}

function isDiscordAvatar(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "cdn.discordapp.com" || host === "media.discordapp.net";
  } catch {
    return false;
  }
}

function normalizeDiscordNickname(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 32);
  return normalized.length >= 2 ? normalized : "PMC";
}
