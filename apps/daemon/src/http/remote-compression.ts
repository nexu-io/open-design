import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';
import { isLoopbackPeerAddress } from './local-daemon-request.js';

/**
 * Response compression for clients that reach the daemon over a real network.
 *
 * The daemon serves the static web export and every `/api/*` route itself
 * (Docker, `od` bound past loopback), and without compression a first Home
 * load ships ~19 MB uncompressed: ~15 MB of JS/CSS plus a ~3.2 MB
 * `/api/plugins` body. gzip cuts both by ~70%.
 *
 * Two invariants keep this safe to install ahead of every route:
 *
 * - Loopback peers are never compressed. The desktop app and `tools-dev` talk
 *   to the daemon over 127.0.0.1, where bytes are free and compression would
 *   only spend CPU. A reverse proxy on the same host also arrives as loopback
 *   and is expected to compress for its own clients.
 * - Only an explicit allowlist of whole-document content types is compressed.
 *   Streaming responses (`text/event-stream` SSE, NDJSON, binary downloads)
 *   fall outside it, so compression can never buffer a live stream.
 * - Partial responses (206 / `Content-Range`) are never compressed. The range
 *   describes bytes of the uncompressed representation, so gzipping the slice
 *   would hand the client bytes that no longer match it.
 */
const COMPRESSIBLE_CONTENT_TYPES = new Set([
  'application/javascript',
  'application/json',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/javascript',
]);

export function isCompressibleContentType(contentType: unknown): boolean {
  if (typeof contentType !== 'string') return false;
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return COMPRESSIBLE_CONTENT_TYPES.has(mediaType);
}

export function isPartialResponse(res: Response): boolean {
  return res.statusCode === 206 || res.getHeader('Content-Range') !== undefined;
}

export interface RemoteCompressionOptions {
  /** Whether the request arrived from this machine. Tests inject a remote peer. */
  isLocalPeer?: (req: Request) => boolean;
}

export function createRemoteCompressionMiddleware(
  options: RemoteCompressionOptions = {},
): RequestHandler {
  const isLocalPeer =
    options.isLocalPeer ?? ((req: Request) => isLoopbackPeerAddress(req.socket?.remoteAddress));
  return compression({
    filter: (req, res) =>
      !isLocalPeer(req as Request)
      && !isPartialResponse(res as Response)
      && isCompressibleContentType((res as Response).getHeader('Content-Type')),
  });
}
