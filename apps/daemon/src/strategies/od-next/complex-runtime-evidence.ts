import {
  OdNextRuntimeCapabilitySnapshotV1Schema,
  type OpenDesignPlanContractV2,
  type StrategyInputStageV2,
} from '@open-design/contracts';

import { buildStructuredMainRunObservationV1 } from '../../observability/main-run-observation.js';
import { adaptRuntimeChildObservationsV1 } from '../../observability/runtime-child-observations.js';
import { strategyTaskRunObservationId } from '../../observability/task-observation-aggregation.js';
import {
  hashOdNextRuntimeCapabilitySnapshotV1,
} from '../../runtimes/od-next-capability-gate.js';
import type { OdNextComplexRuntimeEvidence } from './complex-production.js';

interface ComplexRunEvidenceInput {
  phase: 'eligibility' | 'completion';
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  stage: StrategyInputStageV2;
  agentId: string;
  capabilitySnapshot: unknown;
  plan: OpenDesignPlanContractV2;
  run: {
    status: string;
    createdAt: number;
    updatedAt: number;
    events: Array<{ event: string; data: unknown; timestamp?: number }>;
  };
}

/** Build complex evidence only from the admission-frozen capability snapshot. */
export function resolveDaemonOwnedOdNextComplexRuntimeEvidence(
  input: ComplexRunEvidenceInput,
): OdNextComplexRuntimeEvidence | undefined {
  const parsed = OdNextRuntimeCapabilitySnapshotV1Schema.safeParse(
    input.capabilitySnapshot,
  );
  if (!parsed.success || parsed.data.agentId !== input.agentId) return undefined;
  const { snapshotHash, ...withoutHash } = parsed.data;
  if (hashOdNextRuntimeCapabilitySnapshotV1(withoutHash) !== snapshotHash) {
    return undefined;
  }
  const capabilitySnapshot = parsed.data;
  if (input.phase === 'eligibility') {
    return { capabilitySnapshot };
  }
  const taskRunObservationId = strategyTaskRunObservationId(
    input.taskExecutionId,
    input.runId,
  );
  const rootInput = {
    taskExecutionId: input.taskExecutionId,
    runId: input.runId,
    taskRunIndex: input.taskRunIndex,
    stage: input.stage,
    startedAtMs: input.run.createdAt,
    ...(capabilitySnapshot.agentCliVersion
      ? { agentCliVersion: capabilitySnapshot.agentCliVersion }
      : {}),
    ...(capabilitySnapshot.runtimeCompanionName
      ? { runtimeCompanionName: capabilitySnapshot.runtimeCompanionName }
      : {}),
    ...(capabilitySnapshot.runtimeCompanionVersion
      ? { runtimeCompanionVersion: capabilitySnapshot.runtimeCompanionVersion }
      : {}),
    runtimeAdapterVersion: capabilitySnapshot.runtimeAdapterVersion,
  };
  const running = buildStructuredMainRunObservationV1({
    ...rootInput,
    status: 'running',
  });
  const children = adaptRuntimeChildObservationsV1({
    events: input.run.events,
    taskExecutionId: input.taskExecutionId,
    runId: input.runId,
    taskRunIndex: input.taskRunIndex,
    taskRunObservationId,
    stage: input.stage,
    ...(capabilitySnapshot.agentCliVersion
      ? { agentCliVersion: capabilitySnapshot.agentCliVersion }
      : {}),
    ...(capabilitySnapshot.runtimeCompanionVersion
      ? { runtimeCompanionVersion: capabilitySnapshot.runtimeCompanionVersion }
      : {}),
  });
  const completed = buildStructuredMainRunObservationV1({
    ...rootInput,
    status: 'completed',
    endedAtMs: input.run.updatedAt,
  });
  return {
    capabilitySnapshot,
    observations: [running, ...children, completed],
    taskRunObservationId,
  };
}
