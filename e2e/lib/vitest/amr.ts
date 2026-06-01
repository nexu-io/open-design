import { randomUUID } from 'node:crypto';

import { requestJson } from './http.ts';

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
    method: 'POST',
  });
}
