/**
 * static-serving.ts — fix for issue #6426
 *
 * No external dependencies — uses only Node built-ins + express (already a dep).
 *
 * Usage in server.ts:
 *   import { createCompressionMiddleware, createStaticMiddleware } from './static-serving.js';
 *   app.use(createCompressionMiddleware());
 *   app.use(createStaticMiddleware(STATIC_DIR));
 *   // remove: app.use(express.static(STATIC_DIR));
 */

import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

export function isCompressibleMime(mime: string): boolean {
  if (!mime) return false;
  const part = mime.split(';')[0];
  if (!part) return false;
  const base = part.trim().toLowerCase();
  return (
    base === 'text/html' ||
    base === 'text/css' ||
    base === 'text/plain' ||
    base === 'text/xml' ||
    base === 'text/javascript' ||
    base === 'application/javascript' ||
    base === 'application/json' ||
    base === 'application/xml' ||
    base === 'application/manifest+json' ||
    base === 'image/svg+xml'
  );
}

export function isImmutableNextAsset(urlPath: string): boolean {
  return urlPath.startsWith('/_next/static/');
}

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
export const CACHE_NO_STORE  = 'no-cache, no-store, must-revalidate';

// ---------------------------------------------------------------------------
// 1. Compression middleware — Brotli preferred, gzip fallback
//    Scoped to static web assets only; API routes are skipped.
// ---------------------------------------------------------------------------

export function createCompressionMiddleware(): RequestHandler {
  return function compressionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Issue #6426: compress static assets only — not API responses.
    // SSE content-type guard below is kept as defense-in-depth.
    if (req.path === '/api' || req.path.startsWith('/api/')) { next(); return; }

    const ae = (req.headers['accept-encoding'] as string) ?? '';
    const wantsBr   = /\bbr\b/.test(ae);
    const wantsGzip = /\bgzip\b/.test(ae);
    if (!wantsBr && !wantsGzip) { next(); return; }

    const origWrite = res.write.bind(res) as typeof res.write;
    const origEnd   = res.end.bind(res)   as typeof res.end;
    let compressor: zlib.BrotliCompress | zlib.Gzip | null = null;
    let decided = false;

    function setup(): boolean {
      if (decided) return compressor !== null;
      decided = true;
      const ct = res.getHeader('Content-Type') as string | undefined;
      if (!ct || ct.includes('event-stream') || !isCompressibleMime(ct)) return false;

      if (wantsBr) {
        compressor = zlib.createBrotliCompress({
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
        });
        res.setHeader('Content-Encoding', 'br');
      } else {
        compressor = zlib.createGzip({ level: 6 });
        res.setHeader('Content-Encoding', 'gzip');
      }

      res.removeHeader('Content-Length');
      res.setHeader('Vary', 'Accept-Encoding');
      compressor.on('data', (chunk: Buffer) => { origWrite(chunk); });
      compressor.on('end', () => { origEnd(); });
      return true;
    }

    (res as any).write = function (
      chunk: any,
      enc?: BufferEncoding | ((e: Error | null | undefined) => void),
      cb?: (e: Error | null | undefined) => void,
    ): boolean {
      if (setup() && compressor) return compressor.write(chunk, enc as BufferEncoding, cb);
      return origWrite(chunk, enc as BufferEncoding, cb);
    };

    (res as any).end = function (
      chunk?: any,
      enc?: BufferEncoding | (() => void),
      cb?: () => void,
    ): Response {
      if (setup() && compressor) {
        if (chunk != null && chunk !== '') compressor.end(chunk, enc as BufferEncoding, cb);
        else compressor.end();
        return res;
      }
      return origEnd(chunk, enc as BufferEncoding, cb);
    };

    next();
  };
}

// ---------------------------------------------------------------------------
// 2. Static middleware with cache-header policy
// ---------------------------------------------------------------------------

export function createStaticMiddleware(root: string): RequestHandler {
  return express.static(root, {
    etag: true,
    lastModified: true,
    index: 'index.html',
    setHeaders(res: Response, filePath: string) {
      const relative = path.relative(root, filePath);
      const urlPath  = '/' + relative.split(path.sep).join('/');
      res.setHeader(
        'Cache-Control',
        isImmutableNextAsset(urlPath) ? CACHE_IMMUTABLE : CACHE_NO_STORE,
      );
    },
  }) as RequestHandler;
}
