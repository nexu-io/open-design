import type { RuntimeAgentDef, RuntimeModelOption } from './types.js';

/** Efforts are catalogue-owned identifiers, never executable config fragments. */
export function parseReasoningId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id) ? id : null;
}

/** Known capabilities are authoritative; old/custom catalogues retain fallback. */
export function validateModelReasoning(
  def: Pick<RuntimeAgentDef, 'reasoningOptions'>,
  models: RuntimeModelOption[],
  modelId: string | null | undefined,
  effort: unknown,
): string | null {
  if (effort == null || effort === '' || effort === 'default') return null;
  const id = parseReasoningId(effort);
  if (!id) throw new Error('Invalid reasoning id.');
  const model = models.find((m) => m.id === modelId);
  if (model?.reasoningOptions !== undefined) {
    if (!model.reasoningOptions.some((option) => option.id === id)) {
      throw new Error(`Reasoning "${id}" is not supported by model "${model.id}".`);
    }
    return id;
  }
  return def.reasoningOptions?.find((option) => option.id === id)?.id ?? null;
}
