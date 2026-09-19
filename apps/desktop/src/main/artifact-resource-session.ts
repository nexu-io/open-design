import { createHash, randomUUID } from 'node:crypto';

import { session, type Session } from 'electron';
import {
  DESKTOP_FROZEN_RESOURCE_LIMITS,
  type DesktopExportArtifactInput,
} from '@open-design/sidecar-proto';

type CapturedResource = { bytes: Uint8Array<ArrayBuffer>; mime: string };

export interface ArtifactResourceSession {
  readonly session: Session;
  readonly entryUrl: string;
  dispose(): Promise<void>;
}

/**
 * A render owns one in-memory origin. Only bytes captured by the daemon can
 * satisfy a project-relative request; this module has no project filesystem or
 * daemon URL to fall back to. The document and its scripts stay unchanged.
 */
export async function createArtifactResourceSession(
  input: DesktopExportArtifactInput,
): Promise<ArtifactResourceSession> {
  const frozen = input.frozenResources;
  if (!frozen) throw new Error('frozen artifact resources are required');

  const resources = new Map<string, CapturedResource>();
  const entryBytes = Buffer.from(input.html, 'utf8');
  if (entryBytes.byteLength > DESKTOP_FROZEN_RESOURCE_LIMITS.entryBytes) {
    throw new Error('frozen artifact entry exceeds the byte limit');
  }
  resources.set(frozen.entryPath, { bytes: entryBytes, mime: 'text/html; charset=utf-8' });
  let rawBytes = entryBytes.byteLength;
  // The sidecar normalizer checks the wire shape, canonical base64, path and
  // encoded budget before this function. Verify the actual decoded identity at
  // the consumer as well, before creating any Electron resource.
  for (const resource of frozen.resources) {
    const bytes = Buffer.from(resource.bytesBase64, 'base64');
    rawBytes += bytes.byteLength;
    if (bytes.byteLength > DESKTOP_FROZEN_RESOURCE_LIMITS.assetBytes
      || rawBytes > DESKTOP_FROZEN_RESOURCE_LIMITS.rawBytes) {
      throw new Error('frozen artifact resources exceed the byte limit');
    }
    if (createHash('sha256').update(bytes).digest('hex') !== resource.sha256) {
      throw new Error('frozen artifact resource digest does not match its bytes');
    }
    if (resources.has(resource.path)) throw new Error('duplicate frozen artifact resource path');
    resources.set(resource.path, { bytes, mime: resource.mime });
  }

  const identity = randomUUID();
  const origin = `https://od-cover-${identity}.invalid`;
  const isolated = session.fromPartition(`od-cover-${identity}`, { cache: false });
  const installedSchemes: string[] = [];
  let disposed = false;

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    resources.clear();
    // A unique non-persistent partition never borrows the app/login session.
    // Destroy the window first, then terminate outstanding loads and discard
    // any cache/storage the authored page created during this render.
    const cleanup: Array<() => void | Promise<void>> = [
      ...installedSchemes.map((scheme) => () => isolated.protocol.unhandle(scheme)),
      () => isolated.closeAllConnections(),
      () => isolated.clearStorageData(),
      () => isolated.clearCache(),
    ];
    // Native cleanup can throw synchronously during Electron shutdown. Start
    // each operation behind its own promise so one failed unregistration does
    // not prevent the other handler, connections or storage being released.
    await Promise.allSettled(cleanup.map((operation) => Promise.resolve().then(operation)));
  }

  const respond = async (request: Request): Promise<Response> => {
    if (disposed) return new Response(null, { status: 410 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405 });
    }
    const url = new URL(request.url);
    if (url.origin !== origin) {
      // A different render's private origin is not a remote asset. No session
      // may resolve another session's project map through a network fallback.
      if (url.hostname.endsWith('.invalid')) return new Response(null, { status: 404 });
      // Preserve ordinary remote resources in this isolated session. Electron
      // 41's bypass flag delegates to its normal network stack without calling
      // this same handler recursively; no CORS/CSP bypass or app cookies.
      return isolated.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    const projectPath = projectPathFromUrl(url);
    const resource = projectPath === null ? undefined : resources.get(projectPath);
    if (!resource) return new Response(null, { status: 404 });
    return new Response(request.method === 'HEAD' ? null : resource.bytes, {
      headers: {
        'Content-Type': resource.mime,
        'Content-Length': String(resource.bytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };

  try {
    isolated.setPermissionCheckHandler(() => false);
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.webRequest.onBeforeRequest((details, callback) => {
      const protocol = new URL(details.url).protocol;
      callback({ cancel: !['https:', 'http:', 'data:', 'blob:'].includes(protocol) });
    });
    for (const scheme of ['https', 'http']) {
      isolated.protocol.handle(scheme, respond);
      installedSchemes.push(scheme);
    }
    return {
      session: isolated,
      entryUrl: `${origin}/${frozen.entryPath.split('/').map(encodeURIComponent).join('/')}`,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Decode each segment exactly once; query/fragment never change file identity. */
function projectPathFromUrl(url: URL): string | null {
  try {
    const segments = url.pathname.slice(1).split('/').map(decodeURIComponent);
    if (segments.some((part) => !part || part.startsWith('.') || /[/\\\0]/.test(part))) return null;
    return segments.join('/');
  } catch {
    return null;
  }
}
