import { detectAcpModels } from '../../agent-protocol/index.js';
import { parsePiModels } from '../../agent-protocol/index.js';
import { execAgentFile } from '../invocation.js';
import { DEFAULT_MODEL_OPTION } from '../models.js';
import type { RuntimeModelOption } from '../types.js';

export { detectAcpModels, parsePiModels, execAgentFile, DEFAULT_MODEL_OPTION };

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
