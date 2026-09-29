import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { I18nProvider } from "@/components/app/i18n-provider";
import { LanguageSelector } from "@/components/app/language-selector";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { getPublicContactEmail } from "@/lib/legal";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getServerTranslator("legal", locale);
  const commonI18n = await getI18nPayload(["common"], locale);
  const contact = getPublicContactEmail() ?? t("contactFallback");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="absolute right-4 top-4">
        <I18nProvider {...commonI18n}>
          <LanguageSelector compact initialLocale={locale} />
        </I18nProvider>
      </div>
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-zinc-50">
          <ShieldCheck className="h-5 w-5 text-lime-300" />
          EscapeMate
        </Link>
        <h1 className="mt-8 text-3xl font-bold">{t("privacyPage.title")}</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-zinc-300">
          <p>{t("privacyPage.paragraphs.intro")}</p>
          <p>{t("privacyPage.paragraphs.discord")}</p>
          <p>{t("privacyPage.paragraphs.profile")}</p>
          <p>{t("privacyPage.paragraphs.tarkovStats")}</p>
          <p>{t("privacyPage.paragraphs.moderation")}</p>
          <p>{t("privacyPage.paragraphs.contact", { contact })}</p>
        </div>
      </div>
    </main>
  );
}
