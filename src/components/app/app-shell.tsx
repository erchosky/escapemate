import Link from "next/link";
import { FlaskConical, LogOut, Shield } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { isDemoBackend } from "@/lib/demo/mode";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";
import { AppNav, type AppNavLabels } from "@/components/app/app-nav";
import { I18nProvider } from "@/components/app/i18n-provider";
import { LanguageSelector } from "@/components/app/language-selector";
import { ShellAvatar, ShellStatusProvider } from "@/components/app/shell-status";
import { Button } from "@/components/ui/button";

// The shell does no data fetching: avatar and badges load client-side (shell-status.tsx),
// so layout renders during prefetches and navigations never touch the database.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getServerTranslator("common", locale);
  const commonI18n = await getI18nPayload(["common"], locale);
  const navLabels: AppNavLabels = {
    mainAria: t("navigation.mainAria"),
    mobileAria: t("navigation.mobileAria"),
    items: {
      swipe: t("navigation.items.swipe"),
      matches: t("navigation.items.matches"),
      raidNow: t("navigation.items.raidNow"),
      questHelp: t("navigation.items.questHelp"),
      settings: t("navigation.items.settings"),
      admin: t("navigation.items.admin"),
    },
  };

  return (
    <ShellStatusProvider>
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      {isDemoBackend() ? (
        <div className="flex items-center justify-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-center text-xs text-amber-100">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          {t("demoBanner")}
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/swipe" className="flex items-center gap-2 font-semibold tracking-wide text-zinc-50">
            <Shield className="h-5 w-5 text-lime-300" />
            EscapeMate
          </Link>
          <AppNav labels={navLabels} variant="desktop" />
          <div className="flex items-center gap-2">
            <I18nProvider {...commonI18n}>
              <LanguageSelector compact initialLocale={locale} />
            </I18nProvider>
            <ShellAvatar label={t("navigation.profile")} />
            <form action={signOut}>
              <Button variant="outline" size="icon" title={t("actions.signOut")} aria-label={t("actions.signOut")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:py-6">
        {children}
      </main>
      <AppNav labels={navLabels} variant="mobile" />
    </div>
    </ShellStatusProvider>
  );
}
