/** @module agent-protocol/core
 * Foundation barrel for the agent-protocol module. Re-exports the shared
 * JSON-line stream parser consumed by every protocol adapter (acp/, pi-rpc/).
 */
export { createJsonLineStream } from './json-line-stream.js';
