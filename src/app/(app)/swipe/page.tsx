import { I18nProvider } from "@/components/app/i18n-provider";
import { SwipeDeck } from "@/components/app/swipe-deck";
import { getI18nPayload, getLocale } from "@/lib/i18n/server";
import { getSwipeCandidates } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function SwipePage() {
  const [locale, profiles] = await Promise.all([getLocale(), getSwipeCandidates()]);
  const i18n = await getI18nPayload(["common", "profile", "swipe", "matches", "errors"], locale);

  return (
    <I18nProvider {...i18n}>
      <SwipeDeck initialProfiles={profiles} />
    </I18nProvider>
  );
}
