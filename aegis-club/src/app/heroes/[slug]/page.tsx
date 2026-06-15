import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GraduationCap, LogIn } from "lucide-react";
import type { PrimaryAttribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroAvatar } from "@/components/heroes/HeroAvatar";
import { AddTutorialForm } from "@/components/heroes/AddTutorialForm";
import { TutorialCard } from "@/components/heroes/TutorialCard";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ATTR_LABELS: Record<PrimaryAttribute, string> = {
  STRENGTH: "Força",
  AGILITY: "Agilidade",
  INTELLIGENCE: "Inteligência",
  UNIVERSAL: "Universal",
};

const ATTR_TONE: Record<PrimaryAttribute, "dire" | "radiant" | "aegis" | "neutral"> =
  {
    STRENGTH: "dire",
    AGILITY: "radiant",
    INTELLIGENCE: "aegis",
    UNIVERSAL: "neutral",
  };

function Stars({ complexity }: { complexity: number }) {
  const filled = Math.max(0, Math.min(3, complexity));
  return (
    <span
      className="text-sm tracking-tight text-aegis"
      aria-label={`Complexidade ${filled} de 3`}
    >
      {"★".repeat(filled)}
      <span className="text-surface-border">{"★".repeat(3 - filled)}</span>
    </span>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hero = await prisma.hero.findUnique({
    where: { slug },
    select: { localizedName: true },
  });
  return { title: hero ? hero.localizedName : "Herói" };
}

export default async function HeroDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const hero = await prisma.hero.findUnique({
    where: { slug },
    include: {
      tutorials: {
        where: { approved: true },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        include: {
          author: { select: { id: true, nickname: true } },
          votes: user
            ? { where: { userId: user.id }, select: { value: true } }
            : false,
        },
      },
    },
  });

  if (!hero) {
    notFound();
  }

  return (
    <div className="container-page py-10">
      <Link
        href="/heroes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos heróis
      </Link>

      {/* Cabeçalho do herói */}
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-surface-border bg-surface/40 p-6">
        <HeroAvatar slug={hero.slug} name={hero.localizedName} size="lg" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-zinc-100">
            {hero.localizedName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ATTR_TONE[hero.primaryAttr]}>
              {ATTR_LABELS[hero.primaryAttr]}
            </Badge>
            <Stars complexity={hero.complexity} />
          </div>
          {hero.roles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hero.roles.map((role) => (
                <Badge key={role} tone="neutral">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tutoriais */}
      <section className="mt-10 space-y-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-aegis" />
          <h2 className="text-xl font-bold text-zinc-100">Tutoriais</h2>
        </div>

        {user ? (
          <AddTutorialForm heroId={hero.id} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface/40 px-5 py-4">
            <p className="text-sm text-zinc-400">
              Entre com sua conta Steam para contribuir com um tutorial.
            </p>
            <Link
              href="/api/auth/steam/login"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              <LogIn className="h-4 w-4" />
              Entrar com Steam
            </Link>
          </div>
        )}

        {hero.tutorials.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-10 w-10" />}
            title="Ainda não há tutoriais"
            description={`Seja o primeiro a ensinar ${hero.localizedName} para a comunidade.`}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {hero.tutorials.map((tutorial) => (
              <TutorialCard
                key={tutorial.id}
                tutorial={tutorial}
                currentUserId={user?.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
