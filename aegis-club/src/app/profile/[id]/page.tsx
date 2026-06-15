import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Gamepad2,
  Heart,
  Link2,
  Pencil,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
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
import { HeroAvatar } from "@/components/heroes/HeroAvatar";
import { HEROES } from "@/data/heroes";
import { cn, winRate } from "@/lib/utils";
import {
  ConnectButton,
  type ConnectionState,
} from "@/components/profile/ConnectButton";
import { ImportSteamButton } from "@/components/profile/ImportSteamButton";
import {
  DOTA_ROLE_LABELS,
  REGION_LABELS,
} from "@/components/profile/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil" };

const ROLE_BADGE: Partial<Record<"ORGANIZER" | "ADMIN", string>> = {
  ORGANIZER: "Organizador",
  ADMIN: "Admin",
};

/** Resolve a conexão (amizade) entre o visitante e o dono do perfil. */
async function resolveConnection(
  viewerId: string,
  ownerId: string,
): Promise<ConnectionState> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: ownerId },
        { requesterId: ownerId, addresseeId: viewerId },
      ],
    },
    select: { status: true },
  });
  if (!friendship) return "none";
  if (friendship.status === "ACCEPTED") return "ACCEPTED";
  if (friendship.status === "PENDING") return "PENDING";
  return "none";
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    }),
    getCurrentUser(),
  ]);

  if (!user) notFound();

  const profile = user.profile;
  const isSelf = viewer?.id === user.id;

  const connection: ConnectionState =
    viewer && !isSelf
      ? await resolveConnection(viewer.id, user.id)
      : "none";

  // Heróis favoritos resolvidos pelo catálogo estático.
  const favoriteHeroes = (profile?.favoriteHeroIds ?? [])
    .map((heroId) => HEROES.find((h) => h.id === heroId))
    .filter((h): h is (typeof HEROES)[number] => Boolean(h));

  // Partidas recentes pela plataforma.
  const recentMatches = await prisma.matchPlayer.findMany({
    where: { userId: user.id },
    include: { match: true },
    orderBy: { match: { createdAt: "desc" } },
    take: 8,
  });

  return (
    <div className="container-page py-10">
      {/* Cabeçalho */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-6 py-6">
          <Avatar src={user.avatarUrl} name={user.nickname} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">
                {user.nickname}
              </h1>
              {user.role !== "PLAYER" && (
                <Badge tone="aegis">{ROLE_BADGE[user.role]}</Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RankBadge points={profile?.rankPoints ?? 1000} showPoints />
              <Badge tone="neutral">
                {REGION_LABELS[profile?.region ?? "SA"]}
              </Badge>
              {profile?.country && (
                <Badge tone="neutral">{profile.country}</Badge>
              )}
              {typeof profile?.publicMmr === "number" && (
                <Badge tone="neutral">MMR público: {profile.publicMmr}</Badge>
              )}
            </div>

            {profile?.bio && (
              <p className="mt-3 max-w-2xl text-sm text-zinc-400">
                {profile.bio}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {isSelf ? (
              <>
                <Link
                  href="/profile/edit"
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  <Pencil className="h-4 w-4" />
                  Editar perfil
                </Link>
                {user.steamId && <ImportSteamButton />}
              </>
            ) : (
              viewer && (
                <ConnectButton targetUserId={user.id} status={connection} />
              )
            )}
          </div>
        </CardContent>
      </Card>

      {!profile && (
        <div className="mb-6">
          <EmptyState
            icon={<UserRound className="h-10 w-10" />}
            title="Perfil ainda não configurado"
            description={
              isSelf
                ? "Edite seu perfil para adicionar funções, heróis favoritos e redes sociais."
                : "Este jogador ainda não preencheu o perfil."
            }
            action={
              isSelf ? (
                <Link
                  href="/profile/edit"
                  className={cn(buttonVariants({ variant: "primary" }))}
                >
                  Configurar perfil
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Corpo */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Conduta */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-aegis" /> Conduta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BehaviorMeter score={profile?.behaviorScore ?? 7500} />
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-aegis" /> Estatísticas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
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
              <p className="text-2xl font-bold text-dire-soft">
                {profile?.losses ?? 0}
              </p>
              <p className="text-xs text-zinc-500">Derrotas</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-aegis">
                {winRate(profile?.wins ?? 0, profile?.matchesPlayed ?? 0)}%
              </p>
              <p className="text-xs text-zinc-500">Win rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-100">
                {profile?.abandons ?? 0}
              </p>
              <p className="text-xs text-zinc-500">Abandonos</p>
            </div>
          </CardContent>
        </Card>

        {/* Funções */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-aegis" /> Funções
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile && profile.mainRoles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.mainRoles.map((role) => (
                  <Badge key={role} tone="neutral">
                    {DOTA_ROLE_LABELS[role]}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Nenhuma função principal definida.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Heróis favoritos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-aegis" /> Heróis favoritos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favoriteHeroes.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {favoriteHeroes.map((hero) => (
                  <Link
                    key={hero.id}
                    href={`/heroes/${hero.slug}`}
                    className="group flex flex-col items-center gap-1"
                    title={hero.localizedName}
                  >
                    <HeroAvatar
                      slug={hero.slug}
                      name={hero.localizedName}
                      size="md"
                      className="transition-transform group-hover:-translate-y-0.5"
                    />
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200">
                      {hero.localizedName}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Nenhum herói favorito selecionado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Redes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-aegis" /> Redes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile && (profile.discord || profile.twitch || profile.youtube) ? (
              <ul className="space-y-2 text-sm">
                {profile.discord && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">Discord</span>
                    <span className="truncate text-zinc-200">
                      {profile.discord}
                    </span>
                  </li>
                )}
                {profile.twitch && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">Twitch</span>
                    <a
                      href={`https://twitch.tv/${profile.twitch}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-muted truncate"
                    >
                      {profile.twitch}
                    </a>
                  </li>
                )}
                {profile.youtube && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">YouTube</span>
                    <a
                      href={`https://youtube.com/${profile.youtube}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-muted truncate"
                    >
                      {profile.youtube}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">
                Nenhuma rede social informada.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Partidas recentes */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-aegis" /> Partidas recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <EmptyState
                icon={<Gamepad2 className="h-8 w-8" />}
                title="Sem partidas ainda"
                description="As partidas disputadas pela plataforma aparecerão aqui."
              />
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
                      {mp.won === null && mp.match.status !== "COMPLETED" && (
                        <Badge tone="warn">Em aberto</Badge>
                      )}
                    </div>
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
