import type { NextConfig } from "next";

function originFromUrl(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const supabaseOrigin = originFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseHost = hostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const posthogOrigin = originFromUrl(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://app.posthog.com";
const sentryOrigin = originFromUrl(process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN);
const isProduction = process.env.NODE_ENV === "production";

const connectSources = [
  "'self'",
  supabaseOrigin,
  supabaseOrigin ? supabaseOrigin.replace("https://", "wss://") : null,
  "https://api.tarkov.dev",
  "https://players.tarkov.dev",
  posthogOrigin,
  sentryOrigin,
].filter(Boolean);

const imageSources = [
  "'self'",
  "data:",
  "blob:",
  "https://cdn.discordapp.com",
  "https://media.discordapp.net",
  supabaseOrigin,
].filter(Boolean);

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  isProduction ? null : "'unsafe-eval'",
  posthogOrigin,
].filter(Boolean);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  `img-src ${imageSources.join(" ")}`,
  `connect-src ${connectSources.join(" ")}`,
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: isProduction ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
