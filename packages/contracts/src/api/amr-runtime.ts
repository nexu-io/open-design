/** Run-scoped AMR execution runtimes. `none` calls the model through AMR without a harness. */
export const AMR_RUNTIMES = ['opencode', 'pi', 'codex', 'claude', 'dsh', 'ohmypi', 'none'] as const;
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
  directModelContinuation?: AmrDirectModelContinuation;
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

/** Explicit accounting for bounded model-only output-budget continuation. */
export interface AmrDirectModelContinuation {
  policy: 'output-budget-v1';
  maxContinuations: number;
  requestCount: number;
  continuationCount: number;
  usageComplete: boolean;
  requests: Array<{
    response: { requestedModelId: string; requestId?: string; responseId: string; responseModelId: string };
    usage: Record<string, number> | null;
    durationMs: number;
    truncated: boolean;
    succeeded: boolean;
  }>;
}

export function parseAmrDirectModelContinuation(value: unknown, model: string): AmrDirectModelContinuation | undefined {
  if (value === undefined) return undefined;
  const invalid = (): never => { throw new Error('Invalid direct-model continuation evidence'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const count = row.requestCount;
  if (row.policy !== 'output-budget-v1' || row.maxContinuations !== 8
    || !Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 9
    || row.continuationCount !== (count as number) - 1 || typeof row.usageComplete !== 'boolean'
    || !Array.isArray(row.requests) || row.requests.length !== count) return invalid();
  const id = (v: unknown): v is string => typeof v === 'string' && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v);
  const requests: AmrDirectModelContinuation['requests'] = row.requests.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return invalid();
    const request = item as Record<string, unknown>;
    const response = request.response as Record<string, unknown> | undefined;
    if (!response || response.requestedModelId !== model || !id(response.responseId) || !id(response.responseModelId)
      || (response.requestId !== undefined && !id(response.requestId))
      || !Number.isSafeInteger(request.durationMs) || (request.durationMs as number) < 0
      || typeof request.succeeded !== 'boolean' || typeof request.truncated !== 'boolean') return invalid();
    let usage: Record<string, number> | null = null;
    if (request.usage !== null) {
      if (!request.usage || typeof request.usage !== 'object' || Array.isArray(request.usage)) return invalid();
      usage = {};
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cachedReadTokens', 'thoughtTokens']) {
        const number = (request.usage as Record<string, unknown>)[key];
        if (number === undefined) continue;
        if (!Number.isSafeInteger(number) || (number as number) < 0) return invalid();
        usage[key] = number as number;
      }
      if (usage.inputTokens === undefined || usage.outputTokens === undefined
        || usage.totalTokens !== usage.inputTokens + usage.outputTokens) return invalid();
    }
    return { response: { requestedModelId: model, responseId: response.responseId, responseModelId: response.responseModelId,
      ...(typeof response.requestId === 'string' ? {requestId: response.requestId} : {}) },
      usage, durationMs: request.durationMs as number, truncated: request.truncated, succeeded: request.succeeded };
  });
  if (row.usageComplete && requests.some(request => request.usage === null)) return invalid();
  return { policy: 'output-budget-v1', maxContinuations: 8, requestCount: count as number,
    continuationCount: row.continuationCount as number, usageComplete: row.usageComplete, requests };
}
