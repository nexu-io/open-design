export interface PagesFunctionContext<Env, Params = Record<string, string>> {
  request: Request;
  env: Env;
  params: Params;
  // Serves the next matching handler — for a Pages Function that owns a broad
  // route, this falls through to the static asset (or the 404 page) instead of
  // the function generating a response itself.
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}

export type PagesFunction<Env, Params = Record<string, string>> = (
  context: PagesFunctionContext<Env, Params>,
) => Response | Promise<Response>;

export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
}

export interface D1StatementResult {
  meta?: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1StatementResult>;
}

export interface AttributionConsumptionDb {
  prepare(query: string): D1Statement;
}

export interface AttributionEnv {
  ATTRIBUTION_KV?: KvBinding;
  ATTRIBUTION_DB?: AttributionConsumptionDb;
  ATTRIBUTION_CONSUME_TOKEN?: string;
}

export interface AttributionRecord {
  assetUrl: string;
  createdAt: string;
  landingUrl: string | null;
  referrer: string | null;
  token: string;
  webDistinctId: string;
  properties: Record<string, unknown>;
  consumedBy?: string;
  consumedAt?: string;
}

export interface ClientWebBridgeRecord {
  kind: 'client_web_bridge';
  installationId: string;
  targetOrigin: string;
  createdAt: string;
  token: string;
  consumedAt?: string;
}

export const ATTRIBUTION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function json(status: number, body: Record<string, unknown>, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  };
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function requireKv(env: AttributionEnv): KvBinding | null {
  return env.ATTRIBUTION_KV ?? null;
}

export function requireConsumptionDb(env: AttributionEnv): AttributionConsumptionDb | null {
  return env.ATTRIBUTION_DB ?? null;
}

export function recordKey(token: string): string {
  return `download-attribution:${token}`;
}

export async function consumeTokenAtomically(input: {
  db: AttributionConsumptionDb;
  token: string;
  kind: 'download' | 'client_web_bridge';
  consumedBy: string | null;
  now?: string;
}): Promise<{ won: boolean; consumedBy: string | null }> {
  const now = input.now ?? new Date().toISOString();
  const insert = await input.db.prepare(
    `INSERT INTO attribution_token_consumptions (token, kind, consumed_by, consumed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token, kind) DO NOTHING`,
  ).bind(input.token, input.kind, input.consumedBy, now).run();
  if ((insert.meta?.changes ?? 0) === 1) return { won: true, consumedBy: input.consumedBy };
  const claimed = await input.db.prepare(
    `SELECT consumed_by AS consumedBy
     FROM attribution_token_consumptions
     WHERE token = ? AND kind = ?`,
  ).bind(input.token, input.kind).first<{ consumedBy?: unknown }>();
  return { won: false, consumedBy: typeof claimed?.consumedBy === 'string' ? claimed.consumedBy : null };
}

export async function releaseAtomicConsumption(input: {
  db: AttributionConsumptionDb;
  token: string;
  kind: 'download' | 'client_web_bridge';
}): Promise<void> {
  await input.db.prepare(
    'DELETE FROM attribution_token_consumptions WHERE token = ? AND kind = ?',
  ).bind(input.token, input.kind).run();
}

export function cleanString(value: unknown, max = 2048): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function validToken(value: string | null): value is string {
  return !!value && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

export function attributionProperties(input: {
  landingUrl: string | null;
  referrer: string | null;
  platform: string | null;
  utm: Record<string, unknown>;
}): Record<string, unknown> {
  const props: Record<string, unknown> = {
    od_source_resolved: 'download_token',
  };
  const utmMap: Record<string, string> = {
    utm_source: 'od_utm_source',
    utm_medium: 'od_utm_medium',
    utm_campaign: 'od_utm_campaign',
    utm_content: 'od_utm_content',
    utm_term: 'od_utm_term',
  };
  for (const [from, to] of Object.entries(utmMap)) {
    const value = cleanString(input.utm[from], 256);
    if (value) props[to] = value;
  }
  if (input.referrer) props.od_referrer = input.referrer;
  if (input.landingUrl) props.od_landing_url = input.landingUrl;
  if (input.platform) props.od_download_platform = input.platform;
  return props;
}
