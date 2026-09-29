import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type {
  AppBadges,
  GameMode,
  Language,
  MapName,
  MatchSummary,
  Message,
  Objective,
  PlayStyle,
  PostKind,
  PostResponse,
  Profile,
  ProfileTarkovStats,
  QuestHelpPost,
  QuestHelpType,
  RaidNowPost,
  Region,
} from "@/lib/constants";
import { DEMO_SESSION_COOKIE } from "@/lib/demo/mode";
import {
  DEMO_MATCH_ID,
  DEMO_USER_ID,
  demoCurrentContact,
  demoCurrentProfile,
  demoCurrentStats,
  demoMatchedPerson,
  demoPeople,
  type DemoPerson,
} from "@/lib/demo/seed";

type DemoMatch = { id: string; other_id: string; created_at: string; last_message_at: string | null };
type DemoRaidPost = Omit<RaidNowPost, "profile" | "responses" | "myResponse" | "accepted_count"> & { closed_at: string | null };
type DemoQuestPost = Omit<QuestHelpPost, "profile" | "responses" | "myResponse">;
type DemoResponse = Omit<PostResponse, "responder"> & { kind: PostKind };

export type DemoState = {
  profile: Profile;
  contact: { discord_username: string | null; discord_id: string | null };
  stats: ProfileTarkovStats | null;
  people: Map<string, DemoPerson>;
  swipes: Map<string, "like" | "pass">;
  matches: DemoMatch[];
  messages: Message[];
  reads: Map<string, string>;
  raidPosts: DemoRaidPost[];
  questPosts: DemoQuestPost[];
  responses: DemoResponse[];
  blocks: Set<string>;
  reportCount: number;
};

const MAX_SESSIONS = 500;
const globalStore = globalThis as typeof globalThis & { __escapemateDemoSessions?: Map<string, DemoState> };
const sessions = (globalStore.__escapemateDemoSessions ??= new Map<string, DemoState>());

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function createState(): DemoState {
  const people = new Map<string, DemoPerson>();
  [...demoPeople, demoMatchedPerson].forEach((person) => people.set(person.profile.id, structuredClone(person)));

  // Recent activity makes "active X minutes ago" meaningful in the demo.
  let offset = 3;
  people.forEach((person) => {
    person.profile.last_active_at = minutesFromNow(-offset);
    offset += 17;
  });

  const nightOperator = demoMatchedPerson.profile.id;
  const kilo = demoPeople[1].profile.id;
  const woodsGhost = demoPeople[5].profile.id;
  const shorelineDoc = demoPeople[3].profile.id;

  return {
    profile: { ...structuredClone(demoCurrentProfile), last_active_at: new Date().toISOString() },
    contact: { ...demoCurrentContact },
    stats: structuredClone(demoCurrentStats),
    people,
    swipes: new Map(),
    matches: [{ id: DEMO_MATCH_ID, other_id: nightOperator, created_at: minutesFromNow(-50), last_message_at: minutesFromNow(-15) }],
    messages: [
      {
        id: "00000000-0000-4000-8000-000000000031",
        match_id: DEMO_MATCH_ID,
        sender_id: nightOperator,
        body: "Buenas, ¿hacemos Customs esta noche?",
        created_at: minutesFromNow(-20),
      },
      {
        id: "00000000-0000-4000-8000-000000000032",
        match_id: DEMO_MATCH_ID,
        sender_id: DEMO_USER_ID,
        body: "Sí, necesito sacar quest y extraer.",
        created_at: minutesFromNow(-18),
      },
      {
        id: "00000000-0000-4000-8000-000000000033",
        match_id: DEMO_MATCH_ID,
        sender_id: nightOperator,
        body: "Listo para Customs esta noche.",
        created_at: minutesFromNow(-15),
      },
    ],
    reads: new Map([[DEMO_MATCH_ID, minutesFromNow(-19)]]),
    raidPosts: [
      {
        id: "00000000-0000-4000-8000-000000000041",
        profile_id: nightOperator,
        map: "Customs",
        objective: "Misiones",
        players_needed: 2,
        language: "ES",
        region: "EU",
        style: "Chill",
        game_mode: "PvP",
        notes: "Quest run controlado, sin prisas.",
        expires_at: minutesFromNow(75),
        created_at: minutesFromNow(-15),
        closed_at: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000042",
        profile_id: kilo,
        map: "Reserve",
        objective: "Boss hunting",
        players_needed: 3,
        language: "ES",
        region: "EU",
        style: "Tryhard",
        game_mode: "PvP",
        notes: "Glukhar en Reserve. Traed munición de pen alta.",
        expires_at: minutesFromNow(50),
        created_at: minutesFromNow(-40),
        closed_at: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000043",
        profile_id: woodsGhost,
        map: "Woods",
        objective: "Scav runs",
        players_needed: 1,
        language: "EN",
        region: "LATAM",
        style: "Sniper",
        game_mode: "PvE",
        notes: "Scav runs tranquilas en PvE. Sin prisa.",
        expires_at: minutesFromNow(30),
        created_at: minutesFromNow(-60),
        closed_at: null,
      },
    ],
    questPosts: [
      {
        id: "00000000-0000-4000-8000-000000000051",
        user_id: nightOperator,
        quest_id: "e2e-task-extortionist",
        quest_name: "The Extortionist",
        map: "Customs",
        region: "EU",
        language: "ES",
        playstyle: "Quest focused",
        game_mode: "PvP",
        request_type: "Necesito ayuda",
        description: "Necesito encontrar el item y extraer en Customs.",
        status: "Activa",
        expires_at: minutesFromNow(60 * 20),
        created_at: minutesFromNow(-30),
        updated_at: minutesFromNow(-30),
      },
      {
        id: "00000000-0000-4000-8000-000000000052",
        user_id: shorelineDoc,
        quest_id: null,
        quest_name: "Shortage",
        map: "Woods",
        region: "EU",
        language: "ES",
        playstyle: "Sherpa",
        game_mode: "PvE",
        request_type: "Ofrezco ayuda / Sherpa",
        description: "Enseño spawns de Salewa y rutas seguras en Woods PvE.",
        status: "Activa",
        expires_at: minutesFromNow(60 * 10),
        created_at: minutesFromNow(-90),
        updated_at: minutesFromNow(-90),
      },
    ],
    responses: [],
    blocks: new Set(),
    reportCount: 0,
  };
}

async function sessionId() {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_SESSION_COOKIE)?.value ?? "shared";
}

export async function getDemoState() {
  const id = await sessionId();
  let state = sessions.get(id);

  if (!state) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    state = createState();
    sessions.set(id, state);
  }

  return state;
}

// After "delete account" the demo behaves like a first login: empty profile, no matches.
export async function resetDemoState({ asNewPlayer = false } = {}) {
  const state = createState();
  if (asNewPlayer) {
    state.profile = {
      ...state.profile,
      nickname: "Operador Demo",
      region: null,
      language: null,
      spoken_languages: [],
      approximate_level: null,
      favorite_maps: [],
      play_styles: [],
      objectives: [],
      schedule: [],
      game_modes: ["PvP"],
      bio: null,
      onboarding_complete: false,
    };
    state.stats = null;
    state.matches = [];
    state.messages = [];
    state.reads = new Map();
  }
  sessions.set(await sessionId(), state);
}

function isVisible(state: DemoState, profileId: string) {
  return !state.blocks.has(profileId);
}

function publicProfile(state: DemoState, profileId: string): Profile | undefined {
  if (profileId === DEMO_USER_ID) return state.profile;
  return state.people.get(profileId)?.profile;
}

function sharesGameMode(a: Profile, b: Profile) {
  const mine = a.game_modes?.length ? a.game_modes : ["PvP"];
  const theirs = b.game_modes?.length ? b.game_modes : ["PvP"];
  return mine.some((mode) => theirs.includes(mode));
}

function findMatchWith(state: DemoState, otherId: string) {
  return state.matches.find((match) => match.other_id === otherId);
}

function openMatch(state: DemoState, otherId: string) {
  const existing = findMatchWith(state, otherId);
  if (existing) return existing;

  const match: DemoMatch = { id: randomUUID(), other_id: otherId, created_at: new Date().toISOString(), last_message_at: null };
  state.matches.unshift(match);
  return match;
}

export function demoSwipeCandidates(state: DemoState, limit: number) {
  return Array.from(state.people.values())
    .filter((person) => person.profile.id !== demoMatchedPerson.profile.id)
    .filter((person) => !state.swipes.has(person.profile.id))
    .filter((person) => isVisible(state, person.profile.id))
    .filter((person) => !findMatchWith(state, person.profile.id))
    .filter((person) => sharesGameMode(state.profile, person.profile))
    .sort((a, b) => (b.profile.compatibility_score ?? 0) - (a.profile.compatibility_score ?? 0))
    .slice(0, limit)
    .map((person) => ({ ...person.profile, tarkov_stats: person.stats }));
}

export function demoSwipe(state: DemoState, targetId: string, decision: "like" | "pass") {
  const target = state.people.get(targetId);
  if (!target || !isVisible(state, targetId)) return { ok: false as const };

  state.swipes.set(targetId, decision);
  if (decision === "like" && target.likesYou) {
    const match = openMatch(state, targetId);
    return { ok: true as const, matched: true, matchId: match.id };
  }

  return { ok: true as const, matched: false, matchId: null };
}

export function demoMatches(state: DemoState): MatchSummary[] {
  return state.matches
    .filter((match) => isVisible(state, match.other_id))
    .map((match) => {
      const lastMessage = [...state.messages].reverse().find((message) => message.match_id === match.id);
      return {
        id: match.id,
        created_at: match.created_at,
        last_message_at: match.last_message_at,
        otherProfile: publicProfile(state, match.other_id) as Profile,
        lastMessage: lastMessage?.body ?? null,
        unread: Boolean(
          lastMessage && lastMessage.sender_id !== DEMO_USER_ID && lastMessage.created_at > (state.reads.get(match.id) ?? ""),
        ),
      };
    })
    .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
}

export function demoMatchDetail(state: DemoState, matchId: string) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !isVisible(state, match.other_id)) return null;

  const person = state.people.get(match.other_id);
  if (!person) return null;

  state.reads.set(match.id, new Date().toISOString());
  const messages = state.messages.filter((message) => message.match_id === match.id);

  return {
    otherProfile: {
      ...person.profile,
      discord_username: person.contact.discord_username,
      discord_id: person.contact.discord_id,
      tarkov_stats: person.stats,
    },
    messages: messages.slice(-30),
  };
}

export function demoOlderMessages(state: DemoState, matchId: string, before: string) {
  const older = state.messages.filter((message) => message.match_id === matchId && message.created_at < before);
  return { messages: older.slice(-30), hasMore: older.length > 30 };
}

export function demoSendMessage(state: DemoState, matchId: string, body: string) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !isVisible(state, match.other_id)) return null;

  const now = Date.now();
  const mine: Message = { id: randomUUID(), match_id: matchId, sender_id: DEMO_USER_ID, body, created_at: new Date(now).toISOString() };
  const person = state.people.get(match.other_id);
  const sentBefore = state.messages.filter((message) => message.match_id === matchId && message.sender_id === DEMO_USER_ID).length;
  const replyBody = person?.replies[sentBefore % person.replies.length];
  const reply: Message | null = replyBody
    ? { id: randomUUID(), match_id: matchId, sender_id: match.other_id, body: replyBody, created_at: new Date(now + 1000).toISOString() }
    : null;

  state.messages.push(mine, ...(reply ? [reply] : []));
  match.last_message_at = (reply ?? mine).created_at;
  state.reads.set(matchId, (reply ?? mine).created_at);
  return reply ? [mine, reply] : [mine];
}

function withResponses<T extends { id: string }>(state: DemoState, kind: PostKind, post: T, ownerId: string) {
  const responses = state.responses
    .filter((response) => response.kind === kind && response.post_id === post.id)
    .filter((response) => isVisible(state, response.responder_id))
    .map(({ kind: _kind, ...response }) => {
      void _kind;
      return { ...response, responder: publicProfile(state, response.responder_id) ?? null };
    });

  if (ownerId === DEMO_USER_ID) return { ...post, responses, myResponse: null };
  return { ...post, responses: [], myResponse: responses.find((response) => response.responder_id === DEMO_USER_ID) ?? null };
}

type RaidFilters = { region?: Region; language?: Language; map?: MapName; objective?: Objective; game_mode?: GameMode };

export function demoRaidPosts(state: DemoState, filters: RaidFilters): RaidNowPost[] {
  const now = new Date().toISOString();
  return state.raidPosts
    .filter((post) => !post.closed_at && post.expires_at > now && isVisible(state, post.profile_id))
    .filter((post) => !filters.region || post.region === filters.region)
    .filter((post) => !filters.language || post.language === filters.language)
    .filter((post) => !filters.map || post.map === filters.map)
    .filter((post) => !filters.objective || post.objective === filters.objective)
    .filter((post) => !filters.game_mode || post.game_mode === filters.game_mode)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ closed_at: _closed, ...post }) => {
      void _closed;
      const accepted_count = state.responses.filter(
        (response) => response.kind === "raid_now" && response.post_id === post.id && response.status === "accepted",
      ).length;
      return {
        ...withResponses(state, "raid_now", post, post.profile_id),
        accepted_count,
        profile: publicProfile(state, post.profile_id),
      };
    });
}

type QuestFilters = { region?: Region; language?: Language; map?: MapName; request_type?: QuestHelpType; game_mode?: GameMode };

export function demoQuestPosts(state: DemoState, filters: QuestFilters): QuestHelpPost[] {
  const now = new Date().toISOString();
  return state.questPosts
    .filter((post) => post.status === "Activa" && post.expires_at > now && isVisible(state, post.user_id))
    .filter((post) => !filters.region || post.region === filters.region)
    .filter((post) => !filters.language || post.language === filters.language)
    .filter((post) => !filters.map || post.map === filters.map)
    .filter((post) => !filters.request_type || post.request_type === filters.request_type)
    .filter((post) => !filters.game_mode || post.game_mode === filters.game_mode)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((post) => ({ ...withResponses(state, "quest_help", post, post.user_id), profile: publicProfile(state, post.user_id) }));
}

// A demo player answers every post you publish so the accept flow can be tried right away.
function simulateIncomingResponse(state: DemoState, kind: PostKind, postId: string, gameMode: GameMode) {
  const responder = Array.from(state.people.values()).find(
    (person) => isVisible(state, person.profile.id) && (person.profile.game_modes ?? ["PvP"]).includes(gameMode),
  );
  if (!responder) return;

  state.responses.push({
    kind,
    id: randomUUID(),
    post_id: postId,
    responder_id: responder.profile.id,
    message: kind === "raid_now" ? "Me apunto. Tengo comms y voy equipado." : "Puedo ayudarte, ya la tengo hecha.",
    status: "pending",
    match_id: null,
    created_at: new Date().toISOString(),
  });
}

export type DemoRaidInput = {
  map: MapName;
  objective: Objective;
  players_needed: number;
  language: Language;
  region: Region;
  style: PlayStyle;
  game_mode: GameMode;
  notes?: string;
};

export function demoCreateRaidPost(state: DemoState, input: DemoRaidInput) {
  const now = new Date().toISOString();
  const active = state.raidPosts.some((post) => post.profile_id === DEMO_USER_ID && !post.closed_at && post.expires_at > now);
  if (active) return "raidNow.activePostExists" as const;

  const id = randomUUID();
  state.raidPosts.unshift({
    id,
    profile_id: DEMO_USER_ID,
    ...input,
    notes: input.notes || null,
    expires_at: minutesFromNow(90),
    created_at: now,
    closed_at: null,
  });
  simulateIncomingResponse(state, "raid_now", id, input.game_mode);
  return null;
}

export function demoCloseRaidPost(state: DemoState, postId: string) {
  const post = state.raidPosts.find((item) => item.id === postId && item.profile_id === DEMO_USER_ID && !item.closed_at);
  if (!post) return false;
  post.closed_at = new Date().toISOString();
  return true;
}

export type DemoQuestInput = {
  quest_id: string | null;
  quest_name: string;
  map: MapName;
  region: Region;
  language: Language;
  playstyle: PlayStyle | null;
  game_mode: GameMode;
  request_type: QuestHelpType;
  description: string | null;
};

export function demoCreateQuestPost(state: DemoState, input: DemoQuestInput) {
  const now = new Date().toISOString();
  const id = randomUUID();
  state.questPosts.unshift({
    id,
    user_id: DEMO_USER_ID,
    ...input,
    status: "Activa",
    expires_at: minutesFromNow(60 * 24),
    created_at: now,
    updated_at: now,
  });
  simulateIncomingResponse(state, "quest_help", id, input.game_mode);
}

export function demoCloseQuestPost(state: DemoState, postId: string) {
  const post = state.questPosts.find((item) => item.id === postId && item.user_id === DEMO_USER_ID && item.status === "Activa");
  if (!post) return false;
  post.status = "Cerrada";
  post.updated_at = new Date().toISOString();
  return true;
}

export function demoRespond(state: DemoState, kind: PostKind, postId: string, message: string | null) {
  const post =
    kind === "raid_now"
      ? state.raidPosts.find((item) => item.id === postId && !item.closed_at)
      : state.questPosts.find((item) => item.id === postId && item.status === "Activa");
  if (!post) return "responses.failed" as const;

  const ownerId = "profile_id" in post ? post.profile_id : post.user_id;
  if (ownerId === DEMO_USER_ID || !isVisible(state, ownerId)) return "responses.failed" as const;
  if ("players_needed" in post) {
    const accepted = state.responses.filter((item) => item.kind === kind && item.post_id === postId && item.status === "accepted").length;
    if (accepted >= post.players_needed) return "responses.failed" as const;
  }
  if (state.responses.some((item) => item.kind === kind && item.post_id === postId && item.responder_id === DEMO_USER_ID)) {
    return "responses.duplicate" as const;
  }

  state.responses.push({
    kind,
    id: randomUUID(),
    post_id: postId,
    responder_id: DEMO_USER_ID,
    message,
    status: "pending",
    match_id: null,
    created_at: new Date().toISOString(),
  });

  // Demo owners accept straight away so the chat that opens can be explored.
  const response = state.responses[state.responses.length - 1];
  const match = openMatch(state, ownerId);
  response.status = "accepted";
  response.match_id = match.id;
  if (message) {
    state.messages.push({ id: randomUUID(), match_id: match.id, sender_id: DEMO_USER_ID, body: message, created_at: new Date().toISOString() });
    match.last_message_at = new Date().toISOString();
  }
  return null;
}

export function demoDecideResponse(state: DemoState, kind: PostKind, responseId: string, accept: boolean) {
  const response = state.responses.find((item) => item.kind === kind && item.id === responseId);
  if (!response) return { ok: false as const };

  const post =
    kind === "raid_now"
      ? state.raidPosts.find((item) => item.id === response.post_id)
      : state.questPosts.find((item) => item.id === response.post_id);
  const ownerId = post ? ("profile_id" in post ? post.profile_id : post.user_id) : null;
  if (ownerId !== DEMO_USER_ID) return { ok: false as const };
  if (response.status !== "pending") return { ok: true as const, matchId: response.match_id };

  if (!accept) {
    response.status = "declined";
    return { ok: true as const, matchId: null };
  }

  const match = openMatch(state, response.responder_id);
  response.status = "accepted";
  response.match_id = match.id;
  if (response.message) {
    state.messages.push({
      id: randomUUID(),
      match_id: match.id,
      sender_id: response.responder_id,
      body: response.message,
      created_at: new Date().toISOString(),
    });
    match.last_message_at = new Date().toISOString();
  }
  return { ok: true as const, matchId: match.id };
}

export function demoBlock(state: DemoState, profileId: string) {
  if (!state.people.has(profileId)) return false;
  state.blocks.add(profileId);
  return true;
}

export function demoReport(state: DemoState, profileId: string) {
  if (!state.people.has(profileId)) return false;
  state.reportCount += 1;
  return true;
}

export function demoBadges(state: DemoState): AppBadges {
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const visibleMatches = state.matches.filter((match) => isVisible(state, match.other_id));
  const unread = state.messages.filter((message) => {
    const match = visibleMatches.find((item) => item.id === message.match_id);
    return match && message.sender_id !== DEMO_USER_ID && message.created_at > (state.reads.get(match.id) ?? "");
  }).length;
  const pending = (kind: PostKind) =>
    state.responses.filter((response) => {
      if (response.kind !== kind || response.status !== "pending" || response.responder_id === DEMO_USER_ID) return false;
      const post =
        kind === "raid_now"
          ? state.raidPosts.find((item) => item.id === response.post_id && !item.closed_at && item.expires_at > now)
          : state.questPosts.find((item) => item.id === response.post_id && item.status === "Activa" && item.expires_at > now);
      return Boolean(post);
    }).length;

  return {
    unread_messages: unread,
    new_matches: visibleMatches.filter((match) => match.created_at > weekAgo && !state.reads.has(match.id)).length,
    quest_help_responses: pending("quest_help"),
    raid_now_responses: pending("raid_now"),
    open_reports: 0,
    is_admin: false,
  };
}
