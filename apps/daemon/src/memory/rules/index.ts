/** @module rules/index
 * Barrel for annotation → rule-proposal distillation: parses a rule body and turns a
 * batch of canvas/deck annotations into display-only `RuleProposalDraft`s (heuristic
 * pass plus a best-effort LLM generalisation). Never writes a rule on its own. May
 * import the `llm/` barrel.
 */

export type { DistillResult } from './rules.js';
export { parseRuleBody, distillRulesFromAnnotations } from './rules.js';
