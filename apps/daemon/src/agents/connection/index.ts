/**
 * @module agents/connection
 *
 * Agent connection testing: provider (BYOK API) and Local CLI adapter probes
 * used by Settings, plus the Copilot stream handler and Claude CLI failure
 * diagnostics those probes lean on. Reaches `core/` for the asset-URL guard
 * and the flat `acp`/`pi-rpc` protocol adapters as shared kernel.
 */
export * from './connection-test.js';
export * from './copilot-stream.js';
export * from './claude-diagnostics.js';
