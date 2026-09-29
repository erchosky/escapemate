import { NextResponse } from "next/server";
import { getShellStatus } from "@/lib/supabase/queries";

export async function GET() {
  const status = await getShellStatus();
  const headers = { "Cache-Control": "private, no-store" };
  if (!status) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  return NextResponse.json(status, { headers });
}
