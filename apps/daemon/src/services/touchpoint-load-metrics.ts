import { touchpointLoadMetricsSchema, TOUCHPOINT_LOAD_METRICS_HEADER, type TouchpointLoadMetrics } from '@open-design/contracts/api/touchpointLoadResults';

export { TOUCHPOINT_LOAD_METRICS_HEADER };
/** Only resource payloads; base64 text bytes and decoded bytes are distinct measurements. */
export function touchpointResourceSizes(body: unknown): { base64: number | null; decoded: number | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { base64: null, decoded: null };
  const value = body as { contentOmitted?: unknown; content?: { resources?: unknown } };
  if (value.contentOmitted === true && !value.content?.resources) return { base64: 0, decoded: null };
  if (!Array.isArray(value.content?.resources)) return { base64: null, decoded: null };
  let base64 = 0, decoded = 0;
  for (const resource of value.content.resources) {
    if (!resource || typeof resource.bytes !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resource.bytes)) return { base64: null, decoded: null };
    base64 += Buffer.byteLength(resource.bytes, 'utf8');
    decoded += Buffer.byteLength(resource.bytes, 'base64');
  }
  return { base64, decoded };
}
export function touchpointLoadMetrics(fields: Partial<TouchpointLoadMetrics> = {}): TouchpointLoadMetrics {
  const parsed = touchpointLoadMetricsSchema.safeParse({ ...fields, version: 1 });
  return parsed.success ? parsed.data : touchpointLoadMetricsSchema.parse({ version: 1 });
}
export function touchpointMetricsHeader(fields: Partial<TouchpointLoadMetrics> = {}): string {
  return JSON.stringify(touchpointLoadMetrics(fields));
}
