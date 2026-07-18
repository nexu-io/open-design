/** @module agent-protocol/acp
 * Public barrel for the ACP (Agent Client Protocol) JSON-RPC subprocess
 * transport. Re-exports the surface consumed by runtime adapter definitions
 * (detectAcpModels, normalizeModels, ModelOption) and the daemon's
 * connection-test and chat-server entry points (attachAcpSession,
 * buildAcpSessionNewParams, AcpMcpServerInput).
 */
export { type AcpMcpServerInput, buildAcpSessionNewParams } from './session-params.js';
export { type ModelOption, normalizeModels, detectAcpModels } from './models.js';
export { attachAcpSession } from './session.js';
