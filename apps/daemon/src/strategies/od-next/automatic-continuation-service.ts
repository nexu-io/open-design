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

/**
 * Machine-block delimiting failures the protocol stream could not resolve. The
 * stream suppresses these bodies rather than emitting them, so they are the
 * only codes that describe a machine-contract boundary failure rather than one
 * agent turn being non-compliant.
 */
const MACHINE_CONTRACT_BOUNDARY_CODES = new Set([
  'od_next_protocol_machine_block_malformed',
  'od_next_protocol_machine_block_too_large',
]);

/**
 * Map one blocked task to the rollout stop signal it justifies, if any.
 *
 * A stop latch disables OD Next for the whole daemon instance and survives
 * restart, so only a failure of the machine contract itself may raise one. An
 * agent turn that omits, duplicates, or mis-populates a machine block is a
 * per-task defect: it is already fail-closed for that task, its reason codes
 * are persisted for attribution, and it must not silently return every later
 * request in the daemon to the legacy path.
 */
export function rolloutStopSignalForBlockedContinuation(
  reasonCodes: readonly string[],
): 'route_mode_drift' | 'machine_contract_leak' | 'complex_child_unverified' | null {
  if (reasonCodes.some((code) => (
    code.includes('route_mismatch') || code.includes('execution_mode_mismatch')
  ))) return 'route_mode_drift';
  if (reasonCodes.some((code) => MACHINE_CONTRACT_BOUNDARY_CODES.has(code))) {
    return 'machine_contract_leak';
  }
  // Child evidence deliberately raises nothing.
  //
  // The other two signals mean OD Next's own contract broke, which is true
  // whichever agent hit it, so disabling the strategy daemon-wide is
  // proportionate. Unverifiable Children are a property of ONE runtime — Vela
  // ships no child-lifecycle producer today, so an AMR complex Run cannot be
  // certified at all — and the task is already fail-closed with its reason
  // codes persisted. Latching there took OD Next away from Codex, Claude and
  // OpenCode because a fourth runtime lacks a capability, recoverable only by
  // an operator `od strategy rollout reset`. `complex_child_unverified` stays
  // in the reason-code union so daemons already holding that latch, and the
  // records that explain them, keep parsing.
  return null;
}
