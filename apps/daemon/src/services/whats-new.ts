import type { WhatsNewContent, WhatsNewLocaleContent } from '@open-design/contracts';

// Fetches the post-update "what's new" highlight from a single hosted document
// on a dedicated R2 bucket. Operators edit that one file after a release; the
// document carries an `id` that drives the home card's once-per-highlight
// behavior (see apps/web/src/lib/whats-new.ts). This service does not know
// about release channels or the running version — content identity is the
// only thing that matters. A missing, unreachable, or malformed document
// resolves to `{ id: null, content: null }`; this endpoint must never fail the
// home surface.

export interface WhatsNewReadResult {
  id: string | null;
  content: WhatsNewContent | null;
  fetchedAt: number;
  stale: boolean;
}

export interface WhatsNewServiceOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}

export interface WhatsNewService {
  readWhatsNew(channel: string): Promise<WhatsNewReadResult>;
}

/** The dedicated, hardcoded highlights document. Operators update this file. */
export const DEFAULT_WHATS_NEW_URL = 'https://whatsnew.open-design.ai/whats-new.json';

/**
 * The post-update card is a release feature. Only real release channels fetch
 * the hosted document; development/CI builds resolve to no card so the card
 * never intrudes on tests or unreleased builds. `OD_WHATS_NEW_URL` opts any
 * channel in (used by e2e fixtures that exercise the card on purpose).
 */
const WHATS_NEW_RELEASE_CHANNELS = new Set(['beta', 'prerelease', 'preview', 'stable']);

// Short enough that an operator's edit reaches users on their next Home visit
// without a long stale window, long enough that Home activations do not hammer
// the origin.
const WHATS_NEW_CACHE_TTL_MS = 10 * 60 * 1000;
const WHATS_NEW_TIMEOUT_MS = 4_000;

/**
 * The document URL, or null when this build must not show the card.
 * `OD_WHATS_NEW_URL` overrides it for local fixtures and tests (e.g. a
 * tools-serve endpoint) regardless of channel; otherwise the dedicated R2
 * object is used only on release channels.
 */
export function whatsNewSourceUrl(env: NodeJS.ProcessEnv, channel: string): string | null {
  const override = env.OD_WHATS_NEW_URL?.trim();
  if (override) return override;
  return WHATS_NEW_RELEASE_CHANNELS.has(channel) ? DEFAULT_WHATS_NEW_URL : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readHttpsUrl(value: unknown): string | null {
  const raw = readNonEmptyString(value);
  if (raw == null) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

function parseLocaleOverrides(value: unknown): Record<string, WhatsNewLocaleContent> | undefined {
  if (!isObject(value)) return undefined;
  const locales: Record<string, WhatsNewLocaleContent> = {};
  for (const [locale, entry] of Object.entries(value)) {
    if (!isObject(entry)) continue;
    const override: WhatsNewLocaleContent = {};
    const title = readNonEmptyString(entry.title);
    const body = readNonEmptyString(entry.body);
    const linkUrl = readHttpsUrl(entry.linkUrl);
    if (title != null) override.title = title;
    if (body != null) override.body = body;
    if (linkUrl != null) override.linkUrl = linkUrl;
    if (Object.keys(override).length > 0) locales[locale] = override;
  }
  return Object.keys(locales).length > 0 ? locales : undefined;
}

/**
 * Parses the hosted highlights document. A valid highlight needs a non-empty
 * `id` (the once-per-highlight key) plus `title` and `body`. Anything missing
 * or malformed resolves to `{ id: null, content: null }` rather than
 * propagating a shape error into the UI.
 */
export function parseWhatsNewDocument(payload: unknown): { id: string | null; content: WhatsNewContent | null } {
  if (!isObject(payload)) return { id: null, content: null };
  const id = readNonEmptyString(payload.id);
  const title = readNonEmptyString(payload.title);
  const body = readNonEmptyString(payload.body);
  if (id == null || title == null || body == null) return { id: null, content: null };

  const imageUrl = readHttpsUrl(payload.imageUrl);
  const linkUrl = readHttpsUrl(payload.linkUrl);
  const locales = parseLocaleOverrides(payload.locales);
  return {
    id,
    content: {
      title,
      body,
      ...(imageUrl != null ? { imageUrl } : {}),
      ...(linkUrl != null ? { linkUrl } : {}),
      ...(locales != null ? { locales } : {}),
    },
  };
}

export function createWhatsNewService({
  fetchImpl = fetch,
  now = () => Date.now(),
  env = process.env,
}: WhatsNewServiceOptions = {}): WhatsNewService {
  let cache: { key: string; result: WhatsNewReadResult } | null = null;
  let inflight: Promise<WhatsNewReadResult> | null = null;

  async function readWhatsNew(channel: string): Promise<WhatsNewReadResult> {
    const sourceUrl = whatsNewSourceUrl(env, channel);
    if (sourceUrl == null) {
      // Development/CI builds (no release channel, no override) never show the
      // card and never reach out to the network.
      return { id: null, content: null, fetchedAt: now(), stale: false };
    }
    const cacheKey = sourceUrl;
    const currentTime = now();
    if (
      cache?.key === cacheKey &&
      currentTime - cache.result.fetchedAt < WHATS_NEW_CACHE_TTL_MS
    ) {
      return { ...cache.result, stale: false };
    }
    if (inflight) return inflight;

    inflight = (async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), WHATS_NEW_TIMEOUT_MS);
      try {
        const response = await fetchImpl(sourceUrl, {
          headers: { accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`whats-new document request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as unknown;
        const parsed = parseWhatsNewDocument(payload);
        const result: WhatsNewReadResult = {
          id: parsed.id,
          content: parsed.content,
          fetchedAt: now(),
          stale: false,
        };
        cache = { key: cacheKey, result };
        return result;
      } catch {
        if (cache?.key === cacheKey) return { ...cache.result, stale: true };
        // The card is best-effort chrome; a broken document must not break home.
        return { id: null, content: null, fetchedAt: now(), stale: true };
      } finally {
        clearTimeout(timeout);
        inflight = null;
      }
    })();

    return inflight;
  }

  return { readWhatsNew };
}
