/**
 * @module mcp/agent-install
 * Plans and applies registration of the Open Design MCP server into external
 * coding agents' own configs (`od mcp install <agent>`). Owns the agent-slug
 * registry, the install-plan shapes (CLI / JSON / manual), and the JSON-config
 * apply/remove primitives. Pure planning logic; no sibling MCP imports.
 */
export * from './install.js';
