import Link from "next/link";
import { Trophy, Users, Coins, Calendar, Plus } from "lucide-react";
import type { Region, TournamentFormat, TournamentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Torneios" };

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

const STATUS_FILTERS: { value: TournamentStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "REGISTRATION", label: STATUS_LABELS.REGISTRATION },
  { value: "LIVE", label: STATUS_LABELS.LIVE },
  { value: "COMPLETED", label: STATUS_LABELS.COMPLETED },
  { value: "DRAFT", label: STATUS_LABELS.DRAFT },
];

function isStatus(value: string | undefined): value is TournamentStatus {
  return (
    value === "DRAFT" ||
    value === "REGISTRATION" ||
    value === "LIVE" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  );
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = isStatus(status) ? status : "ALL";

  const [user, tournaments] = await Promise.all([
    getCurrentUser(),
    prisma.tournament.findMany({
      where: activeStatus === "ALL" ? undefined : { status: activeStatus },
      include: {
        organizer: true,
        _count: { select: { teams: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="container-page py-10">
      <SectionHeading
        eyebrow="Competitivo"
        title="Torneios"
        description="Dispute, organize e acompanhe campeonatos da comunidade."
        action={
          user ? (
            <Link
              href="/tournaments/new"
              className={cn(buttonVariants({ variant: "primary" }))}
            >
              <Plus className="h-4 w-4" />
              Criar torneio
            </Link>
          ) : undefined
        }
      />

      {/* Filtros de status */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const isActive = filter.value === activeStatus;
          const href =
            filter.value === "ALL"
              ? "/tournaments"
              : `/tournaments?status=${filter.value}`;
          return (
            <Link
              key={filter.value}
              href={href}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
                isActive
                  ? "border-aegis/40 bg-aegis/15 text-aegis"
                  : "border-surface-border text-zinc-400 hover:border-aegis/30 hover:text-zinc-200",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="Nenhum torneio por aqui"
          description="Ainda não há torneios com esse filtro. Que tal organizar o seu?"
          action={
            user ? (
              <Link
                href="/tournaments/new"
                className={cn(buttonVariants({ variant: "primary" }))}
              >
                <Plus className="h-4 w-4" />
                Criar torneio
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <Link
                  href={`/tournaments/${t.slug}`}
                  className="text-lg font-semibold text-zinc-100 hover:text-aegis"
                >
                  {t.name}
                </Link>
                <Badge tone={STATUS_TONES[t.status]}>
                  {STATUS_LABELS[t.status]}
                </Badge>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone="neutral">{FORMAT_LABELS[t.format]}</Badge>
                <Badge tone="neutral">{REGION_LABELS[t.region]}</Badge>
              </div>

              <dl className="mt-auto space-y-2 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-zinc-500" />
                  <span>
                    {t._count.teams}/{t.maxTeams} times
                  </span>
                </div>
                {t.prizePool && (
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-zinc-500" />
                    <span>{t.prizePool}</span>
                  </div>
                )}
                {t.startsAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-zinc-500" />
                    <span>{dateFormatter.format(t.startsAt)}</span>
                  </div>
                )}
              </dl>

              <p className="mt-4 border-t border-surface-border pt-3 text-xs text-zinc-500">
                Organizado por{" "}
                <span className="text-zinc-300">{t.organizer.nickname}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
