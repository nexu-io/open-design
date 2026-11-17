import { createHash } from 'node:crypto';
import { parseHostHeader } from '../origin-validation.js';

export function projectPoweredPreviewHostname(projectId: string): string {
  return `od-${createHash('sha256').update(projectId).digest('hex').slice(0, 32)}.localhost`;
}

interface PoweredPreviewOriginRequest {
  method: string;
  /** Full pathname, including the /api prefix. */
  path: string;
  headers: {
    host?: unknown;
    origin?: unknown;
    referer?: unknown;
    'sec-fetch-site'?: unknown;
    'sec-fetch-dest'?: unknown;
  };
}

function header(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

function headerUrl(value: unknown): URL | null {
  try {
    return new URL(header(value));
  } catch {
    return null;
  }
}

function isProjectPreviewHost(hostname: string | undefined): boolean {
  return Boolean(hostname?.startsWith('od-') && hostname.endsWith('.localhost'));
}

/**
 * Project preview hosts are reserved for GETs of that project's powered
 * files. Check both the target and browser source before any API exception;
 * a preview cannot regain daemon access by targeting the normal loopback host.
 * The hostname hash names an origin, rather than granting project authority.
 */
export function projectPoweredPreviewOriginDecision(
  request: PoweredPreviewOriginRequest,
  daemonPort: number | null | undefined,
): 'allow' | 'reject' | null {
  const target = parseHostHeader(request.headers.host);
  const origin = headerUrl(request.headers.origin);
  const referer = headerUrl(request.headers.referer);
  const targetIsPreview = isProjectPreviewHost(target?.hostname);
  const sourceIsPreview = isProjectPreviewHost(origin?.hostname)
    || isProjectPreviewHost(referer?.hostname);
  if (!targetIsPreview) return sourceIsPreview ? 'reject' : null;
  if (!daemonPort || target?.port !== String(daemonPort) || request.method !== 'GET') {
    return 'reject';
  }
  const match = /^\/api\/projects\/([^/]+)\/powered\/.+$/u.exec(request.path);
  if (!match) return 'reject';
  let projectId: string;
  try {
    projectId = decodeURIComponent(match[1]!);
  } catch {
    return 'reject';
  }
  const expectedHost = projectPoweredPreviewHostname(projectId);
  if (target.hostname !== expectedHost) return 'reject';
  const expectedOrigin = new URL(`http://${expectedHost}:${daemonPort}`).origin;
  const originHeader = header(request.headers.origin);
  if (originHeader && originHeader !== expectedOrigin) return 'reject';
  if (sourceIsPreview && referer && referer.origin !== expectedOrigin) return 'reject';
  const site = header(request.headers['sec-fetch-site']);
  const destination = header(request.headers['sec-fetch-dest']);
  if (site && site !== 'same-origin' && destination !== 'document' && destination !== 'iframe') {
    return 'reject';
  }
  return 'allow';
}
