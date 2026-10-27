import type Database from 'better-sqlite3';

import {
  getStrategyTaskExecution,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';

import {
  runIntakePreflight,
  type OdNextIntakePreflightInput,
} from './resolver.js';

type SqliteDb = Database.Database;

export class OdNextCoordinatorError extends Error {
  constructor(
    message: string,
    readonly reasonCodes: string[],
  ) {
    super(message);
    this.name = 'OdNextCoordinatorError';
  }
}

export interface OdNextCoordinatorResult {
  action:
    | 'running'
    | 'awaiting_clarification'
    | 'plan_ready'
    | 'completed'
    | 'blocked'
    | 'canceled';
  task: StrategyTaskExecutionRecord;
  visibleText: string;
  reasonCodes: string[];

}

function requireTask(db: SqliteDb, taskExecutionId: string): StrategyTaskExecutionRecord {
  const task = getStrategyTaskExecution(db, taskExecutionId);
  if (!task) {
    throw new OdNextCoordinatorError(
      `Unknown OD Next task execution ${taskExecutionId}.`,
      ['od_next_task_not_found'],
    );
  }
  return task;
}

export function prepareStrategyIntake(db: SqliteDb, input: {
  taskExecutionId: string;
  intake: OdNextIntakePreflightInput;
}): { ok: boolean; reasonCodes: string[] } {
  const current = requireTask(db, input.taskExecutionId);
  if (
    current.route !== null
    || current.inputStage !== 'request'
    || current.runs.length !== 1
  ) {
    throw new OdNextCoordinatorError(
      'OD Next routes each new logical task exactly once.',
      ['od_next_route_already_locked'],
    );
  }
  if (current.outcome !== 'running') {
    throw new OdNextCoordinatorError(
      'Only a running request can be routed.',
      ['od_next_task_not_running'],
    );
  }
  const { reasonCodes } = runIntakePreflight(input.intake);
  return { ok: reasonCodes.length === 0, reasonCodes };
}
