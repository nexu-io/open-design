import {
  corsHeaders,
  json,
  recordKey,
  requireKv,
  validToken,
  type AttributionEnv,
  type AttributionRecord,
  type PagesFunction,
} from '../../../_lib/attribution';

// Download URLs are minted only as `/{windows|macos|linux}/{arch}/{token}/{asset}`
// (see `functions/api/attribution/mint.ts`). This function's file-path route
// `/[os]/[arch]/[token]/[asset]` structurally matches ANY four-segment path,
// though — including localized static pages such as
// `/zh/plugins/templates/deck/` (os=`zh`, arch=`plugins`, token=`templates`,
// asset=`deck`). Because Pages Functions run before static-asset serving, an
// unguarded function would shadow every four-segment page with a JSON 404
// (`download_not_found`). Gate on the platform segment so anything that isn't a
// real download request falls through to the static asset instead.
const DOWNLOAD_PLATFORMS = new Set(['windows', 'macos', 'linux']);

export const onRequest: PagesFunction<AttributionEnv, {
  os: string;
  arch: string;
  token: string;
  asset: string;
}> = async ({ request, env, params, next }) => {
  if (!DOWNLOAD_PLATFORMS.has(params.os)) return next();
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }
  const kv = requireKv(env);
  if (!kv || !validToken(params.token)) return json(404, { error: 'download_not_found' });
  const raw = await kv.get(recordKey(params.token));
  if (!raw) return json(404, { error: 'download_not_found' });
  const record = JSON.parse(raw) as AttributionRecord;
  const upstream = await fetch(record.assetUrl, {
    method: request.method,
    headers: { Accept: request.headers.get('accept') ?? '*/*' },
  });
  if (!upstream.ok || (request.method === 'GET' && !upstream.body)) {
    return json(502, { error: 'download_upstream_unavailable' });
  }
  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', `attachment; filename="${params.asset.replace(/"/g, '')}"`);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
};
