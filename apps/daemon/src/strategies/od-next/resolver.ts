type Availability = { id: string; available: boolean };

export interface OdNextIntakePreflightInput {
  inputRefs: ReadonlyArray<{ id: string; accessible: boolean }>;
  selectedAgentAvailable: boolean;
  taskProfileAvailable: boolean;
  dependencies: ReadonlyArray<Availability>;
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
    ...(!input.taskProfileAvailable ? ['od_next_preflight_task_profile_unavailable'] : []),
    ...availabilityReasonCodes(
      input.dependencies,
      'od_next_preflight_dependency_unavailable',
    ),
  ];
  return { status: reasonCodes.length === 0 ? 'passed' : 'blocked', reasonCodes };
}
