export const DEMO_SESSION_COOKIE = "escapemate_demo_session";

// Local demo backend: every page and action runs against an in-memory store instead of
// Supabase. It runs under `next dev` (with LOCAL_DEMO=true or no Supabase configured), or under
// a local production build only when a second explicit flag is set (`npm run demo`). Hosted
// environments can never enable it.
export function isDemoBackend() {
  // `npm run dev` without Supabase credentials falls back to the demo instead of failing on every page.
  const unconfiguredDev = process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (process.env.LOCAL_DEMO !== "true" && !unconfiguredDev) return false;
  if (process.env.NODE_ENV !== "production") return true;
  const hosted = Boolean(process.env.NETLIFY || process.env.VERCEL || process.env.CONTEXT || process.env.SITE_ID);
  return process.env.DEMO_PRODUCTION_BUILD === "true" && !hosted;
}

// E2E runs pin tarkov.dev data to fixtures so assertions stay deterministic.
export function isTarkovDataOffline() {
  return isDemoBackend() && process.env.TARKOV_OFFLINE === "true";
}
