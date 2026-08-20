import {
  ATTRIBUTION_TTL_SECONDS,
  json,
  optionsResponse,
  consumeTokenAtomically,
  recordKey,
  releaseAtomicConsumption,
  requireConsumptionDb,
  requireKv,
  validToken,
  type AttributionEnv,
  type AttributionRecord,
  type PagesFunction,
} from '../../_lib/attribution';

export const onRequest: PagesFunction<AttributionEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = env.ATTRIBUTION_CONSUME_TOKEN;
  if (secret) {
    const expected = `Bearer ${secret}`;
    if (request.headers.get('authorization') !== expected) return json(401, { error: 'unauthorized' });
  }
  const kv = requireKv(env);
  if (!kv) return json(503, { error: 'attribution_store_unconfigured' });
  const db = requireConsumptionDb(env);
  if (!db) return json(503, { error: 'attribution_consumption_store_unconfigured' });
  const body = await request.json().catch(() => null);
  const token = body && typeof body === 'object' && !Array.isArray(body) && typeof (body as Record<string, unknown>).token === 'string'
    ? (body as { token: string }).token
    : null;
  const installationId = body && typeof body === 'object' && !Array.isArray(body) && typeof (body as Record<string, unknown>).installationId === 'string'
    ? (body as { installationId: string }).installationId
    : null;
  if (!validToken(token) || !installationId) return json(400, { error: 'invalid_claim' });
  const consumed = await consumeTokenAtomically({
    db,
    token,
    kind: 'download',
    consumedBy: installationId,
  });
  if (!consumed.won) {
    if (consumed.consumedBy !== installationId) return json(200, { status: 'already_consumed_other' });
    const raw = await kv.get(recordKey(token));
    if (!raw) return json(200, { status: 'not_found' });
    const record = JSON.parse(raw) as AttributionRecord;
    return json(200, {
      status: 'already_consumed_same',
      webDistinctId: record.webDistinctId,
      properties: record.properties,
    });
  }
  const raw = await kv.get(recordKey(token));
  if (!raw) {
    await releaseAtomicConsumption({ db, token, kind: 'download' });
    return json(200, { status: 'not_found' });
  }
  const record = JSON.parse(raw) as AttributionRecord;
  if (record.consumedBy && record.consumedBy !== installationId) {
    await releaseAtomicConsumption({ db, token, kind: 'download' });
    return json(200, { status: 'already_consumed_other' });
  }
  const next: AttributionRecord = {
    ...record,
    consumedBy: installationId,
    consumedAt: record.consumedAt ?? new Date().toISOString(),
  };
  await kv.put(recordKey(token), JSON.stringify(next), { expirationTtl: ATTRIBUTION_TTL_SECONDS });
  return json(200, {
    status: record.consumedBy === installationId ? 'already_consumed_same' : 'consumed',
    webDistinctId: record.webDistinctId,
    properties: record.properties,
  });
};
