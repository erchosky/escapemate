import { logActionError } from "@/lib/security";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

type SupabaseRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => unknown;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;

    buckets.set(key, {
      count: 1,
      resetAt,
    });

    return {
      ok: true,
      remaining: limit - 1,
      resetAt,
    };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;

  return {
    ok: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function clearRateLimitBucketsForTests() {
  buckets.clear();
}

export async function checkPersistentRateLimit(
  supabase: SupabaseRpcClient,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(
    1,
    Math.ceil(options.windowMs / 1000),
  );

  try {
    const response = (await supabase.rpc("check_rate_limit", {
      p_key: options.key,
      p_limit: options.limit,
      p_window_seconds: windowSeconds,
    })) as {
      data?: unknown;
      error?: unknown;
    };

    if (!response || typeof response !== "object") {
      throw new Error("Malformed rate limit RPC response");
    }

    if (response.error) {
      throw response.error;
    }

    const row = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (!row || typeof row !== "object" || !("allowed" in row)) {
      throw new Error("Malformed rate limit RPC data");
    }

    const result = row as {
      allowed: unknown;
      remaining?: unknown;
      reset_at?: unknown;
    };

    if (typeof result.allowed !== "boolean") {
      throw new Error("Malformed rate limit RPC allowed value");
    }

    const resetAt = typeof result.reset_at === "string"
      ? new Date(result.reset_at).getTime()
      : Date.now() + options.windowMs;

    if (!Number.isFinite(resetAt)) {
      throw new Error("Malformed rate limit RPC reset value");
    }

    return {
      ok: result.allowed,
      remaining: typeof result.remaining === "number" && Number.isFinite(result.remaining)
        ? Math.max(0, result.remaining)
        : 0,
      resetAt,
    };
  } catch (error) {
    logActionError("rateLimit.persistent.exception", error);
  }

  if (process.env.NODE_ENV !== "production") {
    return checkRateLimit(options);
  }

  return {
    ok: false,
    remaining: 0,
    resetAt: Date.now() + options.windowMs,
  };
}
