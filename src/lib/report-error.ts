// Sends an error to Sentry without putting the SDK in every bundle: it is only loaded when
// a DSN is configured (NEXT_PUBLIC_SENTRY_DSN is inlined at build time).
export function reportError(error: unknown) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}
