import { z } from "zod";

// ── Perfil ────────────────────────────────────────────────────────
export const dotaRoleEnum = z.enum([
  "CARRY",
  "MID",
  "OFFLANE",
  "SOFT_SUPPORT",
  "HARD_SUPPORT",
]);

export const regionEnum = z.enum(["SA", "NA", "EU", "CIS", "SEA", "CHINA"]);

export const updateProfileSchema = z.object({
  nickname: z.string().min(2).max(32).optional(),
  bio: z.string().max(500).optional(),
  region: regionEnum.optional(),
  mainRoles: z.array(dotaRoleEnum).max(5).optional(),
  favoriteHeroIds: z.array(z.number().int().positive()).max(6).optional(),
  discord: z.string().max(64).optional(),
  twitch: z.string().max(64).optional(),
  youtube: z.string().max(64).optional(),
});

// ── Fila / matchmaking ────────────────────────────────────────────
export const joinQueueSchema = z.object({
  mode: z.enum(["RANKED_5V5", "UNRANKED_5V5"]).default("RANKED_5V5"),
  region: regionEnum.default("SA"),
  preferredRoles: z.array(dotaRoleEnum).max(5).optional(),
});

// ── Reputação ─────────────────────────────────────────────────────
export const commendSchema = z.object({
  matchId: z.string().optional(),
  toUserId: z.string().min(1),
  category: z.enum(["FRIENDLY", "FORGIVING", "TEACHING", "LEADERSHIP"]),
});

export const reportSchema = z.object({
  matchId: z.string().optional(),
  toUserId: z.string().min(1),
  category: z.enum([
    "TOXIC_CHAT",
    "INTENTIONAL_FEEDING",
    "GRIEFING",
    "ABANDON",
    "HATE_SPEECH",
    "CHEATING",
    "SMURFING",
  ]),
  comment: z.string().max(500).optional(),
});

// ── Tutoriais ─────────────────────────────────────────────────────
export const createTutorialSchema = z.object({
  heroId: z.number().int().positive(),
  title: z.string().min(4).max(120),
  youtube: z.string().min(5), // URL ou ID; normalizado no servidor
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
  language: z.string().default("pt-BR"),
});

export const voteTutorialSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

// ── Torneios ──────────────────────────────────────────────────────
export const createTournamentSchema = z.object({
  name: z.string().min(4).max(80),
  description: z.string().max(2000).optional(),
  format: z
    .enum(["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN"])
    .default("SINGLE_ELIMINATION"),
  region: regionEnum.default("SA"),
  maxTeams: z.number().int().min(2).max(64).default(8),
  prizePool: z.string().max(120).optional(),
  registrationEndsAt: z.string().datetime().optional(),
  startsAt: z.string().datetime().optional(),
});

export const createTeamSchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(2).max(40),
  tag: z.string().min(1).max(6),
});

export const reportMatchResultSchema = z.object({
  matchId: z.string().min(1),
  winnerTeamId: z.string().min(1),
  scoreA: z.number().int().min(0).max(5).default(0),
  scoreB: z.number().int().min(0).max(5).default(0),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type JoinQueueInput = z.infer<typeof joinQueueSchema>;
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
