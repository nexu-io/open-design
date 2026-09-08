import type { AmrRuntime } from '@open-design/contracts';

/** Keep historical AMR/OpenCode rows intact; every other runtime has its own handles. */
export function agentSessionStorageKey(agentId: string, amrRuntime?: AmrRuntime): string {
  return agentId === 'amr' && amrRuntime && amrRuntime !== 'opencode' ? `amr:${amrRuntime}` : agentId;
}
