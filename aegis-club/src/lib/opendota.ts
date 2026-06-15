/**
 * Integração leve com a OpenDota (https://docs.opendota.com/).
 * Usada para importar a lista de heróis e estatísticas públicas de jogadores.
 * Tudo opcional — a plataforma funciona com os dados estáticos de heróis.
 */

const OPENDOTA = "https://api.opendota.com/api";
const STEAM_ID_OFFSET = 76561197960265728n;

/** Converte SteamID64 no account_id de 32 bits usado pela OpenDota. */
export function steamIdToAccountId(steamId64: string): number {
  return Number(BigInt(steamId64) - STEAM_ID_OFFSET);
}

export interface OpenDotaHero {
  id: number;
  name: string; // npc_dota_hero_*
  localized_name: string;
  primary_attr: "str" | "agi" | "int" | "all";
  attack_type: string;
  roles: string[];
}

export async function fetchOpenDotaHeroes(): Promise<OpenDotaHero[]> {
  const res = await fetch(`${OPENDOTA}/heroes`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`OpenDota /heroes falhou: ${res.status}`);
  return res.json();
}

export interface OpenDotaPlayer {
  account_id: number;
  personaname?: string;
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
  win?: number;
  lose?: number;
}

export async function fetchOpenDotaPlayer(
  accountId: number,
): Promise<OpenDotaPlayer | null> {
  try {
    const [profileRes, wlRes] = await Promise.all([
      fetch(`${OPENDOTA}/players/${accountId}`, {
        next: { revalidate: 60 * 30 },
      }),
      fetch(`${OPENDOTA}/players/${accountId}/wl`, {
        next: { revalidate: 60 * 30 },
      }),
    ]);
    if (!profileRes.ok) return null;
    const profile = await profileRes.json();
    const wl = wlRes.ok ? await wlRes.json() : { win: 0, lose: 0 };
    return {
      account_id: accountId,
      personaname: profile?.profile?.personaname,
      rank_tier: profile?.rank_tier ?? null,
      leaderboard_rank: profile?.leaderboard_rank ?? null,
      win: wl?.win ?? 0,
      lose: wl?.lose ?? 0,
    };
  } catch {
    return null;
  }
}

/** Converte rank_tier da OpenDota (ex: 55) para MMR aproximado de exibição. */
export function rankTierToApproxMmr(rankTier?: number | null): number | null {
  if (!rankTier) return null;
  const medal = Math.floor(rankTier / 10); // 1..8
  const stars = rankTier % 10; // 0..5
  // Aproximação grosseira: cada medalha ~770 de MMR, cada estrela ~154.
  return Math.round((medal - 1) * 770 + stars * 154);
}
