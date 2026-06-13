// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { listLiveArtifacts, readLiveArtifactPreview } from '@/vitest/live-artifacts';
import { readOrbitStatus, startOrbitRun, waitForOrbitSummary } from '@/vitest/orbit';
import { readRun, waitForRunStatus } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';
import { requestJson } from '@/vitest/http';

type ProjectResponse = {
  project: {
    id: string;
    metadata?: {
      kind?: string;
      trigger?: string;
    };
    name: string;
    skillId?: string | null;
  };
};

describe('orbit run spec', () => {
  test('starts a manual Orbit run and publishes a live artifact through the agent tool path', async () => {
    const suite = await createSmokeSuite('orbit-run');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['codex'],
      });

      await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
        body: {
          agentCliEnv: { codex: fakeAgents.codex.env },
          agentId: 'codex',
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          designSystemId: null,
          onboardingCompleted: true,
          orbit: { enabled: false, templateSkillId: null, time: '08:00' },
          skillId: null,
          telemetry: { artifactManifest: true, content: false, metrics: false },
        },
        method: 'PUT',
      });

      const before = await readOrbitStatus(webUrl);
      expect(before.running).toBe(false);
      expect(before.config?.enabled).toBe(false);
      expect(before.config?.templateSkillId).toBe(null);

      const orbit = await startOrbitRun(webUrl);
      expect(orbit.projectId).toMatch(/^orbit-/);
      expect(orbit.agentRunId).toEqual(expect.any(String));

      const runningStatus = await readRun(webUrl, orbit.agentRunId);
      expect(runningStatus.projectId).toBe(orbit.projectId);
      expect(runningStatus.agentId).toBe('codex');

      const finalRun = await waitForRunStatus(webUrl, orbit.agentRunId, 'succeeded', { timeoutMs: 30_000 });
      expect(finalRun.status).toBe('succeeded');

      const finalOrbit = await waitForOrbitSummary(webUrl, orbit.agentRunId, { timeoutMs: 30_000 });
      const summary = finalOrbit.lastRun;
      expect(summary?.agentRunId).toBe(orbit.agentRunId);
      expect(summary?.artifactProjectId).toBe(orbit.projectId);
      expect(summary?.artifactId).toEqual(expect.any(String));
      expect(summary?.connectorsChecked).toBe(1);
      expect(summary?.connectorsSucceeded).toBe(1);
      expect(summary?.connectorsFailed).toBe(0);
      expect(summary?.markdown).toContain('Orbit Agent');

      const project = await requestJson<ProjectResponse>(webUrl, `/api/projects/${encodeURIComponent(orbit.projectId)}`);
      expect(project.project.skillId).toBe('live-artifact');
      expect(project.project.metadata?.kind).toBe('orbit');
      expect(project.project.metadata?.trigger).toBe('manual');

      const artifacts = await listLiveArtifacts(webUrl, orbit.projectId);
      const artifact = artifacts.find((candidate) => candidate.id === summary?.artifactId);
      expect(artifact).toEqual(expect.objectContaining({
        createdByRunId: orbit.agentRunId,
        projectId: orbit.projectId,
        refreshStatus: 'idle',
        status: 'active',
        title: 'Orbit Daily Digest',
      }));

      const preview = await readLiveArtifactPreview(webUrl, orbit.projectId, artifact?.id ?? '');
      expect(preview).toContain('Orbit daily digest');
      expect(preview).toContain('Fake connector activity');

      await suite.report.json('summary.json', {
        artifact,
        namespace: suite.namespace,
        orbit: finalOrbit,
        project: project.project,
        run: finalRun,
        runtime: {
          daemonPort: runtime.daemonPort,
          webPort: runtime.webPort,
          webUrl,
        },
        status,
      });
    });
  }, 180_000);
});
