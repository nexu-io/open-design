import Link from "next/link";
import { Crown, Trophy } from "lucide-react";
import type { Region } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RankBadge } from "@/components/ui/RankBadge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { behaviorTier } from "@/lib/reputation";
import { cn, winRate } from "@/lib/utils";
import { REGIONS, REGION_LABELS } from "@/components/profile/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ranking" };

function parseRegion(value: string | undefined): Region | null {
  return REGIONS.includes(value as Region) ? (value as Region) : null;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region: regionParam } = await searchParams;
  const region = parseRegion(regionParam);

  const profiles = await prisma.profile.findMany({
    where: region ? { region } : undefined,
    orderBy: { rankPoints: "desc" },
    take: 100,
    include: { user: true },
  });

  const chips: { label: string; region: Region | null }[] = [
    { label: "Todos", region: null },
    ...REGIONS.map((r) => ({ label: REGION_LABELS[r], region: r })),
  ];

  return (
    <div className="container-page py-10">
      <SectionHeading
        eyebrow="Comunidade"
        title="Ranking"
        description="Os melhores da comunidade por pontos de habilidade."
      />

      {/* Filtros de região */}
      <div className="mb-6 flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = chip.region === region;
          return (
            <Link
              key={chip.label}
              href={chip.region ? `/leaderboard?region=${chip.region}` : "/leaderboard"}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-aegis/50 bg-aegis/15 text-aegis"
                  : "border-surface-border text-zinc-400 hover:border-aegis/40 hover:text-zinc-200",
              )}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="Nenhum jogador no ranking"
          description="Ainda não há jogadores nesta região. Que tal jogar a primeira partida?"
        />
      ) : (
        <Card>
          {/* Cabeçalho (apenas em telas maiores) */}
          <div className="hidden border-b border-surface-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 sm:grid sm:grid-cols-[3rem_1fr_10rem_5rem_5rem_4rem] sm:items-center sm:gap-3">
            <span>#</span>
            <span>Jogador</span>
            <span>Medalha</span>
            <span className="text-right">Pontos</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">Conduta</span>
          </div>

          <ul className="divide-y divide-surface-border">
            {profiles.map((profile, index) => {
              const position = index + 1;
              const tier = behaviorTier(profile.behaviorScore);
              const isTop3 = position <= 3;
              return (
                <li
                  key={profile.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-5 py-3 sm:grid sm:grid-cols-[3rem_1fr_10rem_5rem_5rem_4rem]",
                    isTop3 && "bg-aegis/5",
                  )}
                >
                  {/* Posição */}
                  <span
                    className={cn(
                      "inline-flex w-8 items-center gap-1 text-base font-bold tabular-nums",
                      isTop3 ? "text-aegis" : "text-zinc-500",
                    )}
                  >
                    {isTop3 && <Crown className="h-4 w-4" />}
                    {position}
                  </span>

                  {/* Jogador */}
                  <Link
                    href={`/profile/${profile.userId}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar
                      src={profile.user.avatarUrl}
                      name={profile.user.nickname}
                      size="sm"
                    />
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        isTop3 ? "text-zinc-100" : "text-zinc-200",
                      )}
                    >
                      {profile.user.nickname}
                    </span>
                  </Link>

                  {/* Medalha */}
                  <span className="sm:justify-self-start">
                    <RankBadge points={profile.rankPoints} />
                  </span>

                  {/* Pontos */}
                  <span className="text-sm font-semibold tabular-nums text-zinc-200 sm:text-right">
                    {profile.rankPoints}
                    <span className="ml-1 text-xs font-normal text-zinc-500 sm:hidden">
                      pts
                    </span>
                  </span>

                  {/* Win rate */}
                  <span className="text-sm tabular-nums text-zinc-400 sm:text-right">
                    {winRate(profile.wins, profile.matchesPlayed)}%
                  </span>

                  {/* Conduta */}
                  <span
                    className="flex items-center gap-1.5 sm:justify-end"
                    title={tier.label}
                  >
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", tier.barColor)}
                    />
                    <span className="text-xs text-zinc-500 sm:hidden">
                      {tier.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
