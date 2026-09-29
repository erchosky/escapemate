"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, type Locale, normalizeLocale } from "@/lib/i18n/config";
import { writeBrowserLocaleCookie } from "@/lib/i18n/client";
import { useTranslations } from "@/components/app/i18n-provider";
import { cn } from "@/lib/utils";

export function applyLocaleSelection(value: string, setLocale: (locale: Locale) => void, refresh: () => void) {
  const nextLocale = normalizeLocale(value);
  setLocale(nextLocale);
  writeBrowserLocaleCookie(nextLocale);
  refresh();
  return nextLocale;
}

export function LanguageSelector({
  className,
  compact = false,
  initialLocale,
}: {
  className?: string;
  compact?: boolean;
  initialLocale: Locale;
}) {
  const router = useRouter();
  const id = useId();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [syncedLocale, setSyncedLocale] = useState<Locale>(initialLocale);
  const t = useTranslations("common");

  // The server renders initialLocale from the same cookie; follow it when a refresh changes it.
  if (initialLocale !== syncedLocale) {
    setSyncedLocale(initialLocale);
    setLocale(initialLocale);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-xs font-medium text-zinc-400"}>
        {t("language.label")}
      </label>
      <select
        id={id}
        value={locale}
        aria-label={t("language.ariaLabel")}
        onChange={(event) => {
          applyLocaleSelection(event.target.value, setLocale, () => router.refresh());
        }}
        className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs font-semibold text-zinc-100 outline-none transition focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {t(`language.${option}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
