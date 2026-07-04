/**
 * @module codex/rollout
 *
 * Extracts the opening model call's cache-hit usage for a finished turn from a
 * Codex run's rollout JSONL, locating the rollout file under the Codex home
 * resolved via the domain foundation.
 */

export {
  codexSessionIdFromRunEvents,
  extractCodexLastTurnFirstCallUsage,
  readCodexRolloutFirstCall,
} from './codex-rollout-usage.js';
