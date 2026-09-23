import type { StrategyExecutionModeV2, StrategyRouteV2 } from '@open-design/contracts';

export const OD_NEXT_RESOLVER_SOURCE_AUTHORITY = {
  user_explicit: 600,
  project_metadata: 500,
  baseline_artifact: 400,
  attachment: 300,
  inferred: 200,
  default: 100,
} as const;

export type OdNextResolverSource = keyof typeof OD_NEXT_RESOLVER_SOURCE_AUTHORITY;
export type OdNextMissingPolicy = 'extract' | 'infer' | 'default' | 'ask' | 'block';

export interface OdNextResolverCandidate<T = unknown> {
  source: Exclude<OdNextResolverSource, 'inferred' | 'default'>;
  value: T;
  explicitChange?: boolean;
  scope?: string;
}

export interface OdNextResolverFieldInput<T = unknown> {
  lockedValue?: T;
  candidates?: ReadonlyArray<OdNextResolverCandidate<T>>;
  missingPolicy: OdNextMissingPolicy;
  inferredValue?: T;
  defaultValue?: T;
}

export interface OdNextResolvedField<T = unknown> {
  status: 'confirmed' | 'inferred' | 'defaulted' | 'missing' | 'conflicted';
  source?: OdNextResolverSource | 'locked';
  value?: T;
  conflicts?: ReadonlyArray<{ source: OdNextResolverSource; value: T; scope?: string }>;
}

export interface OdNextResolverResult {
  values: Record<string, unknown>;
  fields: Record<string, OdNextResolvedField>;
  changeSet: Array<{ field: string; from: unknown; to: unknown }>;
  askFields: string[];
  blockedFields: string[];
  conflictedFields: string[];
}

export class OdNextResolverError extends Error {
  constructor(
    message: string,
    readonly reasonCodes: string[],
  ) {
    super(message);
    this.name = 'OdNextResolverError';
  }
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableValue(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

/**
 * Deterministic field resolver for the planning-only Task Profile draft.
 * It does not read files, artifacts, or runtime state; callers provide already
 * authorized facts with explicit source ownership.
 */
export function resolveStrategyFields(
  input: Record<string, OdNextResolverFieldInput>,
): OdNextResolverResult {
  const values: Record<string, unknown> = {};
  const fields: Record<string, OdNextResolvedField> = {};
  const changeSet: Array<{ field: string; from: unknown; to: unknown }> = [];
  const askFields: string[] = [];
  const blockedFields: string[] = [];
  const conflictedFields: string[] = [];

  for (const field of Object.keys(input).sort()) {
    const definition = input[field];
    if (!definition) continue;
    const candidates = [...(definition.candidates ?? [])];

    if (definition.lockedValue !== undefined) {
      const explicitChanges = candidates.filter(
        (candidate) => candidate.source === 'user_explicit' && candidate.explicitChange === true,
      );
      const distinctChanges = new Map(
        explicitChanges.map((candidate) => [stableValue(candidate.value), candidate]),
      );
      if (distinctChanges.size > 1) {
        fields[field] = {
          status: 'conflicted',
          conflicts: explicitChanges.map((candidate) => ({
            source: candidate.source,
            value: candidate.value,
            ...(candidate.scope ? { scope: candidate.scope } : {}),
          })),
        };
        conflictedFields.push(field);
        continue;
      }
      const explicit = explicitChanges[0];
      if (explicit && !sameValue(explicit.value, definition.lockedValue)) {
        values[field] = explicit.value;
        fields[field] = {
          status: 'confirmed',
          source: explicit.source,
          value: explicit.value,
        };
        changeSet.push({ field, from: definition.lockedValue, to: explicit.value });
      } else {
        values[field] = definition.lockedValue;
        fields[field] = {
          status: 'confirmed',
          source: 'locked',
          value: definition.lockedValue,
        };
      }
      continue;
    }

    if (candidates.length > 0) {
      const highestAuthority = Math.max(...candidates.map(
        (candidate) => OD_NEXT_RESOLVER_SOURCE_AUTHORITY[candidate.source],
      ));
      const authoritative = candidates.filter(
        (candidate) => OD_NEXT_RESOLVER_SOURCE_AUTHORITY[candidate.source] === highestAuthority,
      );
      const distinct = new Map(
        authoritative.map((candidate) => [stableValue(candidate.value), candidate]),
      );
      if (distinct.size > 1) {
        fields[field] = {
          status: 'conflicted',
          conflicts: authoritative.map((candidate) => ({
            source: candidate.source,
            value: candidate.value,
            ...(candidate.scope ? { scope: candidate.scope } : {}),
          })),
        };
        conflictedFields.push(field);
        continue;
      }
      const selected = authoritative[0];
      if (selected) {
        values[field] = selected.value;
        fields[field] = {
          status: 'confirmed',
          source: selected.source,
          value: selected.value,
        };
        continue;
      }
    }

    if (
      (definition.missingPolicy === 'extract' || definition.missingPolicy === 'infer')
      && definition.inferredValue !== undefined
    ) {
      values[field] = definition.inferredValue;
      fields[field] = {
        status: 'inferred',
        source: 'inferred',
        value: definition.inferredValue,
      };
      continue;
    }
    if (definition.missingPolicy === 'default' && definition.defaultValue !== undefined) {
      values[field] = definition.defaultValue;
      fields[field] = {
        status: 'defaulted',
        source: 'default',
        value: definition.defaultValue,
      };
      continue;
    }

    fields[field] = { status: 'missing' };
    if (definition.missingPolicy === 'ask') askFields.push(field);
    else blockedFields.push(field);
  }

  return {
    values,
    fields,
    changeSet,
    askFields,
    blockedFields,
    conflictedFields,
  };
}

export interface OdNextDirectEditEligibility {
  editableBaselineExists: boolean;
  localAndUnambiguous: boolean;
  canonicalDeliverableStable: boolean;
  deliverableSetStable: boolean;
  dependenciesBounded: boolean;
}

export interface OdNextRouteDecision {
  route: StrategyRouteV2;
  executionMode: StrategyExecutionModeV2 | null;
  reasonCodes: string[];
}

export function decideStrategyRequestRoute(input: {
  preference: 'auto' | StrategyRouteV2;
  routeLocked: boolean;
  buildStarted: boolean;
  directEdit: OdNextDirectEditEligibility;
}): OdNextRouteDecision {
  const failed: string[] = [];
  if (!input.directEdit.editableBaselineExists) {
    failed.push('od_next_route_direct_edit_baseline_missing');
  }
  if (!input.directEdit.localAndUnambiguous) {
    failed.push('od_next_route_direct_edit_scope_ambiguous');
  }
  if (!input.directEdit.canonicalDeliverableStable) {
    failed.push('od_next_route_direct_edit_canonical_deliverable_changed');
  }
  if (!input.directEdit.deliverableSetStable) {
    failed.push('od_next_route_direct_edit_deliverable_set_changed');
  }
  if (!input.directEdit.dependenciesBounded) {
    failed.push('od_next_route_direct_edit_dependencies_unbounded');
  }

  if (input.routeLocked || input.buildStarted) {
    if (failed.length > 0) {
      throw new OdNextResolverError(
        'A locked Direct Edit cannot fall back after Build begins.',
        ['od_next_route_locked_scope_escape'],
      );
    }
    throw new OdNextResolverError(
      'The request route has already been locked.',
      ['od_next_route_already_locked'],
    );
  }
  if (input.preference === 'full_plan') {
    return { route: 'full_plan', executionMode: null, reasonCodes: [] };
  }
  if (failed.length === 0) {
    return { route: 'direct_edit', executionMode: 'simple', reasonCodes: [] };
  }
  return { route: 'full_plan', executionMode: null, reasonCodes: failed };
}

type Availability = { id: string; available: boolean };

export interface OdNextIntakePreflightInput {
  inputRefs: ReadonlyArray<{ id: string; accessible: boolean }>;
  selectedAgentAvailable: boolean;
  nativeContinuation: 'verified' | 'advertised' | 'unknown' | 'unsupported';
  taskProfileAvailable: boolean;
  dependencies: ReadonlyArray<Availability>;
}

export interface OdNextExecutionPreflightInput {
  productionRoutes: ReadonlyArray<Availability>;
  dependencies: ReadonlyArray<Availability>;
  inputs: ReadonlyArray<Availability>;
  renderers: ReadonlyArray<Availability>;
  exporters: ReadonlyArray<Availability>;
  templates: ReadonlyArray<Availability>;
  outputKinds: ReadonlyArray<{ id: string; supported: boolean }>;
}

const DAEMON_OWNED_PRODUCTION_ROUTES = {
  prototype: new Set(['html', 'prototype-html']),
  ppt: new Set(['ppt-html', 'html', 'deck-html']),
  marketing: new Set(['marketing-html', 'html', 'image-html']),
  hyperframes: new Set(['hyperframes-html', 'html']),
} as const;

const DAEMON_OWNED_OUTPUT_KINDS = {
  prototype: new Set(['prototype', 'html', 'source']),
  ppt: new Set(['presentation', 'ppt', 'deck', 'html', 'source']),
  marketing: new Set(['image', 'marketing', 'html', 'source']),
  hyperframes: new Set(['video', 'hyperframes', 'html', 'source', 'rendered-video']),
} as const;

export function daemonOwnedOdNextPlanningCatalog(
  taskType: keyof typeof DAEMON_OWNED_PRODUCTION_ROUTES,
): { productionRoutes: string[]; outputKinds: string[] } {
  return {
    productionRoutes: [...DAEMON_OWNED_PRODUCTION_ROUTES[taskType]],
    outputKinds: [...DAEMON_OWNED_OUTPUT_KINDS[taskType]],
  };
}

/**
 * Production preflight owned by the daemon, not the model. It recognizes only
 * the four bundled OD Next artifact profiles and a finite route/output
 * allowlist. Unknown future artifact types or route strings fail closed and
 * continue through ordinary Open Design unless explicitly added here.
 */
export function resolveDaemonOwnedOdNextExecutionPreflight(
  plan: import('@open-design/contracts').OpenDesignPlanContractV2,
): OdNextExecutionPreflightInput {
  const taskType = plan.taskProfile.taskType as keyof typeof DAEMON_OWNED_PRODUCTION_ROUTES;
  const routes = DAEMON_OWNED_PRODUCTION_ROUTES[taskType];
  const outputKinds = DAEMON_OWNED_OUTPUT_KINDS[taskType];
  return {
    productionRoutes: plan.runManifest.productionRoutes.map((id) => ({
      id,
      available: Boolean(routes?.has(id)),
    })),
    dependencies: [],
    inputs: plan.runManifest.inputRefs.map((id) => ({
      id,
      available: id === 'request',
    })),
    renderers: [],
    exporters: [],
    templates: [],
    outputKinds: plan.taskProfile.requiredDeliverables.map(({ kind }) => ({
      id: kind,
      supported: Boolean(outputKinds?.has(kind)),
    })),
  };
}

export interface OdNextPreflightResult {
  status: 'passed' | 'blocked';
  reasonCodes: string[];
}

function availabilityReasonCodes(
  values: ReadonlyArray<Availability>,
  prefix: string,
): string[] {
  return values
    .filter((value) => !value.available)
    .map((value) => `${prefix}:${value.id}`)
    .sort();
}

export function runIntakePreflight(input: OdNextIntakePreflightInput): OdNextPreflightResult {
  const reasonCodes = [
    ...input.inputRefs
      .filter((value) => !value.accessible)
      .map((value) => `od_next_preflight_input_unavailable:${value.id}`)
      .sort(),
    ...(!input.selectedAgentAvailable ? ['od_next_preflight_agent_unavailable'] : []),
    ...(input.nativeContinuation !== 'verified'
      ? ['od_next_preflight_native_continuation_unverified']
      : []),
    ...(!input.taskProfileAvailable ? ['od_next_preflight_task_profile_unavailable'] : []),
    ...availabilityReasonCodes(
      input.dependencies,
      'od_next_preflight_dependency_unavailable',
    ),
  ];
  return { status: reasonCodes.length === 0 ? 'passed' : 'blocked', reasonCodes };
}

export function runExecutionPreflight(
  input: OdNextExecutionPreflightInput,
): OdNextPreflightResult {
  const reasonCodes = [
    ...availabilityReasonCodes(input.productionRoutes, 'od_next_preflight_route_unavailable'),
    ...availabilityReasonCodes(input.dependencies, 'od_next_preflight_dependency_unavailable'),
    ...availabilityReasonCodes(input.inputs, 'od_next_preflight_input_unavailable'),
    ...availabilityReasonCodes(input.renderers, 'od_next_preflight_renderer_unavailable'),
    ...availabilityReasonCodes(input.exporters, 'od_next_preflight_exporter_unavailable'),
    ...availabilityReasonCodes(input.templates, 'od_next_preflight_template_unavailable'),
    ...input.outputKinds
      .filter((value) => !value.supported)
      .map((value) => `od_next_preflight_output_unsupported:${value.id}`)
      .sort(),
  ];
  return { status: reasonCodes.length === 0 ? 'passed' : 'blocked', reasonCodes };
}
