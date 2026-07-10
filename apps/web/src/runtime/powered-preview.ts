/**
 * "Powered preview" — render an HTML artifact in a cross-origin-isolated
 * iframe so it can use capabilities the default opaque-origin preview sandbox
 * blocks: same-origin Web Workers (incl. external-file workers), real Web
 * Storage, WASM, and — via `Document-Isolation-Policy` on the daemon response
 * — `SharedArrayBuffer`. This is what real WebGL sites (Gaussian-splat
 * viewers, ffmpeg.wasm, threaded physics/renderers) need. See issue #724.
 *
 * Isolation model: the daemon reports its own directly-reachable http origin
 * (`/api/preview/isolation`). We load the powered iframe from the host-swapped
 * loopback variant of that origin (127.0.0.1 <-> localhost). That reserved
 * origin is cross-origin to the app shell and the daemon treats browser
 * requests from it as preview-only, so granting `allow-same-origin` gives the
 * artifact Workers/storage without exposing the normal daemon API.
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

/**
 * Swap 127.0.0.1 <-> localhost so the returned origin resolves to the same
 * loopback server but uses the daemon's preview-only browser host. Any
 * non-loopback host is returned unchanged; callers must reject unchanged
 * values because no preview-only host exists for them.
 */
export function swapLoopbackHost(origin: string): string {
  try {
    const u = new URL(origin);
    if (u.hostname === '127.0.0.1') u.hostname = 'localhost';
    else if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    return origin;
  }
}

/**
 * Resolve the origin to load the powered iframe from, given the daemon's
 * reported base. The result must be the loopback host-swapped variant, because
 * the daemon reserves that browser origin for powered file bytes only. Returns
 * null when no safe host swap exists or when the swapped origin still collides
 * with the app shell.
 */
export function resolvePoweredBaseOrigin(baseOrigin: string): string | null {
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  let normalized: string;
  try {
    normalized = new URL(baseOrigin).origin;
  } catch {
    return null;
  }
  const swapped = swapLoopbackHost(normalized);
  if (swapped === normalized || swapped === appOrigin) return null;
  return swapped;
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
  if (!info || !info.supported || !info.baseOrigin) return null;
  const base = resolvePoweredBaseOrigin(info.baseOrigin);
  if (!base) return null;
  return buildProjectPoweredFileUrl(base, projectId, filePath);
}
