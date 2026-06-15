import Link from "next/link";
import { Swords, Scale, ShieldCheck, Users2, ShieldAlert } from "lucide-react";
import type { QueueMode } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BehaviorMeter } from "@/components/ui/BehaviorMeter";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { buttonVariants } from "@/components/ui/Button";
import { canQueueRanked, BEHAVIOR_START } from "@/lib/reputation";
import { cn } from "@/lib/utils";
import { QueuePanel } from "@/components/matchmaking/QueuePanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jogar" };

const EXPLAINERS = [
  {
    icon: Scale,
    title: "Matchmaking equilibrado",
    description:
      "Times são montados pelos seus rankPoints para que cada lado tenha chances justas de vitória.",
  },
  {
    icon: ShieldCheck,
    title: "Fila separada por conduta",
    description:
      "Quem coleciona denúncias cai na fila de baixa prioridade, longe das partidas saudáveis.",
  },
  {
    icon: Users2,
    title: "Partidas 5x5 com ready-check",
    description:
      "Ao reunir 10 jogadores compatíveis, abrimos um lobby com confirmação de presença.",
  },
] as const;

export default async function PlayPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Swords className="h-10 w-10" />}
          title="Entre para jogar"
          description="Conecte sua conta Steam para entrar na fila e disputar partidas justas."
          action={
            <Link
              href="/api/auth/steam/login"
              className={cn(buttonVariants({ variant: "primary" }))}
            >
              Entrar com Steam
            </Link>
          }
        />
      </div>
    );
  }

  const profile = user.profile;
  const region = profile?.region ?? "SA";
  const behaviorScore = profile?.behaviorScore ?? BEHAVIOR_START;
  const canRanked = canQueueRanked(behaviorScore);

  const [rankedCount, unrankedCount, activeEntry] = await Promise.all([
    prisma.queueEntry.count({
      where: { status: "WAITING", mode: "RANKED_5V5", region },
    }),
    prisma.queueEntry.count({
      where: { status: "WAITING", mode: "UNRANKED_5V5", region },
    }),
    prisma.queueEntry.findFirst({
      where: { userId: user.id, status: { in: ["WAITING", "MATCHED"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const waitingCounts: Record<QueueMode, number> = {
    RANKED_5V5: rankedCount,
    UNRANKED_5V5: unrankedCount,
  };

  return (
    <div className="container-page py-10">
      <SectionHeading
        eyebrow="Matchmaking"
        title="Jogar agora"
        description="Entre na fila e seja alocado em uma partida 5x5 equilibrada e saudável."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal: painel da fila */}
        <div className="lg:col-span-2">
          <QueuePanel
            entry={
              activeEntry
                ? {
                    mode: activeEntry.mode,
                    status: activeEntry.status,
                    matchId: activeEntry.matchId,
                    createdAt: activeEntry.createdAt.getTime(),
                  }
                : null
            }
            region={region}
            waitingCounts={waitingCounts}
            canRanked={canRanked}
          />
        </div>

        {/* Coluna lateral: conduta */}
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <h3 className="text-sm font-semibold text-zinc-100">Sua conduta</h3>
            <BehaviorMeter score={behaviorScore} />
            {!canRanked && (
              <Badge tone="bad" className="self-start">
                <ShieldAlert className="h-3.5 w-3.5" />
                Fila ranqueada bloqueada
              </Badge>
            )}
            <p className="text-xs text-zinc-500">
              Elogios recebidos elevam sua conduta; denúncias validadas a
              reduzem. Partidas limpas recuperam pontos com o tempo.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Como funciona a fila */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Como funciona a fila
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {EXPLAINERS.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardContent className="flex flex-col gap-3 py-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-aegis/10">
                    <Icon className="h-5 w-5 text-aegis" />
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {item.title}
                  </h3>
                  <p className="text-sm text-zinc-400">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
