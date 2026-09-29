"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/i18n/format";
import { useI18n } from "@/components/app/i18n-provider";

// Server and client clocks differ by a few seconds, so the first paint may disagree at a
// minute boundary; suppressHydrationWarning covers that and the interval keeps it current.
export function RelativeTime({ value, prefix }: { value: string; prefix?: (time: string) => string }) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const text = formatRelativeTime(value, locale, now);
  return (
    <time dateTime={value} suppressHydrationWarning>
      {prefix ? prefix(text) : text}
    </time>
  );
}
