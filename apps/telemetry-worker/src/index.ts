import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions, ErrorEvent, Event } from '@sentry/cloudflare';

const DEFAULT_LANGFUSE_BASE_URL = 'https://us.cloud.langfuse.com';
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BATCH_EVENTS = 100;
const RELAY_MARKER_HEADER = 'X-Open-Design-Telemetry';
const RELAY_MARKER_VALUE = 'langfuse-ingestion-v1';
const DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 0.1;
const FILTERED_VALUE = '[Filtered]';
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|secret|token|api[-_]?key|session|langfuse/i;
const ALLOWED_EVENT_TYPES = new Set([
  'trace-create',
  'span-create',
  'generation-create',
  'event-create',
  'score-create',
]);

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  TELEMETRY_CLIENT_RATE_LIMITER?: RateLimitBinding;
  TELEMETRY_IP_RATE_LIMITER?: RateLimitBinding;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function shouldScrubKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    scrubbed[key] = shouldScrubKey(key) ? FILTERED_VALUE : scrubValue(nestedValue);
  }
  return scrubbed;
}

function parseSampleRate(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_SENTRY_TRACES_SAMPLE_RATE;
}

export function scrubSentryEvent(event: Event): Event {
  const scrubbed: Event = { ...event };

  if (event.request) {
    scrubbed.request = { ...event.request };
    delete scrubbed.request.data;
    if (event.request.headers && isRecord(event.request.headers)) {
      scrubbed.request.headers = scrubValue(event.request.headers) as Record<string, string>;
    }
  }

  if (event.extra) {
    scrubbed.extra = scrubValue(event.extra) as NonNullable<Event['extra']>;
  }

  if (event.user) {
    const userId = typeof event.user.id === 'string' ? event.user.id : undefined;
    if (userId) {
      scrubbed.user = { id: userId };
    } else {
      delete scrubbed.user;
    }
  }

  return scrubbed;
}

export function buildSentryOptions(env: Env): CloudflareOptions {
  const dsn = env.SENTRY_DSN?.trim();
  const release = env.SENTRY_RELEASE?.trim();
  const environment = env.SENTRY_ENVIRONMENT?.trim() || 'production';
  const options: CloudflareOptions = {
    enabled: Boolean(dsn),
    environment,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    integrations: (integrations) => [
      ...integrations.filter((integration) => integration.name !== 'HttpServer'),
      Sentry.httpServerIntegration({ maxRequestBodySize: 'none' }),
    ],
    beforeSend: (event) => scrubSentryEvent(event) as ErrorEvent,
  };

  if (dsn) {
    options.dsn = dsn;
  }
  if (release) {
    options.release = release;
  }

  return options;
}

function bodySizeBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function basicAuthHeader(publicKey: string, secretKey: string): string {
  const bytes = new TextEncoder().encode(`${publicKey}:${secretKey}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function validateIngestionBody(value: unknown): string | null {
  if (!isRecord(value)) return 'body must be a JSON object';
  const batch = value.batch;
  if (!Array.isArray(batch)) return 'body.batch must be an array';
  if (batch.length === 0) return 'body.batch must not be empty';
  if (batch.length > MAX_BATCH_EVENTS) return 'body.batch has too many events';

  for (const [index, event] of batch.entries()) {
    if (!isRecord(event)) return `body.batch[${index}] must be an object`;
    if (typeof event.id !== 'string' || event.id.length === 0) {
      return `body.batch[${index}].id must be a string`;
    }
    if (event.id.length > 200) return `body.batch[${index}].id is too long`;
    if (typeof event.type !== 'string' || !ALLOWED_EVENT_TYPES.has(event.type)) {
      return `body.batch[${index}].type is not allowed`;
    }
    if (!isRecord(event.body)) return `body.batch[${index}].body must be an object`;
  }
  return null;
}

function findTraceUserId(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.batch)) return null;
  for (const event of value.batch) {
    if (!isRecord(event) || event.type !== 'trace-create' || !isRecord(event.body)) {
      continue;
    }
    const userId = event.body.userId;
    return typeof userId === 'string' && userId.length > 0 ? userId.slice(0, 200) : null;
  }
  return null;
}

async function enforceRateLimits(
  request: Request,
  env: Env,
  parsedBody: unknown,
): Promise<Response | null> {
  const clientKey = findTraceUserId(parsedBody);
  if (clientKey && env.TELEMETRY_CLIENT_RATE_LIMITER) {
    const { success } = await env.TELEMETRY_CLIENT_RATE_LIMITER.limit({
      key: `client:${clientKey}`,
    });
    if (!success) return jsonResponse(429, { error: 'rate limit exceeded' });
  }

  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (ip && env.TELEMETRY_IP_RATE_LIMITER) {
    const { success } = await env.TELEMETRY_IP_RATE_LIMITER.limit({
      key: `ip:${ip}`,
    });
    if (!success) return jsonResponse(429, { error: 'rate limit exceeded' });
  }

  return null;
}

async function readBoundedBody(request: Request): Promise<string | Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength != null && Number(contentLength) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'payload too large' });
  }

  const text = await request.text();
  if (bodySizeBytes(text) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'payload too large' });
  }
  return text;
}

function resolveLangfuseUrl(env: Env): string {
  return `${(env.LANGFUSE_BASE_URL?.trim() || DEFAULT_LANGFUSE_BASE_URL).replace(/\/+$/, '')}/api/public/ingestion`;
}

function hasLangfuseCredentials(env: Env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY?.trim() && env.LANGFUSE_SECRET_KEY?.trim());
}

function isHealthPath(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname === '/api/langfuse' || pathname === '/health';
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET' && isHealthPath(request)) {
    return jsonResponse(200, {
      ok: true,
      service: 'open-design-telemetry-relay',
      configured: hasLangfuseCredentials(env),
      upstream: resolveLangfuseUrl(env),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  if (request.headers.get(RELAY_MARKER_HEADER) !== RELAY_MARKER_VALUE) {
    return jsonResponse(403, { error: 'missing telemetry client marker' });
  }

  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) {
    return jsonResponse(503, { error: 'telemetry relay is not configured' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { error: 'content-type must be application/json' });
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody instanceof Response) return rawBody;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'invalid JSON' });
  }

  const validationError = validateIngestionBody(parsed);
  if (validationError != null) {
    return jsonResponse(400, { error: validationError });
  }

  const rateLimitResponse = await enforceRateLimits(request, env, parsed);
  if (rateLimitResponse) return rateLimitResponse;

  const upstream = await fetch(resolveLangfuseUrl(env), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(publicKey, secretKey),
      'Content-Type': 'application/json',
    },
    body: rawBody,
  });
  const upstreamBody = await upstream.text();
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

export default Sentry.withSentry<Env>((env) => buildSentryOptions(env), {
  fetch: handleRequest,
});
