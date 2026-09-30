import { buildSharePath, type PublicShareLinkUnavailableCode } from '@open-design/contracts';
import {
  normalizeShareViewerOrigin,
  resolveEffectiveShareViewerOrigin,
  resolveShareViewerOriginOverride,
} from '../integrations/share-viewer-origin.js';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

const STABLE_SHARE_SLUG = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** A dot-segment project id would be collapsed by URL resolution
 * (`/artifact/../<slug>` becomes `/<slug>`), so it is never a valid identity. */
function isShareIdentity(projectId: string, slug: string): boolean {
  const trimmedProjectId = projectId.trim();
  return Boolean(trimmedProjectId) && trimmedProjectId !== '.' && trimmedProjectId !== '..' && STABLE_SHARE_SLUG.test(slug);
}

function assertShareIdentity(projectId: string, slug: string): void {
  if (!isShareIdentity(projectId, slug)) throw new Error('PUBLIC_SHARE_IDENTITY_INVALID');
}

/**
 * Resolve the canonical public Viewer address. Only presentation configuration
 * failures become null; invalid identity and publishing/authorization errors
 * remain errors. The address uses a root-shell origin, never the console URL.
 */
export function resolvePublicShareViewerUrl(
  projectId: string,
  slug: string,
  env: EnvMap = process.env,
  configuredEnv: EnvMap = {},
): string | null {
  assertShareIdentity(projectId, slug);
  try {
    return publicShareViewerUrl(projectId, slug, env, configuredEnv);
  } catch (error) {
    if (error instanceof Error && error.message === 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE') return null;
    throw error;
  }
}

/** Strict variant used by callers that must distinguish unavailable links. */
export function publicShareViewerUrl(
  projectId: string,
  slug: string,
  env: EnvMap = process.env,
  configuredEnv: EnvMap = {},
): string {
  assertShareIdentity(projectId, slug);
  const origin = resolveEffectiveShareViewerOrigin(env, configuredEnv);
  if (!origin) throw new Error('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
  return viewerUrlOn(origin, projectId, slug);
}

function viewerUrlOn(origin: string, projectId: string, slug: string): string {
  return new URL(buildSharePath({ projectId, slug }), origin).href;
}

/**
 * What AMR said about one publication's address, after verification. AMR is
 * the canonical source of the share link (its `SHARE_APP_ORIGIN`); the daemon
 * only checks that what it was handed is structurally that link.
 */
export type AmrShareLink = { url: string } | { code: PublicShareLinkUnavailableCode };

/** The address to show for one publication, or why there is none. */
export type PublicShareLink = { url: string } | { url: null; code: PublicShareLinkUnavailableCode };

/**
 * Accept an AMR-reported address only when it is byte-for-byte the canonical
 * Viewer address of THIS identity on the address's own origin: HTTPS, a
 * root-only origin (no userinfo, query or fragment, judged on the raw text as
 * for the override), and the path exactly `/artifact/{projectId}/{slug}` with
 * the builder's percent-encoding. Anything else is null: a URL for another
 * project, another slug, a console path or a non-canonical spelling is never
 * shown, not repaired.
 */
export function verifiedAmrShareViewerUrl(raw: unknown, projectId: string, slug: string): string | null {
  if (typeof raw !== 'string' || !isShareIdentity(projectId, slug)) return null;
  if (raw.slice(0, 8).toLowerCase() !== 'https://') return null;
  const pathStart = raw.indexOf('/', 8);
  if (pathStart < 0) return null;
  const origin = normalizeShareViewerOrigin(raw.slice(0, pathStart));
  if (!origin) return null;
  const expected = viewerUrlOn(origin, projectId, slug);
  return expected === raw ? raw : null;
}

const LINK_UNAVAILABLE_CODES: ReadonlySet<string> = new Set<PublicShareLinkUnavailableCode>([
  'PUBLIC_SHARE_WEB_URL_UNAVAILABLE',
  'PUBLIC_SHARE_IDENTITY_INVALID',
]);

/**
 * Read the `url` / `link` pair AMR (through `vela share … --json`) attaches to
 * an active binding. Returns null when the record carries neither (a stopped
 * binding, a pending publish, or an older server): that is "AMR said nothing",
 * not an address. A present `url` that fails verification is reported as
 * unavailable and logged without echoing the address.
 */
export function parseAmrShareLink(record: unknown, projectId: string, slug: string): AmrShareLink | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const value = record as { url?: unknown; link?: unknown };
  if (value.url !== undefined && value.url !== null) {
    const url = verifiedAmrShareViewerUrl(value.url, projectId, slug);
    if (url) return { url };
    console.warn('[od] AMR share link rejected: not the canonical Viewer address for this publication');
    return { code: isShareIdentity(projectId, slug) ? 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' : 'PUBLIC_SHARE_IDENTITY_INVALID' };
  }
  const link = value.link;
  if (link && typeof link === 'object' && !Array.isArray(link)) {
    const { status, code } = link as { status?: unknown; code?: unknown };
    if (status === 'unavailable' && typeof code === 'string' && LINK_UNAVAILABLE_CODES.has(code)) {
      return { code: code as PublicShareLinkUnavailableCode };
    }
    return { code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' };
  }
  return null;
}

/**
 * The single presentation rule for a publication's link:
 *
 * 1. an explicit `OD_SHARE_VIEWER_URL(S)` override (local dev/debug) wins; a
 *    present but invalid override is unavailable, never a fallback;
 * 2. otherwise the address AMR reported (fresh, or the persisted copy of the
 *    last one), re-verified here so a stored legacy console URL never shows;
 * 3. otherwise unavailable, carrying AMR's own code when it gave one.
 *
 * `amr` may be a raw persisted string: it goes through the same verification.
 */
export function resolvePublicShareLink(
  projectId: string,
  slug: string,
  amr: AmrShareLink | string | null,
  env: EnvMap = process.env,
  configuredEnv: EnvMap = {},
): PublicShareLink {
  if (!isShareIdentity(projectId, slug)) return { url: null, code: 'PUBLIC_SHARE_IDENTITY_INVALID' };
  const override = resolveShareViewerOriginOverride(env, configuredEnv);
  if (override.status === 'origin') return { url: viewerUrlOn(override.origin, projectId, slug) };
  if (override.status === 'invalid') return { url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' };
  const reported = typeof amr === 'string' ? { url: amr } : amr;
  if (reported && 'url' in reported) {
    const url = verifiedAmrShareViewerUrl(reported.url, projectId, slug);
    if (url) return { url };
    return { url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' };
  }
  return { url: null, code: reported?.code ?? 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' };
}

/** The value to persist with a publication: only a verified AMR address. */
export function persistedAmrShareUrl(link: AmrShareLink | null): string | null {
  return link && 'url' in link ? link.url : null;
}
