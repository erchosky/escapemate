"use client";

import { useEffect } from "react";

// posthog-js is ~300 KB, so it is only downloaded when a project key is configured.
// Nothing in the app reads the PostHog React context, so no provider wrapper is needed.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        capture_pageview: true,
        person_profiles: "identified_only",
      });
    });
  }, []);

  return <>{children}</>;
}
