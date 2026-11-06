/** @module agent-protocol/pi-rpc
 * Barrel for the pi-rpc submodule. Re-exports the three public symbols:
 * `mapPiRpcEvent` (pure RPC-to-daemon event mapper), `attachPiRpcSession`
 * (session lifecycle), and `parsePiModels` (model list parser).
 */
export { mapPiRpcEvent } from './events.js';
export { attachPiRpcSession } from './session.js';
export { parsePiModels } from './models.js';
