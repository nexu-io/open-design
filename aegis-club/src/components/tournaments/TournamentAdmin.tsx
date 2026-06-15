"use client";

import { useState, useTransition } from "react";
import { Play, DoorOpen, Save, AlertCircle } from "lucide-react";
import type { TournamentStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import {
  openRegistration,
  startTournament,
  reportTournamentMatch,
} from "@/app/tournaments/actions";

interface AdminTeam {
  id: string;
  name: string;
  tag: string;
}

export interface AdminMatch {
  id: string;
  round: number;
  position: number;
  bracket: string;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  teamA: AdminTeam | null;
  teamB: AdminTeam | null;
}

const fieldClass =
  "w-16 rounded-lg border border-surface-border bg-bg px-2 py-1.5 text-sm text-zinc-100 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40";
const selectClass =
  "rounded-lg border border-surface-border bg-bg px-2 py-1.5 text-sm text-zinc-100 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40";

function teamLabel(team: AdminTeam): string {
  return `${team.tag} — ${team.name}`;
}

function ReportMatchRow({ match }: { match: AdminMatch }) {
  const teamA = match.teamA;
  const teamB = match.teamB;
  const [scoreA, setScoreA] = useState(match.scoreA);
  const [scoreB, setScoreB] = useState(match.scoreB);
  const [winnerTeamId, setWinnerTeamId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!teamA || !teamB) return null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!winnerTeamId) {
      setError("Selecione o time vencedor.");
      return;
    }
    startTransition(async () => {
      try {
        await reportTournamentMatch({
          matchId: match.id,
          winnerTeamId,
          scoreA,
          scoreB,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível salvar o resultado.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-xl border border-surface-border bg-bg/40 p-3"
    >
      <div className="text-xs text-zinc-500">
        Rodada {match.round} · {teamLabel(teamA)} vs {teamLabel(teamB)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <span className="font-mono text-xs text-zinc-500">{teamA.tag}</span>
          <input
            type="number"
            min={0}
            max={5}
            value={scoreA}
            onChange={(e) => setScoreA(Number(e.target.value))}
            className={fieldClass}
            aria-label={`Placar de ${teamLabel(teamA)}`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <span className="font-mono text-xs text-zinc-500">{teamB.tag}</span>
          <input
            type="number"
            min={0}
            max={5}
            value={scoreB}
            onChange={(e) => setScoreB(Number(e.target.value))}
            className={fieldClass}
            aria-label={`Placar de ${teamLabel(teamB)}`}
          />
        </label>
        <select
          value={winnerTeamId}
          onChange={(e) => setWinnerTeamId(e.target.value)}
          className={selectClass}
          aria-label="Time vencedor"
        >
          <option value="">Vencedor…</option>
          <option value={teamA.id}>{teamLabel(teamA)}</option>
          <option value={teamB.id}>{teamLabel(teamB)}</option>
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-behavior-bad" role="alert">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </form>
  );
}

export function TournamentAdmin({
  tournamentId,
  status,
  teamCount,
  matches,
}: {
  tournamentId: string;
  status: TournamentStatus;
  teamCount: number;
  matches: AdminMatch[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível concluir a ação.",
        );
      }
    });
  }

  // Partidas pendentes: sem vencedor e com os dois times definidos.
  const pendingMatches = matches
    .filter((m) => !m.winnerId && m.teamA && m.teamB)
    .sort((a, b) => a.round - b.round || a.position - b.position);

  return (
    <div className="space-y-4 rounded-2xl border border-aegis/30 bg-aegis/5 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-aegis">
        Painel do organizador
      </h3>

      {status === "DRAFT" && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            O torneio está em rascunho. Abra as inscrições para receber times.
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => runAction(() => openRegistration(tournamentId))}
          >
            <DoorOpen className="h-4 w-4" />
            {pending ? "Abrindo…" : "Abrir inscrições"}
          </Button>
        </div>
      )}

      {status === "REGISTRATION" && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            Inscrições abertas. Inicie o torneio para gerar o chaveamento.
          </p>
          <Button
            type="button"
            disabled={pending || teamCount < 2}
            onClick={() => runAction(() => startTournament(tournamentId))}
          >
            <Play className="h-4 w-4" />
            {pending ? "Iniciando…" : "Iniciar torneio"}
          </Button>
          {teamCount < 2 && (
            <p className="text-xs text-zinc-500">
              É preciso ao menos 2 times inscritos para iniciar.
            </p>
          )}
        </div>
      )}

      {status === "LIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Registre o resultado de cada partida para avançar o chaveamento.
          </p>
          {pendingMatches.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nenhuma partida aguardando resultado no momento.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingMatches.map((m) => (
                <ReportMatchRow key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      )}

      {(status === "COMPLETED" || status === "CANCELLED") && (
        <p className="text-sm text-zinc-400">
          {status === "COMPLETED"
            ? "Torneio encerrado."
            : "Torneio cancelado."}
        </p>
      )}

      {error && (
        <p
          className="flex items-center gap-1.5 text-sm text-behavior-bad"
          role="alert"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
