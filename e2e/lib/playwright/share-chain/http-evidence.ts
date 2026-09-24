export interface HttpRequestSource {
  url(): string;
  method(): string;
  resourceType(): string;
}
export interface HttpResponseSource {
  url(): string;
  status(): number;
  request(): HttpRequestSource;
  json(): Promise<unknown>;
}
function parseEvidenceUrl(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}
/** Diagnostic output only, never a transport URL. Rechecks must use the live
 * request URL unchanged, not a path reconstructed from this redacted record. */
export function evidenceUrl(value: string): string {
  const url = parseEvidenceUrl(value);
  if (!url) return 'invalid:<REDACTED>';
  if (!['http:', 'https:'].includes(url.protocol)) return `${url.protocol}<REDACTED>`;
  url.username = ''; url.password = ''; url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (!['projectId', 'filePath', 'shareAlias'].includes(key)) url.searchParams.set(key, '<REDACTED>');
  }
  return url.href;
}
export function captureHttpRequest(request: HttpRequestSource, page: string) {
  return { page, at: Date.now(), method: request.method(), type: request.resourceType(), url: evidenceUrl(request.url()), urlPurpose: 'diagnostic-only' as const };
}
/** Only business bodies needed by the probe are read. Identity/directory/auth bodies are not evidence inputs. */
export function mayReadEvidenceBody(pathname: string): boolean {
  return /^\/(?:api\/)?v1\/(?:public\/(?:shares|snapshots)\/[^/]+|collab\/share\/[^/]+\/comments)$/.test(pathname)
    || /^\/api\/projects\/[^/]+\/(?:comments(?:\/(?:sync-state|read-state))?|conversations\/[^/]+\/comments|files\/.+\/publish-public)$/.test(pathname);
}
export async function captureHttpResponse(response: HttpResponseSource, page: string) {
  const record = { ...captureHttpRequest(response.request(), page), status: response.status() };
  if (!mayReadEvidenceBody(parseEvidenceUrl(response.url())?.pathname ?? '')) return { ...record, body: null, bodyRead: 'not-requested' as const };
  try { return { ...record, body: await response.json(), bodyRead: 'complete' as const }; }
  catch { return { ...record, body: null, bodyRead: 'unavailable' as const }; }
}
