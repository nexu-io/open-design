/**
 * @module codex/config
 *
 * Pre-launch normalization of the Codex CLI's `config.toml` (stale
 * `service_tier` values and nested `[features.*]` tables that would make the
 * CLI exit before processing a prompt).
 */

export {
  resolveCodexConfigPath,
  normalizeCodexConfigContent,
  normalizeCodexConfigFile,
} from './codex-config-normalize.js';
export type { CodexConfigIO } from './codex-config-normalize.js';
