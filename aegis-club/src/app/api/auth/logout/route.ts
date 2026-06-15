import { NextResponse } from "next/server";
import { appUrl } from "@/lib/steam";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  // 303 força o navegador a fazer GET na home após o logout.
  const res = NextResponse.redirect(`${appUrl()}/`, 303);
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
