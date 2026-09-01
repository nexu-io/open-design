/**
 * Compatibility export for daemon-local callers. The canonical deck scaffold
 * lives in contracts so classic, BYOK, and OD Next prompt paths cannot drift.
 */
export {
  DECK_FRAMEWORK_DIRECTIVE,
  DECK_SKELETON_HTML,
  renderDeckFrameworkDirective,
  renderLegacyDeckCompatibilityDirective,
} from '@open-design/contracts';
