import { detectAcpModels } from '../../agent-protocol/index.js';
import { parsePiModels } from '../../agent-protocol/index.js';
import { execAgentFile } from '../invocation.js';
import { DEFAULT_MODEL_OPTION } from '../models.js';
import type { RuntimeModelOption } from '../types.js';

export { detectAcpModels, parsePiModels, execAgentFile, DEFAULT_MODEL_OPTION };

export function clampCodexReasoning(
  modelId: string | null | undefined,
  effort: string | null | undefined,
) {
  if (!effort) return effort;
  const raw = String(modelId ?? '').trim();
  const id = raw.includes('/') ? raw.split('/').pop() : raw;
  const isGpt5LateFamily =
    !id ||
    id === 'default' ||
    id.startsWith('gpt-5.2') ||
    id.startsWith('gpt-5.3') ||
    id.startsWith('gpt-5.4') ||
    id.startsWith('gpt-5.5');
  if (isGpt5LateFamily && effort === 'minimal') return 'low';
  if (id === 'gpt-5.1' && effort === 'xhigh') return 'high';
  if (id === 'gpt-5.1-codex-mini') {
    return effort === 'high' || effort === 'xhigh' ? 'high' : 'medium';
  }
  return effort;
}

// Per-model support matrix for the Claude Code CLI's `--effort` flag.
// Sonnet 5 / Opus 4.8 / Opus 4.7 / Fable 5 support the full
// low|medium|high|xhigh|max range. The prior generation — Sonnet 4.6 /
// Opus 4.6 — supports everything except `xhigh`. Unknown/omitted/aliased
// model ids (e.g. 'default', 'sonnet', 'opus') are treated as the current
// (full-range) generation rather than clamped, mirroring how
// clampCodexReasoning treats an unset model id as the newest family.
const CLAUDE_NO_XHIGH_MODEL_IDS = new Set([
  'claude-sonnet-4-6',
  'claude-sonnet-4.6',
  'sonnet-4-6',
  'sonnet-4.6',
  'claude-opus-4-6',
  'claude-opus-4.6',
  'opus-4-6',
  'opus-4.6',
]);

export function clampClaudeReasoning(
  modelId: string | null | undefined,
  effort: string | null | undefined,
) {
  if (!effort) return effort;
  const raw = String(modelId ?? '').trim().toLowerCase();
  const id = raw.includes('/') ? raw.split('/').pop() : raw;
  if (effort === 'xhigh' && id && CLAUDE_NO_XHIGH_MODEL_IDS.has(id)) {
    return 'high';
  }
  return effort;
}

// Parse one-id-per-line stdout from `<cli> models` and prepend the synthetic
// default option. Used by opencode / cursor-agent.
export function parseLineSeparatedModels(stdout: string): RuntimeModelOption[] {
  const ids = String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  // De-dupe while preserving order — some CLIs print near-duplicates.
  const seen = new Set();
  const out = [DEFAULT_MODEL_OPTION];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id });
  }
  return out;
}
