import { TOUCHPOINT_OFFLINE_REPLAY_HEADER } from '@open-design/contracts/api/touchpointOffline';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import type { Request } from 'express';

export type TouchpointProxyRequest = Pick<Request, 'method' | 'path' | 'url' | 'headers' | 'body' | 'query'> & { once(event: string, listener: () => void): unknown };
export interface TouchpointProxyResponse extends Writable {
  readonly headersSent: boolean;
  status(code: number): this;
  json(value: unknown): this;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
}
interface CapturedDecision { status: number; headers: Map<string, string | number | readonly string[]>; body: Buffer; }

/** A bounded in-process consumer of the ordinary proxy, including its authority journal. */
class WarmResponse extends Writable implements TouchpointProxyResponse {
  headersSent = false;
  statusCode = 200;
  headers = new Map<string, string | number | readonly string[]>();
  chunks: Buffer[] = [];
  bytes = 0;
  status(code: number): this { this.statusCode = code; return this; }
  setHeader(name: string, value: string | number | readonly string[]): void { this.headers.set(name.toLowerCase(), value); }
  json(value: unknown): this { this.setHeader('content-type', 'application/json'); this.end(JSON.stringify(value)); return this; }
  _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.headersSent = true;
    this.bytes += chunk.length;
    if (this.bytes > 8 * 1024 * 1024) { done(new Error('touchpoint_prefetch_too_large')); return; }
    this.chunks.push(Buffer.from(chunk)); done();
  }
}

export const TOUCHPOINT_PREFETCH_BACKOFF_MS = 60_000;
export const PREFETCH_PLACEMENT = 'opend.home.campaign-modal';
export const PREFETCH_PLACEMENTS = [PREFETCH_PLACEMENT, 'opend.home.hover-entry', 'opend.home.hover-layer'] as const;

/** One warm attempt per identity/locale; failures may retry only on a later observation after backoff. No timer. */
function createPlacementPrefetch(placement: string, run: (req: TouchpointProxyRequest, res: TouchpointProxyResponse) => void) {
  let identity: string | null = null;
  let epoch = 0;
  let ready: { key: string; deadline: number; result: CapturedDecision } | null = null;
  let attempted = false;
  let retryAt = 0;
  let flight: { key: string; epoch: number; response: WarmResponse; result: Promise<CapturedDecision | null> } | null = null;
  const reset = (key: string | null) => {
    if (key === identity) return;
    identity = key; ++epoch; ready = null; attempted = false; retryAt = 0;
    flight?.response.destroy(); flight = null;
  };
  const initialKey = (scope: string, req: TouchpointProxyRequest): string | null => {
    const url = new URL(req.url, 'http://daemon');
    if (req.method !== 'GET' || req.path !== '/api/touchpoints/production-runtime' ||
      url.searchParams.get('placementKey') !== placement || url.searchParams.get('emptyResponse') !== '200' ||
      [...url.searchParams.keys()].some(key => !['placementKey', 'locale', 'emptyResponse'].includes(key))) return null;
    return JSON.stringify([scope, url.searchParams.get('locale')]);
  };
  return {
    reset,
    backingOff(scope: string, req: TouchpointProxyRequest): boolean {
      return identity === initialKey(scope, req) && Number.isFinite(retryAt) && performance.now() < retryAt;
    },
    consumeReady(scope: string, req: TouchpointProxyRequest): CapturedDecision | null {
      const pending = ready;
      if (!pending || pending.key !== initialKey(scope, req)) return null;
      ready = null;
      return performance.now() < pending.deadline ? pending.result : null;
    },
    warm(scope: string, locale: string) {
      const key = JSON.stringify([scope, locale]);
      reset(key);
      if (flight || (attempted && performance.now() < retryAt)) return;
      attempted = true;
      retryAt = Infinity;
      const response = new WarmResponse();
      const result = new Promise<CapturedDecision | null>(resolve => {
        response.once('finish', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(response.chunks) }));
        response.once('error', () => resolve(null));
        response.once('close', () => resolve(null));
      });
      const current = { key, epoch, response, result };
      flight = current;
      const query = new URLSearchParams({ placementKey: placement, locale, emptyResponse: '200' });
      const req = Object.assign(new EventEmitter(), { method: 'GET', path: '/api/touchpoints/production-runtime', url: `/api/touchpoints/production-runtime?${query}`, headers: { 'accept-encoding': 'gzip' }, query: {}, body: undefined });
      void result.then(value => {
        if (flight !== current) return;
        flight = null;
        // A single local handoff is allowed only after a fresh online answer.
        // The durable store checks expiry/refusal again at consumption.
        if (value?.status === 200 && !value.headers.has(TOUCHPOINT_OFFLINE_REPLAY_HEADER)) ready = { key, deadline: performance.now() + 10_000, result: value };
        retryAt = !value || value.status >= 500 || value.headers.has(TOUCHPOINT_OFFLINE_REPLAY_HEADER) ? performance.now() + TOUCHPOINT_PREFETCH_BACKOFF_MS : Infinity;
      });
      try { run(req, response); } catch { response.destroy(); }
    },
    /** Only identical initial reads may join; refresh/revocation bindings remain independent. */
    async join(scope: string, req: TouchpointProxyRequest): Promise<CapturedDecision | null> {
      const current = flight;
      if (!current || current.key !== initialKey(scope, req)) return null;
      const value = await current.result;
      if (epoch !== current.epoch) return null;
      ready = null;
      return value;
    },
    close() { reset(null); },
  };
}

/** Fixed home surfaces only. Each retains its own request, handoff and backoff;
 * the normal host still authorizes and validates the hover pair atomically. */
export function createTouchpointPrefetch(run: (req: TouchpointProxyRequest, res: TouchpointProxyResponse) => void) {
  const placements = new Map<string, ReturnType<typeof createPlacementPrefetch>>(
    PREFETCH_PLACEMENTS.map(placement => [placement, createPlacementPrefetch(placement, run)]),
  );
  const forRequest = (req: TouchpointProxyRequest) =>
    placements.get(new URL(req.url, 'http://daemon').searchParams.get('placementKey') ?? '');
  return {
    reset(key: string | null) { for (const state of placements.values()) state.reset(key); },
    warm(scope: string, locale: string) { for (const state of placements.values()) state.warm(scope, locale); },
    backingOff(scope: string, req: TouchpointProxyRequest) { return forRequest(req)?.backingOff(scope, req) ?? false; },
    consumeReady(scope: string, req: TouchpointProxyRequest) { return forRequest(req)?.consumeReady(scope, req) ?? null; },
    join(scope: string, req: TouchpointProxyRequest) { return forRequest(req)?.join(scope, req) ?? Promise.resolve(null); },
    close() { for (const state of placements.values()) state.close(); },
  };
}
