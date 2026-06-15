"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Region, TournamentFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/utils";
import {
  generateSingleElimination,
  nextSlot,
  type SeededTeam,
} from "@/lib/bracket";
import {
  createTeamSchema,
  createTournamentSchema,
  reportMatchResultSchema,
} from "@/lib/validations";

// ── Tipos de estado retornados aos formulários ────────────────────
export interface CreateTournamentState {
  ok?: boolean;
  error?: string;
}

export interface RegisterTeamState {
  ok?: boolean;
  error?: string;
}

const TOURNAMENT_FORMATS: readonly TournamentFormat[] = [
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION",
  "ROUND_ROBIN",
];

const REGIONS: readonly Region[] = ["SA", "NA", "EU", "CIS", "SEA", "CHINA"];

function parseFormat(value: FormDataEntryValue | null): TournamentFormat {
  return TOURNAMENT_FORMATS.includes(value as TournamentFormat)
    ? (value as TournamentFormat)
    : "SINGLE_ELIMINATION";
}

function parseRegion(value: FormDataEntryValue | null): Region {
  return REGIONS.includes(value as Region) ? (value as Region) : "SA";
}

/** Converte o valor de um input datetime-local em ISO, ou undefined se vazio. */
function parseLocalDateTime(value: FormDataEntryValue | null): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** Gera um slug único para o torneio (adiciona sufixo curto se houver colisão). */
async function uniqueTournamentSlug(name: string): Promise<string> {
  const base = slugify(name) || "torneio";
  let slug = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await prisma.tournament.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    const suffix = Math.random().toString(36).slice(2, 6);
    slug = `${base}-${suffix}`;
  }
  // Último recurso: timestamp garante unicidade.
  return `${base}-${Date.now().toString(36)}`;
}

/** Cria um torneio em rascunho e leva o organizador para a página de detalhe. */
export async function createTournament(
  _prevState: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  let slug: string;
  try {
    const user = await requireUser();

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const prizePool = String(formData.get("prizePool") ?? "").trim();
    const maxTeams = Number(formData.get("maxTeams"));
    const format = parseFormat(formData.get("format"));
    const region = parseRegion(formData.get("region"));
    const registrationEndsAt = parseLocalDateTime(
      formData.get("registrationEndsAt"),
    );
    const startsAt = parseLocalDateTime(formData.get("startsAt"));

    const parsed = createTournamentSchema.safeParse({
      name,
      description: description || undefined,
      format,
      region,
      maxTeams: Number.isFinite(maxTeams) ? maxTeams : 8,
      prizePool: prizePool || undefined,
      registrationEndsAt,
      startsAt,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { error: first?.message ?? "Dados do torneio inválidos." };
    }

    slug = await uniqueTournamentSlug(parsed.data.name);

    await prisma.tournament.create({
      data: {
        slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        format: parsed.data.format,
        region: parsed.data.region,
        maxTeams: parsed.data.maxTeams,
        prizePool: parsed.data.prizePool ?? null,
        status: "DRAFT",
        organizerId: user.id,
        registrationEndsAt: parsed.data.registrationEndsAt
          ? new Date(parsed.data.registrationEndsAt)
          : null,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para criar um torneio." };
    }
    return { error: "Não foi possível criar o torneio. Tente novamente." };
  }

  // redirect lança internamente — fica fora do try/catch.
  redirect(`/tournaments/${slug}`);
}

/** Inscreve um time no torneio (o usuário vira capitão e primeiro membro). */
export async function registerTeam(
  _prevState: RegisterTeamState,
  formData: FormData,
): Promise<RegisterTeamState> {
  try {
    const user = await requireUser();

    const tournamentId = String(formData.get("tournamentId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const tag = String(formData.get("tag") ?? "").trim();

    const parsed = createTeamSchema.safeParse({ tournamentId, name, tag });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { error: first?.message ?? "Dados do time inválidos." };
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: parsed.data.tournamentId },
      select: {
        slug: true,
        status: true,
        maxTeams: true,
        _count: { select: { teams: true } },
      },
    });
    if (!tournament) {
      return { error: "Torneio não encontrado." };
    }
    if (tournament.status !== "REGISTRATION") {
      return { error: "As inscrições deste torneio não estão abertas." };
    }
    if (tournament._count.teams >= tournament.maxTeams) {
      return { error: "Este torneio já atingiu o número máximo de times." };
    }

    const alreadyCaptain = await prisma.team.findFirst({
      where: {
        tournamentId: parsed.data.tournamentId,
        captainId: user.id,
      },
      select: { id: true },
    });
    if (alreadyCaptain) {
      return { error: "Você já inscreveu um time neste torneio." };
    }

    await prisma.team.create({
      data: {
        tournamentId: parsed.data.tournamentId,
        name: parsed.data.name,
        tag: parsed.data.tag,
        captainId: user.id,
        members: { create: { userId: user.id } },
      },
    });

    revalidatePath(`/tournaments/${tournament.slug}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para inscrever um time." };
    }
    return { error: "Não foi possível inscrever o time. Tente novamente." };
  }
}

/** Garante que o usuário atual é o organizador do torneio; retorna o slug. */
async function requireOrganizer(tournamentId: string): Promise<{
  slug: string;
}> {
  const user = await requireUser();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { slug: true, organizerId: true },
  });
  if (!tournament) {
    throw new Error("Torneio não encontrado.");
  }
  if (tournament.organizerId !== user.id) {
    throw new Error("Apenas o organizador pode gerenciar este torneio.");
  }
  return { slug: tournament.slug };
}

/** Abre as inscrições de um torneio em rascunho. */
export async function openRegistration(tournamentId: string): Promise<void> {
  const { slug } = await requireOrganizer(tournamentId);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "REGISTRATION" },
  });
  revalidatePath(`/tournaments/${slug}`);
}

/**
 * Inicia o torneio: define seeds, gera o chaveamento de eliminação simples,
 * avança automaticamente os "byes" e marca o torneio como Ao vivo.
 */
export async function startTournament(tournamentId: string): Promise<void> {
  const { slug } = await requireOrganizer(tournamentId);

  const teams = await prisma.team.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, seed: true },
  });
  if (teams.length < 2) {
    throw new Error("É preciso ao menos 2 times para iniciar o torneio.");
  }

  // Atribui seeds por ordem de inscrição quando ainda não definidos.
  const seeded: SeededTeam[] = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const seed = team.seed ?? i + 1;
    if (team.seed == null) {
      await prisma.team.update({
        where: { id: team.id },
        data: { seed },
      });
    }
    seeded.push({ id: team.id, seed });
  }

  const bracket = generateSingleElimination(seeded);

  // Cria as partidas apenas se ainda não existirem.
  const existing = await prisma.tournamentMatch.count({ where: { tournamentId } });
  if (existing === 0) {
    await prisma.tournamentMatch.createMany({
      data: bracket.map((m) => ({
        tournamentId,
        round: m.round,
        position: m.position,
        bracket: m.bracket,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        bestOf: m.bracket === "GRAND_FINAL" ? 3 : 1,
      })),
    });
  }

  // Avança automaticamente os byes da primeira rodada (teamA definido, teamB nulo).
  const round1 = await prisma.tournamentMatch.findMany({
    where: { tournamentId, round: 1 },
    orderBy: { position: "asc" },
  });
  for (const match of round1) {
    if (match.teamAId && !match.teamBId && !match.winnerId) {
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { winnerId: match.teamAId, completedAt: new Date() },
      });
      await advanceWinner(tournamentId, match.round, match.position, match.teamAId);
    }
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "LIVE", startsAt: new Date() },
  });
  revalidatePath(`/tournaments/${slug}`);
}

/**
 * Propaga o vencedor de (round, position) para o slot correspondente da
 * próxima rodada. Retorna true se havia partida seguinte (não era a final).
 */
async function advanceWinner(
  tournamentId: string,
  round: number,
  position: number,
  winnerTeamId: string,
): Promise<boolean> {
  const target = nextSlot(position);
  const next = await prisma.tournamentMatch.findFirst({
    where: {
      tournamentId,
      round: round + 1,
      position: target.position,
    },
    orderBy: { position: "asc" },
  });
  if (!next) return false;

  await prisma.tournamentMatch.update({
    where: { id: next.id },
    data: target.slot === "A" ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId },
  });
  return true;
}

/**
 * Registra o resultado de uma partida do torneio. Apenas o organizador pode.
 * Avança o vencedor; se era a final, marca o torneio como Encerrado.
 */
export async function reportTournamentMatch(input: {
  matchId: string;
  winnerTeamId: string;
  scoreA: number;
  scoreB: number;
}): Promise<void> {
  const user = await requireUser();

  const parsed = reportMatchResultSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Resultado inválido.");
  }
  const { matchId, winnerTeamId, scoreA, scoreB } = parsed.data;

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    include: {
      tournament: { select: { id: true, slug: true, organizerId: true } },
    },
  });
  if (!match) {
    throw new Error("Partida não encontrada.");
  }
  if (match.tournament.organizerId !== user.id) {
    throw new Error("Apenas o organizador pode registrar resultados.");
  }
  if (!match.teamAId || !match.teamBId) {
    throw new Error("A partida ainda não tem os dois times definidos.");
  }
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) {
    throw new Error("O vencedor precisa ser um dos times da partida.");
  }

  const loserId =
    winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: {
      scoreA,
      scoreB,
      winnerId: winnerTeamId,
      completedAt: new Date(),
    },
  });

  // Elimina o perdedor (eliminação simples).
  await prisma.team.update({
    where: { id: loserId },
    data: { eliminated: true },
  });

  const hadNext = await advanceWinner(
    match.tournament.id,
    match.round,
    match.position,
    winnerTeamId,
  );

  // Sem próxima partida = era a final → torneio encerrado.
  if (!hadNext) {
    await prisma.tournament.update({
      where: { id: match.tournament.id },
      data: { status: "COMPLETED" },
    });
  }

  revalidatePath(`/tournaments/${match.tournament.slug}`);
}
