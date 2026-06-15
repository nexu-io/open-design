/**
 * Geração de chaveamento (single elimination) para torneios.
 */

export interface SeededTeam {
  id: string;
  seed: number;
}

export interface BracketMatchInput {
  round: number;
  position: number;
  bracket: "WINNERS" | "LOSERS" | "GRAND_FINAL";
  teamAId: string | null;
  teamBId: string | null;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

/**
 * Ordem padrão de seeds num chaveamento (1 vs N, etc).
 * Para size=4 → [1,4,3,2]; size=8 → [1,8,5,4,3,6,7,2].
 */
export function seedOrder(size: number): number[] {
  let rounds = [1, 2];
  while (rounds.length < size) {
    const next: number[] = [];
    const total = rounds.length * 2 + 1;
    for (const s of rounds) {
      next.push(s);
      next.push(total - s);
    }
    rounds = next;
  }
  return rounds;
}

/**
 * Cria todas as partidas de um chaveamento de eliminação simples.
 * Times além da contagem viram "bye" (adversário nulo → avança sozinho).
 */
export function generateSingleElimination(
  teams: SeededTeam[],
): BracketMatchInput[] {
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const size = nextPowerOfTwo(sorted.length);
  const order = seedOrder(size);

  // Mapeia cada posição de seed (1..size) para um time ou null (bye).
  const bySeed = new Map<number, SeededTeam>();
  sorted.forEach((t, i) => bySeed.set(i + 1, t));

  const matches: BracketMatchInput[] = [];
  const totalRounds = Math.log2(size);

  // Rodada 1
  for (let i = 0; i < size / 2; i++) {
    const seedA = order[i * 2];
    const seedB = order[i * 2 + 1];
    matches.push({
      round: 1,
      position: i,
      bracket: "WINNERS",
      teamAId: bySeed.get(seedA)?.id ?? null,
      teamBId: bySeed.get(seedB)?.id ?? null,
    });
  }

  // Rodadas seguintes (vazias até serem preenchidas pelos vencedores)
  for (let round = 2; round <= totalRounds; round++) {
    const count = size / 2 ** round;
    for (let pos = 0; pos < count; pos++) {
      matches.push({
        round,
        position: pos,
        bracket: round === totalRounds ? "GRAND_FINAL" : "WINNERS",
        teamAId: null,
        teamBId: null,
      });
    }
  }

  return matches;
}

/** Onde o vencedor de (round, position) avança na próxima rodada. */
export function nextSlot(position: number): {
  position: number;
  slot: "A" | "B";
} {
  return {
    position: Math.floor(position / 2),
    slot: position % 2 === 0 ? "A" : "B",
  };
}
