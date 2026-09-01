import { z } from 'zod';

export const OD_NEXT_STRATEGY_ID = 'od-next-strategy' as const;
export const OD_NEXT_PROMPT_RECIPE_ID = 'od-next-plan-build-v2' as const;
export const OD_NEXT_APPLIED_STRATEGY_SCHEMA = 'open-design.applied-strategy/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_SCHEMA = 'open-design.plan-contract/v2' as const;
export const OD_NEXT_RUNTIME_STATE_SCHEMA = 'open-design.strategy-state/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_BLOCK = 'open-design-plan-contract' as const;
export const OD_NEXT_RUNTIME_STATE_BLOCK = 'open-design-runtime-state' as const;
export const OD_NEXT_BUNDLED_STRATEGY_SCHEMA = 'open-design.bundled-strategy/v2' as const;

export const StrategyTaskTypeV2Schema = z.enum([
  'prototype',
  'ppt',
  'marketing',
  'hyperframes',
  'generic',
]);
export type StrategyTaskTypeV2 = z.infer<typeof StrategyTaskTypeV2Schema>;

export const StrategyInputStageV2Schema = z.enum([
  'request',
  'clarification',
  'contract_repair',
  'production',
]);
export type StrategyInputStageV2 = z.infer<typeof StrategyInputStageV2Schema>;

export const StrategyRouteV2Schema = z.enum(['direct_edit', 'full_plan']);
export type StrategyRouteV2 = z.infer<typeof StrategyRouteV2Schema>;

export const StrategyExecutionModeV2Schema = z.enum(['simple', 'complex']);
export type StrategyExecutionModeV2 = z.infer<typeof StrategyExecutionModeV2Schema>;

export const StrategyOutcomeV2Schema = z.enum([
  'clarification_required',
  'plan_ready',
  'completed',
  'blocked',
  'canceled',
]);
export type StrategyOutcomeV2 = z.infer<typeof StrategyOutcomeV2Schema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeAssetPathSchema = z.string().min(1).refine(
  (path) => path.startsWith('./') && !path.includes('..'),
  { message: 'Strategy asset paths must be plugin-relative and may not traverse upward.' },
);

const forbiddenStrategyKeys = new Set([
  'acceptance',
  'acceptanceChecklist',
  'artifactRepair',
  'candidateEvidenceBundle',
  'completionGate',
  'critique',
  'evidencePlan',
  'finalEvidenceBundle',
  'judge',
  'judgeReport',
  'needs_repair',
  'qualityGate',
  'qualityScore',
  'repairAttempts',
  'repairPerformed',
  'repairRequired',
  'repaired_unverified',
  'repeat',
  'revalidation',
]);

function findForbiddenStrategyKey(
  value: unknown,
  path: Array<string | number> = [],
): { key: string; path: Array<string | number> } | undefined {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const found = findForbiddenStrategyKey(child, [...path, index]);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenStrategyKeys.has(key)) return { key, path: [...path, key] };
    const found = findForbiddenStrategyKey(child, [...path, key]);
    if (found) return found;
  }
  return undefined;
}

function rejectForbiddenStrategySemantics(
  value: unknown,
  context: z.RefinementCtx,
): void {
  const found = findForbiddenStrategyKey(value);
  if (!found) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: found.path,
    message: `OD Next V2 does not allow post-Build field "${found.key}".`,
  });
}

const StrategyAssetDeclarationV2Schema = z.object({
  path: relativeAssetPathSchema,
  version: z.string().min(1),
}).strict();

const StrategyTaskProfileAssetDeclarationV2Schema = StrategyAssetDeclarationV2Schema.extend({
  taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  rollout: z.enum(['active', 'reserved']),
  projectKinds: z.array(z.string().min(1)).min(1),
  /**
   * Non-prompt files the task profile ships alongside its rule card — for
   * example the handheld device shells the prototype profile stages into the
   * project directory. They enter the package identity with the profile that
   * declares them, so a shell edit changes the package hash exactly like a
   * rule-card edit does, and they are never concatenated into the prompt head.
   */
  resources: z.array(StrategyAssetDeclarationV2Schema).optional(),
}).strict().superRefine((value, context) => {
  const paths = (value.resources ?? []).map((resource) => resource.path);
  if (new Set(paths).size !== paths.length || paths.includes(value.path)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resources'],
      message: 'Task profile resources must have unique paths distinct from the profile itself.',
    });
  }
});

export const BundledStrategyDeclarationV2Schema = z.object({
  schema: z.literal(OD_NEXT_BUNDLED_STRATEGY_SCHEMA),
  id: z.literal(OD_NEXT_STRATEGY_ID),
  promptRecipe: z.literal(OD_NEXT_PROMPT_RECIPE_ID),
  assets: z.object({
    core: StrategyAssetDeclarationV2Schema,
    orchestration: StrategyAssetDeclarationV2Schema,
    taskProfiles: z.array(StrategyTaskProfileAssetDeclarationV2Schema).length(4),
    taskProfileMapping: StrategyAssetDeclarationV2Schema,
  }).strict(),
}).strict().superRefine((value, context) => {
  const taskTypes = value.assets.taskProfiles.map((profile) => profile.taskType);
  if (new Set(taskTypes).size !== taskTypes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assets', 'taskProfiles'],
      message: 'Each declared strategy task profile must have a unique taskType.',
    });
  }
});
export type BundledStrategyDeclarationV2 = z.infer<typeof BundledStrategyDeclarationV2Schema>;

const StrategyAssetDigestV2Schema = z.object({
  path: relativeAssetPathSchema,
  sha256: sha256Schema,
}).strict();

const SelectedStrategyTaskProfileV2Schema = z.object({
  taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  version: z.string().min(1),
  path: relativeAssetPathSchema,
  sha256: sha256Schema,
}).strict();

export const AppliedStrategyBindingV2Schema = z.object({
  schema: z.literal(OD_NEXT_APPLIED_STRATEGY_SCHEMA),
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  assetDigests: z.array(StrategyAssetDigestV2Schema).min(1),
  selectedTaskProfile: SelectedStrategyTaskProfileV2Schema,
  taskProfileVersions: z.array(z.string().min(1)).min(1),
  promptRecipe: z.literal(OD_NEXT_PROMPT_RECIPE_ID),
}).strict().superRefine((value, context) => {
  const paths = value.assetDigests.map((asset) => asset.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assetDigests'],
      message: 'Applied strategy asset paths must be unique.',
    });
  }
  const sortedPaths = [...paths].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assetDigests'],
      message: 'Applied strategy asset digests must use stable path order.',
    });
  }
  const selectedDigest = value.assetDigests.find(
    (asset) => asset.path === value.selectedTaskProfile.path,
  );
  if (selectedDigest?.sha256 !== value.selectedTaskProfile.sha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedTaskProfile'],
      message: 'Selected task profile digest must match the package asset roster.',
    });
  }
  if (!value.taskProfileVersions.includes(value.selectedTaskProfile.version)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskProfileVersions'],
      message: 'Selected task profile version must be recorded in taskProfileVersions.',
    });
  }
});
export type AppliedStrategyBindingV2 = z.infer<typeof AppliedStrategyBindingV2Schema>;

const CanonicalDeliverableV2Schema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  format: z.string().min(1),
}).strict();

const RequiredDeliverableV2Schema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  derivesFrom: z.string().min(1).optional(),
}).strict();

export const ResolvedTaskProfileV2Schema = z.object({
  schemaVersion: z.literal('2'),
  taskType: StrategyTaskTypeV2Schema,
  taskProfileVersion: z.string().min(1),
  goal: z.string().min(1),
  contextAndAudience: z.string().min(1),
  inputsAndReferences: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  canonicalDeliverable: CanonicalDeliverableV2Schema,
  requiredDeliverables: z.array(RequiredDeliverableV2Schema).min(1),
  designSpec: z.object({
    source: z.enum(['existing-artifact', 'brand', 'resolved-baseline']),
    version: z.string().min(1),
    decisions: z.record(z.unknown()),
  }).strict(),
  buildRequirements: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
  }).strict()),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  taskSpecific: z.record(z.unknown()),
}).strict().superRefine((value, context) => {
  rejectForbiddenStrategySemantics(value, context);

  const deliverableIds = value.requiredDeliverables.map((deliverable) => deliverable.id);
  if (new Set(deliverableIds).size !== deliverableIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredDeliverables'],
      message: 'Required deliverable ids must be unique.',
    });
  }
  if (!deliverableIds.includes(value.canonicalDeliverable.id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredDeliverables'],
      message: 'The canonical deliverable must be part of requiredDeliverables.',
    });
  }
  const requirementIds = value.buildRequirements.map((requirement) => requirement.id);
  if (new Set(requirementIds).size !== requirementIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildRequirements'],
      message: 'Build requirement ids must be unique.',
    });
  }
});
export type ResolvedTaskProfileV2 = z.infer<typeof ResolvedTaskProfileV2Schema>;

const FullPlanStepV2Schema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  outputs: z.array(z.string().min(1)).min(1),
  dependsOn: z.array(z.string().min(1)).optional(),
}).strict();

const ReadinessArtifactV2Schema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  digest: sha256Schema,
}).strict();

const BuildPackageV2Schema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  inputs: z.array(z.string().min(1)),
  outputs: z.array(z.string().min(1)).min(1),
  sharedConstraints: z.array(z.string().min(1)).min(1),
  dependsOn: z.array(z.string().min(1)),
  allowedResources: z.array(z.string().min(1)),
}).strict();

function validateDependencyGraph(
  entries: Array<{ id: string; dependsOn?: string[] | undefined }>,
  path: string,
  context: z.RefinementCtx,
): void {
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: `${path} ids must be unique.`,
    });
    return;
  }
  const knownIds = new Set(ids);
  const dependencies = new Map(
    entries.map((entry) => [entry.id, entry.dependsOn ?? []]),
  );
  for (const [id, refs] of dependencies) {
    for (const ref of refs) {
      if (!knownIds.has(ref)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${id} depends on unknown ${path} id ${ref}.`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (knownIds.has(dependency) && hasCycle(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (ids.some(hasCycle)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: `${path} dependencies must be acyclic.`,
    });
  }
}

export const FullPlanV2Schema = z.object({
  executionMode: StrategyExecutionModeV2Schema,
  steps: z.array(FullPlanStepV2Schema).min(1),
  readinessArtifacts: z.array(ReadinessArtifactV2Schema),
  buildPackages: z.array(BuildPackageV2Schema),
}).strict().superRefine((value, context) => {
  rejectForbiddenStrategySemantics(value, context);
  if (value.executionMode === 'simple' && value.buildPackages.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildPackages'],
      message: 'Simple plans may not declare Build Packages.',
    });
  }
  if (value.executionMode === 'complex' && value.buildPackages.length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildPackages'],
      message: 'Complex plans require at least two Build Packages.',
    });
  }
  if (value.executionMode === 'complex') {
    const outputOwners = new Map<string, string>();
    for (const [index, buildPackage] of value.buildPackages.entries()) {
      const localOutputs = new Set<string>();
      for (const output of buildPackage.outputs) {
        if (localOutputs.has(output)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['buildPackages', index, 'outputs'],
            message: `Build Package ${buildPackage.id} outputs must be unique.`,
          });
        }
        localOutputs.add(output);
        const owner = outputOwners.get(output);
        if (owner && owner !== buildPackage.id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['buildPackages', index, 'outputs'],
            message: `Build output ${output} is already owned by Build Package ${owner}.`,
          });
        } else {
          outputOwners.set(output, buildPackage.id);
        }
      }
    }
  }
  validateDependencyGraph(value.steps, 'steps', context);
  validateDependencyGraph(value.buildPackages, 'buildPackages', context);
});
export type FullPlanV2 = z.infer<typeof FullPlanV2Schema>;

const PlanContractStrategyIdentityV2Schema = z.object({
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  snapshotId: z.string().min(1),
}).strict();

export const OpenDesignPlanContractV2Schema = z.object({
  schema: z.literal(OD_NEXT_PLAN_CONTRACT_SCHEMA),
  strategy: PlanContractStrategyIdentityV2Schema,
  taskProfile: ResolvedTaskProfileV2Schema,
  fullPlan: FullPlanV2Schema,
  runManifest: z.object({
    selectedAgentId: z.string().min(1),
    capabilitySnapshotHash: sha256Schema,
    inputRefs: z.array(z.string().min(1)),
    baselineArtifactRef: z.string().min(1).optional(),
    productionRoutes: z.array(z.string().min(1)).min(1),
    preflight: z.object({
      intake: z.literal('passed'),
      execution: z.literal('passed'),
    }).strict(),
  }).strict(),
  decisionSummary: z.object({
    goal: z.string().min(1),
    deliverables: z.array(z.string().min(1)).min(1),
    keyConstraints: z.array(z.string()),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
    openDecisions: z.array(z.string()),
  }).strict(),
}).strict().superRefine(rejectForbiddenStrategySemantics);
export type OpenDesignPlanContractV2 = z.infer<typeof OpenDesignPlanContractV2Schema>;

export const StrategyRuntimeStateV2Schema = z.object({
  schema: z.literal(OD_NEXT_RUNTIME_STATE_SCHEMA),
  route: StrategyRouteV2Schema,
  inputStage: StrategyInputStageV2Schema,
  outcome: StrategyOutcomeV2Schema,
  executionMode: StrategyExecutionModeV2Schema.nullable(),
  reasonCodes: z.array(z.string().min(1)),
}).strict().superRefine((value, context) => {
  rejectForbiddenStrategySemantics(value, context);

  if (value.route === 'direct_edit') {
    if (value.inputStage !== 'request') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputStage'],
        message: 'Direct Edit is confined to the request stage.',
      });
    }
    if (value.executionMode !== 'simple') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionMode'],
        message: 'Direct Edit always uses simple execution.',
      });
    }
    if (!['completed', 'blocked', 'canceled'].includes(value.outcome)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'Direct Edit must finish in the request stage.',
      });
    }
    return;
  }

  if (value.inputStage === 'production') {
    if (value.executionMode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionMode'],
        message: 'Production requires a locked execution mode.',
      });
    }
    if (!['completed', 'blocked', 'canceled'].includes(value.outcome)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'Production must report a task-chain terminal outcome.',
      });
    }
  } else if (value.inputStage === 'clarification') {
    if (!['plan_ready', 'blocked', 'canceled'].includes(value.outcome)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'Clarification cannot request another clarification round.',
      });
    }
  } else if (value.inputStage === 'contract_repair') {
    if (value.executionMode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionMode'],
        message: 'Contract repair preserves an already-locked execution mode.',
      });
    }
    if (!['plan_ready', 'blocked', 'canceled'].includes(value.outcome)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'Contract repair only serializes a plan or stops the task.',
      });
    }
  } else {
    if (!['clarification_required', 'plan_ready', 'blocked', 'canceled'].includes(value.outcome)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'A Full Plan request cannot complete before Production.',
      });
    }
    if (value.outcome === 'clarification_required' && value.executionMode !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionMode'],
        message: 'Execution mode is not locked before clarification is resolved.',
      });
    }
  }

  if (value.outcome === 'plan_ready' && value.executionMode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionMode'],
      message: 'A plan-ready state requires a locked execution mode.',
    });
  }
});
export type StrategyRuntimeStateV2 = z.infer<typeof StrategyRuntimeStateV2Schema>;

const StrategyRuntimeTransitionEndpointV2Schema = z.object({
  route: StrategyRouteV2Schema,
  inputStage: StrategyInputStageV2Schema,
  executionMode: StrategyExecutionModeV2Schema.nullable(),
}).strict();

const allowedStageTransitions = new Set([
  'request:clarification',
  'request:contract_repair',
  'request:production',
  'clarification:contract_repair',
  'clarification:production',
  'contract_repair:production',
]);

export const StrategyRuntimeTransitionV2Schema = z.object({
  from: StrategyRuntimeTransitionEndpointV2Schema,
  to: StrategyRuntimeTransitionEndpointV2Schema,
}).strict().superRefine((value, context) => {
  if (value.from.route !== value.to.route) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'route'],
      message: 'Strategy route is locked for the task chain.',
    });
  }
  if (value.from.route === 'direct_edit') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'inputStage'],
      message: 'Direct Edit does not continue into another physical stage.',
    });
  }
  if (!allowedStageTransitions.has(`${value.from.inputStage}:${value.to.inputStage}`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'inputStage'],
      message: 'Illegal OD Next physical-stage transition.',
    });
  }
  if (value.to.inputStage === 'clarification' && value.to.executionMode !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'executionMode'],
      message: 'Execution mode remains unlocked when entering clarification.',
    });
  }
  if (value.to.inputStage === 'contract_repair') {
    if (value.from.executionMode === null || value.to.executionMode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to', 'executionMode'],
        message: 'Contract repair requires the previously locked execution mode.',
      });
    }
  }
  if (
    value.from.inputStage === 'contract_repair'
    && value.from.executionMode === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['from', 'executionMode'],
      message: 'Contract repair cannot continue without its locked execution mode.',
    });
  }
  if (
    value.from.executionMode !== null
    && value.from.executionMode !== value.to.executionMode
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'executionMode'],
      message: 'Execution mode is locked once selected.',
    });
  }
  if (value.to.inputStage === 'production' && value.to.executionMode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to', 'executionMode'],
      message: 'Production requires a locked execution mode.',
    });
  }
});
export type StrategyRuntimeTransitionV2 = z.infer<typeof StrategyRuntimeTransitionV2Schema>;

export const CapabilitySupportV2Schema = z.enum([
  'unsupported',
  'unknown',
  'advertised',
  'verified',
]);
export type CapabilitySupportV2 = z.infer<typeof CapabilitySupportV2Schema>;

export const AgentCapabilitySnapshotV2Schema = z.object({
  agentId: z.string().min(1),
  agentVersion: z.string().min(1).optional(),
  nativeSessionContinuation: CapabilitySupportV2Schema,
  nativeSubagents: z.object({
    support: CapabilitySupportV2Schema,
    evidenceLevel: z.enum(['unavailable', 'tool_only', 'structured']),
    source: z.string().min(1),
  }).strict(),
  capturedAt: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (
    value.nativeSubagents.support === 'verified'
    && value.nativeSubagents.evidenceLevel !== 'structured'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nativeSubagents', 'evidenceLevel'],
      message: 'Verified native Subagents require structured lifecycle evidence.',
    });
  }
});
export type AgentCapabilitySnapshotV2 = z.infer<typeof AgentCapabilitySnapshotV2Schema>;

export const ChildAgentEvidenceV2Schema = z.object({
  childId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  state: z.enum(['started', 'completed', 'failed']),
  source: z.string().min(1),
  sourceEventType: z.string().min(1),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, context) => {
  if (
    value.startedAt !== undefined
    && value.endedAt !== undefined
    && value.endedAt < value.startedAt
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endedAt'],
      message: 'Child terminal time may not precede its start time.',
    });
  }
});
export type ChildAgentEvidenceV2 = z.infer<typeof ChildAgentEvidenceV2Schema>;

const StrategyTaskProjectionIdentityV2Schema = z.object({
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  snapshotId: z.string().min(1),
}).strict();

/**
 * Client-facing attribution for a blocked task projection: the protocol gate's
 * reason codes plus the agent-visible text of the rejected turn (null when the
 * turn had no visible text). Mirrors the daemon task store's persisted
 * `blockedContext`; present only when the projected outcome is `blocked`, so
 * the UI can terminate the turn's form interaction and explain why.
 */
const StrategyTaskBlockedContextV2Schema = z.object({
  reasonCodes: z.array(z.string().min(1)).min(1),
  visibleText: z.string().nullable(),
}).strict();
export type StrategyTaskBlockedContextV2 = z.infer<typeof StrategyTaskBlockedContextV2Schema>;

export const StrategyTaskProjectionV2Schema = z.object({
  taskExecutionId: z.string().min(1),
  strategy: StrategyTaskProjectionIdentityV2Schema,
  inputStage: StrategyInputStageV2Schema,
  outcome: z.union([z.literal('running'), StrategyOutcomeV2Schema]),
  route: StrategyRouteV2Schema.nullable(),
  executionMode: StrategyExecutionModeV2Schema.nullable(),
  activeRunId: z.string().min(1),
  nextRunId: z.string().min(1).optional(),
  terminal: z.boolean(),
  blockedContext: StrategyTaskBlockedContextV2Schema.optional(),
}).strict().superRefine((value, context) => {
  const isTerminalOutcome = ['completed', 'blocked', 'canceled'].includes(value.outcome);
  if (value.terminal !== isTerminalOutcome) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['terminal'],
      message: 'Task projection terminal must match the logical task outcome.',
    });
  }
  if (value.terminal && value.nextRunId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nextRunId'],
      message: 'Terminal task projections may not advertise a next Run.',
    });
  }
  if (value.route === 'direct_edit' && value.executionMode !== 'simple') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionMode'],
      message: 'Direct Edit projections always use simple execution.',
    });
  }
  if (value.inputStage === 'contract_repair' && value.executionMode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionMode'],
      message: 'Contract-repair projections preserve a locked execution mode.',
    });
  }
  if (value.route === null) {
    if (
      value.inputStage !== 'request'
      || value.outcome !== 'running'
      || value.executionMode !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['route'],
        message: 'An unlocked route is valid only while the initial request is running.',
      });
    }
    return;
  }
  if (value.outcome !== 'running') {
    const state = StrategyRuntimeStateV2Schema.safeParse({
      schema: OD_NEXT_RUNTIME_STATE_SCHEMA,
      route: value.route,
      inputStage: value.inputStage,
      outcome: value.outcome,
      executionMode: value.executionMode,
      reasonCodes: [],
    });
    if (!state.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'A settled task projection must match the Runtime State transition table.',
      });
    }
  }
  if (value.route === 'direct_edit') {
    if (value.inputStage !== 'request') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputStage'],
        message: 'Direct Edit projections are confined to the request stage.',
      });
    }
    return;
  }
  if (
    value.outcome === 'clarification_required'
    && (value.inputStage !== 'request' || value.executionMode !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outcome'],
      message: 'Clarification is requested once before execution mode is locked.',
    });
  }
  if (value.outcome === 'plan_ready' && value.executionMode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionMode'],
      message: 'A plan-ready projection requires a locked execution mode.',
    });
  }
  if (value.inputStage === 'production' && value.executionMode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionMode'],
      message: 'Production projections require a locked execution mode.',
    });
  }
  if (value.outcome === 'completed' && value.inputStage !== 'production') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outcome'],
      message: 'Full Plan completion is valid only after Production.',
    });
  }
});
export type StrategyTaskProjectionV2 = z.infer<typeof StrategyTaskProjectionV2Schema>;
