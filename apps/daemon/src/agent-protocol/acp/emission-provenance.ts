/** Out-of-band origin of an ACP bridge emission, never part of its payload. */
export interface AcpEmissionMeta {
  hostSynthesized?: boolean;
}

const hostSynthesizedEmissions = new WeakSet<object>();

/**
 * Retain host provenance on the live payload identity even when a consumer only
 * stores { event, data }. Weak references neither retain transcripts nor add
 * fields to SSE, persisted JSON, or Langfuse. Deserialized legacy events have
 * no provenance and keep the existing pairing behavior.
 */
export function withAcpEmissionProvenance<T extends object>(
  payload: T,
  meta?: AcpEmissionMeta,
): T {
  if (meta?.hostSynthesized === true) hostSynthesizedEmissions.add(payload);
  return payload;
}

export function isHostSynthesizedAcpEmission(payload: object): boolean {
  return hostSynthesizedEmissions.has(payload);
}
