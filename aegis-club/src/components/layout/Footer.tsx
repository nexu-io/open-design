import Link from "next/link";
import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-surface-border bg-bg-soft">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-100">
            <Shield className="h-5 w-5 text-aegis" />
            <span className="font-display text-lg font-bold tracking-tight">
              Aegis Club
            </span>
          </div>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Plataforma competitiva da comunidade de Dota 2. Partidas justas,
            menos toxicidade, mais comunidade.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/play" className="link-muted">
            Jogar
          </Link>
          <Link href="/heroes" className="link-muted">
            Heróis
          </Link>
          <Link href="/tournaments" className="link-muted">
            Torneios
          </Link>
          <Link href="/leaderboard" className="link-muted">
            Ranking
          </Link>
        </nav>
      </div>
      <div className="border-t border-surface-border py-4 text-center text-xs text-zinc-600">
        Projeto comunitário, sem vínculo com a Valve. Dota 2 é marca da Valve
        Corporation.
      </div>
    </footer>
  );
}
