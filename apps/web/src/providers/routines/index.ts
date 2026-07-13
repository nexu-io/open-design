// Public barrel for the routines/automations transport adapters. This folder
// is the one transport home for `/api/routines`, `/api/automation-templates`,
// `/api/automation-proposals`, and `/api/projects` (as consumed by the
// automations slice) — the automations slice's `dependencies.ts` is the only
// feature file allowed to import it.
export {
  fetchAutomationsSnapshot,
  runRoutineNow,
  toggleRoutinePaused,
  deleteRoutine,
  type AutomationsSnapshot,
  type RoutineProjectSummary,
  type RunRoutineResult,
} from './routines';
export { fetchRoutineRuns, crystallizeRoutineRun } from './runs';
export { reviewAutomationProposal } from './proposals';
export { createRoutine, updateRoutine } from './submit';
export { subscribeEscapeKey, lockBodyScroll, scheduleTimeout, confirmDialog } from './dom-bridge';
