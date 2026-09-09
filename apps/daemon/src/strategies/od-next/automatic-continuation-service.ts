import type {
  OpenDesignPlanContractV2,
  StrategyInputStageV2,
} from '@open-design/contracts';

import type { OdNextComplexRuntimeEvidence } from './complex-production.js';
import { resolveDaemonOwnedOdNextComplexRuntimeEvidence } from './complex-runtime-evidence.js';
import {
  resolveDaemonOwnedOdNextExecutionPreflight,
  type OdNextExecutionPreflightInput,
} from './resolver.js';

export type OdNextExecutionPreflightResolver = (input: {
  taskExecutionId: string;
  runId: string;
  agentId: string;
  productionRoutes: readonly string[];
  plan: OpenDesignPlanContractV2;
}) => OdNextExecutionPreflightInput | undefined | Promise<OdNextExecutionPreflightInput | undefined>;

export type OdNextComplexProductionResolver = (input: {
  phase: 'eligibility' | 'completion';
  taskExecutionId: string;
  runId: string;
  agentId: string;
  plan: OpenDesignPlanContractV2;
  runtimeCapabilitySnapshot?: unknown;
}) => OdNextComplexRuntimeEvidence | undefined | Promise<OdNextComplexRuntimeEvidence | undefined>;

interface AutomaticContinuationTask {
  taskExecutionId: string;
  strategyId: string;
  selectedAgentId: string;
  runs: Array<{
    runId: string;
    taskRunIndex: number;
    inputStage: StrategyInputStageV2;
  }>;
}

interface AutomaticContinuationRun {
  id: string;
  status: string;
  createdAt: number;
  events: Array<{ event: string; data: unknown; timestamp?: number }>;
  preflightAgentCliVersion?: string | null;
}

/**
 * Resolve daemon-owned execution and complex-runtime facts outside the HTTP /
 * process lifecycle. The caller retains cancellation and transition ordering;
 * this service owns capability selection only.
 */
export async function resolveAutomaticContinuationEvidence(input: {
  plan: OpenDesignPlanContractV2 | null | undefined;
  phase: 'eligibility' | 'completion';
  task: AutomaticContinuationTask;
  run: AutomaticContinuationRun;
  localSyntheticCanary: boolean;
  executionPreflightResolver?: OdNextExecutionPreflightResolver | null;
  complexProductionResolver?: OdNextComplexProductionResolver | null;
  runtimeCapabilitySnapshot?: unknown;
}): Promise<{
  executionPreflight?: OdNextExecutionPreflightInput;
  complexRuntimeEvidence?: OdNextComplexRuntimeEvidence;
}> {
  const { plan } = input;
  if (!plan) return {};

  const executionPreflight = input.executionPreflightResolver
    ? await input.executionPreflightResolver({
        taskExecutionId: input.task.taskExecutionId,
        runId: input.run.id,
        agentId: input.task.selectedAgentId,
        productionRoutes: plan.runManifest.productionRoutes,
        plan,
      })
    : input.task.strategyId === 'od-next-strategy' && input.localSyntheticCanary
      ? {
          productionRoutes: plan.runManifest.productionRoutes.map((id) => ({ id, available: true })),
          dependencies: [],
          inputs: [],
          renderers: [],
          exporters: [],
          templates: [],
          outputKinds: plan.taskProfile.requiredDeliverables.map((item) => ({
            id: item.kind,
            supported: true,
          })),
        }
      : input.task.strategyId === 'od-next-strategy'
        ? resolveDaemonOwnedOdNextExecutionPreflight(plan)
        : undefined;

  let complexRuntimeEvidence: OdNextComplexRuntimeEvidence | undefined;
  if (plan.fullPlan.executionMode === 'complex') {
    if (input.complexProductionResolver) {
      complexRuntimeEvidence = await input.complexProductionResolver({
        phase: input.phase,
        taskExecutionId: input.task.taskExecutionId,
        runId: input.run.id,
        agentId: input.task.selectedAgentId,
        plan,
        runtimeCapabilitySnapshot: input.runtimeCapabilitySnapshot,
      });
    } else {
      const mapping = input.task.runs.find((candidate) => candidate.runId === input.run.id);
      if (mapping) {
        complexRuntimeEvidence = resolveDaemonOwnedOdNextComplexRuntimeEvidence({
          phase: input.phase,
          taskExecutionId: input.task.taskExecutionId,
          runId: input.run.id,
          taskRunIndex: mapping.taskRunIndex,
          stage: mapping.inputStage,
          agentId: input.task.selectedAgentId,
          capabilitySnapshot: input.runtimeCapabilitySnapshot,
          plan,
          run: {
            status: input.run.status,
            createdAt: input.run.createdAt,
            updatedAt: Date.now(),
            events: input.run.events,
          },
        });
      }
    }
  }
  return {
    ...(executionPreflight ? { executionPreflight } : {}),
    ...(complexRuntimeEvidence ? { complexRuntimeEvidence } : {}),
  };
}
