import { NextResponse, type NextRequest } from "next/server";
import { normalizeLocale } from "@/lib/i18n/config";
import { getTasks } from "@/lib/tarkov/client";

// Quest data is identical for every player, so it is served from one CDN-cacheable URL per
// locale instead of being embedded in every Quest Help page render.
export async function GET(request: NextRequest) {
  const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
  const tasks = await getTasks(locale);

  return NextResponse.json(tasks, {
    headers: {
      "Cache-Control": tasks.length
        ? "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
        : "public, max-age=60, s-maxage=60",
    },
  });
}
