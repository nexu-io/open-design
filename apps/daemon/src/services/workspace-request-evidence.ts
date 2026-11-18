import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import { isIP, Socket } from 'node:net';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

type Phase = 'dispatch' | 'connection_pool' | 'dns' | 'tcp' | 'tls' | 'sending_headers' | 'response_headers' | 'response_body' | 'json' | 'validation' | 'complete';
type Outcome = 'unknown' | 'success' | 'http_error' | 'invalid_payload' | 'invalid_json' | 'network_error' | 'timeout';

/** Timing only: never retain a URL, credential, response body, or raw IP. */
export interface WorkspaceRequestEvidence {
  startedAt: string;
  timeoutMs: number;
  elapsedMs: number;
  phase: Phase;
  outcome: Outcome;
  requestCreatedMs: number | null;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  headersStartedMs: number | null;
  headersSentMs: number | null;
  responseHeadersMs: number | null;
  bodyParsedMs: number | null;
  deadlineOverrunMs: number | null;
  eventLoopDelayMaxMs: number;
  connectionAttempts: number;
  reusedSocket: boolean | null;
  ipFamily: 'IPv4' | 'IPv6' | null;
  status: number | null;
  contentType: 'json' | 'html' | 'other' | null;
  requestId: string | null;
  cfRay: string | null;
  errorCodes: string[];
}

const ERROR_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  'ENETUNREACH', 'EHOSTUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET', 'UND_ERR_ABORTED',
]);

type TransportTrace = { created(): void; socket(socket: Socket): void; sending(socket?: Socket): void; sent(): void };
const scope = new AsyncLocalStorage<TransportTrace>();
const requests = new WeakMap<object, TransportTrace>();
const usedSockets = new WeakSet<Socket>();
let active = 0;
type TransportEvent = { request?: object; socket?: Socket };
const subscriptions: Array<[string, (message: unknown) => void]> = [
  ['net.client.socket', message => {
    const socket = (message as TransportEvent).socket;
    if (socket instanceof Socket) scope.getStore()?.socket(socket);
  }],
  ['undici:request:create', message => {
    const request = (message as TransportEvent).request;
    const trace = scope.getStore();
    if (request && trace) { requests.set(request, trace); trace.created(); }
  }],
  ['undici:client:sendHeaders', message => {
    const { request, socket } = message as TransportEvent;
    if (request) requests.get(request)?.sending(socket);
  }],
  ['undici:request:bodySent', message => {
    const request = (message as TransportEvent).request;
    if (request) requests.get(request)?.sent();
  }],
];
// Node invokes subscribers synchronously. A diagnostic callback must never
// throw through an otherwise healthy application request.
const observers = subscriptions.map(([name, observer]) => ({
  source: channel(name),
  observer: (message: unknown) => { try { observer(message); } catch { /* observation only */ } },
}));

function createTrace(options: {
  apiUrl: string;
  timeoutMs: number;
  record: (evidence: WorkspaceRequestEvidence) => void;
  now?: () => number;
}) {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const elapsed = () => Math.max(0, Math.round((now() - started) * 100) / 100);
  let usesDns = true;
  try { usesDns = isIP(new URL(options.apiUrl).hostname.replace(/^\[|\]$/g, '')) === 0; } catch { /* fetch owns URL validation */ }
  const evidence: WorkspaceRequestEvidence = {
    startedAt: new Date().toISOString(), timeoutMs: options.timeoutMs, elapsedMs: 0,
    phase: 'dispatch', outcome: 'unknown', requestCreatedMs: null, dnsMs: null, tcpMs: null, tlsMs: null,
    headersStartedMs: null, headersSentMs: null, responseHeadersMs: null, bodyParsedMs: null,
    deadlineOverrunMs: null, eventLoopDelayMaxMs: 0, connectionAttempts: 0,
    reusedSocket: null, ipFamily: null, status: null, contentType: null,
    requestId: null, cfRay: null, errorCodes: [],
  };
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const sockets = new Set<Socket>();
  const cleanups: Array<() => void> = [];
  let finished = false;

  function errors(error: unknown): void {
    try {
      const pending = [error];
      const seen = new Set<unknown>();
      while (pending.length && seen.size < 16 && evidence.errorCodes.length < 8) {
        const value = pending.shift();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        const row = value as { code?: unknown; cause?: unknown; errors?: unknown };
        if (typeof row.code === 'string' && ERROR_CODES.has(row.code) && !evidence.errorCodes.includes(row.code)) evidence.errorCodes.push(row.code);
        if (row.cause) pending.push(row.cause);
        if (Array.isArray(row.errors)) pending.push(...row.errors.slice(0, 8));
      }
    } catch { /* Unknown errors may expose throwing getters. */ }
  }

  function listen(socket: Socket, name: string, observer: (...args: unknown[]) => void): void {
    const handler = (...args: unknown[]) => {
      if (!finished) { try { observer(...args); } catch { /* observation only */ } }
    };
    socket.on(name, handler);
    cleanups.push(() => socket.removeListener(name, handler));
  }

  return {
    run<T>(execute: () => T): T { return scope.run(this, execute); },
    created(): void {
      if (finished) return;
      evidence.requestCreatedMs = elapsed();
      evidence.phase = 'connection_pool';
    },
    socket(socket: Socket): void {
      if (finished || sockets.has(socket)) return;
      sockets.add(socket);
      evidence.phase = usesDns ? 'dns' : 'tcp';
      listen(socket, 'lookup', error => {
        evidence.dnsMs ??= elapsed();
        evidence.phase = error ? 'dns' : 'tcp';
        errors(error);
      });
      listen(socket, 'connectionAttempt', () => {
        evidence.phase = 'tcp';
        evidence.connectionAttempts += 1;
      });
      listen(socket, 'connectionAttemptFailed', (_ip, _port, _family, error) => errors(error));
      listen(socket, 'connect', () => {
        evidence.tcpMs = elapsed();
        evidence.phase = (socket as Socket & { encrypted?: boolean }).encrypted ? 'tls' : 'sending_headers';
      });
      listen(socket, 'secureConnect', () => {
        evidence.tlsMs = elapsed();
        evidence.phase = 'sending_headers';
      });
    },
    sending(socket?: Socket): void {
      if (finished) return;
      evidence.headersStartedMs = elapsed();
      evidence.phase = 'sending_headers';
      if (socket) {
        if (sockets.has(socket)) evidence.reusedSocket = false;
        else if (usedSockets.has(socket)) evidence.reusedSocket = true;
        usedSockets.add(socket);
        evidence.ipFamily = socket.remoteFamily === 'IPv4' || socket.remoteFamily === 'IPv6' ? socket.remoteFamily : null;
      }
    },
    sent(): void {
      if (finished) return;
      evidence.headersSentMs = elapsed();
      evidence.phase = 'response_headers';
    },
    headers(response: Response): void {
      evidence.responseHeadersMs = elapsed();
      evidence.status = response.status;
      evidence.phase = 'response_body';
      try {
        const type = response.headers?.get('content-type') ?? '';
        evidence.contentType = /json/i.test(type) ? 'json' : /html/i.test(type) ? 'html' : 'other';
        const requestId = response.headers?.get('x-request-id') ?? '';
        if (/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) evidence.requestId = requestId;
        const ray = response.headers?.get('cf-ray') ?? '';
        if (/^[a-f0-9]{16,32}-[A-Z]{3}$/i.test(ray)) evidence.cfRay = ray;
      } catch { /* Header observations cannot change the response result. */ }
    },
    parsed(): void { evidence.bodyParsedMs = elapsed(); evidence.phase = 'validation'; },
    outcome(outcome: Outcome): void {
      evidence.outcome = outcome;
      if (outcome === 'success') evidence.phase = 'complete';
      if (outcome === 'http_error') evidence.phase = 'response_headers';
    },
    deadline(): void { evidence.deadlineOverrunMs = Math.max(0, elapsed() - options.timeoutMs); },
    failed(error: unknown, timedOut: boolean): void {
      errors(error);
      if (timedOut) evidence.outcome = 'timeout';
      else if (error instanceof SyntaxError) evidence.outcome = 'invalid_json';
      else evidence.outcome = 'network_error';
      if (error instanceof SyntaxError) evidence.phase = 'json';
    },
    finish(): void {
      if (finished) return;
      finished = true;
      for (const cleanup of cleanups) cleanup();
      histogram.disable();
      evidence.elapsedMs = elapsed();
      evidence.eventLoopDelayMaxMs = Math.round(histogram.max / 10_000) / 100;
      if (--active === 0) for (const { source, observer } of observers) source.unsubscribe(observer);
      try { options.record({ ...evidence, errorCodes: [...evidence.errorCodes] }); } catch { /* observation only */ }
    },
  };
}

/** Passively observe the existing fetch and its socket; never replace transport. */
export function beginWorkspaceRequestEvidence(options: Parameters<typeof createTrace>[0]): ReturnType<typeof createTrace> {
  if (active++ === 0) for (const { source, observer } of observers) source.subscribe(observer);
  return createTrace(options);
}
