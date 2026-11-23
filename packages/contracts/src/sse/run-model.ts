import type { PersistedAgentEvent } from '../api/chat.js';

type Status = Extract<PersistedAgentEvent, { kind: 'status' }>;

export function runModelId(raw: unknown): string | undefined {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id !== 'default' && /^[\w][\w./:+@-]{0,159}$/u.test(id) ? id : undefined;
}

export function withRequestedRunModel(event: string, payload: unknown, requested: unknown): unknown {
  return event === 'start' && payload && typeof payload === 'object' && 'agentId' in payload
    ? { ...payload, requestedModel: runModelId(requested) ?? null }
    : payload;
}

export function runStartStatus(payload: {
  bin?: unknown;
  agentId?: unknown;
  requestedModel?: unknown;
  model?: unknown;
}): Status {
  const agentId = runModelId(payload.agentId);
  const requestedModel = runModelId(payload.requestedModel);
  const dispatchedModel = runModelId(payload.model);
  return {
    kind: 'status', label: 'starting',
    ...(typeof payload.bin === 'string' ? { detail: payload.bin } : {}),
    ...(agentId ? { agentId } : {}),
    ...(requestedModel ? { requestedModel } : {}),
    ...(dispatchedModel ? { dispatchedModel } : {}),
  };
}

export function runFallbackModel(label: string, model: unknown): Pick<Status, 'dispatchedModel'> {
  const dispatchedModel = label === 'model_fallback' ? runModelId(model) : undefined;
  return dispatchedModel ? { dispatchedModel } : {};
}

/** A live client can extend the recorded attempts, but cannot rewrite their model evidence. */
export function preservesRunModelEvidence(stored: readonly unknown[], incoming: readonly unknown[]): boolean {
  const evidence = (events: readonly unknown[]) => events.flatMap((event) => {
    if (!event || typeof event !== 'object' || !('kind' in event) || event.kind !== 'status') return [];
    const status = event as Partial<Status>;
    if (status.label === 'provider_model' && runModelId(status.detail)) {
      return [JSON.stringify([status.label, status.detail])];
    }
    if ((status.label === 'starting' || status.label === 'model_fallback') &&
        (status.agentId || status.requestedModel || status.dispatchedModel)) {
      return [JSON.stringify([status.label, status.agentId, status.requestedModel, status.dispatchedModel])];
    }
    return [];
  });
  const previous = evidence(stored);
  if (previous.length === 0) return true;
  const next = evidence(incoming);
  return previous.every((fact, index) => fact === next[index]);
}
