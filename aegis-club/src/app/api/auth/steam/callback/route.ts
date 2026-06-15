import { NextRequest, NextResponse } from "next/server";
import { verifySteamCallback, fetchSteamProfile, appUrl } from "@/lib/steam";
import { prisma } from "@/lib/prisma";
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const steamId = await verifySteamCallback(url.searchParams);
  if (!steamId) {
    return NextResponse.redirect(`${appUrl()}/?auth=error`);
  }

  const profile = await fetchSteamProfile(steamId);

  const user = await prisma.user.upsert({
    where: { steamId },
    update: {
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl ?? undefined,
    },
    create: {
      steamId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      profile: { create: { country: profile.country ?? undefined } },
    },
  });

  const token = await encodeSession({
    sub: user.id,
    steamId,
    nickname: user.nickname,
    role: user.role,
    avatarUrl: user.avatarUrl,
  });

  const res = NextResponse.redirect(`${appUrl()}/dashboard`);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
