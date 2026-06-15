import Link from "next/link";
import { Search, GraduationCap } from "lucide-react";
import type { Prisma, PrimaryAttribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { HeroAvatar } from "@/components/heroes/HeroAvatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Heróis" };
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

const FILTERS: { value: PrimaryAttribute | null; label: string }[] = [
  { value: null, label: "Todos" },
  { value: "STRENGTH", label: "Força" },
  { value: "AGILITY", label: "Agilidade" },
  { value: "INTELLIGENCE", label: "Inteligência" },
  { value: "UNIVERSAL", label: "Universal" },
];

function isPrimaryAttr(value: string | undefined): value is PrimaryAttribute {
  return (
    value === "STRENGTH" ||
    value === "AGILITY" ||
    value === "INTELLIGENCE" ||
    value === "UNIVERSAL"
  );
}

function Stars({ complexity }: { complexity: number }) {
  const filled = Math.max(0, Math.min(3, complexity));
  return (
    <span
      className="text-xs tracking-tight text-aegis"
      title={`Complexidade ${filled}/3`}
      aria-label={`Complexidade ${filled} de 3`}
    >
      {"★".repeat(filled)}
      <span className="text-surface-border">{"★".repeat(3 - filled)}</span>
    </span>
  );
}

export default async function HeroesPage({
  searchParams,
}: {
  searchParams: Promise<{ attr?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const attr = isPrimaryAttr(sp.attr) ? sp.attr : null;
  const q = (sp.q ?? "").trim();

  const where: Prisma.HeroWhereInput = {};
  if (attr) where.primaryAttr = attr;
  if (q) {
    where.localizedName = { contains: q, mode: "insensitive" };
  }

  const heroes = await prisma.hero.findMany({
    where,
    orderBy: { localizedName: "asc" },
    include: { _count: { select: { tutorials: true } } },
  });

  function filterHref(value: PrimaryAttribute | null): string {
    const params = new URLSearchParams();
    if (value) params.set("attr", value);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/heroes?${qs}` : "/heroes";
  }

  return (
    <div className="container-page py-10">
      <SectionHeading
        eyebrow="Aprenda"
        title="Heróis"
        description="Explore o catálogo de heróis do Dota 2 e aprenda cada um com tutoriais em vídeo curados pela comunidade."
      />

      {/* Filtros e busca */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = attr === f.value;
            return (
              <Link
                key={f.label}
                href={filterHref(f.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-aegis/40 bg-aegis/15 text-aegis"
                    : "border-surface-border text-zinc-400 hover:border-aegis/40 hover:text-zinc-100",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        <form action="/heroes" method="get" className="flex items-center gap-2">
          {attr && <input type="hidden" name="attr" value={attr} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar herói…"
              className="h-10 w-52 rounded-xl border border-surface-border bg-bg pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      {heroes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title="Nenhum herói encontrado"
          description={
            q
              ? `Nada corresponde a "${q}". Tente outro termo ou limpe o filtro.`
              : "Não há heróis para este filtro no momento."
          }
          action={
            <Link href="/heroes">
              <Button variant="outline">Limpar filtros</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {heroes.map((hero) => (
            <Link key={hero.id} href={`/heroes/${hero.slug}`} className="group">
              <Card className="h-full p-4 transition-colors group-hover:border-aegis/40">
                <div className="flex flex-col items-center gap-3 text-center">
                  <HeroAvatar slug={hero.slug} name={hero.localizedName} size="lg" />
                  <div className="space-y-2">
                    <h3 className="font-semibold leading-tight text-zinc-100">
                      {hero.localizedName}
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <Badge tone={ATTR_TONE[hero.primaryAttr]}>
                        {ATTR_LABELS[hero.primaryAttr]}
                      </Badge>
                      <Stars complexity={hero.complexity} />
                    </div>
                    <p className="text-xs text-zinc-500">
                      {hero._count.tutorials}{" "}
                      {hero._count.tutorials === 1 ? "tutorial" : "tutoriais"}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
