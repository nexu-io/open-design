import type { ProxyStreamDeltaPayload, ProxyStreamEndPayload, ProxyStreamStartPayload } from '../api/proxy';
import type { SseErrorPayload } from '../errors';
import type { SseTransportEvent } from './common';

export const PROXY_SSE_PROTOCOL_VERSION = 1;

export type ProxySseEvent =
  | SseTransportEvent<'start', ProxyStreamStartPayload>
  | SseTransportEvent<'delta', ProxyStreamDeltaPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ProxyStreamEndPayload>;
