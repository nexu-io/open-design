// Public API of the automations slice. The orchestrator (`TasksView`, which
// lives outside the slice) imports ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past it (ADR 0002).

// UI types the orchestrator's props are built from.
export type {
  AutomationModal,
  AutomationTemplate,
  AutomationTemplateKind,
  RoutineProjectSummary,
  TasksViewProps,
  TemplateFilter,
} from './types';

// Pure rules the orchestrator needs directly (kept public for the existing
// `sortRoutinesNewestFirst` unit-test import).
export { buildModalInitial, sortRoutinesNewestFirst } from './rules';

// Hooks (with their controller/options types) the orchestrator wires.
export {
  useWiredAutomationsDashboard,
  type AutomationsDashboardController,
  type UseAutomationsDashboardOptions,
} from './hooks/useAutomationsDashboard.hooks';

// Dumb components the orchestrator composes.
export { AutomationsHero } from './components/AutomationsHero';
export { AutomationsSavedSection } from './components/AutomationsSavedSection';
export { ProposalsSection } from './components/ProposalsSection';
export { TemplatesSection } from './components/TemplatesSection';
export { NewAutomationModal } from './components/NewAutomationModal';
