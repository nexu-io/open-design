/** Run-scoped AMR execution runtimes. `none` calls the model through AMR without a harness. */
export const AMR_RUNTIMES = ['opencode', 'pi', 'codex', 'claude', 'dsh', 'none'] as const;
export type AmrRuntime = (typeof AMR_RUNTIMES)[number];

export function isAmrRuntime(value: unknown): value is AmrRuntime {
  return typeof value === 'string' && AMR_RUNTIMES.some((runtime) => runtime === value);
}

/** Omission preserves the existing OpenCode default; invalid input must fail. */
export function resolveAmrRuntime(agentId: string, value: unknown): AmrRuntime | undefined {
  if (value === undefined) return agentId === 'amr' ? 'opencode' : undefined;
  if (agentId !== 'amr') throw new Error('amrRuntime is only supported by AMR');
  if (!isAmrRuntime(value)) throw new Error(`amrRuntime must be one of: ${AMR_RUNTIMES.join(', ')}`);
  return value;
}

export interface AmrRuntimeEvidence {
  requestedRuntime: AmrRuntime;
  actualRuntime: AmrRuntime;
  runtimeVersion: string;
  /** Selected AMR catalog model, not a provider backend name. */
  modelId?: string;
  modelResponses?: AmrModelResponseEvidence[];
}

/** Correlated HTTP observations; AMR remains responsible for backend routing. */
export interface AmrModelResponseEvidence {
  requestedModelId: string;
  requestId?: string;
  responseId: string;
  responseModelId: string;
}

export function parseAmrModelResponses(value: unknown, catalogModelId: string): AmrModelResponseEvidence[] | undefined {
  if (value === undefined) return undefined; // Legacy CLI packages have no wire observations.
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) throw new Error('Invalid AMR model response evidence');
  const identifier = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v);
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid AMR model response evidence');
    const row = item as Record<string, unknown>;
    if (row.requestedModelId !== catalogModelId || !identifier(row.responseId) || !identifier(row.responseModelId)
      || (row.requestId !== undefined && !identifier(row.requestId)) || seen.has(row.responseId)) throw new Error('Invalid or mismatched AMR model response evidence');
    seen.add(row.responseId);
    return {
      requestedModelId: catalogModelId, responseId: row.responseId, responseModelId: row.responseModelId,
      ...(typeof row.requestId === 'string' ? { requestId: row.requestId } : {}),
    };
  });
}
