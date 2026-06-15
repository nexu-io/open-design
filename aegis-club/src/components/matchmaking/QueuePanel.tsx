"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords,
  LoaderCircle,
  Users,
  Timer,
  CheckCircle2,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import type { QueueMode, QueueStatus, Region } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { joinQueue, leaveQueue } from "@/app/play/actions";

const MATCH_SIZE = 10;
const POLL_MS = 4000;

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

export interface ActiveEntry {
  mode: QueueMode;
  status: QueueStatus;
  matchId: string | null;
  /** epoch ms de quando entrou na fila */
  createdAt: number;
}

export interface QueuePanelProps {
  entry: ActiveEntry | null;
  region: Region;
  /** contagem de WAITING por modo, na região do usuário */
  waitingCounts: Record<QueueMode, number>;
  canRanked: boolean;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function QueuePanel({
  entry,
  region,
  waitingCounts,
  canRanked,
}: QueuePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<QueueMode>(
    entry?.mode ?? (canRanked ? "RANKED_5V5" : "UNRANKED_5V5"),
  );

  const isWaiting = entry?.status === "WAITING";
  const isMatched = entry?.status === "MATCHED";

  // Sincroniza o modo selecionado com a entrada ativa.
  useEffect(() => {
    if (entry) setMode(entry.mode);
  }, [entry]);

  // Polling enquanto procura partida: atualiza o Server Component.
  useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [isWaiting, router]);

  // Cronômetro da fila.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isWaiting]);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const res = await joinQueue(mode, region);
      if (!res.ok) setError(res.error ?? "Não foi possível entrar na fila.");
      else router.refresh();
    });
  }

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const res = await leaveQueue();
      if (!res.ok) setError(res.error ?? "Não foi possível sair da fila.");
      else router.refresh();
    });
  }

  // ── Partida encontrada ────────────────────────────────────────────
  if (isMatched && entry?.matchId) {
    return (
      <Card className="border-aegis/40">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-aegis/15">
            <CheckCircle2 className="h-7 w-7 text-aegis" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">
              Partida encontrada!
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Vá para o lobby e confirme que está pronto.
            </p>
          </div>
          <Link
            href={`/match/${entry.matchId}`}
            className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
          >
            <Swords className="h-4 w-4" />
            Ir para o lobby
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Procurando partida ────────────────────────────────────────────
  if (isWaiting && entry) {
    const count = waitingCounts[entry.mode] ?? 0;
    const elapsed = formatElapsed(now - entry.createdAt);
    return (
      <Card className="border-aegis/30">
        <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-aegis/20" />
            <LoaderCircle className="h-10 w-10 animate-spin text-aegis" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">
              Procurando partida…
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {MODE_LABELS[entry.mode]} · {REGION_LABELS[region]}
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span className="inline-flex items-center gap-1.5 text-zinc-300">
              <Users className="h-4 w-4 text-aegis" />
              <span className="font-semibold text-zinc-100">
                {Math.min(count, MATCH_SIZE)}/{MATCH_SIZE}
              </span>{" "}
              na fila
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-300 tabular-nums">
              <Timer className="h-4 w-4 text-aegis" />
              {elapsed}
            </span>
          </div>
          {error && <p className="text-sm text-dire-soft">{error}</p>}
          <Button variant="danger" onClick={handleLeave} disabled={pending}>
            <LogOut className="h-4 w-4" />
            Sair da fila
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Entrar na fila ────────────────────────────────────────────────
  const rankedDisabled = !canRanked;
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 py-6">
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-300">Modo</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => !rankedDisabled && setMode("RANKED_5V5")}
              disabled={rankedDisabled}
              aria-pressed={mode === "RANKED_5V5"}
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                mode === "RANKED_5V5"
                  ? "border-aegis/50 bg-aegis/10 text-aegis"
                  : "border-surface-border text-zinc-300 hover:border-aegis/40",
                rankedDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {MODE_LABELS.RANKED_5V5}
            </button>
            <button
              type="button"
              onClick={() => setMode("UNRANKED_5V5")}
              aria-pressed={mode === "UNRANKED_5V5"}
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                mode === "UNRANKED_5V5"
                  ? "border-aegis/50 bg-aegis/10 text-aegis"
                  : "border-surface-border text-zinc-300 hover:border-aegis/40",
              )}
            >
              {MODE_LABELS.UNRANKED_5V5}
            </button>
          </div>
          {rankedDisabled && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-dire-soft">
              <ShieldAlert className="h-3.5 w-3.5" />
              Fila ranqueada bloqueada pela sua conduta atual.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Região</span>
          <Badge tone="neutral">{REGION_LABELS[region]}</Badge>
        </div>

        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Na fila agora
          </span>
          <span className="font-semibold text-zinc-200">
            {waitingCounts[mode] ?? 0} jogador(es)
          </span>
        </div>

        {error && <p className="text-sm text-dire-soft">{error}</p>}

        <Button size="lg" onClick={handleJoin} disabled={pending}>
          <Swords className="h-4 w-4" />
          {pending ? "Entrando…" : "Entrar na fila"}
        </Button>
      </CardContent>
    </Card>
  );
}
