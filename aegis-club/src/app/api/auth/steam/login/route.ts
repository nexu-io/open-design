import { NextResponse } from "next/server";
import { buildSteamLoginUrl } from "@/lib/steam";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(buildSteamLoginUrl());
}
