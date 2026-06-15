import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/steam";
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Login de desenvolvimento — cria/usa um usuário fictício e abre sessão.
 * Desabilitado em produção. Útil para testar sem configurar a Steam.
 */
export async function GET() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true"
  ) {
    return NextResponse.json({ error: "Desabilitado" }, { status: 403 });
  }

  const user = await prisma.user.upsert({
    where: { email: "dev@aegis.local" },
    update: {},
    create: {
      email: "dev@aegis.local",
      nickname: "Jogador Dev",
      role: "ADMIN",
      profile: { create: { rankPoints: 3000, behaviorScore: 9000 } },
    },
  });

  const token = await encodeSession({
    sub: user.id,
    steamId: user.steamId,
    nickname: user.nickname,
    role: user.role,
    avatarUrl: user.avatarUrl,
  });

  const res = NextResponse.redirect(`${appUrl()}/dashboard`);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
