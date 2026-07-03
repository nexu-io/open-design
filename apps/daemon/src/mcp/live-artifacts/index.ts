/**
 * @module mcp/live-artifacts
 * The live-artifacts MCP tool surface an agent run exposes back to itself:
 * builds the tool schema (`createLiveArtifactsMcpTools`), handles requests
 * (`handleLiveArtifactsMcpRequest`), and runs the standalone server
 * (`runLiveArtifactsMcpServer`). Self-contained; no sibling MCP imports.
 */
export * from './server.js';
