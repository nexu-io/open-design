import type { AgentInfo } from './registry.js';

export type AgentCompanionSetupAction = 'already-compatible' | 'installed' | 'repaired';

export interface AgentCompanionSetupResponse {
  action: AgentCompanionSetupAction;
  agent: AgentInfo;
  ok: true;
  packageVersion: string;
}
