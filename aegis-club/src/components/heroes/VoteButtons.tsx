"use client";

import { useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { voteTutorial } from "@/app/heroes/actions";

export function VoteButtons({
  tutorialId,
  score,
  myVote,
  canVote,
}: {
  tutorialId: string;
  score: number;
  /** Voto atual do usuário: 1, -1 ou 0/undefined se não votou. */
  myVote?: number;
  /** Falso quando o usuário não está autenticado. */
  canVote: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function cast(value: 1 | -1) {
    if (!canVote || pending) return;
    startTransition(async () => {
      await voteTutorial(tutorialId, value);
    });
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-surface-border bg-surface/60 p-1">
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={!canVote || pending}
        aria-label="Votar a favor"
        aria-pressed={myVote === 1}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          myVote === 1
            ? "bg-behavior-good/20 text-behavior-good"
            : "text-zinc-400 hover:bg-surface-hover hover:text-zinc-100",
        )}
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      <span
        className={cn(
          "min-w-7 text-center text-sm font-semibold tabular-nums",
          score > 0
            ? "text-behavior-good"
            : score < 0
              ? "text-behavior-bad"
              : "text-zinc-300",
        )}
      >
        {score}
      </span>

      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={!canVote || pending}
        aria-label="Votar contra"
        aria-pressed={myVote === -1}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          myVote === -1
            ? "bg-behavior-bad/20 text-behavior-bad"
            : "text-zinc-400 hover:bg-surface-hover hover:text-zinc-100",
        )}
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
}
