/**
 * @module mcp/core
 * Foundation kernel for the MCP domain: the shared config schema and IO
 * (`config`), the OAuth 2.1 / PKCE client-credential flow (`oauth`), the
 * per-server token store (`tokens`), and the install-payload builder
 * (`install-info`). These are the pure, dependency-light primitives every other
 * MCP concern (client, agent-install, live-artifacts) and the daemon's routes
 * and runtime build on. `core` imports no sibling subdirectory.
 */
export * from './config.js';
export * from './oauth.js';
export * from './tokens.js';
export * from './install-info.js';
