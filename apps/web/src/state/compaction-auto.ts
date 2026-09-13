/**
 * Automatic context compaction for API/BYOK conversations (#5991 follow-up).
 *
 * Manual compaction is driven by the `/compact` slash command. This module
 * adds the automatic counterpart: right before an API-mode send, the
 * outgoing transcript (after any existing checkpoint) is token-estimated
 * against the selected model's context window, and once it crosses the
 * ratio threshold the same daemon compaction endpoint is invoked ahead of
 * the run. Manual `/compact` stays available and unchanged.
 *
 * API-mode runtimes ship no context-window catalog (ACP `findKnownModel`
 * metadata only covers ACP models), so Antigravity's static label set and a
 * small BYOK model-id prefix table live here. The estimate is a cheap
 * character heuristic (ASCII ≈ 0.25 tokens, everything else ≈ 1 token), not
 * a tokenizer — the default ratio (0.75) leaves headroom for estimation
 * error, the system prompt and the summary block itself.
 *
 * Auto-compaction must never block a send: callers wrap this in try/catch,
 * and every failure mode either skips quietly or surfaces a toast while the
 * run proceeds with the full history.
 *
 * Tuning knobs (build-time env, all optional):
 *  - NEXT_PUBLIC_OD_COMPACTION_AUTO=0          disable auto-compaction
 *  - NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN=1  decide but never call the daemon
 *  - NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO=0.75 arm ratio of the context window
 */

import type {
  ChatConversationCompaction,
  ChatMessage,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  COMPACTION_ELIGIBLE_AGENT_IDS,
  compactConversation,
  fetchConversationCompaction,
} from '../providers/daemon';
import litellmData from './litellm-models.json';

export const AUTO_COMPACTION_DEFAULT_RATIO = 0.75;
export const AUTO_COMPACTION_DEFAULT_MIN_MESSAGES = 8;
export const AUTO_COMPACTION_FALLBACK_WINDOW_TOKENS = 200_000;

/**
 * Context windows come from the vendored LiteLLM catalog
 * (`litellm-models.json#contextWindows`, `max_input_tokens`), the same
 * community catalog already used for output caps. It is the best available
 * per-model source for API/BYOK ids — API-mode runtimes report no context
 * metadata (ACP `findKnownModel` only covers ACP models), and LiteLLM keeps
 * one entry per provider path for thousands of models.
 *
 * Where LiteLLM is wrong for our usage, CONTEXT_WINDOW_OVERRIDES wins.
 */
const CONTEXT_WINDOW_OVERRIDES: Record<string, number> = {
  // LiteLLM lists 1M for DeepSeek v4, but the official spec (and the
  // settings shipped with this app) document 384K. Stay conservative so
  // compaction fires before the real ceiling. Keys are normalized model
  // ids (see normalizeModelId) and matched on the normalized needle.
  deepseekv4pro: 393_216,
  deepseekv4flash: 393_216,
};

const LITELLM_CONTEXT_WINDOWS = (litellmData.contextWindows ?? {}) as Record<
  string,
  number
>;

/**
 * Antigravity exposes a static model label set (no live catalog —
 * see runtimes/defs/antigravity.ts). Its labels are resolved here first;
 * unknown labels fall through to the LiteLLM lookup.
 */
const ANTIGRAVITY_CONTEXT_WINDOWS: Record<string, number> = {
  default: 1_000_000,
  'Gemini 3.1 Pro (High)': 1_000_000,
  'Gemini 3.1 Pro (Low)': 1_000_000,
  'Gemini 3.5 Flash (High)': 1_000_000,
  'Gemini 3.5 Flash (Medium)': 1_000_000,
  'Gemini 3.5 Flash (Low)': 1_000_000,
  'Claude Sonnet 4.6 (Thinking)': 200_000,
  'Claude Opus 4.6 (Thinking)': 200_000,
  'GPT-OSS 120B (Medium)': 128_000,
};

/**
 * Last-resort prefix table for ids the LiteLLM catalog does not track
 * (custom/self-hosted BYOK ids, ollama-colon ids, brand-new models).
 */
const MODEL_WINDOW_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ['gemini', 1_000_000],
  ['gpt-5', 400_000],
  ['codex', 400_000],
  ['o3', 400_000],
  ['o4', 400_000],
  ['claude', 200_000],
  ['anthropic', 200_000],
  ['sonnet', 200_000],
  ['opus', 200_000],
  ['haiku', 200_000],
  ['grok', 256_000],
  ['gpt-oss', 128_000],
  ['deepseek', 128_000],
  ['kimi', 128_000],
  ['moonshot', 128_000],
  ['qwen', 128_000],
  ['glm', 128_000],
  ['llama', 128_000],
  ['mistral', 128_000],
  ['mixtral', 128_000],
  ['ministral', 128_000],
  ['gemma', 128_000],
  ['phi-', 128_000],
];

function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let litellmNormalizedIndex: Map<string, number> | null = null;

function litellmNormalIndex(): Map<string, number> {
  if (litellmNormalizedIndex) return litellmNormalizedIndex;
  const index = new Map<string, number>();
  for (const [id, window] of Object.entries(LITELLM_CONTEXT_WINDOWS)) {
    if (!Number.isFinite(window) || window <= 0) continue;
    const norm = normalizeModelId(id);
    const prev = index.get(norm);
    // Providers can disagree per path; keep the smallest window so an
    // ambiguous suffix match lands on the conservative side.
    if (prev === undefined || window < prev) index.set(norm, window);
  }
  litellmNormalizedIndex = index;
  return index;
}

function lookupLitellmContextWindow(model: string): number | undefined {
  const raw = model.trim();
  if (!raw) return undefined;

  // Exact, case-insensitive raw key.
  const exact = LITELLM_CONTEXT_WINDOWS[raw.toLowerCase()];
  if (Number.isFinite(exact) && (exact as number) > 0) return exact;

  // Strip a leading provider path (`openai/gpt-5.2` → `gpt-5.2`) and retry.
  const slash = raw.lastIndexOf('/');
  if (slash >= 0) {
    const tail = raw.slice(slash + 1).toLowerCase();
    const tailHit = LITELLM_CONTEXT_WINDOWS[tail];
    if (Number.isFinite(tailHit) && (tailHit as number) > 0) return tailHit;
  }

  const norm = normalizeModelId(raw);
  const index = litellmNormalIndex();
  const exactNorm = index.get(norm);
  if (exactNorm !== undefined) return exactNorm;

  // Normalized suffix match for family ids (`kimi-k2.6` against provider
  // variants like `azure_ai/kimi-k2.6`). Only for needles long enough that
  // a suffix can't be coincidence. Providers usually agree, but one odd
  // provider can under-report, so resolve by the most common value (mode)
  // with the smallest window as the tie-break.
  if (norm.length >= 6) {
    const matches: number[] = [];
    for (const [key, window] of index) {
      if (key.endsWith(norm)) matches.push(window);
    }
    if (matches.length > 0) {
      const frequencies = new Map<number, number>();
      for (const window of matches) {
        frequencies.set(window, (frequencies.get(window) ?? 0) + 1);
      }
      let best: number | undefined;
      let bestFreq = -1;
      for (const [window, freq] of frequencies) {
        if (freq > bestFreq || (freq === bestFreq && (best === undefined || window < best))) {
          best = window;
          bestFreq = freq;
        }
      }
      if (best !== undefined) return best;
    }
  }
  return undefined;
}

export function resolveModelContextWindowTokens(agentId: string, model?: string | null): number {
  if (agentId === 'antigravity' && model) {
    const direct = ANTIGRAVITY_CONTEXT_WINDOWS[model];
    if (direct) return direct;
  }
  if (model) {
    const override = CONTEXT_WINDOW_OVERRIDES[normalizeModelId(model)];
    if (override) return override;
    const litellm = lookupLitellmContextWindow(model);
    if (litellm !== undefined) return litellm;
    const needle = model.toLowerCase();
    for (const [prefix, window] of MODEL_WINDOW_PREFIXES) {
      if (needle.includes(prefix)) return window;
    }
  }
  return AUTO_COMPACTION_FALLBACK_WINDOW_TOKENS;
}

/** Coarse character-based token estimate: ASCII ≈ 0.25 token, CJK/other ≈ 1. */
export function estimateTextTokens(text: string): number {
  let ascii = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 128) ascii += 1;
  }
  return Math.ceil(ascii / 4) + (text.length - ascii);
}

export function estimateHistoryTokens(history: ReadonlyArray<Pick<ChatMessage, 'content'>>): number {
  let total = 0;
  for (const message of history) {
    total += estimateTextTokens(message.content);
  }
  return total;
}

export type AutoCompactionSkipReason =
  | 'disabled'
  | 'ineligible-agent'
  | 'checkpoint-fetch-failed'
  | 'too-few-messages'
  | 'below-threshold';

export interface AutoCompactionDecision {
  shouldCompact: boolean;
  reason: 'eligible-threshold' | AutoCompactionSkipReason;
  /** Outgoing span after applying the checkpoint (or the full history). */
  span: ChatMessage[];
  checkpoint: ChatConversationCompaction | null;
  estimatedTokens: number;
  contextWindowTokens: number;
  thresholdTokens: number;
}

export interface AutoCompactionConfig {
  enabled: boolean;
  dryRun: boolean;
  /** Fraction of the model context window that arms auto-compaction. */
  ratio: number;
  /** Minimum outgoing turns before auto-compaction is considered. */
  minMessages: number;
}

export function resolveAutoCompactionConfig(): AutoCompactionConfig {
  const parsed = Number.parseFloat(
    process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO ?? '',
  );
  return {
    enabled: process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO !== '0',
    dryRun: process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN === '1',
    ratio: Number.isFinite(parsed)
      ? Math.min(0.95, Math.max(0.1, parsed))
      : AUTO_COMPACTION_DEFAULT_RATIO,
    minMessages: AUTO_COMPACTION_DEFAULT_MIN_MESSAGES,
  };
}

/**
 * Mirrors `sliceHistoryAfterCheckpoint` in providers/daemon.ts: everything at
 * or before `cutAtMessageId` is dropped; a checkpoint whose boundary is no
 * longer in the history is ignored rather than silently dropping turns.
 */
function spanAfterCheckpoint(
  history: ChatMessage[],
  checkpoint: ChatConversationCompaction | null,
): ChatMessage[] {
  if (!checkpoint) return history;
  const cutIndex = history.findIndex((m) => m.id === checkpoint.cutAtMessageId);
  if (cutIndex < 0) return history;
  return history.slice(cutIndex + 1);
}

export function computeAutoCompactionDecision(options: {
  agentId: string;
  model?: string | null;
  history: ChatMessage[];
  checkpoint: ChatConversationCompaction | null;
  /** Set when the checkpoint lookup failed; skip rather than guess. */
  checkpointUnavailable?: boolean;
  config: AutoCompactionConfig;
}): AutoCompactionDecision {
  const {
    agentId,
    model,
    history,
    checkpoint,
    checkpointUnavailable = false,
    config,
  } = options;
  const contextWindowTokens = resolveModelContextWindowTokens(agentId, model);
  const span = spanAfterCheckpoint(history, checkpoint);
  const estimatedTokens = estimateHistoryTokens(span);
  const thresholdTokens = Math.round(contextWindowTokens * config.ratio);

  let reason: AutoCompactionDecision['reason'];
  if (!config.enabled) {
    reason = 'disabled';
  } else if (checkpointUnavailable) {
    reason = 'checkpoint-fetch-failed';
  } else if (!COMPACTION_ELIGIBLE_AGENT_IDS.has(agentId)) {
    reason = 'ineligible-agent';
  } else if (span.length < config.minMessages) {
    reason = 'too-few-messages';
  } else if (estimatedTokens < thresholdTokens) {
    reason = 'below-threshold';
  } else {
    reason = 'eligible-threshold';
  }

  return {
    shouldCompact: reason === 'eligible-threshold',
    reason,
    span,
    checkpoint,
    estimatedTokens,
    contextWindowTokens,
    thresholdTokens,
  };
}

export interface AutoCompactionOutcome {
  compacted: boolean;
  dryRun: boolean;
  decision: AutoCompactionDecision;
  checkpoint?: ChatConversationCompaction;
}

/**
 * Evaluates and (when armed) runs auto-compaction for one outgoing API-mode
 * turn. Throws only when the compaction POST itself fails — the caller
 * surfaces it and proceeds with the full history; every decision-level skip
 * returns a plain outcome.
 */
export async function maybeAutoCompactConversation(options: {
  projectId: string;
  conversationId: string;
  agentId: string;
  model?: string | null;
  history: ChatMessage[];
  workspaceContext?: WorkspaceCollabContext | null;
  onProgress?: (stage: string, message?: string) => void;
}): Promise<AutoCompactionOutcome> {
  const config = resolveAutoCompactionConfig();

  let checkpoint: ChatConversationCompaction | null = null;
  let checkpointUnavailable = false;
  try {
    checkpoint = await fetchConversationCompaction(
      options.projectId,
      options.conversationId,
      options.workspaceContext,
    );
  } catch {
    checkpointUnavailable = true;
  }

  const decision = computeAutoCompactionDecision({
    agentId: options.agentId,
    model: options.model,
    history: options.history,
    checkpoint,
    checkpointUnavailable,
    config,
  });

  if (!decision.shouldCompact) {
    return { compacted: false, dryRun: false, decision };
  }
  if (config.dryRun) {
    return { compacted: false, dryRun: true, decision };
  }

  const fresh = await compactConversation(options.projectId, options.conversationId, {
    workspaceContext: options.workspaceContext,
    onProgress: options.onProgress,
  });
  return { compacted: true, dryRun: false, decision, checkpoint: fresh };
}
