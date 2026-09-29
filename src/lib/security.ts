import { z } from "zod";

export const uuidSchema = z.string().uuid();

type SafeLogMeta = Record<string, string | number | boolean | null | undefined>;

function sanitizeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: typeof error === "string" ? error.slice(0, 180) : "Unknown error" };
  }

  const candidate = error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code.slice(0, 80) : undefined,
    name: typeof candidate.name === "string" ? candidate.name.slice(0, 80) : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    message: typeof candidate.message === "string" ? candidate.message.slice(0, 180) : "Operation failed",
  };
}

function sanitizeMeta(meta?: SafeLogMeta) {
  if (!meta) return undefined;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      typeof value === "string" ? value.slice(0, 180) : value ?? null,
    ]),
  );
}

export function logActionError(action: string, error: unknown, meta?: SafeLogMeta) {
  console.error("[server-error]", {
    action,
    ...sanitizeError(error),
    meta: sanitizeMeta(meta),
  });
}
