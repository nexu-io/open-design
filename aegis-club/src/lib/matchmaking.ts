/**
 * Motor de matchmaking.
 *
 * Estilo "Gamers Club": os jogadores entram numa fila, e quando há 10
 * compatíveis o sistema forma uma partida 5x5 equilibrada e abre um
 * ready-check. O host cria o lobby no cliente do Dota 2 e compartilha
 * nome/senha; ao fim, todos podem elogiar/denunciar.
 *
 * A compatibilidade considera modo, região e — crucialmente — o behavior
 * score: jogadores de baixa prioridade só caem com outros de baixa
 * prioridade, isolando a toxicidade das partidas saudáveis.
 */

import type { Prisma, QueueMode, Region } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLowPriority } from "@/lib/reputation";

export const MATCH_SIZE = 10;
const TEAM_SIZE = 5;

interface BalanceablePlayer {
  userId: string;
  rankPoints: number;
}

/**
 * Divide 10 jogadores em dois times equilibrados.
 * Heurística gananciosa: ordena por rankPoints (desc) e aloca cada
 * jogador ao time com menor soma atual, respeitando o tamanho máximo.
 */
export function balanceTeams<T extends BalanceablePlayer>(
  players: T[],
): { radiant: T[]; dire: T[] } {
  const sorted = [...players].sort((a, b) => b.rankPoints - a.rankPoints);
  const radiant: T[] = [];
  const dire: T[] = [];
  let radiantSum = 0;
  let direSum = 0;

  for (const p of sorted) {
    const radiantFull = radiant.length >= TEAM_SIZE;
    const direFull = dire.length >= TEAM_SIZE;
    const goRadiant = direFull
      ? true
      : radiantFull
        ? false
        : radiantSum <= direSum;
    if (goRadiant) {
      radiant.push(p);
      radiantSum += p.rankPoints;
    } else {
      dire.push(p);
      direSum += p.rankPoints;
    }
  }
  return { radiant, dire };
}

export function averageRank(players: BalanceablePlayer[]): number {
  if (players.length === 0) return 1000;
  const sum = players.reduce((acc, p) => acc + p.rankPoints, 0);
  return Math.round(sum / players.length);
}

/**
 * Tenta formar uma partida a partir das entradas em espera.
 * Retorna o id da partida criada, ou null se ainda não há 10 compatíveis.
 *
 * Roda dentro de uma transação para evitar alocar o mesmo jogador duas vezes.
 */
export async function tryFormMatch(
  mode: QueueMode,
  region: Region,
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const waiting = await tx.queueEntry.findMany({
      where: { status: "WAITING", mode, region },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    // Separa em "saudáveis" e "baixa prioridade" para não misturar.
    const healthy = waiting.filter((e) => !isLowPriority(e.behaviorScore));
    const lowPrio = waiting.filter((e) => isLowPriority(e.behaviorScore));

    const pool =
      healthy.length >= MATCH_SIZE
        ? healthy
        : lowPrio.length >= MATCH_SIZE
          ? lowPrio
          : null;

    if (!pool) return null;

    // Pega os 10 que esperam há mais tempo (prioridade por fila).
    const chosen = pool.slice(0, MATCH_SIZE);
    const { radiant, dire } = balanceTeams(
      chosen.map((e) => ({ userId: e.userId, rankPoints: e.rankPoints, id: e.id })),
    );

    const avg = averageRank(chosen);

    const playerData: Prisma.MatchPlayerCreateWithoutMatchInput[] = [
      ...radiant.map((p, i) => ({
        user: { connect: { id: p.userId } },
        team: "RADIANT" as const,
        slot: i,
      })),
      ...dire.map((p, i) => ({
        user: { connect: { id: p.userId } },
        team: "DIRE" as const,
        slot: i,
      })),
    ];

    const match = await tx.match.create({
      data: {
        mode,
        region,
        status: "DRAFTING",
        averageRank: avg,
        players: { create: playerData },
      },
    });

    await tx.queueEntry.updateMany({
      where: { id: { in: chosen.map((e) => e.id) } },
      data: { status: "MATCHED", matchId: match.id },
    });

    return match.id;
  });
}
