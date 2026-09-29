import { I18nProvider } from "@/components/app/i18n-provider";
import { RaidNowBoard } from "@/components/app/raid-now-board";
import { resolveRaidNowErrorCode, resolveRaidNowSuccessCode } from "@/lib/action-feedback";
import { GAME_MODES, LANGUAGES, normalizeMapName, OBJECTIVES, REGIONS } from "@/lib/constants";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { getRaidNowPosts } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function RaidNowPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; region?: string; language?: string; map?: string; objective?: string; game_mode?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const filters = {
    region: REGIONS.find((item) => item === params.region),
    language: LANGUAGES.find((item) => item === params.language),
    map: params.map ? normalizeMapName(params.map) ?? undefined : undefined,
    game_mode: GAME_MODES.find((item) => item === params.game_mode),
    objective: OBJECTIVES.find((item) => item === params.objective),
  };
  const [{ user, profile, posts }, raidNowT, i18n] = await Promise.all([
    getRaidNowPosts(filters),
    getServerTranslator("raid-now", locale),
    getI18nPayload(["common", "raid-now", "profile", "errors"], locale),
  ]);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-50">{raidNowT("title")}</h1>
        <p className="mt-1 text-sm text-zinc-400">{raidNowT("description")}</p>
      </div>
      <I18nProvider {...i18n}>
        <RaidNowBoard
          posts={posts}
          currentUserId={user.id}
          profile={profile}
          filters={filters}
          errorCode={resolveRaidNowErrorCode(params.error)}
          successCode={resolveRaidNowSuccessCode(params.success)}
        />
      </I18nProvider>
    </>
  );
}
