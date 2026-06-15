"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  setLobbyInfo,
  startMatch,
  reportResult,
} from "@/app/match/[id]/actions";

// ── Campo copiável (nome/senha do lobby) ──────────────────────────────
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navegadores sem clipboard API: silenciosamente ignora.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="truncate font-mono text-sm text-zinc-100">{value}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? (
          <Check className="h-4 w-4 text-behavior-good" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

// ── Formulário de lobby do host (DRAFTING) ────────────────────────────
export function LobbyInfoForm({
  matchId,
  lobbyName,
  lobbyPassword,
}: {
  matchId: string;
  lobbyName: string;
  lobbyPassword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function action(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setLobbyInfo(matchId, formData);
      if (!res.ok) {
        setError(res.error ?? "Não foi possível salvar o lobby.");
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-400">
          Nome do lobby
          <input
            name="lobbyName"
            defaultValue={lobbyName}
            placeholder="ex: Aegis #1234"
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/60"
          />
        </label>
        <label className="text-xs font-medium text-zinc-400">
          Senha
          <input
            name="lobbyPassword"
            defaultValue={lobbyPassword}
            placeholder="senha do lobby"
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/60"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          Salvar lobby
        </Button>
        {saved && <span className="text-xs text-behavior-good">Lobby salvo.</span>}
        {error && <span className="text-xs text-dire-soft">{error}</span>}
      </div>
    </form>
  );
}

// ── Botão de iniciar partida do host (DRAFTING) ───────────────────────
export function StartMatchButton({
  matchId,
  allReady,
}: {
  matchId: string;
  allReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await startMatch(matchId);
      if (!res.ok) {
        setError(res.error ?? "Não foi possível iniciar a partida.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" onClick={handleStart} disabled={!allReady || pending}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Iniciar partida
      </Button>
      {!allReady && (
        <p className="text-xs text-zinc-500">
          Aguardando todos os jogadores confirmarem presença.
        </p>
      )}
      {error && <p className="text-xs text-dire-soft">{error}</p>}
    </div>
  );
}

// ── Reportar resultado (LIVE) ─────────────────────────────────────────
export function ReportResultControls({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReport(winner: "RADIANT" | "DIRE") {
    setError(null);
    startTransition(async () => {
      const res = await reportResult(matchId, winner);
      if (!res.ok) {
        setError(res.error ?? "Não foi possível reportar o resultado.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-400">
        Quando a partida terminar, registre quem venceu. Os rankPoints serão
        atualizados automaticamente.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => handleReport("RADIANT")}
          disabled={pending}
          className="border border-radiant/40 text-radiant hover:bg-radiant/10"
        >
          <Send className="h-4 w-4" />
          Radiant venceu
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleReport("DIRE")}
          disabled={pending}
          className="border border-dire/40 text-dire-soft hover:bg-dire/10"
        >
          <Send className="h-4 w-4" />
          Dire venceu
        </Button>
      </div>
      {error && <p className="text-sm text-dire-soft">{error}</p>}
    </div>
  );
}
