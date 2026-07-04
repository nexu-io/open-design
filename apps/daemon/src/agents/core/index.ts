/**
 * @module agents/core
 *
 * Foundation kernel for the agents domain. Holds the SSRF asset-URL guard that
 * both `connection/` (the CLI-agent media path) and `byok/` (chat-tool
 * downloads) depend on. Imports no sibling subdir — every other concern may
 * import `core/` directly.
 */
export * from './asset-url-guard.js';
