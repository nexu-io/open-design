import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Swords,
  CheckCircle2,
  Clock,
  Trophy,
  Crown,
  ShieldQuestion,
} from "lucide-react";
import type {
  MatchSide,
  MatchStatus,
  QueueMode,
  Region,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { RankBadge } from "@/components/ui/RankBadge";
import { ReadyCheck } from "@/components/matchmaking/ReadyCheck";
import { PostMatchPanel } from "@/components/matchmaking/PostMatchPanel";
import {
  CopyField,
  LobbyInfoForm,
  StartMatchButton,
  ReportResultControls,
} from "@/components/matchmaking/MatchLiveControls";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partida" };

const MODE_LABELS: Record<QueueMode, string> = {
  RANKED_5V5: "Ranqueada 5x5",
  UNRANKED_5V5: "Normal 5x5",
};

const REGION_LABELS: Record<Region, string> = {
  SA: "América do Sul",
  NA: "América do Norte",
  EU: "Europa",
  CIS: "CIS",
  SEA: "Sudeste Asiático",
  CHINA: "China",
};

const STATUS_META: Record<
  MatchStatus,
  { label: string; tone: "neutral" | "aegis" | "radiant" | "warn" | "bad" }
> = {
  DRAFTING: { label: "Confirmando presença", tone: "warn" },
  LIVE: { label: "Em andamento", tone: "aegis" },
  COMPLETED: { label: "Finalizada", tone: "radiant" },
  CANCELLED: { label: "Cancelada", tone: "bad" },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MatchPage({ params }: PageProps) {
  const { id } = await params;

  const [match, viewer] = await Promise.all([
    prisma.match.findUnique({
      where: { id },
      include: {
        players: {
          include: { user: { include: { profile: true } } },
          orderBy: [{ team: "asc" }, { slot: "asc" }],
        },
      },
    }),
    getCurrentUser(),
  ]);

  if (!match) notFound();

  const radiant = match.players.filter((p) => p.team === "RADIANT");
  const dire = match.players.filter((p) => p.team === "DIRE");

  const viewerPlayer = viewer
    ? match.players.find((p) => p.userId === viewer.id)
    : undefined;
  const isParticipant = Boolean(viewerPlayer);
  const isHost =
    viewerPlayer?.team === "RADIANT" && viewerPlayer.slot === 0;
  const allReady =
    match.players.length > 0 && match.players.every((p) => p.ready);

  const statusMeta = STATUS_META[match.status];

  const winnerSide: MatchSide | null =
    match.radiantWin === true ? "RADIANT" : match.radiantWin === false ? "DIRE" : null;

  return (
    <div className="container-page py-10">
      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-aegis">
            Partida
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-zinc-100">
            <Swords className="h-6 w-6 text-aegis" />
            <span className="font-mono">#{match.id.slice(-6)}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{MODE_LABELS[match.mode]}</Badge>
            <Badge tone="neutral">{REGION_LABELS[match.region]}</Badge>
            <span className="text-xs text-zinc-500">
              Rank médio {match.averageRank}
            </span>
          </div>
        </div>
        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
      </div>

      {/* Vencedor (COMPLETED) */}
      {match.status === "COMPLETED" && winnerSide && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-radiant/30 bg-radiant/10 px-5 py-3">
          <Trophy className="h-5 w-5 text-radiant" />
          <span className="text-sm font-medium text-zinc-100">
            Vitória do{" "}
            <span
              className={cn(
                "font-semibold",
                winnerSide === "RADIANT" ? "text-radiant" : "text-dire-soft",
              )}
            >
              {winnerSide === "RADIANT" ? "Radiant" : "Dire"}
            </span>
          </span>
        </div>
      )}

      {/* Times */}
      <div className="grid gap-5 lg:grid-cols-2">
        <TeamColumn
          side="RADIANT"
          players={radiant}
          isWinner={winnerSide === "RADIANT"}
          showDelta={match.status === "COMPLETED"}
        />
        <TeamColumn
          side="DIRE"
          players={dire}
          isWinner={winnerSide === "DIRE"}
          showDelta={match.status === "COMPLETED"}
        />
      </div>

      {/* ── DRAFTING: ready-check + host ───────────────────────────── */}
      {match.status === "DRAFTING" && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4 text-aegis" />
                Confirmação de presença
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-zinc-400">
                {match.players.filter((p) => p.ready).length}/
                {match.players.length} jogadores prontos.
              </p>
              {isParticipant && viewerPlayer ? (
                <ReadyCheck
                  matchId={match.id}
                  viewerReady={viewerPlayer.ready}
                />
              ) : (
                <p className="text-sm text-zinc-500">
                  Você está assistindo a esta partida.
                </p>
              )}
            </CardContent>
          </Card>

          {isHost && (
            <Card className="border-aegis/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-aegis" />
                  Controles do host
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <LobbyInfoForm
                  matchId={match.id}
                  lobbyName={match.lobbyName ?? ""}
                  lobbyPassword={match.lobbyPassword ?? ""}
                />
                <div className="border-t border-surface-border pt-4">
                  <StartMatchButton matchId={match.id} allReady={allReady} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── LIVE: lobby + reportar resultado ───────────────────────── */}
      {match.status === "LIVE" && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Lobby no Dota 2</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {match.lobbyName || match.lobbyPassword ? (
                <>
                  {match.lobbyName && (
                    <CopyField label="Nome do lobby" value={match.lobbyName} />
                  )}
                  {match.lobbyPassword && (
                    <CopyField label="Senha" value={match.lobbyPassword} />
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  O host ainda não informou os dados do lobby.
                </p>
              )}
            </CardContent>
          </Card>

          {isParticipant && (
            <Card>
              <CardHeader>
                <CardTitle>Reportar resultado</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportResultControls matchId={match.id} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── COMPLETED: avaliação pós-partida ───────────────────────── */}
      {match.status === "COMPLETED" && isParticipant && viewer && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-aegis" />
              Avaliar jogadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PostMatchPanel
              matchId={match.id}
              viewerUserId={viewer.id}
              players={match.players.map((p) => ({
                userId: p.userId,
                nickname: p.user.nickname,
                avatarUrl: p.user.avatarUrl,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Coluna de um time ───────────────────────────────────────────────
type TeamPlayer = {
  id: string;
  userId: string;
  ready: boolean;
  won: boolean | null;
  rankDelta: number | null;
  user: {
    nickname: string;
    avatarUrl: string | null;
    profile: { rankPoints: number } | null;
  };
};

function TeamColumn({
  side,
  players,
  isWinner,
  showDelta,
}: {
  side: MatchSide;
  players: TeamPlayer[];
  isWinner: boolean;
  showDelta: boolean;
}) {
  const isRadiant = side === "RADIANT";
  return (
    <Card className={cn(isRadiant ? "border-radiant/30" : "border-dire/30")}>
      <CardHeader className="flex items-center justify-between">
        <CardTitle
          className={cn(isRadiant ? "text-radiant" : "text-dire-soft")}
        >
          {isRadiant ? "Radiant" : "Dire"}
        </CardTitle>
        {isWinner && (
          <Badge tone="good">
            <Trophy className="h-3 w-3" />
            Vencedor
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-surface-border">
          {players.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <Link
                href={`/profile/${p.userId}`}
                className="flex min-w-0 items-center gap-3"
              >
                <Avatar
                  src={p.user.avatarUrl}
                  name={p.user.nickname}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {i === 0 && (
                      <Crown className="mr-1 inline h-3.5 w-3.5 text-aegis" />
                    )}
                    {p.user.nickname}
                  </p>
                  <RankBadge points={p.user.profile?.rankPoints ?? 1000} />
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                {showDelta && p.rankDelta !== null && (
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      p.rankDelta >= 0 ? "text-behavior-good" : "text-dire-soft",
                    )}
                  >
                    {p.rankDelta >= 0 ? "+" : ""}
                    {p.rankDelta}
                  </span>
                )}
                {!showDelta &&
                  (p.ready ? (
                    <CheckCircle2 className="h-5 w-5 text-behavior-good" />
                  ) : (
                    <Clock className="h-5 w-5 text-zinc-600" />
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
