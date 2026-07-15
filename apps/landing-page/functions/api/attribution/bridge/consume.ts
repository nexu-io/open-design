import {
  json,
  optionsResponse,
  consumeTokenAtomically,
  recordKey,
  releaseAtomicConsumption,
  requireConsumptionDb,
  requireKv,
  validToken,
  type AttributionEnv,
  type ClientWebBridgeRecord,
  type PagesFunction,
} from '../../../_lib/attribution';

export const onRequest: PagesFunction<AttributionEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const kv = requireKv(env);
  if (!kv) return json(503, { error: 'attribution_store_unconfigured' });
  const db = requireConsumptionDb(env);
  if (!db) return json(503, { error: 'attribution_consumption_store_unconfigured' });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token : null;
  if (!validToken(token)) return json(400, { error: 'invalid_bridge_token' });
  const raw = await kv.get(recordKey(token));
  if (!raw) return json(404, { error: 'bridge_not_found' });
  const record = JSON.parse(raw) as Partial<ClientWebBridgeRecord>;
  if (record.kind !== 'client_web_bridge' || record.targetOrigin !== new URL(request.url).origin || record.consumedAt || !record.installationId) {
    return json(404, { error: 'bridge_not_found' });
  }
  const consumed = await consumeTokenAtomically({
    db,
    token,
    kind: 'client_web_bridge',
    consumedBy: record.installationId,
  });
  if (!consumed.won) return json(404, { error: 'bridge_not_found' });
  await kv.put(recordKey(token), JSON.stringify({ ...record, consumedAt: new Date().toISOString() }), { expirationTtl: 10 * 60 });
  return json(200, { installationId: record.installationId });
};
