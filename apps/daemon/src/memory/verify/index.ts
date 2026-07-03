/** @module verify/index
 * Barrel for POST self-verify enforcement: the pure `enforceVerify` evaluator plus a
 * small ring buffer of recent verdicts (fed over the `verify` SSE channel). Programmatic
 * enforcement of the self-verify scorecard against active `rule` memories. May import
 * `core/` only.
 */

export type { ActiveRuleForVerify, EnforceVerifyInput } from './verify.js';
export {
  enforceVerify,
  recordVerify,
  listVerifications,
  removeVerification,
  clearVerifications,
  __resetVerificationsForTests,
} from './verify.js';
