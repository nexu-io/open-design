/**
 * Ranking interno da plataforma (rankPoints) e medalhas no estilo Dota 2.
 * Usamos um Elo simples para variação de pontos a cada partida.
 */

export interface RankTier {
  key: string;
  name: string;
  /** 1–5 (estrelas), 0 = sem divisão (Imortal) */
  division: number;
  color: string;
  /** faixa mínima de rankPoints */
  min: number;
}

// Medalhas do Dota: Arauto, Guardião, Cruzado, Arconte, Lenda, Ancião, Divino, Imortal.
const MEDALS: Array<{ key: string; name: string; color: string; base: number }> =
  [
    { key: "herald", name: "Arauto", color: "text-stone-400", base: 0 },
    { key: "guardian", name: "Guardião", color: "text-amber-700", base: 770 },
    { key: "crusader", name: "Cruzado", color: "text-orange-400", base: 1540 },
    { key: "archon", name: "Arconte", color: "text-emerald-400", base: 2310 },
    { key: "legend", name: "Lenda", color: "text-sky-400", base: 3080 },
    { key: "ancient", name: "Ancião", color: "text-violet-400", base: 3850 },
    { key: "divine", name: "Divino", color: "text-fuchsia-400", base: 4620 },
    { key: "immortal", name: "Imortal", color: "text-aegis", base: 5400 },
  ];

const DIVISION_SPAN = 770 / 5; // largura de cada estrela dentro de uma medalha

export function rankTier(points: number): RankTier {
  // Encontra a medalha mais alta cujo base <= points
  let medal = MEDALS[0];
  for (const m of MEDALS) {
    if (points >= m.base) medal = m;
  }
  if (medal.key === "immortal") {
    return { ...medal, division: 0, min: medal.base };
  }
  const within = points - medal.base;
  const division = Math.min(5, Math.floor(within / DIVISION_SPAN) + 1);
  return { ...medal, division, min: medal.base };
}

export function rankLabel(points: number): string {
  const t = rankTier(points);
  return t.division > 0 ? `${t.name} ${"★".repeat(t.division)}` : t.name;
}

// ── Elo ──────────────────────────────────────────────────────────
const K_FACTOR = 32;

export function expectedScore(playerAvg: number, opponentAvg: number): number {
  return 1 / (1 + 10 ** ((opponentAvg - playerAvg) / 400));
}

/**
 * Variação de rankPoints para um jogador.
 * @param teamAvg média do time do jogador
 * @param opponentAvg média do time adversário
 * @param won venceu?
 */
export function rankDelta(
  teamAvg: number,
  opponentAvg: number,
  won: boolean,
): number {
  const expected = expectedScore(teamAvg, opponentAvg);
  const actual = won ? 1 : 0;
  return Math.round(K_FACTOR * (actual - expected));
}
