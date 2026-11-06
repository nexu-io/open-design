/**
 * "Powered preview" — render an HTML artifact in a cross-origin-isolated
 * iframe so it can use capabilities the default opaque-origin preview sandbox
 * blocks: same-origin Web Workers (incl. external-file workers), real Web
 * Storage, WASM, and — via `Document-Isolation-Policy` on the daemon response
 * — `SharedArrayBuffer`. This is what real WebGL sites (Gaussian-splat
 * viewers, ffmpeg.wasm, threaded physics/renderers) need. See issue #724.
 *
 * Isolation model: the daemon reports its own directly-reachable http origin
 * (`/api/preview/isolation`). Each project loads from its own stable
 * `od-<project hash>.localhost` hostname on that daemon port. The hash only
 * gives the project a DNS-safe name; the daemon separately restricts that
 * origin to the same project's powered files. Real browser origins keep
 * Workers/storage separate from both the app shell and other projects.
 *
 * The daemon `/powered/*` route (apps/daemon/src/routes/project/index.ts)
 * stamps the isolation headers; this module is the browser half that decides
 * WHEN to use it and builds the URL.
 */

import { buildProjectPoweredFileUrl, type ProjectPreviewIsolationResponse } from '@open-design/contracts';

let isolationProbe: Promise<ProjectPreviewIsolationResponse | null> | null = null;

/** Fetch (once, cached) the daemon's powered-preview isolation info. */
export function fetchPreviewIsolation(): Promise<ProjectPreviewIsolationResponse | null> {
  if (isolationProbe) return isolationProbe;
  isolationProbe = (async () => {
    try {
      const resp = await fetch('/api/preview/isolation', { cache: 'no-store' });
      if (!resp.ok) return null;
      const data = (await resp.json()) as ProjectPreviewIsolationResponse;
      if (!data || typeof data.baseOrigin !== 'string' || !data.baseOrigin) return null;
      return data;
    } catch {
      return null;
    }
  })();
  return isolationProbe;
}

/** Test-only: drop the cached probe so a fresh fetch runs. */
export function __resetPreviewIsolationCache(): void {
  isolationProbe = null;
}

function isRemoteHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname !== '127.0.0.1'
      && url.hostname !== 'localhost'
      && url.hostname !== '[::1]'
      && url.hostname !== '::1';
  } catch {
    return false;
  }
}

/**
 * Resolve the origin to load the powered iframe from, given the daemon's
 * reported base. A project gets a stable loopback hostname so native browser
 * storage and Workers cannot share an origin with another project. Returns
 * null when the local daemon or Web Crypto is unavailable.
 */
export async function resolvePoweredBaseOrigin(
  baseOrigin: string,
  projectId: string,
): Promise<string | null> {
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  // A loopback URL reported through a reverse proxy points at the browser's
  // machine, not the remote daemon. Fall back to the same-origin raw preview
  // instead of leaking an unreachable localhost iframe URL.
  if (isRemoteHttpOrigin(appOrigin)) return null;
  if (!projectId) return null;
  try {
    const url = new URL(baseOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(projectId));
    const name = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
      .join('').slice(0, 32);
    url.hostname = `od-${name}.localhost`;
    return url.origin === appOrigin ? null : url.origin;
  } catch {
    return null;
  }
}

/**
 * Build the absolute powered-preview URL for a project file, or null if
 * powered mode is unavailable (isolation unsupported, or no cross-origin base
 * could be resolved). Async because it consults the (cached) daemon probe.
 */
export async function resolvePoweredPreviewUrl(
  projectId: string,
  filePath: string,
): Promise<string | null> {
  const info = await fetchPreviewIsolation();
  if (!info || !info.supported || info.projectOrigins !== true || !info.baseOrigin) return null;
  const base = await resolvePoweredBaseOrigin(info.baseOrigin, projectId);
  if (!base) return null;
  return buildProjectPoweredFileUrl(base, projectId, filePath);
}
