"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  onboardingErrorRedirectPath,
  settingsErrorRedirectPath,
  settingsSuccessRedirectPath,
  type ProfileErrorCode,
} from "@/lib/action-feedback";
import { signOut } from "@/lib/actions/auth";
import { removeUserAvatars, uploadUserAvatar, validateAvatarFile } from "@/lib/avatar-storage";
import { isDemoBackend } from "@/lib/demo/mode";
import { getDemoState, resetDemoState } from "@/lib/demo/store";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { GAME_MODES, LANGUAGES, MAPS, OBJECTIVES, PLAY_STYLES, PROFILE_LIMITS, REGIONS, SCHEDULES } from "@/lib/constants";

const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(32),
  discord_username: z.string().trim().max(64).optional(),
  region: z.enum(REGIONS),
  language: z.enum(LANGUAGES),
  spoken_languages: z.array(z.enum(LANGUAGES)).min(1).max(LANGUAGES.length),
  game_modes: z.array(z.enum(GAME_MODES)).min(1).max(GAME_MODES.length),
  approximate_level: z.coerce.number().int().min(1).max(79),
  favorite_maps: z.array(z.enum(MAPS)).min(1).max(PROFILE_LIMITS.favorite_maps),
  play_styles: z.array(z.enum(PLAY_STYLES)).min(1).max(PROFILE_LIMITS.play_styles),
  objectives: z.array(z.enum(OBJECTIVES)).min(1).max(PROFILE_LIMITS.objectives),
  schedule: z.array(z.enum(SCHEDULES)).min(1).max(PROFILE_LIMITS.schedule),
  bio: z.string().trim().max(240).optional(),
});

function formArray(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).map(String).filter(Boolean)));
}

function logOnboardingError(operation: string, error: unknown) {
  logActionError(`saveOnboarding.${operation}`, error);

  if (process.env.NODE_ENV !== "production") {
    const info = error && typeof error === "object" ? (error as Record<string, unknown>) : { message: String(error) };
    console.error("ONBOARDING_ERROR", { operation, code: info.code, message: info.message, details: info.details, hint: info.hint });
  }
}

export async function saveOnboarding(formData: FormData) {
  const editing = formData.get("mode") === "edit";
  const failed = (code: ProfileErrorCode) =>
    redirect(`${onboardingErrorRedirectPath(code)}${editing ? "&edit=1" : ""}`);

  const parsed = profileSchema.safeParse({
    nickname: formData.get("nickname"),
    discord_username: formData.get("discord_username") ?? undefined,
    region: formData.get("region"),
    language: formData.get("language"),
    spoken_languages: formArray(formData, "spoken_languages"),
    game_modes: formArray(formData, "game_modes"),
    approximate_level: formData.get("approximate_level"),
    favorite_maps: formArray(formData, "favorite_maps"),
    play_styles: formArray(formData, "play_styles"),
    objectives: formArray(formData, "objectives"),
    schedule: formArray(formData, "schedule"),
    bio: formData.get("bio") ?? undefined,
  });

  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") {
      console.error("ONBOARDING_ERROR", { operation: "validate_payload", details: z.flattenError(parsed.error).fieldErrors });
    }
    failed("profile.invalidFields");
    return;
  }

  const spokenLanguages = Array.from(new Set([parsed.data.language, ...parsed.data.spoken_languages]));
  const profilePayload = {
    nickname: parsed.data.nickname,
    region: parsed.data.region,
    language: parsed.data.language,
    spoken_languages: spokenLanguages,
    game_modes: parsed.data.game_modes,
    approximate_level: parsed.data.approximate_level,
    favorite_maps: parsed.data.favorite_maps,
    play_styles: parsed.data.play_styles,
    objectives: parsed.data.objectives,
    schedule: parsed.data.schedule,
    bio: parsed.data.bio || null,
    onboarding_complete: true,
    last_active_at: new Date().toISOString(),
  };

  if (isDemoBackend()) {
    const state = await getDemoState();
    state.profile = { ...state.profile, ...profilePayload };
    if (parsed.data.discord_username) state.contact.discord_username = parsed.data.discord_username;
    redirect(editing ? settingsSuccessRedirectPath("profile.saved") : "/swipe");
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `profile:onboarding:${user.id}`,
    limit: 10,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) {
    failed("profile.rateLimited");
    return;
  }

  // avatar_url is left out on purpose: the OAuth callback seeds it and Settings can replace it.
  const { error } = await supabase.from("profiles").upsert({ id: user.id, ...profilePayload });

  if (error) {
    logOnboardingError("upsert profiles", error);
    redirect(onboardingErrorRedirectPath("action.generic"));
  }

  const contactPayload = {
    profile_id: user.id,
    discord_username:
      parsed.data.discord_username ||
      user.user_metadata?.full_name ||
      user.user_metadata?.preferred_username ||
      null,
    discord_id: user.user_metadata?.provider_id ?? user.user_metadata?.sub ?? null,
  };

  const { error: contactError } = await supabase.from("profile_contacts").upsert(contactPayload);

  if (contactError) {
    logOnboardingError("upsert profile_contacts", contactError);
    redirect(onboardingErrorRedirectPath("action.generic"));
  }

  const preferencesPayload = {
    profile_id: user.id,
    preferred_regions: [parsed.data.region],
    preferred_languages: spokenLanguages,
    preferred_maps: parsed.data.favorite_maps,
    preferred_styles: parsed.data.play_styles,
    preferred_objectives: parsed.data.objectives,
    level_min: Math.max(1, parsed.data.approximate_level - 15),
    level_max: Math.min(79, parsed.data.approximate_level + 15),
  };

  const { error: preferencesError } = await supabase.from("player_preferences").upsert(preferencesPayload);

  if (preferencesError) {
    logOnboardingError("upsert player_preferences", preferencesError);
    redirect(onboardingErrorRedirectPath("action.generic"));
  }

  revalidatePath("/swipe");
  revalidatePath("/settings");
  redirect(editing ? settingsSuccessRedirectPath("profile.saved") : "/swipe");
}

const languageSettingsSchema = z.object({
  language: z.enum(LANGUAGES),
  spoken_languages: z.array(z.enum(LANGUAGES)).min(1).max(LANGUAGES.length),
});

export async function updateProfileLanguages(formData: FormData) {
  const parsed = languageSettingsSchema.safeParse({
    language: formData.get("language"),
    spoken_languages: formArray(formData, "spoken_languages"),
  });

  if (!parsed.success) {
    redirect(settingsErrorRedirectPath("profile.invalidPrimaryLanguage"));
  }

  const spokenLanguages = Array.from(new Set([parsed.data.language, ...parsed.data.spoken_languages]));

  if (isDemoBackend()) {
    const state = await getDemoState();
    state.profile = { ...state.profile, language: parsed.data.language, spoken_languages: spokenLanguages };
    redirect(settingsSuccessRedirectPath("profile.saved"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `profile:languages:${user.id}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) {
    redirect(settingsErrorRedirectPath("settings.rateLimited"));
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      language: parsed.data.language,
      spoken_languages: spokenLanguages,
    })
    .eq("id", user.id);

  if (error) {
    logActionError("updateProfileLanguages", error);
    redirect(settingsErrorRedirectPath("action.generic"));
  }

  revalidatePath("/settings");
  revalidatePath("/swipe");
  redirect(settingsSuccessRedirectPath("profile.saved"));
}

export async function uploadAvatar(formData: FormData) {
  const file = formData.get("avatar");
  if (!(file instanceof File) || !validateAvatarFile(file).ok) {
    redirect(settingsErrorRedirectPath("settings.avatarInvalid"));
  }

  if (isDemoBackend()) {
    redirect(settingsErrorRedirectPath("settings.avatarUnavailable"));
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `profile:avatar:${user.id}`,
    limit: 10,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) redirect(settingsErrorRedirectPath("settings.rateLimited"));

  const upload = await uploadUserAvatar(supabase, user.id, file);
  if (!upload.ok) {
    logActionError("uploadAvatar.upload", new Error(upload.error));
    redirect(settingsErrorRedirectPath(upload.error === "upload_failed" ? "action.generic" : "settings.avatarInvalid"));
  }

  // The path is stable per user, so a version query forces browsers and next/image to refetch.
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: `${upload.publicUrl}?v=${Date.now()}` })
    .eq("id", user.id);

  if (error) {
    logActionError("uploadAvatar.profile", error);
    redirect(settingsErrorRedirectPath("action.generic"));
  }

  revalidatePath("/settings");
  redirect(settingsSuccessRedirectPath("settings.avatarSaved"));
}

const DELETE_CONFIRMATIONS = new Set(["ELIMINAR", "DELETE"]);

export async function deleteAccount(formData: FormData) {
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
  if (!DELETE_CONFIRMATIONS.has(confirmation)) {
    redirect(settingsErrorRedirectPath("settings.deleteConfirmMismatch"));
  }

  if (isDemoBackend()) {
    await resetDemoState({ asNewPlayer: true });
    redirect("/");
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  // La foto subida vive en Storage y la RPC solo borra filas: se elimina antes, mientras la
  // sesión todavía es válida (las políticas de Storage exigen que el archivo sea del usuario).
  if (user && !(await removeUserAvatars(supabase, user.id))) {
    logActionError("deleteAccount.avatar", new Error("Avatar removal failed"));
  }

  const { error } = await supabase.rpc("delete_my_account");

  if (error) {
    logActionError("deleteAccount", error);
    // La cuenta sigue viva pero su foto subida ya no existe: se quita esa referencia rota
    // (una foto de Discord se conserva).
    if (user) {
      await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id)
        .like("avatar_url", `%/avatars/${user.id}/%`);
    }
    redirect(settingsErrorRedirectPath("action.generic"));
  }

  await signOut();
}
