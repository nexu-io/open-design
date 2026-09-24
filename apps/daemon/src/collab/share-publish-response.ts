import type { SharePublishResponse, SharePublishResult } from '@open-design/contracts';

/** Presentation origin and binding readiness are independent. A URL names the
 * Viewer route, not a promise that its binding already serves content. */
export function sharePublishResponse(result: SharePublishResult, url: string | null): SharePublishResponse {
  const link = { status: 'unavailable' as const, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' as const };
  if (result.status === 'published') return url === null
    ? { status: 'published', receipt: result.receipt, link }
    : { status: 'published', receipt: result.receipt, url };
  return { status: 'binding_pending', receipt: result.receipt, binding: result.binding,
    ...(url === null ? { link } : { url }) };
}
