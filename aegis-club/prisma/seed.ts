/**
 * Seed do banco: heróis, jogadores de demonstração, tutoriais e um torneio.
 * Roda com `pnpm db:seed` (após `pnpm prisma migrate dev`).
 */
import { PrismaClient } from "@prisma/client";
import { HEROES } from "../src/data/heroes";
import { generateSingleElimination } from "../src/lib/bracket";
import { slugify } from "../src/lib/utils";

const prisma = new PrismaClient();

// Vídeo público de placeholder para os tutoriais de demonstração.
// Troque pelos IDs reais dos seus vídeos do YouTube no painel.
const DEMO_YT = "aqz-KE-bpKQ";

const DEMO_PLAYERS = [
  { nickname: "AegisLover", rankPoints: 5200, behaviorScore: 9600 },
  { nickname: "MidOuPaau", rankPoints: 4100, behaviorScore: 8800 },
  { nickname: "SupportGod", rankPoints: 3950, behaviorScore: 9900 },
  { nickname: "Carregador", rankPoints: 4600, behaviorScore: 7200 },
  { nickname: "PosThree", rankPoints: 3300, behaviorScore: 8100 },
  { nickname: "Wards4Life", rankPoints: 2800, behaviorScore: 9700 },
  { nickname: "RoshKiller", rankPoints: 5100, behaviorScore: 6800 },
  { nickname: "Calmaria", rankPoints: 2100, behaviorScore: 9990 },
  { nickname: "Iniciante22", rankPoints: 600, behaviorScore: 7500 },
  { nickname: "FeederFurioso", rankPoints: 1500, behaviorScore: 3200 },
  { nickname: "Toxic_BR", rankPoints: 1800, behaviorScore: 2400 },
  { nickname: "ShotCaller", rankPoints: 4400, behaviorScore: 9100 },
];

async function main() {
  console.log("→ Semeando heróis…");
  for (const h of HEROES) {
    await prisma.hero.upsert({
      where: { id: h.id },
      update: {
        localizedName: h.localizedName,
        slug: h.slug,
        primaryAttr: h.primaryAttr,
        roles: h.roles,
        complexity: h.complexity,
        name: h.npc,
      },
      create: {
        id: h.id,
        name: h.npc,
        localizedName: h.localizedName,
        slug: h.slug,
        primaryAttr: h.primaryAttr,
        roles: h.roles,
        complexity: h.complexity,
      },
    });
  }

  console.log("→ Semeando jogadores de demonstração…");
  const regions = ["SA", "SA", "SA", "NA", "EU"] as const;
  const allRoles = [
    "CARRY",
    "MID",
    "OFFLANE",
    "SOFT_SUPPORT",
    "HARD_SUPPORT",
  ] as const;
  const users = [];
  for (let i = 0; i < DEMO_PLAYERS.length; i++) {
    const p = DEMO_PLAYERS[i];
    const user = await prisma.user.upsert({
      where: { email: `${slugify(p.nickname)}@demo.aegis` },
      update: {},
      create: {
        nickname: p.nickname,
        email: `${slugify(p.nickname)}@demo.aegis`,
        role: i === 0 ? "ADMIN" : i === 11 ? "ORGANIZER" : "PLAYER",
        profile: {
          create: {
            rankPoints: p.rankPoints,
            behaviorScore: p.behaviorScore,
            region: regions[i % regions.length],
            mainRoles: [allRoles[i % allRoles.length]],
            matchesPlayed: 40 + i * 7,
            wins: 20 + i * 3,
            losses: 20 + i * 4,
            favoriteHeroIds: HEROES.slice(i % 8, (i % 8) + 3).map((h) => h.id),
            bio: "Jogador da comunidade Aegis Club.",
          },
        },
      },
    });
    users.push(user);
  }

  console.log("→ Semeando tutoriais…");
  const tutHeroes = HEROES.slice(0, 6);
  for (const h of tutHeroes) {
    await prisma.tutorial.upsert({
      where: { id: `seed-tut-${h.id}` },
      update: {},
      create: {
        id: `seed-tut-${h.id}`,
        heroId: h.id,
        title: `Guia completo de ${h.localizedName} para iniciantes`,
        youtubeId: DEMO_YT,
        level: "BEGINNER",
        language: "pt-BR",
        authorId: users[0].id,
        score: Math.floor(Math.random() * 50),
      },
    });
  }

  console.log("→ Semeando torneio de demonstração…");
  const organizer = users[11];
  const tournament = await prisma.tournament.upsert({
    where: { slug: "copa-aegis-temporada-1" },
    update: {},
    create: {
      slug: "copa-aegis-temporada-1",
      name: "Copa Aegis — Temporada 1",
      description:
        "Torneio amador 5x5 da comunidade. Eliminação simples, melhor de 3 nas finais.",
      format: "SINGLE_ELIMINATION",
      status: "REGISTRATION",
      region: "SA",
      maxTeams: 4,
      prizePool: "R$ 500 + Arcanas",
      organizerId: organizer.id,
      registrationEndsAt: new Date(Date.now() + 7 * 86400000),
      startsAt: new Date(Date.now() + 8 * 86400000),
    },
  });

  // 4 times de demonstração
  const teamNames = [
    ["Radiant Kings", "RDK"],
    ["Dire Wolves", "DRW"],
    ["Ancient Guardians", "ANC"],
    ["Roshan Slayers", "RSH"],
  ];
  const teams = [];
  for (let i = 0; i < teamNames.length; i++) {
    const [name, tag] = teamNames[i];
    const team = await prisma.team.upsert({
      where: { id: `seed-team-${i}` },
      update: {},
      create: {
        id: `seed-team-${i}`,
        tournamentId: tournament.id,
        name,
        tag,
        captainId: users[i].id,
        seed: i + 1,
        members: {
          create: { userId: users[i].id, role: "CARRY" },
        },
      },
    });
    teams.push(team);
  }

  // Gera o chaveamento se ainda não existir
  const existing = await prisma.tournamentMatch.count({
    where: { tournamentId: tournament.id },
  });
  if (existing === 0) {
    const bracket = generateSingleElimination(
      teams.map((t) => ({ id: t.id, seed: t.seed ?? 0 })),
    );
    for (const m of bracket) {
      await prisma.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          round: m.round,
          position: m.position,
          bracket: m.bracket,
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          bestOf: m.bracket === "GRAND_FINAL" ? 3 : 1,
        },
      });
    }
  }

  console.log("✓ Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
