import { randomUUID } from 'node:crypto';

import { requestJson } from './http.ts';

/**
 * Exact Personal Workspace selected by AMR E2E callers. The daemon must never
 * infer this scope from mutable current/default state, so both project creation
 * and run creation send the same explicit identity.
 */
export const AMR_TEST_WORKSPACE_HEADERS: Readonly<Record<string, string>> = {
  'x-od-workspace-id': 'ws-amr-e2e-personal',
  'x-od-workspace-type': 'personal',
  'x-od-workspace-member-id': 'mem-amr-e2e-personal',
  'x-od-workspace-role': 'owner',
  'x-od-workspace-lifecycle-state': 'active',
  'x-od-workspace-member-status': 'active',
  'x-od-workspace-can-share-projects': 'true',
  'x-od-workspace-can-write-synced-files': 'true',
};

export async function putAmrAppConfig(
  webUrl: string,
  config: {
    agentId: string;
    onboardingCompleted?: boolean;
    agentModels?: Record<string, { model: string; reasoning: string }>;
    agentCliEnv?: Record<string, Record<string, string>>;
  },
) {
  await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
    body: {
      agentId: config.agentId,
      agentModels: config.agentModels ?? { [config.agentId]: { model: 'default', reasoning: 'default' } },
      agentCliEnv: config.agentCliEnv ?? {},
      designSystemId: null,
      onboardingCompleted: config.onboardingCompleted ?? true,
      skillId: null,
      telemetry: { artifactManifest: true, content: false, metrics: false },
    },
    method: 'PUT',
  });
}

export async function createAmrProject(webUrl: string, name: string) {
  return await requestJson<{
    conversationId: string;
    project: { id: string; metadata?: { kind?: string }; name: string };
  }>(webUrl, '/api/projects', {
    body: {
      designSystemId: null,
      id: randomUUID(),
      metadata: { kind: 'prototype' },
      name,
      pendingPrompt: null,
      skillId: null,
    },
    headers: { ...AMR_TEST_WORKSPACE_HEADERS },
    method: 'POST',
  });
}
