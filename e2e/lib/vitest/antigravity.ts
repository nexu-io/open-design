import { randomUUID } from 'node:crypto';

import { requestJson } from './http.ts';

export async function putAntigravityAppConfig(
  webUrl: string,
  config: {
    agentCliEnv?: Record<string, Record<string, string>>;
    agentModels?: Record<string, { model: string; reasoning: string }>;
    onboardingCompleted?: boolean;
  } = {},
) {
  await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
    body: {
      agentCliEnv: config.agentCliEnv ?? {},
      agentId: 'antigravity',
      agentModels: config.agentModels ?? {
        antigravity: { model: 'default', reasoning: 'default' },
      },
      designSystemId: null,
      onboardingCompleted: config.onboardingCompleted ?? true,
      skillId: null,
      telemetry: { artifactManifest: true, content: false, metrics: false },
    },
    method: 'PUT',
  });
}

export async function createAntigravityProject(webUrl: string, name: string) {
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
