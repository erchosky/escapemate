import { I18nProvider } from "@/components/app/i18n-provider";
import { QuestHelpBoard } from "@/components/app/quest-help-board";
import { resolveQuestHelpErrorCode, resolveQuestHelpSuccessCode } from "@/lib/action-feedback";
import { GAME_MODES, LANGUAGES, normalizeMapName, QUEST_HELP_TYPES, REGIONS } from "@/lib/constants";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { getQuestHelpPosts } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function QuestHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; region?: string; language?: string; map?: string; request_type?: string; game_mode?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const filters = {
    region: REGIONS.find((item) => item === params.region),
    language: LANGUAGES.find((item) => item === params.language),
    map: params.map ? normalizeMapName(params.map) ?? undefined : undefined,
    game_mode: GAME_MODES.find((item) => item === params.game_mode),
    request_type: QUEST_HELP_TYPES.find((item) => item === params.request_type),
  };

  const { user, profile, posts } = await getQuestHelpPosts(filters);
  const [questHelpT, i18n] = await Promise.all([
    getServerTranslator("quest-help", locale),
    getI18nPayload(["common", "quest-help", "profile", "errors"], locale),
  ]);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-50">{questHelpT("title")}</h1>
        <p className="mt-1 text-sm text-zinc-400">{questHelpT("description")}</p>
      </div>
      <I18nProvider {...i18n}>
        <QuestHelpBoard
          posts={posts}
          currentUserId={user.id}
          profile={profile}
          filters={filters}
          errorCode={resolveQuestHelpErrorCode(params.error)}
          successCode={resolveQuestHelpSuccessCode(params.success)}
        />
      </I18nProvider>
    </>
  );
}
