import type { Request } from 'express';
import { CLIENT_REQUEST_ID_HEADER, normalizeClientRequestId } from '@open-design/contracts';

/** The client's observational request id, or undefined when absent/malformed. */
export function clientRequestIdFor(req: Request): string | undefined {
  return normalizeClientRequestId(req.get(CLIENT_REQUEST_ID_HEADER));
}
