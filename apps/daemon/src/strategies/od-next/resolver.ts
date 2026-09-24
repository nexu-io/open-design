type Availability = { id: string; available: boolean };

export interface OdNextIntakePreflightInput {
  inputRefs: ReadonlyArray<{ id: string; accessible: boolean }>;
  selectedAgentAvailable: boolean;
  nativeContinuation: 'verified' | 'advertised' | 'unknown' | 'unsupported';
  taskProfileAvailable: boolean;
  dependencies: ReadonlyArray<Availability>;
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
