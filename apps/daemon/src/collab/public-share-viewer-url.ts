import { buildSharePath } from '@open-design/contracts';
import { resolveEffectiveVelaConsoleOrigin } from '../integrations/vela-console-origin.js';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** Human-facing Viewer address, never the content API address.
 * Resolve the selected profile's existing Web base, preserving its deployment
 * prefix. This strict formatter rejects missing/invalid configuration rather
 * than guessing a host. Publication uses resolvePublicShareViewerUrl so that
 * missing presentation configuration does not block independent remote effects.
 * Historical snapshot IDs are not aliases.
 */
/** Only presentation configuration failures become null. Identity faults and
 * all publishing/authorization failures remain errors; never guess a host. */
export function resolvePublicShareViewerUrl(
  projectId: string, slug: string, env: EnvMap = process.env, configuredEnv: EnvMap = {},
): string | null {
  if (!projectId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(slug)) {
    throw new Error('PUBLIC_SHARE_IDENTITY_INVALID');
  }
  try { return publicShareViewerUrl(projectId, slug, env, configuredEnv); }
  catch (error) {
    if (error instanceof Error && error.message === 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE') return null;
    throw error;
  }
}

export function publicShareViewerUrl(
  projectId: string,
  slug: string,
  env: EnvMap = process.env,
  configuredEnv: EnvMap = {},
): string {
  const base = resolveEffectiveVelaConsoleOrigin(env, configuredEnv);
  if (!base) throw new Error('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
  let url: URL;
  try { url = new URL(base); } catch { throw new Error('PUBLIC_SHARE_WEB_URL_UNAVAILABLE'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_SHARE_WEB_URL_UNAVAILABLE');
  }
  if (!projectId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(slug)) {
    throw new Error('PUBLIC_SHARE_IDENTITY_INVALID');
  }
  url.pathname = url.pathname.replace(/\/+$/u, '') + buildSharePath({ projectId, slug });
  return url.href;
}
