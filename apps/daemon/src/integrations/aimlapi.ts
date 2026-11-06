// aimlapi.com BYOK provider — shared identity + outbound header helper.
//
// aimlapi.com (https://aimlapi.com) is an OpenAI-wire-compatible aggregator:
// a single API key fronts ~900 models from many creators, routed by model name
// on the upstream side. Because the wire shape is identical to OpenAI's, the
// chat proxy, connection test and model discovery all reuse the OpenAI call
// shape — the ONLY thing that differs is the outbound headers, which is why
// every outbound call point funnels through `aimlapiHeaders()` rather than
// hand-building `Authorization` inline.
//
// The distinctive aimlapi.com detail is the attribution pair: aimlapi.com
// expects `X-AIMLAPI-Source` and `X-AIMLAPI-Partner-ID` on EVERY request it
// serves — inference, catalog and key checks alike, not just sign-up. Injecting
// them in one helper keeps the invariant "every aimlapi.com request carries our
// attribution" enforceable in one place instead of being re-derived at each
// call site; the aggregator's rebate accounting keys off exactly this, and a
// missing header means the request serves fine but is silently untagged.

/**
 * Provisioned partner for this integration. Valid on both aimlapi.com's staging
 * and production backends, so it ships compiled in and one build works against
 * either — only the base URL differs. Overridable via `AIMLAPI_PARTNER_ID` for
 * a staging-only test id.
 */
export const AIMLAPI_PARTNER_ID = 'part_9TWZWFsyMyNrBDEENq5JaU0r';

/**
 * `<channel>/<client>` — the channel is a small closed set (agent|mcp|web) and
 * the client is this integration's registry slug.
 */
export const AIMLAPI_SOURCE = 'agent/open-design';

/**
 * Default base URL the daemon assumes when the BYOK form leaves the field
 * blank. Kept here as the single source of truth so the chat proxy, model
 * discovery and connection test all default to the same origin.
 *
 * Note the `/v1`: aimlapi.com's OpenAI-compatible surface lives there, while
 * `/v2` on the same host is billing/usage only and 404s for chat completions.
 */
export const AIMLAPI_DEFAULT_BASE_URL = 'https://api.aimlapi.com/v1';

function partnerId(): string {
  return (process.env.AIMLAPI_PARTNER_ID || '').trim() || AIMLAPI_PARTNER_ID;
}

/**
 * The attribution pair on its own (no auth). For any route that carries its own
 * auth header — spread this alongside it so every aimlapi.com request, whatever
 * the wire protocol, still carries attribution.
 */
export function aimlapiAttributionHeaders(): Record<string, string> {
  return {
    'X-AIMLAPI-Source': AIMLAPI_SOURCE,
    'X-AIMLAPI-Partner-ID': partnerId(),
  };
}

/**
 * Build the outbound header set for an aimlapi.com request: Bearer auth plus
 * the attribution pair. Callers spread the result into their `fetch` headers
 * and may add `content-type` etc. on top.
 */
export function aimlapiHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    ...aimlapiAttributionHeaders(),
  };
}

/**
 * Origin of a configured base URL, for callers that need to reach a sibling
 * path on the same host. Falls back to the default origin when the configured
 * value is unusable, so a malformed setting degrades instead of throwing.
 */
export function aimlapiOriginFromBase(baseUrl: string | undefined | null): string {
  const candidate = (baseUrl || '').trim() || AIMLAPI_DEFAULT_BASE_URL;
  try {
    return new URL(candidate).origin;
  } catch {
    return new URL(AIMLAPI_DEFAULT_BASE_URL).origin;
  }
}

/**
 * aimlapi.com's real production hostname — the one host this validated
 * exact-match check will ever recognize (no wildcard/subdomain matching, so
 * a lookalike or attacker-controlled domain can never pick up the
 * attribution pair or the aimlapi-specific catalog/model behavior).
 */
const AIMLAPI_API_HOSTNAME = 'api.aimlapi.com';

/**
 * True when `baseUrl` resolves to aimlapi.com's real API host, regardless of
 * which BYOK protocol tab the caller is configured under. aimlapi.com is
 * OpenAI-wire-compatible, so it already worked (pre-dating this integration)
 * through the generic "OpenAI" tab with a hand-typed base URL — those
 * existing saved configs stay `protocol: 'openai'` (backward compatibility
 * is explicit: "saved configs load unchanged"), so a dispatch keyed only on
 * `protocol === 'aimlapi'` silently excludes them from the attribution pair,
 * the curated catalog filter, and the aimlapi-specific request shape this
 * whole integration exists to add. Callers should check this ALONGSIDE
 * `protocol === 'aimlapi'`, not instead of it, so a native aimlapi.com
 * config with no baseUrl override (falls back to AIMLAPI_DEFAULT_BASE_URL)
 * still matches.
 */
export function isAimlapiApiHost(baseUrl: string | undefined | null): boolean {
  const candidate = (baseUrl || '').trim();
  if (!candidate) return false;
  try {
    return new URL(candidate).hostname.toLowerCase() === AIMLAPI_API_HOSTNAME;
  } catch {
    return false;
  }
}
