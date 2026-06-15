import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Trophy,
  Users,
  Coins,
  Calendar,
  MapPin,
  GitMerge,
  Crown,
} from "lucide-react";
import type { Region, TournamentFormat, TournamentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Bracket } from "@/components/tournaments/Bracket";
import { RegisterTeamForm } from "@/components/tournaments/RegisterTeamForm";
import { TournamentAdmin } from "@/components/tournaments/TournamentAdmin";

export const dynamic = "force-dynamic";

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  SINGLE_ELIMINATION: "Eliminação simples",
  DOUBLE_ELIMINATION: "Eliminação dupla",
  ROUND_ROBIN: "Pontos corridos",
};

const STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições abertas",
  LIVE: "Ao vivo",
  COMPLETED: "Encerrado",
  CANCELLED: "Cancelado",
};

const REGION_LABELS: Record<Region, string> = {
  SA: "América do Sul",
  NA: "América do Norte",
  EU: "Europa",
  CIS: "CIS",
  SEA: "Sudeste Asiático",
  CHINA: "China",
};

type BadgeTone = "neutral" | "aegis" | "radiant" | "dire" | "good" | "warn" | "bad";

const STATUS_TONES: Record<TournamentStatus, BadgeTone> = {
  DRAFT: "neutral",
  REGISTRATION: "aegis",
  LIVE: "radiant",
  COMPLETED: "good",
  CANCELLED: "bad",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: tournament?.name ?? "Torneio" };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    prisma.tournament.findUnique({
      where: { slug },
      include: {
        organizer: true,
        teams: {
          include: {
            captain: true,
            _count: { select: { members: true } },
          },
          orderBy: { seed: "asc" },
        },
        matches: {
          include: { teamA: true, teamB: true, winner: true },
          orderBy: [{ round: "asc" }, { position: "asc" }],
        },
      },
    }),
  ]);

  if (!tournament) {
    notFound();
  }

  const isOrganizer = user?.id === tournament.organizerId;
  const isFull = tournament.teams.length >= tournament.maxTeams;
  const alreadyCaptain = user
    ? tournament.teams.some((t) => t.captainId === user.id)
    : false;
  const canRegister =
    tournament.status === "REGISTRATION" &&
    !!user &&
    !alreadyCaptain &&
    !isFull;

  const bracketMatches = tournament.matches.map((m) => ({
    id: m.id,
    round: m.round,
    position: m.position,
    bracket: m.bracket,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    winnerId: m.winnerId,
    teamA: m.teamA
      ? { id: m.teamA.id, name: m.teamA.name, tag: m.teamA.tag }
      : null,
    teamB: m.teamB
      ? { id: m.teamB.id, name: m.teamB.name, tag: m.teamB.tag }
      : null,
  }));

  return (
    <div className="container-page py-10">
      {/* Cabeçalho */}
      <div className="mb-8">
        <Link
          href="/tournaments"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Torneios
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100">
              {tournament.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONES[tournament.status]}>
                {STATUS_LABELS[tournament.status]}
              </Badge>
              <Badge tone="neutral">{FORMAT_LABELS[tournament.format]}</Badge>
              <Badge tone="neutral">
                <MapPin className="h-3 w-3" />
                {REGION_LABELS[tournament.region]}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface/60 px-3 py-2">
            <Avatar
              src={tournament.organizer.avatarUrl}
              name={tournament.organizer.nickname}
              size="sm"
            />
            <div className="text-sm">
              <p className="text-xs text-zinc-500">Organizado por</p>
              <p className="font-medium text-zinc-200">
                {tournament.organizer.nickname}
              </p>
            </div>
          </div>
        </div>

        {tournament.description && (
          <p className="mt-4 max-w-3xl whitespace-pre-line text-sm text-zinc-400">
            {tournament.description}
          </p>
        )}

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-500" />
            <span>
              {tournament.teams.length}/{tournament.maxTeams} times
            </span>
          </div>
          {tournament.prizePool && (
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-zinc-500" />
              <span>{tournament.prizePool}</span>
            </div>
          )}
          {tournament.registrationEndsAt && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-500" />
              <span>
                Inscrições até{" "}
                {dateFormatter.format(tournament.registrationEndsAt)}
              </span>
            </div>
          )}
          {tournament.startsAt && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-zinc-500" />
              <span>Início {dateFormatter.format(tournament.startsAt)}</span>
            </div>
          )}
        </dl>
      </div>

      {/* Painel do organizador */}
      {isOrganizer && (
        <div className="mb-8">
          <TournamentAdmin
            tournamentId={tournament.id}
            status={tournament.status}
            teamCount={tournament.teams.length}
            matches={bracketMatches}
          />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        {/* Times inscritos */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-zinc-100">
            <Users className="h-5 w-5 text-aegis" />
            Times inscritos
          </h2>

          {tournament.teams.length === 0 ? (
            <p className="rounded-xl border border-dashed border-surface-border bg-surface/40 px-4 py-6 text-sm text-zinc-500">
              Ainda não há times inscritos.
            </p>
          ) : (
            <ul className="space-y-2">
              {tournament.teams.map((team) => (
                <li
                  key={team.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface/60 px-4 py-3",
                    team.eliminated && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-zinc-500">
                        {team.tag}
                      </span>
                      <span className="truncate font-medium text-zinc-100">
                        {team.name}
                      </span>
                      {team.eliminated && (
                        <Badge tone="bad">Eliminado</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                      <Crown className="h-3 w-3" />
                      {team.captain.nickname} · {team._count.members}{" "}
                      {team._count.members === 1 ? "membro" : "membros"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canRegister && (
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-300">
                Inscrever seu time
              </h3>
              <RegisterTeamForm tournamentId={tournament.id} />
            </div>
          )}
          {tournament.status === "REGISTRATION" && user && alreadyCaptain && (
            <p className="mt-4 text-sm text-zinc-500">
              Você já inscreveu um time neste torneio.
            </p>
          )}
          {tournament.status === "REGISTRATION" && !user && (
            <p className="mt-4 text-sm text-zinc-500">
              <Link
                href="/api/auth/steam/login"
                className="text-aegis hover:underline"
              >
                Entre
              </Link>{" "}
              para inscrever um time.
            </p>
          )}
          {tournament.status === "REGISTRATION" && isFull && !alreadyCaptain && (
            <p className="mt-4 text-sm text-zinc-500">
              As inscrições estão lotadas.
            </p>
          )}
        </section>

        {/* Chaveamento */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-zinc-100">
            <GitMerge className="h-5 w-5 text-aegis" />
            Chaveamento
          </h2>

          {tournament.matches.length > 0 ? (
            <Bracket matches={bracketMatches} />
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border bg-surface/40 px-4 py-6 text-sm text-zinc-500">
              <Trophy className="h-4 w-4" />
              Chaveamento será gerado quando o torneio começar.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
