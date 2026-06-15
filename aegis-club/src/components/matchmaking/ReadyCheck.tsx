"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { setReady } from "@/app/match/[id]/actions";

export interface ReadyCheckProps {
  matchId: string;
  /** o jogador (viewer) já confirmou presença? */
  viewerReady: boolean;
}

export function ReadyCheck({ matchId, viewerReady }: ReadyCheckProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (viewerReady) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-behavior-good/30 bg-behavior-good/10 px-4 py-2 text-sm font-medium text-behavior-good">
        <CheckCircle2 className="h-4 w-4" />
        Você está pronto
      </span>
    );
  }

  function handleReady() {
    setError(null);
    startTransition(async () => {
      const res = await setReady(matchId);
      if (!res.ok) {
        setError(res.error ?? "Não foi possível confirmar presença.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" onClick={handleReady} disabled={pending}>
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {pending ? "Confirmando…" : "Estou pronto"}
      </Button>
      {error && <p className="text-sm text-dire-soft">{error}</p>}
    </div>
  );
}
