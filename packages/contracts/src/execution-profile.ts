import type { AmrRuntime } from './api/amr-runtime.js';

export type ExecutionProfile = 'filesystem' | 'text_artifact';

export function executionProfileFromStreamFormat(
  streamFormat: string | null | undefined,
): ExecutionProfile {
  return streamFormat === 'plain' ? 'text_artifact' : 'filesystem';
}

/** AMR's direct-model mode has no filesystem tools, even though transport is ACP. */
export function executionProfileForRuntime(
  agentId: string,
  streamFormat: string | null | undefined,
  amrRuntime?: AmrRuntime,
): ExecutionProfile {
  return agentId === 'amr' && amrRuntime === 'none'
    ? 'text_artifact'
    : executionProfileFromStreamFormat(streamFormat);
}
