import {
  ATTRIBUTION_TTL_SECONDS,
  attributionProperties,
  cleanString,
  json,
  optionsResponse,
  recordKey,
  requireKv,
  type AttributionEnv,
  type AttributionRecord,
  type PagesFunction,
} from '../../_lib/attribution';

function isAllowedReleaseAsset(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith('/nexu-io/open-design/releases/download/');
  } catch {
    return false;
  }
}

export const onRequest: PagesFunction<AttributionEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const kv = requireKv(env);
  if (!kv) return json(503, { error: 'attribution_store_unconfigured' });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'invalid_body' });
  }
  const record = body as Record<string, unknown>;
  const assetUrl = cleanString(record.assetUrl);
  const webDistinctId = cleanString(record.webDistinctId, 512);
  if (!assetUrl || !webDistinctId) {
    return json(400, { error: 'missing_required_fields' });
  }
  // This endpoint turns a public POST body into a byte proxy request. Restrict
  // the upstream to our immutable release-asset path so it cannot be used as a
  // general-purpose proxy to arbitrary origins.
  if (!isAllowedReleaseAsset(assetUrl)) {
    return json(400, { error: 'unsupported_release_asset' });
  }
  const token = `oddl_${crypto.randomUUID().replace(/-/g, '')}`;
  const landingUrl = cleanString(record.landingUrl);
  const referrer = cleanString(record.referrer);
  const platform = cleanString(record.platform, 64);
  const utm = record.utm && typeof record.utm === 'object' && !Array.isArray(record.utm)
    ? record.utm as Record<string, unknown>
    : {};
  const payload: AttributionRecord = {
    assetUrl,
    createdAt: new Date().toISOString(),
    landingUrl,
    referrer,
    token,
    webDistinctId,
    properties: attributionProperties({ landingUrl, referrer, platform, utm }),
  };
  await kv.put(recordKey(token), JSON.stringify(payload), { expirationTtl: ATTRIBUTION_TTL_SECONDS });
  const assetName = encodeURIComponent(assetUrl.split('/').pop() || 'open-design-download');
  const platformPath = platform === 'windows' ? 'windows/x64' : platform === 'macos' ? 'macos/auto' : 'linux/auto';
  const downloadUrl = new URL(`/${platformPath}/${token}/${assetName}`, request.url).toString();
  return json(200, { downloadUrl, token });
};
