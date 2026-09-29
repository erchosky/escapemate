import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE, isDemoBackend } from "@/lib/demo/mode";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (isDemoBackend()) {
    // Each browser gets its own in-memory demo world, which also isolates parallel E2E tests.
    if (request.cookies.has(DEMO_SESSION_COOKIE)) return NextResponse.next();

    const sessionId = crypto.randomUUID();
    request.cookies.set(DEMO_SESSION_COOKIE, sessionId);
    const response = NextResponse.next({ request });
    response.cookies.set(DEMO_SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", path: "/" });
    return response;
  }

  return updateSession(request);
}

export const config = {
  // Static assets and the public quest data route never need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons|data|api/tarkov|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)"],
};
