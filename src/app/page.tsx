import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Crosshair,
  Handshake,
  MessageSquare,
  Radio,
  ShieldCheck,
  Swords,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { I18nProvider } from "@/components/app/i18n-provider";
import { LanguageSelector } from "@/components/app/language-selector";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";

export default async function Home() {
  const locale = await getLocale();
  const common = await getServerTranslator("common", locale);
  const legal = await getServerTranslator("legal", locale);
  const commonI18n = await getI18nPayload(["common"], locale);

  const steps = [
    { icon: UserRoundCheck, key: "profile" },
    { icon: Swords, key: "swipe" },
    { icon: Handshake, key: "play" },
  ] as const;

  const features = [
    { icon: Crosshair, key: "compatibility" },
    { icon: Radio, key: "raidNow" },
    { icon: BookOpen, key: "questHelp" },
    { icon: MessageSquare, key: "chat" },
  ] as const;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="relative overflow-hidden">
        <Image
          src="/images/hero-tactical.jpg"
          alt={common("landing.heroImageAlt")}
          fill
          sizes="100vw"
          className="object-cover opacity-60"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-zinc-950/40" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-5">
          <header className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-wide">
              <ShieldCheck className="h-5 w-5 text-lime-300" />
              EscapeMate
            </Link>
            <div className="flex items-center gap-3">
              <I18nProvider {...commonI18n}>
                <LanguageSelector compact initialLocale={locale} />
              </I18nProvider>
              <Button asChild variant="outline">
                <Link href="/login">
                  <span className="sm:hidden">{common("landing.loginShort")}</span>
                  <span className="hidden sm:inline">{common("landing.loginLink")}</span>
                </Link>
              </Button>
            </div>
          </header>

          <div className="grid items-center gap-12 pt-14 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
            <div>
              <Badge tone="lime">{common("landing.badge")}</Badge>
              <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-6xl">
                {common("landing.headline")}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-300">{common("landing.description")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">{common("landing.primaryCta")}</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/raid-now">{common("landing.secondaryCta")}</Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
                {(["free", "discord", "modes"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-lime-300" />
                    {common(`landing.proof.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
            <CardPreview common={common} />
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-900 bg-zinc-950 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{common("landing.how.title")}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(({ icon: Icon, key }, index) => (
              <li key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-400 text-sm font-black text-zinc-950">
                    {index + 1}
                  </span>
                  <Icon className="h-5 w-5 text-lime-300" />
                </div>
                <h3 className="mt-4 font-semibold text-zinc-50">{common(`landing.how.${key}.title`)}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{common(`landing.how.${key}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{common("landing.featuresTitle")}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, key }) => (
              <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <Icon className="h-5 w-5 text-lime-300" />
                <h3 className="mt-3 font-semibold text-zinc-50">{common(`landing.feature.${key}.title`)}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{common(`landing.feature.${key}.text`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p>{common("landing.safety")}</p>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-900 bg-[radial-gradient(circle_at_50%_0%,rgba(163,230,53,0.12),transparent_60%)] py-16 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-bold text-white">{common("landing.finalCta.title")}</h2>
          <p className="mt-3 text-zinc-400">{common("landing.finalCta.text")}</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/login">{common("landing.primaryCta")}</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-zinc-900 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300">
            {legal("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-zinc-300">
            {legal("terms")}
          </Link>
          <span>{legal("notAffiliated")}</span>
        </div>
      </footer>
    </main>
  );
}

// A static mock of the swipe card, so visitors see the product before signing in.
function CardPreview({ common }: { common: (key: string) => string }) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="absolute inset-x-6 -bottom-3 h-full rounded-[28px] border border-zinc-800 bg-zinc-900/80" />
      <div className="relative overflow-hidden rounded-[28px] border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60">
        <div className="relative flex h-56 items-center justify-center bg-gradient-to-br from-lime-500/80 to-emerald-900">
          <span className="-translate-y-4 text-7xl font-black text-white/80">KR</span>
          <div className="absolute left-4 top-4 flex gap-2">
            <Badge tone="lime">EU</Badge>
            <Badge tone="amber">{common("landing.preview.language")}</Badge>
            <Badge>PvP</Badge>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-zinc-950 to-transparent p-4">
            <div>
              <div className="text-2xl font-black text-white">KiloRaptor</div>
              <div className="text-sm text-zinc-300">{common("landing.preview.meta")}</div>
            </div>
            <div className="rounded-2xl border border-lime-300/40 bg-zinc-950/80 px-3 py-2 text-center">
              <div className="text-lg font-black leading-none text-lime-200">94</div>
              <div className="text-[9px] font-semibold uppercase text-zinc-300">match</div>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {(["reason1", "reason2", "reason3"] as const).map((key) => (
              <span key={key} className="rounded border border-lime-400/20 bg-lime-400/10 px-2 py-1 text-[11px] text-lime-100">
                {common(`landing.preview.${key}`)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex h-11 items-center justify-center gap-2 rounded-md border border-red-400/20 bg-red-500/10 text-sm font-semibold text-red-100">
              <X className="h-4 w-4" />
              {common("landing.preview.pass")}
            </div>
            <div className="flex h-11 items-center justify-center gap-2 rounded-md bg-lime-400 text-sm font-semibold text-zinc-950">
              <Check className="h-4 w-4" />
              {common("landing.preview.like")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
