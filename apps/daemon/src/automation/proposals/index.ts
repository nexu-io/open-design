/** @module proposals/index
 * Automation proposal lifecycle: create/list/get/apply/reject evolution proposals that
 * are persisted as memory entries. Reaches templates/ (declared edge) to materialize an
 * applied proposal into a user automation template.
 */

export {
  applyAutomationProposal,
  createAutomationProposal,
  getAutomationProposal,
  listAutomationProposals,
  rejectAutomationProposal,
} from './proposals.js';
