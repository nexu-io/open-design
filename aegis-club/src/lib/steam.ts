/**
 * Autenticação via Steam usando OpenID 2.0.
 * Não depende de bibliotecas externas: monta a URL de login e valida a
 * asserção de retorno conversando diretamente com o endpoint da Steam.
 */

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const STEAM_ID_PREFIX = "https://steamcommunity.com/openid/id/";

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** URL para onde redirecionamos o usuário a fim de iniciar o login. */
export function buildSteamLoginUrl(): string {
  const realm = appUrl();
  const returnTo = `${realm}/api/auth/steam/callback`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

/**
 * Valida a asserção devolvida pela Steam e retorna o SteamID64.
 * Reenvia os parâmetros recebidos com `openid.mode=check_authentication`.
 */
export async function verifySteamCallback(
  query: URLSearchParams,
): Promise<string | null> {
  const claimedId = query.get("openid.claimed_id");
  if (!claimedId || !claimedId.startsWith(STEAM_ID_PREFIX)) return null;

  const body = new URLSearchParams();
  query.forEach((value, key) => {
    if (key.startsWith("openid.")) body.append(key, value);
  });
  body.set("openid.mode", "check_authentication");

  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/i.test(text)) return null;

  const steamId = claimedId.slice(STEAM_ID_PREFIX.length);
  return /^\d{17}$/.test(steamId) ? steamId : null;
}

export interface SteamProfile {
  steamId: string;
  nickname: string;
  avatarUrl: string | null;
  country: string | null;
}

/**
 * Busca nome e avatar via Steam Web API (GetPlayerSummaries).
 * Sem STEAM_API_KEY, retorna um perfil mínimo baseado no SteamID.
 */
export async function fetchSteamProfile(
  steamId: string,
): Promise<SteamProfile> {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return {
      steamId,
      nickname: `Jogador ${steamId.slice(-4)}`,
      avatarUrl: null,
      country: null,
    };
  }
  try {
    const url = new URL(
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
    );
    url.searchParams.set("key", key);
    url.searchParams.set("steamids", steamId);
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as {
      response?: {
        players?: Array<{
          personaname?: string;
          avatarfull?: string;
          loccountrycode?: string;
        }>;
      };
    };
    const p = data.response?.players?.[0];
    return {
      steamId,
      nickname: p?.personaname ?? `Jogador ${steamId.slice(-4)}`,
      avatarUrl: p?.avatarfull ?? null,
      country: p?.loccountrycode ?? null,
    };
  } catch {
    return {
      steamId,
      nickname: `Jogador ${steamId.slice(-4)}`,
      avatarUrl: null,
      country: null,
    };
  }
}
