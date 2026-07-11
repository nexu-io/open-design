/** @module agent-protocol
 * ACP and pi RPC subprocess protocol adapters, sharing a JSON-line-stream
 * transport from core/. External daemon code imports only from this barrel.
 */
export { createJsonLineStream } from './core/index.js';
export {
  type AcpMcpServerInput,
  type ModelOption,
  buildAcpSessionNewParams,
  normalizeModels,
  detectAcpModels,
  attachAcpSession,
} from './acp/index.js';
export { mapPiRpcEvent, attachPiRpcSession, parsePiModels } from './pi-rpc/index.js';
