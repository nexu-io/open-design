import Link from "next/link";
import {
  Swords,
  ShieldCheck,
  GraduationCap,
  Trophy,
  Users,
  ThumbsUp,
  Gauge,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn, compactNumber } from "@/lib/utils";

async function getStats() {
  try {
    const [players, tournaments, heroes, matches] = await Promise.all([
      prisma.user.count(),
      prisma.tournament.count(),
      prisma.hero.count(),
      prisma.match.count(),
    ]);
    return { players, tournaments, heroes, matches };
  } catch {
    return { players: 0, tournaments: 0, heroes: 0, matches: 0 };
  }
}

const FEATURES = [
  {
    icon: Swords,
    title: "Matchmaking equilibrado",
    text: "Filas 5x5 com balanceamento por Elo interno. Times montados para partidas justas, não estompadas.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-toxicidade de verdade",
    text: "Behavior score com elogios e denúncias. Jogadores tóxicos caem juntos na baixa prioridade — longe de quem joga limpo.",
  },
  {
    icon: GraduationCap,
    title: "Tutoriais de heróis",
    text: "Aprenda cada herói com guias em vídeo do YouTube, curados pela comunidade e separados por nível.",
  },
  {
    icon: Trophy,
    title: "Torneios da comunidade",
    text: "Crie e administre torneios com inscrição de times e chaveamento automático. Da pelada à grande final.",
  },
];

export default async function HomePage() {
  const stats = await getStats();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page relative py-20 sm:py-28">
          <div className="max-w-3xl animate-fade-in">
            <Badge tone="aegis" className="mb-5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Dota 2 competitivo, do jeito certo
            </Badge>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
              Partidas justas.
              <br />
              <span className="text-brand-gradient">Sem toxicidade.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-zinc-400">
              A plataforma da comunidade de Dota 2 inspirada na Gamers Club:
              matchmaking equilibrado, reputação que importa, tutoriais de
              heróis e torneios — tudo em um só lugar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/api/auth/steam/login"
                className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
              >
                Entrar com Steam
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/play"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Como funciona a fila
              </Link>
            </div>
          </div>

          {/* Stats */}
          <dl className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Jogadores", value: stats.players, icon: Users },
              { label: "Heróis", value: stats.heroes, icon: Swords },
              { label: "Partidas", value: stats.matches, icon: Gauge },
              { label: "Torneios", value: stats.tournaments, icon: Trophy },
            ].map((s) => (
              <div key={s.label} className="card p-5">
                <s.icon className="h-5 w-5 text-aegis" />
                <dd className="mt-3 text-3xl font-bold text-zinc-100">
                  {compactNumber(s.value)}
                </dd>
                <dt className="text-sm text-zinc-500">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section className="container-page py-12">
        <div className="grid gap-5 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card group p-6 transition-colors hover:border-aegis/40"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-aegis/10 p-3 text-aegis">
                  <f.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                    {f.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Como o anti-toxicidade funciona */}
      <section className="container-page py-12">
        <div className="card overflow-hidden">
          <div className="grid gap-8 p-8 md:grid-cols-3">
            {[
              {
                icon: ThumbsUp,
                step: "1",
                title: "Jogue e avalie",
                text: "Ao fim de cada partida, elogie quem somou e denuncie quem atrapalhou.",
              },
              {
                icon: Gauge,
                step: "2",
                title: "Seu score evolui",
                text: "Boa conduta sobe o behavior score; denúncias validadas derrubam.",
              },
              {
                icon: ShieldCheck,
                step: "3",
                title: "Filas separadas",
                text: "Quem joga limpo encontra gente limpa. Tóxicos jogam entre si.",
              },
            ].map((s) => (
              <div key={s.step} className="relative">
                <span className="font-display text-5xl font-black text-surface-border">
                  {s.step}
                </span>
                <s.icon className="mt-2 h-6 w-6 text-aegis" />
                <h4 className="mt-3 font-semibold text-zinc-100">{s.title}</h4>
                <p className="mt-1 text-sm text-zinc-400">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="container-page py-16">
        <div className="card flex flex-col items-center gap-4 bg-gradient-to-br from-surface to-bg-elevated p-10 text-center">
          <Trophy className="h-10 w-10 text-aegis" />
          <h2 className="font-display text-2xl font-bold text-zinc-50 sm:text-3xl">
            Pronto para uma partida justa?
          </h2>
          <p className="max-w-md text-zinc-400">
            Entre com sua conta Steam, monte seu perfil e caia na fila com gente
            que respeita o jogo.
          </p>
          <Link
            href="/api/auth/steam/login"
            className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
          >
            Começar agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
