import { I18nProvider } from "@/components/app/i18n-provider";
import { MatchList } from "@/components/app/match-list";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { getMatches } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const [locale, { matches }] = await Promise.all([getLocale(), getMatches()]);
  const matchesT = await getServerTranslator("matches", locale);
  const i18n = await getI18nPayload(["common", "profile", "matches"], locale);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-50">{matchesT("title")}</h1>
        <p className="mt-1 text-sm text-zinc-400">{matchesT("description")}</p>
      </div>
      <I18nProvider {...i18n}>
        <MatchList matches={matches} />
      </I18nProvider>
    </>
  );
}
