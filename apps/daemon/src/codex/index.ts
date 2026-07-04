/**
 * @module codex
 *
 * Public barrel for the Codex integration domain. Bundles the four independent
 * Codex-facing concerns behind one import surface:
 *
 * - `mcp`     — one-click install/uninstall of the OD MCP server into Codex.
 * - `config`  — pre-launch `config.toml` normalization.
 * - `pets`    — the hatch-pet registry and spritesheet serving.
 * - `rollout` — first-call cache-usage extraction from rollout JSONL.
 *
 * The concerns are mutually independent (a pure star); only the `core`
 * foundation (the Codex home resolver) is shared, and it is intentionally NOT
 * re-exported here — it is an internal domain primitive, not public surface.
 * External daemon code must import Codex functionality only from this barrel.
 */

// mcp — Codex CLI MCP install/uninstall
export {
  setCodexRunner,
  probeCodexInstall,
  installCodexMcp,
  uninstallCodexMcp,
} from './mcp/index.js';
export type {
  CodexRunner,
  CodexRunnerResult,
  CodexInstallStatus,
  CodexInstallSpec,
} from './mcp/index.js';

// config — config.toml normalization
export {
  resolveCodexConfigPath,
  normalizeCodexConfigContent,
  normalizeCodexConfigFile,
} from './config/index.js';
export type { CodexConfigIO } from './config/index.js';

// pets — hatch-pet registry
export {
  resolveCodexPetsRoot,
  listCodexPets,
  readCodexPetSpritesheet,
} from './pets/index.js';
export type {
  CodexPetSummaryRecord,
  CodexPetListResult,
} from './pets/index.js';

// rollout — first-call usage extraction
export {
  codexSessionIdFromRunEvents,
  extractCodexLastTurnFirstCallUsage,
  readCodexRolloutFirstCall,
} from './rollout/index.js';
