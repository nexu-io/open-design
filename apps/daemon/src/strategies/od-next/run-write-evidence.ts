import type Database from 'better-sqlite3';

import { runFilesWrittenForRun, type RunSideEffectLedger } from '../../runtimes/run-lifecycle-analytics.js';
import { getStrategyTaskExecutionByRunId, InvalidStrategyTaskRecordError } from '../task-store.js';
import { InvalidFrozenSkillPackageError } from './frozen-skill-package.js';
import { recordStrategyRunWriteEvidence, type StrategyWriteEvidenceSource } from './intent-resolution-store.js';

interface EvidenceRun {
  id: string;
  sideEffectLedger?: RunSideEffectLedger;
  events?: unknown;
  artifactOutcome?: {
    filesWritten?: number;
    filesWrittenUnknown?: boolean;
    filesWrittenSource?: StrategyWriteEvidenceSource;
  };
}

/** The legacy count alone does not establish that the filesystem was observed. */
export function strategyRunWriteEvidence(run: EvidenceRun): {
  filesWritten: number; filesWrittenUnknown: boolean; filesWrittenSource: StrategyWriteEvidenceSource;
} {
  const outcome = run.artifactOutcome;
  return {
    filesWritten: Math.max(outcome?.filesWritten ?? 0, runFilesWrittenForRun(run)),
    filesWrittenUnknown: outcome?.filesWrittenUnknown !== false,
    filesWrittenSource: outcome?.filesWrittenSource ?? 'unknown',
  };
}

/** Uses the same ledger and terminal outcome as the real run lifecycle callbacks. */
export function createStrategyRunWriteEvidenceRecorder(db: Database.Database) {
  const lastToolCount = new WeakMap<EvidenceRun, number>();
  const taskForRun = (runId: string) => {
    try { return getStrategyTaskExecutionByRunId(db, runId); }
    catch (error) {
      // A corrupt task has no trustworthy evidence owner. The lifecycle must
      // still persist its failure instead of throwing again while finishing.
      if (error instanceof InvalidStrategyTaskRecordError || error instanceof InvalidFrozenSkillPackageError) return null;
      throw error;
    }
  };
  return {
    observeToolStream(run: EvidenceRun): void {
      const filesWritten = runFilesWrittenForRun(run);
      if (filesWritten <= (lastToolCount.get(run) ?? 0)) return;
      const task = taskForRun(run.id);
      if (!task?.intentResolution) return;
      recordStrategyRunWriteEvidence(db, {
        taskExecutionId: task.taskExecutionId, runId: run.id,
        filesWritten, unknown: false, source: 'tool_stream',
      });
      lastToolCount.set(run, filesWritten);
    },
    finish(run: EvidenceRun): void {
      const task = taskForRun(run.id);
      if (!task?.intentResolution) return;
      const evidence = strategyRunWriteEvidence(run);
      recordStrategyRunWriteEvidence(db, {
        taskExecutionId: task.taskExecutionId, runId: run.id,
        filesWritten: evidence.filesWritten, unknown: evidence.filesWrittenUnknown,
        source: evidence.filesWrittenSource,
      });
    },
  };
}
