/** @module automation/index
 * Public API for the automation domain: routine scheduling, automation templates,
 * evolution proposals, and the source / routine-run ingestion pipeline. This barrel is
 * the only entry point external (runtime) code may import; it re-exports named symbols
 * from the subdirectory barrels and never from a private file. Keep the export list
 * explicit — it is the reviewable public surface.
 */

export type {
  Routine,
  RoutineContextSelection,
  RoutinePersistence,
  RoutineProjectTarget,
  RoutineRun,
  RoutineRunCompletion,
  RoutineRunHandler,
  RoutineRunHandlerStart,
  RoutineRunStatus,
  RoutineRunTrigger,
  RoutineSchedule,
  Weekday,
} from './core/index.js';

export {
  isValidTimezone,
  isValidWallTime,
  nextHourlyRunAt,
  nextRunAtForSchedule,
  RoutineService,
  validateSchedule,
  validateTarget,
} from './routines/index.js';

export {
  BUILT_IN_AUTOMATION_TEMPLATES,
  getAnyAutomationTemplate,
  getAutomationTemplate,
  listAllAutomationTemplates,
  listAutomationTemplates,
  normalizeAutomationTemplate,
  upsertUserAutomationTemplate,
} from './templates/index.js';

export {
  applyAutomationProposal,
  createAutomationProposal,
  getAutomationProposal,
  listAutomationProposals,
  rejectAutomationProposal,
} from './proposals/index.js';

export {
  automationTemplateIdFromRoutinePrompt,
  getAutomationSourcePacket,
  ingestAutomationSource,
  ingestRoutineConnectorEvolution,
  listAutomationSourcePackets,
} from './ingestion/index.js';
