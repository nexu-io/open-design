import {
  ATTRIBUTION_TTL_SECONDS,
  cleanString,
  json,
  optionsResponse,
  recordKey,
  requireKv,
  type AttributionEnv,
  type ClientWebBridgeRecord,
  type PagesFunction,
} from '../../../_lib/attribution';

function trustedTarget(raw: unknown): URL | null {
  const value = cleanString(raw, 2048);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!['open-design.ai', 'www.open-design.ai', 'staging.open-design.ai'].includes(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export const onRequest: PagesFunction<AttributionEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = env.ATTRIBUTION_CONSUME_TOKEN;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json(401, { error: 'unauthorized' });
  }
  const kv = requireKv(env);
  if (!kv) return json(503, { error: 'attribution_store_unconfigured' });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const installationId = cleanString(body?.installationId, 128);
  const target = trustedTarget(body?.url);
  if (!installationId || !target) return json(400, { error: 'invalid_bridge_request' });
  const token = `odbr_${crypto.randomUUID().replace(/-/g, '')}`;
  const record: ClientWebBridgeRecord = {
    kind: 'client_web_bridge', installationId, targetOrigin: target.origin,
    createdAt: new Date().toISOString(), token,
  };
  await kv.put(recordKey(token), JSON.stringify(record), { expirationTtl: 10 * 60 });
  target.searchParams.set('od_bridge', token);
  return json(200, { url: target.toString() });
};
