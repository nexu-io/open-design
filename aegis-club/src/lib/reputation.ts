/**
 * Sistema de reputação / comportamento — o coração do anti-toxicidade.
 *
 * O "behavior score" vai de 0 a 10000 (mesma escala mental do Dota oficial).
 * Jogadores começam em 7500. Elogios sobem, denúncias validadas descem,
 * partidas limpas recuperam lentamente. Abaixo de um limite, o jogador
 * fica restrito à fila de baixa prioridade (ou bloqueado da ranqueada).
 */

import type { CommendCategory, ReportCategory } from "@prisma/client";

export const BEHAVIOR_MIN = 0;
export const BEHAVIOR_MAX = 10000;
export const BEHAVIOR_START = 7500;

/** Abaixo disto o jogador não entra na fila ranqueada. */
export const RANKED_BEHAVIOR_THRESHOLD = 4000;
/** Abaixo disto entra na fila de "baixa prioridade" (só com outros tóxicos). */
export const LOW_PRIORITY_THRESHOLD = 6000;

export interface BehaviorTier {
  key: "excellent" | "good" | "fair" | "poor" | "critical";
  label: string;
  description: string;
  /** classe de cor Tailwind para texto */
  color: string;
  /** classe de cor Tailwind para fundo de barra */
  barColor: string;
}

export function behaviorTier(score: number): BehaviorTier {
  if (score >= 9000)
    return {
      key: "excellent",
      label: "Exemplar",
      description: "Referência de boa conduta na comunidade.",
      color: "text-behavior-good",
      barColor: "bg-behavior-good",
    };
  if (score >= 7000)
    return {
      key: "good",
      label: "Confiável",
      description: "Bom companheiro de equipe.",
      color: "text-radiant",
      barColor: "bg-radiant",
    };
  if (score >= LOW_PRIORITY_THRESHOLD)
    return {
      key: "fair",
      label: "Neutro",
      description: "Comportamento dentro do esperado, com atenção.",
      color: "text-behavior-warn",
      barColor: "bg-behavior-warn",
    };
  if (score >= RANKED_BEHAVIOR_THRESHOLD)
    return {
      key: "poor",
      label: "Em observação",
      description: "Denúncias recentes. Fila ranqueada limitada.",
      color: "text-dire-soft",
      barColor: "bg-dire-soft",
    };
  return {
    key: "critical",
    label: "Restrito",
    description: "Restrito à fila de baixa prioridade.",
    color: "text-dire",
    barColor: "bg-dire",
  };
}

export function canQueueRanked(behaviorScore: number): boolean {
  return behaviorScore >= RANKED_BEHAVIOR_THRESHOLD;
}

export function isLowPriority(behaviorScore: number): boolean {
  return behaviorScore < LOW_PRIORITY_THRESHOLD;
}

/** Quanto cada elogio recebido soma no behavior score. */
const COMMEND_WEIGHT: Record<CommendCategory, number> = {
  FRIENDLY: 80,
  FORGIVING: 80,
  TEACHING: 100,
  LEADERSHIP: 100,
};

/** Quanto cada denúncia validada subtrai do behavior score. */
const REPORT_WEIGHT: Record<ReportCategory, number> = {
  TOXIC_CHAT: 250,
  INTENTIONAL_FEEDING: 400,
  GRIEFING: 500,
  ABANDON: 300,
  HATE_SPEECH: 800,
  CHEATING: 1500,
  SMURFING: 400,
};

/** Recompensa por terminar uma partida sem ser denunciado. */
export const CLEAN_MATCH_BONUS = 50;
/** Penalidade por abandono. */
export const ABANDON_PENALTY = 600;

export function clampBehavior(score: number): number {
  return Math.max(BEHAVIOR_MIN, Math.min(BEHAVIOR_MAX, Math.round(score)));
}

export function commendDelta(category: CommendCategory): number {
  return COMMEND_WEIGHT[category] ?? 50;
}

export function reportDelta(category: ReportCategory): number {
  return -(REPORT_WEIGHT[category] ?? 250);
}

export const COMMEND_LABELS: Record<CommendCategory, string> = {
  FRIENDLY: "Amigável",
  FORGIVING: "Tolerante",
  TEACHING: "Comunicativo",
  LEADERSHIP: "Boa liderança",
};

export const REPORT_LABELS: Record<ReportCategory, string> = {
  TOXIC_CHAT: "Comunicação abusiva",
  INTENTIONAL_FEEDING: "Feeding intencional",
  GRIEFING: "Sabotagem (griefing)",
  ABANDON: "Abandono",
  HATE_SPEECH: "Discurso de ódio",
  CHEATING: "Trapaça / scripts",
  SMURFING: "Smurf (conta secundária)",
};
