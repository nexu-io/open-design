/** Run-scoped AMR execution runtimes. `none` calls the model through AMR without a harness. */
export const AMR_RUNTIMES = ['opencode', 'pi', 'codex', 'dsh', 'none'] as const;
export type AmrRuntime = (typeof AMR_RUNTIMES)[number];

export function isAmrRuntime(value: unknown): value is AmrRuntime {
  return typeof value === 'string' && AMR_RUNTIMES.some((runtime) => runtime === value);
}

/** Omission preserves the existing OpenCode default; invalid input must fail. */
export function resolveAmrRuntime(agentId: string, value: unknown): AmrRuntime | undefined {
  if (value === undefined) return agentId === 'amr' ? 'opencode' : undefined;
  if (agentId !== 'amr') throw new Error('amrRuntime is only supported by AMR');
  if (!isAmrRuntime(value)) throw new Error(`amrRuntime must be one of: ${AMR_RUNTIMES.join(', ')}`);
  return value;
}

export interface AmrRuntimeEvidence {
  requestedRuntime: AmrRuntime;
  actualRuntime: AmrRuntime;
  runtimeVersion: string;
  modelId?: string;
}
