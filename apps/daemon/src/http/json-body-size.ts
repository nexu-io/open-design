/** Preserve transport bytes without retaining request content or trusting Content-Length. */
const bodyBytes = new WeakMap<object, number>();

export function captureJsonBodySize(request: object, _response: unknown, buffer: Buffer): void {
  bodyBytes.set(request, buffer.byteLength);
}

export function jsonBodyByteLength(request: { body?: unknown }): number {
  // Route-level callers that already decoded JSON still enforce the whole envelope.
  return bodyBytes.get(request) ?? Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
}
