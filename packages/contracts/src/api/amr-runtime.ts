/** Run-scoped harnesses currently implemented behind the AMR entry point. */
export const AMR_RUNTIMES = ['opencode', 'pi'] as const;
export type AmrRuntime = (typeof AMR_RUNTIMES)[number];

export function isAmrRuntime(value: unknown): value is AmrRuntime {
  return value === 'opencode' || value === 'pi';
}

/** Omission preserves the existing OpenCode default; invalid input must fail. */
export function resolveAmrRuntime(agentId: string, value: unknown): AmrRuntime | undefined {
  if (value === undefined) return agentId === 'amr' ? 'opencode' : undefined;
  if (agentId !== 'amr') throw new Error('amrRuntime is only supported by AMR');
  if (!isAmrRuntime(value)) throw new Error('amrRuntime must be opencode or pi');
  return value;
}

export interface AmrRuntimeEvidence {
  requestedRuntime: AmrRuntime;
  actualRuntime: AmrRuntime;
  runtimeVersion: string;
  modelId?: string;
}
