import { I18nProvider } from "@/components/app/i18n-provider";
import { SettingsPanel } from "@/components/app/settings-panel";
import { resolveSettingsErrorCode, resolveSettingsSuccessCode } from "@/lib/action-feedback";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { getMyTarkovStats } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ profile, stats }, params, locale] = await Promise.all([getMyTarkovStats(), searchParams, getLocale()]);
  const settingsT = await getServerTranslator("settings", locale);
  const i18n = await getI18nPayload(["common", "settings", "profile", "errors"], locale);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-50">{settingsT("title")}</h1>
        <p className="mt-1 text-sm text-zinc-400">{settingsT("description")}</p>
      </div>
      <I18nProvider {...i18n}>
        <SettingsPanel
          profile={profile}
          stats={stats}
          errorCode={resolveSettingsErrorCode(params.error)}
          successCode={resolveSettingsSuccessCode(params.success)}
        />
      </I18nProvider>
    </>
  );
}
