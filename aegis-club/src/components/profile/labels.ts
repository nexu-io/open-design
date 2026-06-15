import type { DotaRole, Region } from "@prisma/client";

/** Rótulos (pt-BR) das funções/posições do Dota 2. */
export const DOTA_ROLE_LABELS: Record<DotaRole, string> = {
  CARRY: "Carregador (1)",
  MID: "Meio (2)",
  OFFLANE: "Offlane (3)",
  SOFT_SUPPORT: "Suporte (4)",
  HARD_SUPPORT: "Suporte (5)",
};

/** Rótulos (pt-BR) das regiões de jogo. */
export const REGION_LABELS: Record<Region, string> = {
  SA: "América do Sul",
  NA: "América do Norte",
  EU: "Europa",
  CIS: "CIS",
  SEA: "Sudeste Asiático",
  CHINA: "China",
};

/** Ordem canônica das funções (para listas e checkboxes). */
export const DOTA_ROLES: readonly DotaRole[] = [
  "CARRY",
  "MID",
  "OFFLANE",
  "SOFT_SUPPORT",
  "HARD_SUPPORT",
];

/** Ordem canônica das regiões (para selects e filtros). */
export const REGIONS: readonly Region[] = [
  "SA",
  "NA",
  "EU",
  "CIS",
  "SEA",
  "CHINA",
];
