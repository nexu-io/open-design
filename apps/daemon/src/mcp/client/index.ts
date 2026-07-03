/**
 * @module mcp/client
 * The stdio MCP server Open Design exposes to external coding agents
 * (`od mcp`). Implements the tool handlers (`get_artifact`, `get_file`,
 * `create_artifact`, project/context resolution, …) and the stdio transport
 * lifecycle (`runMcpStdio`). Depends only on the daemon HTTP API and
 * `mcp/core`; it does not import sibling MCP subdirectories.
 */
export * from './client.js';
