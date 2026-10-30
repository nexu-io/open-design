import type { RuntimePromptBudgetError } from './types.js';

// The daemon's token-estimate convention, shared with the
// `prompt_budget_v1` diagnostic emitted by the ACP transport
// (`agent-protocol/acp/session.ts`, `tokenEstimateMethod:
// 'utf8_bytes_div_3_ceil_v1'`). Deliberately conservative: provider tool
// schemas and source code run closer to 3 UTF-8 bytes per token than to
// prose's ~4, so dividing by 3 over-estimates a prose-heavy prompt but
// does not under-estimate the schema-heavy payloads that actually
// overflow a window.
const BYTES_PER_TOKEN = 3;

export interface StaticPromptContextBudgetInput {
  /** Display name of the runtime, e.g. "OpenAI API via OpenCode". */
  agentName: string;
  /** Model id the run will be billed against, as the provider sees it. */
  model: string;
  /** UTF-8 size of the composed prompt this run will send. */
  promptBytes: number;
  /**
   * UTF-8 size of the tool schemas the runtime resolves for this run and
   * re-sends on every request. OpenCode builds these from the MCP servers
   * it is configured with, after the daemon hands over the config, so they
   * are not part of `promptBytes` (see #9118: 462,317 bytes of tool
   * definitions dwarfed the prompt itself).
   */
  toolSchemaBytes?: number;
  /** Window the runtime declares for this model. */
  contextWindowTokens: number;
  /** Tokens that must stay free for the model's reply. */
  outputTokenReserveTokens: number;
}

export interface StaticPromptContextBudgetError extends RuntimePromptBudgetError {
  promptTokenEstimate: number;
  contextWindowTokens: number;
  /** Tokens attributed to resolved tool schemas, when any were measured. */
  toolSchemaTokenEstimate: number;
}

export function estimatePromptTokens(promptBytes: number): number {
  if (!Number.isFinite(promptBytes) || promptBytes <= 0) return 0;
  return Math.ceil(promptBytes / BYTES_PER_TOKEN);
}

/**
 * Refuses a run whose composed prompt cannot fit the context window the
 * runtime is about to declare for it.
 *
 * The static part of a prompt — system text, tool schemas, skills — is
 * present in every request and cannot be removed by compaction, which
 * only trims conversation history. When the prompt is already over
 * budget before the model has said anything, a runtime that answers by
 * compacting therefore re-fires on the very next step and never
 * converges: it spends the provider balance without making progress.
 * Failing here costs one error message instead of that loop.
 *
 * Returns null when the window is unknown (0, negative, or NaN): an
 * absent window is not evidence that this prompt is too large, and
 * inventing a failure would block runs that work.
 */
export function checkStaticPromptContextBudget(
  input: StaticPromptContextBudgetInput,
): StaticPromptContextBudgetError | null {
  const { contextWindowTokens } = input;
  if (!Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) return null;

  const outputTokenReserveTokens = Number.isFinite(input.outputTokenReserveTokens)
    ? Math.max(input.outputTokenReserveTokens, 0)
    : 0;
  const limit = contextWindowTokens - outputTokenReserveTokens;
  const toolSchemaBytes = Number.isFinite(input.toolSchemaBytes)
    ? Math.max(input.toolSchemaBytes ?? 0, 0)
    : 0;
  const promptTokenEstimate = estimatePromptTokens(input.promptBytes);
  const toolSchemaTokenEstimate = estimatePromptTokens(toolSchemaBytes);
  const staticTokenEstimate = promptTokenEstimate + toolSchemaTokenEstimate;
  if (staticTokenEstimate <= limit) return null;

  // Name the part that is actually over budget. When tool schemas are what
  // pushed the request past the window, advice to "shorten the conversation"
  // is useless — the schemas are re-sent on every request either way.
  const schemaDominated = toolSchemaTokenEstimate > promptTokenEstimate;
  const breakdown = toolSchemaBytes > 0
    ? `prompt ${promptTokenEstimate.toLocaleString('en-US')} + tool schemas ${toolSchemaTokenEstimate.toLocaleString('en-US')}`
    : `prompt ${promptTokenEstimate.toLocaleString('en-US')}`;
  const remedy = schemaDominated
    ? 'Disable the MCP servers this run does not need, or use a model whose context window has room for those tool schemas.'
    : 'Reduce the selected skills/design-system context, start a new conversation, or use a model whose context window has room for this prompt.';

  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${input.agentName} declares a ${contextWindowTokens.toLocaleString('en-US')} token context window for ${input.model}, ` +
      `and this run's static request already estimates at ${staticTokenEstimate.toLocaleString('en-US')} tokens (${breakdown}) ` +
      `before any room for the reply (${limit.toLocaleString('en-US')} available). Auto-compaction only trims conversation history, ` +
      'so it cannot shrink content that is re-sent on every request and would re-fire on every step instead of making progress. ' +
      remedy,
    bytes: input.promptBytes + toolSchemaBytes,
    limit,
    promptTokenEstimate,
    contextWindowTokens,
    toolSchemaTokenEstimate,
  };
}
