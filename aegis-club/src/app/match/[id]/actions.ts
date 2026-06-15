"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { MatchSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { rankDelta } from "@/lib/ranking";
import {
  clampBehavior,
  commendDelta,
  reportDelta,
  BEHAVIOR_START,
} from "@/lib/reputation";
import { commendSchema, reportSchema } from "@/lib/validations";

export interface MatchActionResult {
  ok: boolean;
  error?: string;
}

function matchPath(matchId: string): string {
  return `/match/${matchId}`;
}

/** O host é o jogador do slot 0 do time Radiant. */
function isHost(team: MatchSide, slot: number): boolean {
  return team === "RADIANT" && slot === 0;
}

/**
 * Confirma presença (ready-check): marca o MatchPlayer do usuário como pronto.
 */
export async function setReady(matchId: string): Promise<MatchActionResult> {
  const user = await requireUser();

  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId: user.id } },
  });
  if (!player) {
    return { ok: false, error: "Você não participa desta partida." };
  }

  await prisma.matchPlayer.update({
    where: { id: player.id },
    data: { ready: true },
  });

  revalidatePath(matchPath(matchId));
  return { ok: true };
}

/**
 * Atualiza nome/senha do lobby do Dota 2 (apenas o host).
 */
export async function setLobbyInfo(
  matchId: string,
  formData: FormData,
): Promise<MatchActionResult> {
  const user = await requireUser();

  const player = await prisma.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId: user.id } },
  });
  if (!player || !isHost(player.team, player.slot)) {
    return { ok: false, error: "Apenas o host pode definir o lobby." };
  }

  const lobbyName = String(formData.get("lobbyName") ?? "").trim();
  const lobbyPassword = String(formData.get("lobbyPassword") ?? "").trim();

  await prisma.match.update({
    where: { id: matchId },
    data: {
      lobbyName: lobbyName || null,
      lobbyPassword: lobbyPassword || null,
    },
  });

  revalidatePath(matchPath(matchId));
  return { ok: true };
}

/**
 * Inicia a partida (apenas o host, e somente quando todos estão prontos).
 */
export async function startMatch(matchId: string): Promise<MatchActionResult> {
  const user = await requireUser();

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  });
  if (!match) {
    return { ok: false, error: "Partida não encontrada." };
  }

  const host = match.players.find((p) => p.userId === user.id);
  if (!host || !isHost(host.team, host.slot)) {
    return { ok: false, error: "Apenas o host pode iniciar a partida." };
  }

  if (match.status !== "DRAFTING") {
    return { ok: false, error: "A partida já foi iniciada." };
  }

  const allReady =
    match.players.length > 0 && match.players.every((p) => p.ready);
  if (!allReady) {
    return {
      ok: false,
      error: "Aguarde todos confirmarem presença antes de iniciar.",
    };
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status: "LIVE", startedAt: new Date() },
  });

  revalidatePath(matchPath(matchId));
  return { ok: true };
}

/**
 * Reporta o resultado da partida e liquida rankPoints/estatísticas.
 * Qualquer participante pode reportar (modelo de confiança da comunidade).
 */
export async function reportResult(
  matchId: string,
  winner: "RADIANT" | "DIRE",
): Promise<MatchActionResult> {
  const user = await requireUser();

  try {
    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: { include: { user: { include: { profile: true } } } } },
      });
      if (!match) {
        throw new Error("Partida não encontrada.");
      }

      const isParticipant = match.players.some((p) => p.userId === user.id);
      if (!isParticipant) {
        throw new Error("Apenas participantes podem reportar o resultado.");
      }

      if (match.status === "COMPLETED") {
        throw new Error("Esta partida já foi finalizada.");
      }

      const radiantPlayers = match.players.filter((p) => p.team === "RADIANT");
      const direPlayers = match.players.filter((p) => p.team === "DIRE");

      const avg = (players: typeof match.players): number => {
        if (players.length === 0) return match.averageRank;
        const sum = players.reduce(
          (acc, p) => acc + (p.user.profile?.rankPoints ?? 1000),
          0,
        );
        return Math.round(sum / players.length);
      };
      const radiantAvg = avg(radiantPlayers);
      const direAvg = avg(direPlayers);

      const radiantWin = winner === "RADIANT";

      await tx.match.update({
        where: { id: matchId },
        data: {
          radiantWin,
          status: "COMPLETED",
          endedAt: new Date(),
        },
      });

      for (const p of match.players) {
        const won = p.team === winner;
        const teamAvg = p.team === "RADIANT" ? radiantAvg : direAvg;
        const oppAvg = p.team === "RADIANT" ? direAvg : radiantAvg;
        const delta = rankDelta(teamAvg, oppAvg, won);

        await tx.matchPlayer.update({
          where: { id: p.id },
          data: { won, rankDelta: delta },
        });

        await tx.profile.update({
          where: { userId: p.userId },
          data: {
            rankPoints: { increment: delta },
            matchesPlayed: { increment: 1 },
            wins: { increment: won ? 1 : 0 },
            losses: { increment: won ? 0 : 1 },
          },
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Não foi possível reportar o resultado.",
    };
  }

  revalidatePath(matchPath(matchId));
  return { ok: true };
}

export interface CommendInput {
  matchId: string;
  toUserId: string;
  category: "FRIENDLY" | "FORGIVING" | "TEACHING" | "LEADERSHIP";
}

/**
 * Elogia um jogador da partida. Soma pontos de conduta ao alvo.
 */
export async function commendPlayer(
  input: CommendInput,
): Promise<MatchActionResult> {
  const user = await requireUser();

  const parsed = commendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Elogio inválido." };
  }

  if (parsed.data.toUserId === user.id) {
    return { ok: false, error: "Você não pode elogiar a si mesmo." };
  }

  try {
    await prisma.commend.create({
      data: {
        matchId: input.matchId,
        fromId: user.id,
        toId: parsed.data.toUserId,
        category: parsed.data.category,
      },
    });
  } catch (err) {
    // Elogio repetido (mesma categoria/par/partida): ignora silenciosamente.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: true };
    }
    return { ok: false, error: "Não foi possível registrar o elogio." };
  }

  const target = await prisma.profile.findUnique({
    where: { userId: parsed.data.toUserId },
  });
  const current = target?.behaviorScore ?? BEHAVIOR_START;
  await prisma.profile.update({
    where: { userId: parsed.data.toUserId },
    data: { behaviorScore: clampBehavior(current + commendDelta(parsed.data.category)) },
  });

  revalidatePath(matchPath(input.matchId));
  return { ok: true };
}

export interface ReportInput {
  matchId: string;
  toUserId: string;
  category:
    | "TOXIC_CHAT"
    | "INTENTIONAL_FEEDING"
    | "GRIEFING"
    | "ABANDON"
    | "HATE_SPEECH"
    | "CHEATING"
    | "SMURFING";
  comment?: string;
}

/**
 * Denuncia um jogador da partida.
 *
 * NOTA: em produção, denúncias passam por revisão (manual ou automática
 * agregando múltiplos relatos) ANTES de penalizar o alvo. Aqui aplicamos a
 * penalidade direta para fins de demonstração do fluxo.
 */
export async function reportPlayer(
  input: ReportInput,
): Promise<MatchActionResult> {
  const user = await requireUser();

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Denúncia inválida." };
  }

  if (parsed.data.toUserId === user.id) {
    return { ok: false, error: "Você não pode denunciar a si mesmo." };
  }

  try {
    await prisma.report.create({
      data: {
        matchId: input.matchId,
        fromId: user.id,
        toId: parsed.data.toUserId,
        category: parsed.data.category,
        comment: parsed.data.comment?.trim() || null,
      },
    });
  } catch (err) {
    // Denúncia repetida (mesmo par/partida): ignora silenciosamente.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: true };
    }
    return { ok: false, error: "Não foi possível registrar a denúncia." };
  }

  const target = await prisma.profile.findUnique({
    where: { userId: parsed.data.toUserId },
  });
  const current = target?.behaviorScore ?? BEHAVIOR_START;
  // reportDelta retorna valor negativo; clampBehavior garante o piso em 0.
  await prisma.profile.update({
    where: { userId: parsed.data.toUserId },
    data: {
      behaviorScore: clampBehavior(current + reportDelta(parsed.data.category)),
    },
  });

  revalidatePath(matchPath(input.matchId));
  return { ok: true };
}
