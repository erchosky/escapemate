import { I18nProvider } from "@/components/app/i18n-provider";
import { OnboardingForm } from "@/components/app/onboarding-form";
import { resolveProfileErrorCode } from "@/lib/action-feedback";
import { getI18nPayload, getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const [{ profile }, params, locale] = await Promise.all([getCurrentProfile(), searchParams, getLocale()]);
  const i18n = await getI18nPayload(["common", "onboarding", "profile", "errors"], locale);
  const editing = params.edit === "1" || Boolean(profile?.onboarding_complete);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <I18nProvider {...i18n}>
        <OnboardingForm profile={profile} editing={editing} errorCode={resolveProfileErrorCode(params.error)} />
      </I18nProvider>
    </main>
  );
}
