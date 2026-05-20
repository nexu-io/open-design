// xAI runtime credential resolver.
//
// High-level helper on top of `xai-tokens.ts` + `xai-oauth.ts`. Returns
// a fresh access_token, automatically refreshing in place when the
// stored token is within the 120 s expiry skew window. Multiple media
// providers (image / video / TTS / X search) share this helper so they
// all see the same up-to-date bearer without each rolling their own
// expiry logic.
//
// Refresh-on-read (lazy) is sufficient because xAI bearer tokens are
// short-lived — every active call site naturally sees expiry often
// enough that we don't need a separate background refresher.

import { refreshXAIToken } from './xai-oauth.js';
import {
  getXAIToken,
  isXAITokenExpired,
  setXAIToken,
  type StoredXAIToken,
} from './xai-tokens.js';

export interface ResolvedXAICredential {
  accessToken: string;
  /** Whether this came back unchanged from disk or was refreshed inline. */
  source: 'stored' | 'refreshed';
}

/**
 * Get a usable xAI bearer, refreshing in place if the stored token is
 * within the expiry skew window. Returns null when nothing is stored,
 * the stored token has no refresh_token to renew with, or the refresh
 * call fails. Callers should treat null as "no OAuth available, fall
 * back to API key / re-login UI".
 */
export async function resolveXAIBearer(
  dataDir: string,
  fetchImpl?: typeof fetch,
): Promise<ResolvedXAICredential | null> {
  const stored = await getXAIToken(dataDir);
  if (!stored) return null;
  if (!isXAITokenExpired(stored)) {
    return { accessToken: stored.accessToken, source: 'stored' };
  }

  // Within skew window — try a refresh. If we have no refresh_token
  // (some auth servers don't issue one) the caller has to re-login, so
  // we can't recover here.
  if (!stored.refreshToken) return null;

  try {
    const fresh = await refreshXAIToken({
      refreshToken: stored.refreshToken,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    const next: StoredXAIToken = {
      accessToken: fresh.access_token,
      tokenType: fresh.token_type ?? 'Bearer',
      savedAt: Date.now(),
    };
    // Preserve the existing refresh_token when the token endpoint omits
    // one in its response. RFC 6749 §6 lets a server skip refresh_token
    // rotation and keep the old one valid; if we dropped it here the
    // next expiry would have nothing to refresh against and force the
    // user back through the full Sign in flow even though their grant
    // is still good.
    const carriedRefresh = fresh.refresh_token ?? stored.refreshToken;
    if (carriedRefresh) next.refreshToken = carriedRefresh;
    if (typeof fresh.expires_in === 'number') {
      next.expiresAt = Date.now() + fresh.expires_in * 1000;
    }
    if (fresh.scope) next.scope = fresh.scope;
    await setXAIToken(dataDir, next);
    return { accessToken: next.accessToken, source: 'refreshed' };
  } catch {
    // Refresh failed (network blip, revoked refresh_token, server
    // error). Return null so the caller falls through to API-key
    // resolution and surfaces a re-login prompt if everything is empty.
    return null;
  }
}
