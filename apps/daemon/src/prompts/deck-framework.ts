// Compatibility re-export: daemon and BYOK composers share one canonical
// deck skeleton and execution-profile-aware handoff directive.
export {
  DECK_DELIVERY_CONTRACT_DIRECTIVE,
  DECK_FRAMEWORK_DIRECTIVE,
  DECK_OUTCOME_RULES_DIRECTIVE,
  DECK_SKELETON_HTML,
  DECK_VNEXT_DIRECTIVE,
  DEFAULT_DECK_PROMPT_VARIANT,
  renderDeckFrameworkDirective,
  renderDeckPromptDirective,
  type DeckPromptVariant,
} from '@open-design/contracts';
