import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { isTarkovDataOffline } from "@/lib/demo/mode";
import { demoTasks } from "@/lib/demo/seed";
import type { Locale } from "@/lib/i18n/config";
import { logActionError } from "@/lib/security";

const TARKOV_GRAPHQL_ENDPOINT = "https://api.tarkov.dev/graphql";
const TARKOV_PLAYER_PROFILE_ENDPOINT = "https://players.tarkov.dev/profile";
const TARKOV_CACHE_SECONDS = 5 * 60;
const TARKOV_TIMEOUT_MS = 4_000;
// After a failure, skip tarkov.dev for a minute instead of making every request wait for it.
const TARKOV_FAILURE_BACKOFF_MS = 60_000;
let tarkovUnavailableUntil = 0;
const TARKOV_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type PlayerLevel = {
  level: number;
  exp: number;
};

type TarkovCounter = {
  Key: string[];
  Value: number;
};

const playerLevelSchema = z.object({
  level: z.number(),
  exp: z.number(),
});

const taskSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  trader: z.object({ name: z.string() }).nullable().optional(),
  map: z.object({ name: z.string() }).nullable().optional(),
  wikiLink: z.string().nullable().optional(),
  minPlayerLevel: z.number().nullable().optional(),
  taskRequirements: z.array(z.object({
    task: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  })).optional(),
  objectives: z.array(z.object({
    id: z.string().nullable().optional(),
    type: z.string(),
    description: z.string(),
    optional: z.boolean(),
    maps: z.array(z.object({ id: z.string().optional(), name: z.string() })),
  })).optional(),
});

const tarkovCounterSchema = z.object({
  Key: z.array(z.string()),
  Value: z.number(),
});

const playerProfileSchema = z.object({
  aid: z.number(),
  info: z.object({
    nickname: z.string().optional(),
    side: z.string().optional(),
    experience: z.number().optional(),
    prestigeLevel: z.number().optional(),
  }).optional(),
  pmcStats: z.object({
    eft: z.object({
      totalInGameTime: z.number().optional(),
      overAllCounters: z.object({
        Items: z.array(tarkovCounterSchema).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
  updated: z.number().optional(),
});

const graphQLErrorSchema = z.object({ message: z.string() }).passthrough();

function graphQLResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.optional(),
    errors: z.array(graphQLErrorSchema).optional(),
  }).passthrough();
}

export type TarkovPlayerStats = {
  source: "tarkov.dev";
  account_id: string;
  nickname: string | null;
  faction: string | null;
  prestige: number | null;
  experience: number | null;
  level: number | null;
  survival_rate: number | null;
  kd: number | null;
  raids: number | null;
  hours: number | null;
  pmc_kills: number | null;
  total_kills: number | null;
  deaths: number | null;
  survived_raids: number | null;
  updated_at_source: string | null;
  field_map: Record<string, string>;
};

async function readJsonWithGuards<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Unexpected tarkov.dev content-type");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > TARKOV_MAX_RESPONSE_BYTES) {
    throw new Error("tarkov.dev response too large");
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error("Empty tarkov.dev response");
  }

  if (new TextEncoder().encode(text).byteLength > TARKOV_MAX_RESPONSE_BYTES) {
    throw new Error("tarkov.dev response too large");
  }

  return schema.parse(JSON.parse(text));
}

async function tarkovGraphQL<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  dataSchema: z.ZodType<T>,
) {
  if (Date.now() < tarkovUnavailableUntil) return null;

  try {
    const response = await fetch(TARKOV_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TARKOV_TIMEOUT_MS),
      next: { revalidate: 60 * 60 },
    });

    const json = response.ok ? await readJsonWithGuards(response, graphQLResponseSchema(dataSchema)) : null;
    if (!json || json.errors?.length) {
      tarkovUnavailableUntil = Date.now() + TARKOV_FAILURE_BACKOFF_MS;
      logActionError("tarkov.graphql", new Error(json ? "GraphQL returned errors" : `HTTP ${response.status}`));
      return null;
    }

    return json.data ?? null;
  } catch (error) {
    tarkovUnavailableUntil = Date.now() + TARKOV_FAILURE_BACKOFF_MS;
    logActionError("tarkov.graphql", error);
    return null;
  }
}

const getPlayerLevels = unstable_cache(
  async () => {
    const data = await tarkovGraphQL(
      `
      query PlayerLevels {
        playerLevels {
          level
          exp
        }
      }
    `,
      undefined,
      z.object({ playerLevels: z.array(playerLevelSchema) }),
    );

    return data?.playerLevels ?? [];
  },
  ["tarkov-player-levels"],
  { revalidate: TARKOV_CACHE_SECONDS },
);

const fetchPlayerProfile = unstable_cache(
  async (playerId: string) => {
    try {
      const response = await fetch(`${TARKOV_PLAYER_PROFILE_ENDPOINT}/${playerId}.json`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TARKOV_TIMEOUT_MS),
        next: { revalidate: TARKOV_CACHE_SECONDS },
      });

      return await readJsonWithGuards(response, playerProfileSchema);
    } catch (error) {
      logActionError("tarkov.playerProfile", error);
      return null;
    }
  },
  ["tarkov-player-profile"],
  { revalidate: TARKOV_CACHE_SECONDS },
);

export const getTasks = cache(async (locale: Locale = "en") => {
  if (isTarkovDataOffline()) return demoTasks;

  const data = await tarkovGraphQL(
    `
    query Tasks($lang: LanguageCode!) {
      tasks(lang: $lang) {
        id
        name
        normalizedName
        trader { name }
        map { name }
        wikiLink
        minPlayerLevel
        taskRequirements {
          task { id name }
        }
        objectives {
          id
          type
          description
          optional
          maps { id name }
        }
      }
    }
  `,
    { lang: locale },
    z.object({ tasks: z.array(taskSchema) }),
  );

  return data?.tasks ?? [];
});

export async function getTaskByName(name: string) {
  const parsed = z.string().trim().min(2).max(120).safeParse(name);
  if (!parsed.success) return null;

  const tasks = await getTasks();
  const needle = parsed.data.toLowerCase();
  return tasks.find((task) => task.name.toLowerCase() === needle) ?? null;
}

export async function getTaskById(id: string) {
  const parsed = z.string().trim().min(2).max(120).safeParse(id);
  if (!parsed.success) return null;

  const tasks = await getTasks();
  return tasks.find((task) => task.id === parsed.data) ?? null;
}

export function parseTarkovPlayerUrl(url: string) {
  const parsed = z.string().url().safeParse(url);
  if (!parsed.success) return null;

  try {
    const value = new URL(parsed.data);
    if (value.hostname === "players.tarkov.dev") {
      const match = value.pathname.match(/^\/profile\/([0-9]+)\.json$/);
      if (!match) return null;

      return {
        url: value.toString(),
        mode: "regular",
        playerId: match[1],
      };
    }

    if (value.hostname !== "tarkov.dev") return null;

    const match = value.pathname.match(/^\/players\/([a-zA-Z0-9_-]+)\/([0-9]+)\/?$/);
    if (!match) return null;

    return {
      url: value.toString(),
      mode: match[1],
      playerId: match[2],
    };
  } catch {
    return null;
  }
}

function getCounter(counters: TarkovCounter[], key: string[]) {
  return counters.find((counter) => counter.Key.length === key.length && counter.Key.every((item, index) => item === key[index]))?.Value ?? null;
}

function roundMetric(value: number | null, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getLevelFromExperience(experience: number | null, playerLevels: PlayerLevel[]) {
  if (experience == null || !playerLevels.length) return null;

  return playerLevels
    .filter((level) => level.exp <= experience)
    .sort((a, b) => b.level - a.level)[0]?.level ?? null;
}

export async function getPlayerById(playerId: string): Promise<TarkovPlayerStats | null> {
  const parsed = z.string().regex(/^[0-9]+$/).safeParse(playerId);
  if (!parsed.success) return null;

  const [profile, playerLevels] = await Promise.all([
    fetchPlayerProfile(parsed.data),
    getPlayerLevels(),
  ]);

  if (!profile?.aid) return null;

  const counters = profile.pmcStats?.eft?.overAllCounters?.Items ?? [];
  const raids = getCounter(counters, ["Sessions", "Pmc"]);
  const survivedRaids = getCounter(counters, ["ExitStatus", "Survived", "Pmc"]);
  const totalKills = getCounter(counters, ["Kills"]);
  const deaths = getCounter(counters, ["Deaths"]);
  const pmcKills = getCounter(counters, ["KilledPmc"]);
  const totalInGameTime = profile.pmcStats?.eft?.totalInGameTime ?? null;
  const experience = profile.info?.experience ?? null;

  return {
    source: "tarkov.dev",
    account_id: String(profile.aid),
    nickname: profile.info?.nickname ?? null,
    faction: profile.info?.side ?? null,
    prestige: profile.info?.prestigeLevel ?? null,
    experience,
    level: getLevelFromExperience(experience, playerLevels),
    survival_rate: raids && survivedRaids != null ? roundMetric((survivedRaids / raids) * 100) : null,
    kd: deaths && totalKills != null ? roundMetric(totalKills / deaths) : null,
    raids,
    hours: totalInGameTime != null ? Math.round(totalInGameTime / 3600) : null,
    pmc_kills: pmcKills,
    total_kills: totalKills,
    deaths,
    survived_raids: survivedRaids,
    updated_at_source: typeof profile.updated === "number" ? new Date(profile.updated).toISOString() : null,
    field_map: {
      level: "info.experience + api.tarkov.dev GraphQL playerLevels",
      survival_rate: "pmcStats.eft.overAllCounters.Items[Key=ExitStatus.Survived.Pmc] / pmcStats.eft.overAllCounters.Items[Key=Sessions.Pmc] * 100",
      kd: "pmcStats.eft.overAllCounters.Items[Key=Kills] / pmcStats.eft.overAllCounters.Items[Key=Deaths]",
      raids: "pmcStats.eft.overAllCounters.Items[Key=Sessions.Pmc]",
      hours: "pmcStats.eft.totalInGameTime / 3600",
      pmc_kills: "pmcStats.eft.overAllCounters.Items[Key=KilledPmc]",
      faction: "info.side",
      prestige: "info.prestigeLevel",
    },
  };
}

export async function getPlayerByUrl(url: string) {
  const parsed = parseTarkovPlayerUrl(url);
  if (!parsed) return null;

  const player = await getPlayerById(parsed.playerId);
  return player ? { ...player, ...parsed } : null;
}
