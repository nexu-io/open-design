"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, Flag, Check, LoaderCircle } from "lucide-react";
import type { CommendCategory, ReportCategory } from "@prisma/client";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { COMMEND_LABELS, REPORT_LABELS } from "@/lib/reputation";
import { cn } from "@/lib/utils";
import {
  commendPlayer,
  reportPlayer,
} from "@/app/match/[id]/actions";

export interface PostMatchPlayer {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface PostMatchPanelProps {
  matchId: string;
  /** todos os jogadores da partida (o viewer é filtrado internamente) */
  players: PostMatchPlayer[];
  viewerUserId: string;
}

const COMMEND_CATEGORIES = Object.keys(COMMEND_LABELS) as CommendCategory[];
const REPORT_CATEGORIES = Object.keys(REPORT_LABELS) as ReportCategory[];

function PlayerRow({
  matchId,
  player,
}: {
  matchId: string;
  player: PostMatchPlayer;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [commended, setCommended] = useState<CommendCategory | null>(null);
  const [reported, setReported] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>(
    REPORT_CATEGORIES[0],
  );
  const [comment, setComment] = useState("");
  const [showReport, setShowReport] = useState(false);

  function handleCommend(category: CommendCategory) {
    if (commended || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await commendPlayer({
        matchId,
        toUserId: player.userId,
        category,
      });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível elogiar.");
      } else {
        setCommended(category);
        router.refresh();
      }
    });
  }

  function handleReport() {
    if (reported || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await reportPlayer({
        matchId,
        toUserId: player.userId,
        category: reportCategory,
        comment: comment.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível denunciar.");
      } else {
        setReported(true);
        setShowReport(false);
        router.refresh();
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={player.avatarUrl} name={player.nickname} size="sm" />
          <span className="text-sm font-medium text-zinc-200">
            {player.nickname}
          </span>
          {commended && (
            <Badge tone="good">
              <Check className="h-3 w-3" />
              {COMMEND_LABELS[commended]}
            </Badge>
          )}
          {reported && (
            <Badge tone="bad">
              <Check className="h-3 w-3" />
              Denunciado
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReport((v) => !v)}
          disabled={reported || pending}
          aria-expanded={showReport}
        >
          <Flag className="h-4 w-4" />
          Denunciar
        </Button>
      </div>

      {/* Elogios */}
      <div className="flex flex-wrap gap-2">
        {COMMEND_CATEGORIES.map((cat) => {
          const active = commended === cat;
          const disabled = commended !== null || pending;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCommend(cat)}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-behavior-good/40 bg-behavior-good/15 text-behavior-good"
                  : "border-surface-border text-zinc-300 hover:border-behavior-good/40 hover:text-behavior-good",
                disabled && !active && "cursor-not-allowed opacity-40",
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {COMMEND_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* Formulário de denúncia (expansível) */}
      {showReport && !reported && (
        <div className="flex flex-col gap-2 rounded-xl border border-dire/30 bg-dire/5 p-3">
          <label className="text-xs font-medium text-zinc-400">
            Motivo da denúncia
            <select
              value={reportCategory}
              onChange={(e) =>
                setReportCategory(e.target.value as ReportCategory)
              }
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/60"
            >
              {REPORT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {REPORT_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Comentário (opcional)"
            className="w-full resize-none rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/60"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReport(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReport}
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Flag className="h-4 w-4" />
              )}
              Enviar denúncia
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-dire-soft">{error}</p>}
    </li>
  );
}

export function PostMatchPanel({
  matchId,
  players,
  viewerUserId,
}: PostMatchPanelProps) {
  const others = players.filter((p) => p.userId !== viewerUserId);

  if (others.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-sm text-zinc-400">
        Reconheça os bons companheiros e denuncie quem prejudicou a partida.
        Sua avaliação ajusta a conduta de cada jogador.
      </p>
      <ul className="divide-y divide-surface-border">
        {others.map((player) => (
          <PlayerRow key={player.userId} matchId={matchId} player={player} />
        ))}
      </ul>
    </div>
  );
}
