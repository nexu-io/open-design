"use server";

import { revalidatePath } from "next/cache";
import type { QueueMode, Region } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { tryFormMatch } from "@/lib/matchmaking";
import { canQueueRanked, BEHAVIOR_START } from "@/lib/reputation";
import { joinQueueSchema } from "@/lib/validations";

export interface QueueActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Entra na fila de matchmaking.
 * Cria (ou reaproveita) uma QueueEntry em espera e tenta formar uma partida.
 */
export async function joinQueue(
  mode: QueueMode,
  region: Region,
): Promise<QueueActionResult> {
  const user = await requireUser();

  const parsed = joinQueueSchema.safeParse({ mode, region });
  if (!parsed.success) {
    return { ok: false, error: "Modo ou região inválidos." };
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
  });
  const rankPoints = profile?.rankPoints ?? 1000;
  const behaviorScore = profile?.behaviorScore ?? BEHAVIOR_START;

  // Conduta muito baixa não pode jogar ranqueada.
  if (parsed.data.mode === "RANKED_5V5" && !canQueueRanked(behaviorScore)) {
    return {
      ok: false,
      error:
        "Sua conduta está abaixo do mínimo para a fila ranqueada. Jogue partidas limpas para recuperar.",
    };
  }

  // Evita filas duplicadas: se já há uma entrada ativa, reaproveita.
  const existing = await prisma.queueEntry.findFirst({
    where: { userId: user.id, status: { in: ["WAITING", "MATCHED"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    await prisma.queueEntry.create({
      data: {
        userId: user.id,
        mode: parsed.data.mode,
        region: parsed.data.region,
        status: "WAITING",
        rankPoints,
        behaviorScore,
      },
    });
  } else if (existing.status === "WAITING" && existing.mode !== parsed.data.mode) {
    // Trocou de modo enquanto esperava: atualiza a entrada existente.
    await prisma.queueEntry.update({
      where: { id: existing.id },
      data: { mode: parsed.data.mode, region: parsed.data.region },
    });
  }

  // Tenta fechar uma partida 5x5 com quem está esperando.
  await tryFormMatch(parsed.data.mode, parsed.data.region);

  revalidatePath("/play");
  return { ok: true };
}

/**
 * Sai da fila: cancela todas as entradas em espera do usuário.
 */
export async function leaveQueue(): Promise<QueueActionResult> {
  const user = await requireUser();

  await prisma.queueEntry.updateMany({
    where: { userId: user.id, status: "WAITING" },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/play");
  return { ok: true };
}
