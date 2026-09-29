export const REGIONS = ["EU", "NA", "LATAM", "ASIA"] as const;
export const GAME_MODES = ["PvP", "PvE"] as const;
export const LANGUAGES = ["ES", "EN", "FR", "DE", "PT", "RU", "IT"] as const;
export const MAPS = [
  "Customs",
  "Factory",
  "Woods",
  "Shoreline",
  "Interchange",
  "Reserve",
  "Lighthouse",
  "Streets of Tarkov",
  "Ground Zero",
  "The Lab",
  "Terminal",
  "The Labyrinth",
  "Icebreaker",
] as const;

export const PLAY_STYLES = [
  "Chill",
  "Tryhard",
  "PvP",
  "Loot goblin",
  "Rat",
  "Sniper",
  "Sherpa",
  "New player",
  "Quest focused",
] as const;

export const OBJECTIVES = [
  "Misiones",
  "Loot runs",
  "PvP",
  "Aprender",
  "Farmear dinero",
  "Labs",
  "Boss hunting",
  "Scav runs",
  "Night raids",
] as const;

export const SCHEDULES = [
  "Mañana",
  "Tarde",
  "Noche",
  "Madrugada",
  "Fines de semana",
] as const;

export type Region = (typeof REGIONS)[number];
export type Language = (typeof LANGUAGES)[number];
export type MapName = (typeof MAPS)[number];
export type PlayStyle = (typeof PLAY_STYLES)[number];
export type Objective = (typeof OBJECTIVES)[number];
export type Schedule = (typeof SCHEDULES)[number];
export type GameMode = (typeof GAME_MODES)[number];

export const PROFILE_LIMITS = {
  favorite_maps: 5,
  play_styles: 4,
  objectives: 4,
  schedule: 4,
} as const;

export const MAP_ALIASES: Record<string, MapName> = {
  Streets: "Streets of Tarkov",
  Labs: "The Lab",
  Lab: "The Lab",
  "The Labs": "The Lab",
  Laberinto: "The Labyrinth",
  Icebreker: "Icebreaker",
  IceBreaker: "Icebreaker",
  "Night Factory": "Factory",
  "Factory Nocturna": "Factory",
  "Ground Zero 21+": "Ground Zero",
};

export const QUEST_HELP_TYPES = [
  "Necesito ayuda",
  "Ofrezco ayuda / Sherpa",
  "Busco dúo para quest",
  "Busco squad para quest",
  "Busco PvP",
  "Busco loot run",
  "Busco aprender mapa",
] as const;

export type QuestHelpType = (typeof QUEST_HELP_TYPES)[number];

export function normalizeMapName(value: string): MapName | null {
  const trimmed = value.trim();
  const exact = MAPS.find((map) => map.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const alias = Object.entries(MAP_ALIASES).find(([key]) => key.toLowerCase() === trimmed.toLowerCase());
  return alias?.[1] ?? null;
}

export const PUBLIC_PROFILE_COLUMNS = [
  "id",
  "nickname",
  "avatar_url",
  "region",
  "language",
  "spoken_languages",
  "approximate_level",
  "favorite_maps",
  "play_styles",
  "objectives",
  "schedule",
  "game_modes",
  "bio",
  "onboarding_complete",
  "last_active_at",
] as const;

export const PUBLIC_PROFILE_SELECT = PUBLIC_PROFILE_COLUMNS.join(",");

export const PUBLIC_TARKOV_STATS_COLUMNS = [
  "user_id",
  "level",
  "survival_rate",
  "kd",
  "raids",
  "hours",
  "pmc_kills",
  "last_synced_at",
  "is_public",
] as const;

export const PUBLIC_TARKOV_STATS_SELECT = PUBLIC_TARKOV_STATS_COLUMNS.join(",");

export const PRIVATE_TARKOV_STATS_COLUMNS = [
  "id",
  "user_id",
  "tarkov_profile_url",
  "tarkov_player_id",
  "profile_mode",
  "stats_json",
  ...PUBLIC_TARKOV_STATS_COLUMNS.filter((column) => column !== "user_id"),
] as const;

export const PRIVATE_TARKOV_STATS_SELECT = PRIVATE_TARKOV_STATS_COLUMNS.join(",");

export type ProfileTarkovStats = {
  id?: string | null;
  user_id: string;
  tarkov_profile_url?: string | null;
  tarkov_player_id?: string | null;
  profile_mode?: string | null;
  stats_json?: Record<string, unknown> | null;
  level: number | null;
  survival_rate: number | null;
  kd: number | null;
  raids: number | null;
  hours: number | null;
  pmc_kills: number | null;
  last_synced_at: string | null;
  is_public: boolean;
};

export type Profile = {
  id: string;
  nickname: string;
  discord_username?: string | null;
  discord_id?: string | null;
  avatar_url: string | null;
  region: Region | null;
  language: Language | null;
  spoken_languages: Language[] | null;
  approximate_level: number | null;
  favorite_maps: MapName[] | null;
  play_styles: PlayStyle[] | null;
  objectives: Objective[] | null;
  schedule: Schedule[] | null;
  game_modes?: GameMode[] | null;
  bio: string | null;
  onboarding_complete: boolean;
  last_active_at?: string | null;
  compatibility_score?: number;
  compatibility_reasons?: string[];
  compatibility_warnings?: string[];
  shared_languages?: Language[];
  shared_maps?: MapName[];
  shared_objectives?: Objective[];
  shared_styles?: PlayStyle[];
  tarkov_stats?: ProfileTarkovStats | null;
};

export type MatchSummary = {
  id: string;
  otherProfile: Profile;
  created_at: string;
  last_message_at: string | null;
  lastMessage?: string | null;
  unread?: boolean;
};

export type PostResponseStatus = "pending" | "accepted" | "declined";
export type PostKind = "raid_now" | "quest_help";

export type PostResponse = {
  id: string;
  post_id: string;
  responder_id: string;
  message: string | null;
  status: PostResponseStatus;
  match_id: string | null;
  created_at: string;
  responder?: Profile | null;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type RaidNowPost = {
  id: string;
  profile_id: string;
  map: MapName;
  objective: Objective;
  players_needed: number;
  language: Language;
  region: Region;
  style: PlayStyle;
  game_mode: GameMode;
  accepted_count: number;
  notes: string | null;
  expires_at: string;
  created_at: string;
  profile?: Profile;
  responses?: PostResponse[];
  myResponse?: PostResponse | null;
};

export type QuestHelpPost = {
  id: string;
  user_id: string;
  quest_id: string | null;
  quest_name: string;
  map: MapName;
  region: Region;
  language: Language;
  playstyle: PlayStyle | null;
  game_mode: GameMode;
  request_type: QuestHelpType;
  description: string | null;
  status: "Activa" | "Cerrada" | "Expirada";
  expires_at: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  responses?: PostResponse[];
  myResponse?: PostResponse | null;
};

export type AppBadges = {
  unread_messages: number;
  new_matches: number;
  quest_help_responses: number;
  raid_now_responses: number;
  open_reports: number;
  is_admin: boolean;
};

export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export const REPORT_REASONS = ["harassment", "cheating", "rmt", "spam", "fake_profile", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type AdminReport = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at?: string | null;
  reporter?: Profile | null;
  reported?: Profile | null;
};
