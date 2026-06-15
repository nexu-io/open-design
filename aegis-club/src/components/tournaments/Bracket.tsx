import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface BracketTeam {
  id: string;
  name: string;
  tag: string;
}

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  bracket: string;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  teamA: BracketTeam | null;
  teamB: BracketTeam | null;
}

/** Rótulo da rodada — a última (ou a GRAND_FINAL) vira "Final". */
function roundLabel(round: number, totalRounds: number, isFinal: boolean): string {
  if (isFinal) return "Final";
  if (round === totalRounds - 1) return "Semifinal";
  return `Rodada ${round}`;
}

function TeamRow({
  team,
  score,
  isWinner,
  decided,
}: {
  team: BracketTeam | null;
  score: number;
  isWinner: boolean;
  decided: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm",
        isWinner
          ? "bg-aegis/10 text-zinc-100 ring-1 ring-aegis/40"
          : "text-zinc-300",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {team ? (
          <>
            <span className="shrink-0 font-mono text-xs text-zinc-500">
              {team.tag}
            </span>
            <span className="truncate">{team.name}</span>
          </>
        ) : (
          <span className="italic text-zinc-600">A definir</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-sm",
          decided ? "text-zinc-100" : "text-zinc-600",
        )}
      >
        {score}
      </span>
    </div>
  );
}

export function Bracket({ matches }: { matches: BracketMatch[] }) {
  if (matches.length === 0) return null;

  // Agrupa as partidas por rodada, em ordem crescente.
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  const rounds = [...byRound.entries()]
    .map(([round, list]) => ({
      round,
      matches: list.sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.round - b.round);

  const totalRounds = rounds.length;

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {rounds.map(({ round, matches: roundMatches }) => {
        const isFinalColumn =
          round === totalRounds ||
          roundMatches.some((m) => m.bracket === "GRAND_FINAL");
        return (
          <div
            key={round}
            className="flex min-w-[15rem] flex-col gap-3"
          >
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-aegis">
              {isFinalColumn && <Trophy className="h-3.5 w-3.5" />}
              {roundLabel(round, totalRounds, isFinalColumn)}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {roundMatches.map((m) => {
                const decided = m.winnerId != null;
                return (
                  <div
                    key={m.id}
                    className="space-y-1 rounded-xl border border-surface-border bg-surface/60 p-2"
                  >
                    <TeamRow
                      team={m.teamA}
                      score={m.scoreA}
                      isWinner={
                        decided && m.winnerId === m.teamA?.id
                      }
                      decided={decided}
                    />
                    <TeamRow
                      team={m.teamB}
                      score={m.scoreB}
                      isWinner={
                        decided && m.winnerId === m.teamB?.id
                      }
                      decided={decided}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
