import type { WhatsNewContent, WhatsNewLocaleContent } from '@open-design/contracts';

// Reads the release feed metadata.json for the running channel and surfaces
// its optional `whatsNew` block. The block is only exposed when the feed
// describes the version that is currently running — after an update the
// `<channel>/latest` feed and the app agree, which is exactly the moment the
// home surface wants to show a one-time highlights card. When the feed is
// ahead (update not applied yet), behind, unreachable, or has no highlights,
// the service resolves to `content: null` and the UI falls back to generic
// copy; this endpoint must never fail the home surface.

export interface WhatsNewReadInput {
  version: string;
  channel: string;
}

export interface WhatsNewReadResult {
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
  readWhatsNew(input: WhatsNewReadInput): Promise<WhatsNewReadResult>;
}

const WHATS_NEW_RELEASE_CHANNELS = new Set(['beta', 'prerelease', 'preview', 'stable']);
const WHATS_NEW_CACHE_TTL_MS = 60 * 60 * 1000;
const WHATS_NEW_TIMEOUT_MS = 4_000;

export const OPEN_DESIGN_RELEASES_INDEX_URL = 'https://github.com/nexu-io/open-design/releases';

/** Mirrors the `open-design-v<version>` tag naming used by stable releases. */
export function whatsNewReleaseUrl(input: WhatsNewReadInput): string {
  if (input.channel === 'stable') {
    return `${OPEN_DESIGN_RELEASES_INDEX_URL}/tag/open-design-v${encodeURIComponent(input.version)}`;
  }
  return OPEN_DESIGN_RELEASES_INDEX_URL;
}

export function whatsNewMetadataUrl(input: WhatsNewReadInput, env: NodeJS.ProcessEnv): string | null {
  const override = env.OD_UPDATE_METADATA_URL?.trim();
  if (override) return override;
  if (!WHATS_NEW_RELEASE_CHANNELS.has(input.channel)) return null;
  return `https://releases.open-design.ai/${input.channel}/latest/metadata.json`;
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
 * Parses the `whatsNew` block out of a release feed metadata payload,
 * requiring the feed to describe `input.version` (either the exact
 * releaseVersion or its stable base version). Any malformed block resolves to
 * null rather than propagating a shape error into the UI.
 */
export function parseWhatsNewFromMetadata(payload: unknown, input: WhatsNewReadInput): WhatsNewContent | null {
  if (!isObject(payload)) return null;
  const feedVersion = readNonEmptyString(payload.releaseVersion) ?? readNonEmptyString(payload.version);
  const feedBaseVersion = readNonEmptyString(payload.baseVersion);
  if (feedVersion !== input.version && feedBaseVersion !== input.version) return null;

  if (!isObject(payload.whatsNew)) return null;
  const title = readNonEmptyString(payload.whatsNew.title);
  const body = readNonEmptyString(payload.whatsNew.body);
  if (title == null || body == null) return null;

  const imageUrl = readHttpsUrl(payload.whatsNew.imageUrl);
  const linkUrl = readHttpsUrl(payload.whatsNew.linkUrl);
  const locales = parseLocaleOverrides(payload.whatsNew.locales);
  return {
    title,
    body,
    ...(imageUrl != null ? { imageUrl } : {}),
    ...(linkUrl != null ? { linkUrl } : {}),
    ...(locales != null ? { locales } : {}),
  };
}

export function createWhatsNewService({
  fetchImpl = fetch,
  now = () => Date.now(),
  env = process.env,
}: WhatsNewServiceOptions = {}): WhatsNewService {
  let cache: { key: string; result: WhatsNewReadResult } | null = null;
  let inflight: Promise<WhatsNewReadResult> | null = null;

  async function readWhatsNew(input: WhatsNewReadInput): Promise<WhatsNewReadResult> {
    const metadataUrl = whatsNewMetadataUrl(input, env);
    if (metadataUrl == null) {
      return { content: null, fetchedAt: now(), stale: false };
    }

    const cacheKey = `${metadataUrl}::${input.version}`;
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
        const response = await fetchImpl(metadataUrl, {
          headers: { accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`release feed metadata request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as unknown;
        const result: WhatsNewReadResult = {
          content: parseWhatsNewFromMetadata(payload, input),
          fetchedAt: now(),
          stale: false,
        };
        cache = { key: cacheKey, result };
        return result;
      } catch {
        if (cache?.key === cacheKey) return { ...cache.result, stale: true };
        // The card is best-effort chrome; a broken feed must not break home.
        return { content: null, fetchedAt: now(), stale: true };
      } finally {
        clearTimeout(timeout);
        inflight = null;
      }
    })();

    return inflight;
  }

  return { readWhatsNew };
}
