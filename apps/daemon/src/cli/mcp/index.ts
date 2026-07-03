// @ts-nocheck
/** @module cli/mcp
 * Barrel for the MCP domain: re-exports `runMcp` (server lifecycle) and `runMcpInstall` (agent config wiring) to the root dispatcher.
 * MCP commands manage the daemon's stdio MCP server and its integration into coding agent configs.
 */
export * from './install.js';
export * from './mcp.js';
