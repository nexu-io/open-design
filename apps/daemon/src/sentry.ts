import * as Sentry from '@sentry/node';
import type { Event, NodeOptions } from '@sentry/node';

type Env = Record<string, string | undefined>;
type SentryInit = Pick<typeof Sentry, 'init'>;
type SentryExpress = Pick<typeof Sentry, 'setupExpressErrorHandler'>;
type SentryCapture = Pick<typeof Sentry, 'captureException' | 'flush'>;

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const FILTERED = '[Filtered]';

let initialized = false;

function readEnvValue(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function parseSampleRate(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_TRACES_SAMPLE_RATE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return [
    'authorization',
    'cookie',
    'setcookie',
    'token',
    'secret',
    'password',
    'apikey',
    'querystring',
    'session',
    'sentrydsn',
    'openai',
    'anthropic',
    'gemini',
    'langfuse',
  ].some((needle) => normalized.includes(needle));
}

function stripUrlSearchFromText(value: string): string {
  return value.replace(/https?:\/\/[^\s'"<>]+/g, (match) => stripUrlSearch(match));
}

function scrubNestedField(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return FILTERED;
  }

  const normalized = normalizeSensitiveKey(key);
  if (normalized === 'headers') {
    return scrubHeaders(value);
  }

  if ((normalized === 'url' || normalized.endsWith('url')) && typeof value === 'string') {
    return stripUrlSearch(value);
  }

  if (typeof value === 'string') {
    return stripUrlSearchFromText(value);
  }

  return scrubNestedValue(value);
}

function scrubNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubNestedValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, scrubNestedField(key, nestedValue)]),
  );
}

function scrubHeaders(headers: unknown): unknown {
  if (!isRecord(headers)) {
    return headers;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, isSensitiveKey(key) ? FILTERED : value]),
  );
}

function stripUrlSearch(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    return url.toString();
  } catch {
    const searchIndex = value.indexOf('?');
    if (searchIndex < 0) {
      return value;
    }
    const hashIndex = value.indexOf('#', searchIndex);
    return hashIndex < 0 ? value.slice(0, searchIndex) : `${value.slice(0, searchIndex)}${value.slice(hashIndex)}`;
  }
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  const scrubbed: Event = { ...event };

  if (event.request) {
    scrubbed.request = { ...event.request };
    delete scrubbed.request.data;
    delete scrubbed.request.query_string;

    if (typeof event.request.url === 'string') {
      scrubbed.request.url = stripUrlSearch(event.request.url);
    }

    if (event.request.headers) {
      scrubbed.request.headers = scrubHeaders(event.request.headers) as Record<string, string>;
    }

    if ('cookies' in scrubbed.request) {
      delete scrubbed.request.cookies;
    }
  }

  if (event.extra) {
    scrubbed.extra = scrubNestedValue(event.extra) as NonNullable<Event['extra']>;
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = scrubNestedValue(event.breadcrumbs) as NonNullable<Event['breadcrumbs']>;
  }

  if (event.tags) {
    scrubbed.tags = scrubNestedValue(event.tags) as NonNullable<Event['tags']>;
  }

  if (event.contexts) {
    scrubbed.contexts = scrubNestedValue(event.contexts) as NonNullable<Event['contexts']>;
  }

  if ('spans' in event && Array.isArray((event as Event & { spans?: unknown }).spans)) {
    (scrubbed as any).spans = scrubNestedValue((event as Event & { spans?: unknown }).spans);
  }

  if (event.user?.id) {
    scrubbed.user = { id: event.user.id };
  } else if ('user' in scrubbed) {
    delete scrubbed.user;
  }

  return scrubbed as T;
}

export function buildSentryOptions(env: Env = process.env): NodeOptions {
  const dsn = readEnvValue(env, 'SENTRY_DSN');
  const release = readEnvValue(env, 'SENTRY_RELEASE');
  const options: NodeOptions = {
    enabled: Boolean(dsn),
    environment: readEnvValue(env, 'SENTRY_ENVIRONMENT') ?? readEnvValue(env, 'NODE_ENV') ?? 'production',
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(readEnvValue(env, 'SENTRY_TRACES_SAMPLE_RATE')),
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
  };

  if (dsn) {
    options.dsn = dsn;
  }

  if (release) {
    options.release = release;
  }

  return options;
}

export function setupSentryExpressErrorHandler(
  app: Parameters<typeof Sentry.setupExpressErrorHandler>[0],
  sentry: SentryExpress = Sentry,
): void {
  sentry.setupExpressErrorHandler(app);
}

export async function captureStartupException(
  error: unknown,
  sentry: SentryCapture = Sentry,
): Promise<void> {
  try {
    sentry.captureException(error);
    await sentry.flush(2000);
  } catch {
    // Startup error reporting must never mask the original daemon failure.
  }
}

export function initSentryFromEnv(env: Env = process.env, sentry: SentryInit = Sentry): boolean {
  const options = buildSentryOptions(env);
  if (initialized || !options.enabled) {
    return false;
  }

  if (sentry === Sentry) {
    Sentry.init(options);
  } else {
    sentry.init(options);
  }

  initialized = true;
  return true;
}
