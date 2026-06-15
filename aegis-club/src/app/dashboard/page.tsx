import Link from "next/link";
import {
  Swords,
  UserCog,
  Trophy,
  Activity,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RankBadge } from "@/components/ui/RankBadge";
import { BehaviorMeter } from "@/components/ui/BehaviorMeter";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import { cn, winRate } from "@/lib/utils";

export const metadata = { title: "Painel" };

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Gauge className="h-10 w-10" />}
          title="Entre para ver seu painel"
          description="Conecte sua conta Steam para acessar fila, perfil e torneios."
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
  const [activeQueue, recentMatches, openTournaments] = await Promise.all([
    prisma.queueEntry.findFirst({
      where: { userId: user.id, status: { in: ["WAITING", "MATCHED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.matchPlayer.findMany({
      where: { userId: user.id },
      include: { match: true },
      orderBy: { match: { createdAt: "desc" } },
      take: 5,
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["REGISTRATION", "LIVE"] } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return (
    <div className="container-page py-10">
      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={user.avatarUrl} name={user.nickname} size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              Olá, {user.nickname}
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <RankBadge points={profile?.rankPoints ?? 1000} showPoints />
              <Badge tone="neutral">{profile?.region ?? "SA"}</Badge>
            </div>
          </div>
        </div>
        <Link
          href="/play"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
        >
          <Swords className="h-4 w-4" />
          Jogar agora
        </Link>
      </div>

      {activeQueue && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-aegis/30 bg-aegis/10 px-5 py-3">
          <span className="text-sm text-aegis">
            {activeQueue.status === "WAITING"
              ? "Você está na fila procurando partida…"
              : "Partida encontrada! Vá para o lobby."}
          </span>
          <Link
            href={activeQueue.matchId ? `/match/${activeQueue.matchId}` : "/play"}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Ver
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Conduta */}
        <Card>
          <CardHeader>
            <CardTitle>Conduta</CardTitle>
          </CardHeader>
          <CardContent>
            <BehaviorMeter score={profile?.behaviorScore ?? 7500} />
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <Card>
          <CardHeader>
            <CardTitle>Estatísticas</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-zinc-100">
                {profile?.matchesPlayed ?? 0}
              </p>
              <p className="text-xs text-zinc-500">Partidas</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-radiant">
                {profile?.wins ?? 0}
              </p>
              <p className="text-xs text-zinc-500">Vitórias</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-aegis">
                {winRate(profile?.wins ?? 0, profile?.matchesPlayed ?? 0)}%
              </p>
              <p className="text-xs text-zinc-500">Win rate</p>
            </div>
          </CardContent>
        </Card>

        {/* Atalhos */}
        <Card>
          <CardHeader>
            <CardTitle>Atalhos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              href={`/profile/${user.id}`}
              className={cn(buttonVariants({ variant: "secondary" }), "justify-between")}
            >
              Meu perfil <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/profile/edit"
              className={cn(buttonVariants({ variant: "ghost" }), "justify-between")}
            >
              Editar perfil <UserCog className="h-4 w-4" />
            </Link>
            <Link
              href="/tournaments/new"
              className={cn(buttonVariants({ variant: "ghost" }), "justify-between")}
            >
              Criar torneio <Trophy className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Partidas recentes + torneios */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-aegis" /> Partidas recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Você ainda não jogou nenhuma partida pela plataforma.
              </p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {recentMatches.map((mp) => (
                  <li
                    key={mp.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <Link
                      href={`/match/${mp.matchId}`}
                      className="link-muted font-mono"
                    >
                      #{mp.matchId.slice(-6)}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge tone={mp.team === "RADIANT" ? "radiant" : "dire"}>
                        {mp.team === "RADIANT" ? "Radiant" : "Dire"}
                      </Badge>
                      {mp.won === true && <Badge tone="good">Vitória</Badge>}
                      {mp.won === false && <Badge tone="bad">Derrota</Badge>}
                      {mp.match.status !== "COMPLETED" && (
                        <Badge tone="warn">Em aberto</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-aegis" /> Torneios abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openTournaments.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nenhum torneio com inscrições abertas no momento.
              </p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {openTournaments.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <Link
                      href={`/tournaments/${t.slug}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-zinc-200">{t.name}</span>
                      <Badge tone="aegis">
                        {t.status === "LIVE" ? "Ao vivo" : "Inscrições"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
