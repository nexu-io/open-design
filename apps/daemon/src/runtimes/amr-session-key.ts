import type { AmrRuntime } from '@open-design/contracts';

/** Keep historical AMR/OpenCode rows intact while isolating Pi's handles. */
export function agentSessionStorageKey(agentId: string, amrRuntime?: AmrRuntime): string {
  return agentId === 'amr' && amrRuntime === 'pi' ? 'amr:pi' : agentId;
}
