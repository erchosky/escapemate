import { redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { isDemoBackend } from "@/lib/demo/mode";
import { demoUser } from "@/lib/demo/seed";
import {
  demoBadges,
  demoMatchDetail,
  demoMatches,
  demoQuestPosts,
  demoRaidPosts,
  demoSwipeCandidates,
  getDemoState,
} from "@/lib/demo/store";
import {
  PRIVATE_TARKOV_STATS_SELECT,
  PUBLIC_PROFILE_SELECT,
  type AdminReport,
  type AppBadges,
  type GameMode,
  type Language,
  type MatchSummary,
  type MapName,
  type Message,
  type Objective,
  type PostResponse,
  type Profile,
  type ProfileTarkovStats,
  type QuestHelpPost,
  type QuestHelpType,
  type RaidNowPost,
  type Region,
} from "@/lib/constants";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

type RawMatch = {
  id: string;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  profile_one: string;
  profile_two: string;
  profile_one_profile: Profile;
  profile_two_profile: Profile;
};

type RaidNowFilters = {
  region?: Region;
  language?: Language;
  map?: MapName;
  objective?: Objective;
  game_mode?: GameMode;
};

type QuestHelpFilters = {
  region?: Region;
  language?: Language;
  map?: MapName;
  request_type?: QuestHelpType;
  game_mode?: GameMode;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const PUBLIC_PROFILE_RELATION_SELECT = `profiles(${PUBLIC_PROFILE_SELECT})`;
const MATCH_PROFILE_ONE_SELECT = `profile_one_profile:profiles!matches_profile_one_fkey(${PUBLIC_PROFILE_SELECT})`;
const MATCH_PROFILE_TWO_SELECT = `profile_two_profile:profiles!matches_profile_two_fkey(${PUBLIC_PROFILE_SELECT})`;
const RAID_NOW_POST_SELECT = `
  id,
  profile_id,
  map,
  objective,
  players_needed,
  language,
  region,
  style,
  game_mode,
  accepted_count,
  notes,
  expires_at,
  created_at,
  profile:${PUBLIC_PROFILE_RELATION_SELECT}
`;
const QUEST_HELP_POST_SELECT = `
  id,
  user_id,
  quest_id,
  quest_name,
  map,
  region,
  language,
  playstyle,
  game_mode,
  request_type,
  description,
  status,
  expires_at,
  created_at,
  updated_at,
  profile:${PUBLIC_PROFILE_RELATION_SELECT}
`;
const ADMIN_REPORT_SELECT = `
  id,
  reporter_id,
  reported_id,
  reason,
  details,
  status,
  created_at,
  reviewed_at,
  reporter:profiles!reports_reporter_id_fkey(${PUBLIC_PROFILE_SELECT}),
  reported:profiles!reports_reported_id_fkey(${PUBLIC_PROFILE_SELECT})
`;
const RESPONSE_SELECT = (table: "raid_now_responses" | "quest_help_responses") => `
  id,
  post_id,
  responder_id,
  message,
  status,
  match_id,
  created_at,
  responder:profiles!${table}_responder_id_fkey(${PUBLIC_PROFILE_SELECT})
`;
const LAST_ACTIVE_REFRESH_MS = 15 * 60_000;
const MATCH_LIST_LIMIT = 100;

const emptyBadges: AppBadges = {
  unread_messages: 0,
  new_matches: 0,
  quest_help_responses: 0,
  raid_now_responses: 0,
  open_reports: 0,
  is_admin: false,
};

// Both helpers are memoised per request: the shell, the page and its loaders share one auth round-trip.
export const requireUser = cache(async () => {
  if (isDemoBackend()) {
    return { supabase: null as unknown as SupabaseServerClient, user: demoUser };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  return { supabase, user };
});

export const requireCompletedProfile = cache(async () => {
  if (isDemoBackend()) {
    const state = await getDemoState();
    if (!state.profile.onboarding_complete) redirect("/onboarding");
    return { supabase: null as unknown as SupabaseServerClient, user: demoUser, profile: state.profile };
  }

  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_SELECT).eq("id", user.id).single();
  const profile = data as Profile | null;

  if (!profile?.onboarding_complete) redirect("/onboarding");

  const lastActive = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
  if (Date.now() - lastActive > LAST_ACTIVE_REFRESH_MS) {
    // Runs after the response is sent, so the page never waits for this write.
    after(async () => {
      const { error } = await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id);
      if (error) logActionError("profile.touchLastActive", error);
    });
  }

  return { supabase, user, profile };
});

export async function getSwipeCandidates(limit = 20) {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    return demoSwipeCandidates(await getDemoState(), limit);
  }

  const { supabase } = await requireCompletedProfile();

  try {
    // Public Tarkov stats come back in the same call (tarkov_* columns) to save a round trip.
    const { data, error } = await supabase.rpc("get_swipe_candidates", { p_limit: limit });

    if (error) {
      logActionError("swipe.loadCandidates", error);
      return [];
    }

    return ((data ?? []) as RawCandidate[]).map(toCandidateProfile);
  } catch (error) {
    logActionError("swipe.loadCandidatesUnexpected", error);
    return [];
  }
}

type RawCandidate = Profile & {
  tarkov_level: number | null;
  tarkov_survival_rate: number | null;
  tarkov_kd: number | null;
  tarkov_raids: number | null;
  tarkov_hours: number | null;
  tarkov_pmc_kills: number | null;
  has_public_stats: boolean;
};

function toCandidateProfile({
  tarkov_level,
  tarkov_survival_rate,
  tarkov_kd,
  tarkov_raids,
  tarkov_hours,
  tarkov_pmc_kills,
  has_public_stats,
  ...profile
}: RawCandidate): Profile {
  return {
    ...profile,
    discord_id: null,
    discord_username: null,
    tarkov_stats: has_public_stats
      ? {
          user_id: profile.id,
          level: tarkov_level,
          survival_rate: tarkov_survival_rate === null ? null : Number(tarkov_survival_rate),
          kd: tarkov_kd === null ? null : Number(tarkov_kd),
          raids: tarkov_raids,
          hours: tarkov_hours,
          pmc_kills: tarkov_pmc_kills,
          last_synced_at: null,
          is_public: true,
        }
      : null,
  };
}

export async function getCurrentProfile() {
  if (isDemoBackend()) {
    const state = await getDemoState();
    return { user: demoUser, profile: { ...state.profile, ...state.contact } as Profile };
  }

  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_SELECT).eq("id", user.id).maybeSingle();
  const publicProfile = data as Profile | null;
  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("discord_username, discord_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const profile = publicProfile
    ? ({
        ...publicProfile,
        discord_username: contact?.discord_username ?? null,
        discord_id: contact?.discord_id ?? null,
      } as Profile)
    : null;

  return { user, profile };
}

export async function getMyTarkovStats() {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    const state = await getDemoState();
    return { user: demoUser, profile: state.profile, stats: state.stats };
  }

  const { supabase, user, profile } = await requireCompletedProfile();
  const { data } = await supabase
    .from("profile_tarkov_stats")
    .select(PRIVATE_TARKOV_STATS_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, profile: profile as Profile, stats: (data as ProfileTarkovStats | null) ?? null };
}

export async function getMatches() {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    return { user: demoUser, matches: demoMatches(await getDemoState()) };
  }

  const { supabase, user } = await requireCompletedProfile();
  const { data, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      created_at,
      last_message_at,
      last_message_preview,
      last_message_sender_id,
      profile_one,
      profile_two,
      ${MATCH_PROFILE_ONE_SELECT},
      ${MATCH_PROFILE_TWO_SELECT}
    `,
    )
    .or(`profile_one.eq.${user.id},profile_two.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MATCH_LIST_LIMIT);

  if (error) {
    logActionError("matches.list", error);
    return { user, matches: [] as MatchSummary[] };
  }

  // The last-message summary is kept on matches by a trigger, so no message scan is needed.
  const rawMatches = (data ?? []) as unknown as RawMatch[];
  const matchIds = rawMatches.map((match) => match.id);
  const { data: reads, error: readsError } = matchIds.length
    ? await supabase.from("match_reads").select("match_id, last_read_at").eq("profile_id", user.id).in("match_id", matchIds)
    : { data: [], error: null };

  if (readsError) logActionError("matches.reads", readsError);

  const readByMatch = new Map(((reads ?? []) as { match_id: string; last_read_at: string }[]).map((read) => [read.match_id, read.last_read_at]));

  const matches = rawMatches.map((match) => {
    const otherProfile =
      match.profile_one === user.id ? match.profile_two_profile : match.profile_one_profile;
    const lastRead = readByMatch.get(match.id);
    const fromOther = Boolean(match.last_message_sender_id && match.last_message_sender_id !== user.id);

    return {
      id: match.id,
      created_at: match.created_at,
      last_message_at: match.last_message_at,
      otherProfile,
      lastMessage: match.last_message_preview,
      unread: match.last_message_at
        ? fromOther && (!lastRead || match.last_message_at > lastRead)
        : !lastRead,
    };
  });

  return { user, matches: matches as MatchSummary[] };
}

export async function getMatchDetail(matchId: string) {
  const parsedMatchId = uuidSchema.safeParse(matchId);
  if (!parsedMatchId.success) redirect("/matches");

  if (isDemoBackend()) {
    await requireCompletedProfile();
    const detail = demoMatchDetail(await getDemoState(), parsedMatchId.data);
    if (!detail) redirect("/matches");

    return { user: demoUser, matchId: parsedMatchId.data, ...detail };
  }

  const { supabase, user } = await requireCompletedProfile();
  const { data, error: matchError } = await supabase
    .from("matches")
    .select(
      `
      id,
      profile_one,
      profile_two,
      ${MATCH_PROFILE_ONE_SELECT},
      ${MATCH_PROFILE_TWO_SELECT}
    `,
    )
    .eq("id", parsedMatchId.data)
    .single();

  if (matchError) {
    logActionError("matches.detail.match", matchError, { matchId: parsedMatchId.data });
    redirect("/matches?error=match_unavailable");
  }

  const match = data as unknown as RawMatch | null;

  if (!match) redirect("/matches");

  const otherProfile = (match.profile_one === user.id
    ? match.profile_two_profile
    : match.profile_one_profile) as unknown as Profile;

  const [contactResult, statsResult, messagesResult] = await Promise.all([
    supabase
      .from("profile_contacts")
      .select("discord_username, discord_id")
      .eq("profile_id", otherProfile.id)
      .maybeSingle(),
    supabase.rpc("get_public_tarkov_stats", { p_user_ids: [otherProfile.id] }),
    supabase
      .from("messages")
      .select("id, match_id, sender_id, body, created_at")
      .eq("match_id", parsedMatchId.data)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (contactResult.error) {
    logActionError("matches.detail.contact", contactResult.error, { matchId: parsedMatchId.data });
  }

  if (statsResult.error) {
    logActionError("matches.detail.stats", statsResult.error, { matchId: parsedMatchId.data });
  }

  if (messagesResult.error) {
    logActionError("matches.detail.messages", messagesResult.error, { matchId: parsedMatchId.data });
  }

  const matchedProfile = {
    ...otherProfile,
    discord_username: contactResult.data?.discord_username ?? null,
    discord_id: contactResult.data?.discord_id ?? null,
    tarkov_stats: ((statsResult.data ?? []) as ProfileTarkovStats[])[0] ?? null,
  };

  const { error: readError } = await supabase.from("match_reads").upsert({
    match_id: parsedMatchId.data,
    profile_id: user.id,
    last_read_at: new Date().toISOString(),
  });

  if (readError) logActionError("matches.markRead", readError, { matchId: parsedMatchId.data });

  return {
    user,
    matchId: parsedMatchId.data,
    otherProfile: matchedProfile,
    messages: [...((messagesResult.data ?? []) as Message[])].reverse(),
  };
}

export async function getRaidNowPosts(filters: RaidNowFilters = {}) {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    const state = await getDemoState();
    return { user: demoUser, profile: state.profile, posts: demoRaidPosts(state, filters) };
  }

  const { supabase, user, profile } = await requireCompletedProfile();
  let query = supabase
    .from("raid_now_posts")
    .select(RAID_NOW_POST_SELECT)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (filters.region) query = query.eq("region", filters.region);
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.map) query = query.eq("map", filters.map);
  if (filters.objective) query = query.eq("objective", filters.objective);
  if (filters.game_mode) query = query.eq("game_mode", filters.game_mode);

  const { data, error } = await query.limit(50);

  if (error) {
    logActionError("raidNow.list", error);
    return { user, profile, posts: [] as RaidNowPost[] };
  }

  const posts = (data ?? []) as unknown as RaidNowPost[];
  const responses = await loadResponses(supabase, "raid_now_responses", posts.map((post) => post.id));
  return {
    user,
    profile,
    posts: posts.map((post) => attachResponses(post, post.profile_id, user.id, responses)),
  };
}

async function loadResponses(
  supabase: SupabaseServerClient,
  table: "raid_now_responses" | "quest_help_responses",
  postIds: string[],
) {
  if (!postIds.length) return [] as PostResponse[];

  // RLS returns every response on the caller's own posts plus the caller's own responses elsewhere.
  const { data, error } = await supabase
    .from(table)
    .select(RESPONSE_SELECT(table))
    .in("post_id", postIds)
    .order("created_at", { ascending: true });

  if (error) {
    logActionError(`${table}.list`, error);
    return [] as PostResponse[];
  }

  return (data ?? []) as unknown as PostResponse[];
}

function attachResponses<T extends { id: string }>(post: T, ownerId: string, userId: string, responses: PostResponse[]) {
  const forPost = responses.filter((response) => response.post_id === post.id);
  if (ownerId === userId) return { ...post, responses: forPost, myResponse: null };
  return { ...post, responses: [], myResponse: forPost.find((response) => response.responder_id === userId) ?? null };
}

export async function getQuestHelpPosts(filters: QuestHelpFilters = {}) {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    const state = await getDemoState();
    return { user: demoUser, profile: state.profile, posts: demoQuestPosts(state, filters) };
  }

  const { supabase, user, profile } = await requireCompletedProfile();
  let query = supabase
    .from("quest_help_posts")
    .select(QUEST_HELP_POST_SELECT)
    .eq("status", "Activa")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (filters.region) query = query.eq("region", filters.region);
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.map) query = query.eq("map", filters.map);
  if (filters.request_type) query = query.eq("request_type", filters.request_type);
  if (filters.game_mode) query = query.eq("game_mode", filters.game_mode);

  const { data, error } = await query.limit(50);

  if (error) {
    logActionError("questHelp.list", error);
    return { user, profile, posts: [] as QuestHelpPost[] };
  }

  const posts = (data ?? []) as unknown as QuestHelpPost[];
  const responses = await loadResponses(supabase, "quest_help_responses", posts.map((post) => post.id));
  return {
    user,
    profile,
    posts: posts.map((post) => attachResponses(post, post.user_id, user.id, responses)),
  };
}

// Cached per request: the desktop and mobile navigation both render badges.
export const getAppBadges = cache(async (): Promise<AppBadges> => {
  if (isDemoBackend()) {
    await requireCompletedProfile();
    return demoBadges(await getDemoState());
  }

  const { supabase } = await requireCompletedProfile();
  const { data, error } = await supabase.rpc("get_app_badges");

  if (error) {
    logActionError("appShell.badges", error);
    return emptyBadges;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? ({ ...emptyBadges, ...(row as Partial<AppBadges>) } as AppBadges) : emptyBadges;
});

export async function getAdminReports(status?: string) {
  if (isDemoBackend()) {
    return { user: demoUser, reports: [] as AdminReport[], isAdmin: false };
  }

  const { supabase, user } = await requireCompletedProfile();
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin", { p_user_id: user.id });

  if (roleError) {
    logActionError("admin.checkRole", roleError);
    return { user, reports: [] as AdminReport[], isAdmin: false };
  }

  if (!isAdmin) return { user, reports: [] as AdminReport[], isAdmin: false };

  let query = supabase
    .from("reports")
    .select(ADMIN_REPORT_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && ["open", "reviewed", "dismissed", "actioned"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    logActionError("admin.loadReports", error);
    return { user, reports: [] as AdminReport[], isAdmin: true };
  }

  return { user, reports: (data ?? []) as unknown as AdminReport[], isAdmin: true };
}

export type ShellStatus = {
  profile: { id: string; nickname: string; avatar_url: string | null };
  badges: AppBadges;
};

// Header data (avatar + nav badges) for /api/me/shell. Keeping it out of the layout means
// prefetches and navigations never run these queries; the client refreshes it on its own clock.
export async function getShellStatus(): Promise<ShellStatus | null> {
  if (isDemoBackend()) {
    const state = await getDemoState();
    if (!state.profile.onboarding_complete) return null;
    const { id, nickname, avatar_url } = state.profile;
    return { profile: { id, nickname, avatar_url }, badges: demoBadges(state) };
  }

  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return null;

  const [{ data: profile, error: profileError }, { data: badges, error: badgesError }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, avatar_url, onboarding_complete").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_app_badges"),
  ]);

  if (profileError) logActionError("shell.profile", profileError);
  if (badgesError) logActionError("shell.badges", badgesError);
  if (!profile?.onboarding_complete) return null;

  const row = Array.isArray(badges) ? badges[0] : badges;
  return {
    profile: { id: profile.id, nickname: profile.nickname, avatar_url: profile.avatar_url },
    badges: row ? ({ ...emptyBadges, ...(row as Partial<AppBadges>) } as AppBadges) : emptyBadges,
  };
}
