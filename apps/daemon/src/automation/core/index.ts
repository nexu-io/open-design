/** @module core/index
 * Foundation barrel: the automation domain's shared type vocabulary (routine scheduling
 * shapes and persistence/handler contracts). Every sibling subdirectory may import these
 * types directly; core itself imports no sibling subdirectory.
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
} from './types.js';
