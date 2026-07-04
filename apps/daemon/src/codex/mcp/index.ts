/**
 * @module codex/mcp
 *
 * One-click install / uninstall of the Open Design MCP server into the Codex
 * CLI, shelling out to `codex mcp add|remove|get` so Codex owns the config
 * merge/validation. Self-contained; does not depend on the domain foundation.
 */

export {
  setCodexRunner,
  probeCodexInstall,
  installCodexMcp,
  uninstallCodexMcp,
} from './codex-cli.js';
export type {
  CodexRunner,
  CodexRunnerResult,
  CodexInstallStatus,
  CodexInstallSpec,
} from './codex-cli.js';
