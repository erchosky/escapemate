import { z } from "zod";

const originSchema = z.string().url().transform((value) => new URL(value).origin);

function parseOrigin(value: string | undefined | null) {
  const parsed = originSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getCanonicalOrigin() {
  const configured = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  if (isProduction()) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
  }

  return "http://localhost:3000";
}

function configuredAllowedOrigins() {
  const configured = [process.env.OAUTH_ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => parseOrigin(value.trim()))
    .filter((value): value is string => Boolean(value));

  const defaults = process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

  return new Set([getCanonicalOrigin(), ...defaults, ...configured]);
}

export function getOAuthRedirectOrigin(requestOrigin?: string | null) {
  const canonical = getCanonicalOrigin();

  if (process.env.NODE_ENV === "production") {
    return canonical;
  }

  const requested = parseOrigin(requestOrigin);
  if (!requested) return canonical;

  if (!configuredAllowedOrigins().has(requested)) {
    throw new Error("OAuth origin is not allowed");
  }

  return requested;
}

export function assertAllowedOAuthOrigin(origin: string) {
  const parsed = parseOrigin(origin);
  if (!parsed || !configuredAllowedOrigins().has(parsed)) {
    throw new Error("OAuth origin is not allowed");
  }

  return parsed;
}
