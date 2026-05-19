type KVNamespace = {
  put(key: string, value: string): Promise<void>;
};

type PagesFunctionContext<Env> = {
  request: Request & { cf?: Record<string, unknown> };
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

interface Env {
  OUTBOUND_EVENTS?: KVNamespace;
  OUTBOUND_EVENT_SALT?: string;
}

interface OutboundPayload {
  from_path?: unknown;
  to_url?: unknown;
  utm?: unknown;
  ts?: unknown;
}

type OutboundRecord = {
  clickedAt: string;
  fromPath: string;
  toUrl: string;
  utm: Record<string, string | null>;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') ? value.slice(0, 240) : '/';
}

function cleanUtm(value: unknown): Record<string, string | null> {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const clean = (key: string) => {
    const item = record[key];
    return typeof item === 'string' && item.length > 0 ? item.slice(0, 160) : null;
  };
  return {
    source: clean('source'),
    medium: clean('medium'),
    campaign: clean('campaign'),
    content: clean('content'),
  };
}

function cleanDestination(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com') return null;
    if (!url.pathname.startsWith('/nexu-io/open-design')) return null;
    return url.toString().slice(0, 1200);
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let payload: OutboundPayload;
  try {
    payload = (await context.request.json()) as OutboundPayload;
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const destination = cleanDestination(payload.to_url);
  if (!destination) return json(400, { error: 'invalid destination' });

  const request = context.request;
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const salt = context.env.OUTBOUND_EVENT_SALT || 'open-design-outbound';
  const clickedAt = typeof payload.ts === 'string' ? payload.ts : new Date().toISOString();
  const cf = request.cf || {};
  const record: OutboundRecord = {
    clickedAt,
    fromPath: cleanPath(payload.from_path),
    toUrl: destination,
    utm: cleanUtm(payload.utm),
    referer: request.headers.get('referer'),
    userAgentHash: await sha256Hex(`${salt}:${ip}:${userAgent}`),
    country: typeof cf.country === 'string' ? cf.country : undefined,
    region: typeof cf.region === 'string' ? cf.region : undefined,
  };

  if (context.env.OUTBOUND_EVENTS) {
    const date = clickedAt.slice(0, 10);
    const key = `outbound:${date}:${crypto.randomUUID()}`;
    context.waitUntil(context.env.OUTBOUND_EVENTS.put(key, JSON.stringify(record)));
  } else {
    console.log('outbound_click', JSON.stringify(record));
  }

  return json(202, { ok: true });
};
