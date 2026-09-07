import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectMetadata } from '@open-design/contracts';

import { closeDatabase } from '../../src/db.js';
import { startServer, type StartServerOptions } from '../../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type CreateResponse = {
  conversationId: string;
  project: {
    id: string;
    appliedPluginSnapshotId?: string | null;
    metadata?: ProjectMetadata;
  };
};

describe('project Skill discovery binding', () => {
  let started: StartedServer | null = null;
  const originalMode = process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;

  async function daemon(): Promise<StartedServer> {
    started = await startServer(
      { port: 0, returnServer: true } as StartServerOptions,
    ) as StartedServer;
    return started;
  }

  async function createProject(
    url: string,
    suffix: string,
    body: Record<string, unknown>,
  ): Promise<{ response: Response; json: Record<string, any> }> {
    const safeSuffix = suffix.toLowerCase().replace(/[^a-z0-9-]+/gu, '-');
    const response = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `skill-discovery-${safeSuffix}-${process.hrtime.bigint()}`,
        name: `Skill discovery ${suffix}`,
        ...body,
      }),
    });
    return {
      response,
      json: await response.json() as Record<string, any>,
    };
  }

  afterEach(async () => {
    if (originalMode === undefined) delete process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
    else process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = originalMode;
    if (started) {
      await Promise.resolve(started.shutdown?.());
      if (started.server.listening) {
        await new Promise<void>((resolve) => started!.server.close(() => resolve()));
      }
    }
    started = null;
    closeDatabase();
  });

  it('daemon-stamps the typed marker and suppresses the legacy Prototype default', async () => {
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    const { url } = await daemon();
    const { response, json } = await createProject(url, 'active', {
      conversationMode: 'design',
      skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
      metadata: {
        kind: 'prototype',
        skillDiscoveryBinding: {
          schemaVersion: 1,
          provenance: 'no_explicit_task_type',
          catalog: 'open-design-official',
          boundAt: 1,
        },
      },
    });

    expect(response.status, JSON.stringify(json)).toBe(200);
    const created = json as CreateResponse;
    expect(created.project.appliedPluginSnapshotId ?? null).toBeNull();
    expect(created.project.metadata?.scenarioBinding).toBeUndefined();
    expect(created.project.metadata?.strategyBinding).toBeUndefined();
    expect(created.project.metadata?.skillDiscoveryBinding).toMatchObject({
      schemaVersion: 1,
      provenance: 'no_explicit_task_type',
      catalog: 'open-design-official',
      boundAt: expect.any(Number),
    });
    expect(created.project.metadata?.skillDiscoveryBinding?.boundAt).not.toBe(1);

    const patchResponse = await fetch(`${url}/api/projects/${created.project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          kind: 'prototype',
          skillDiscoveryBinding: {
            ...created.project.metadata?.skillDiscoveryBinding,
            boundAt: 1,
          },
        },
      }),
    });
    expect(patchResponse.status).toBe(400);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST', message: 'skillDiscoveryBinding is daemon-owned' },
    });
  });

  it('strips an untrusted metadata binding when no typed marker was sent', async () => {
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    const { url } = await daemon();
    const { response, json } = await createProject(url, 'smuggled', {
      conversationMode: 'design',
      metadata: {
        kind: 'prototype',
        skillDiscoveryBinding: {
          schemaVersion: 1,
          provenance: 'no_explicit_task_type',
          catalog: 'open-design-official',
          boundAt: 1,
        },
      },
    });

    expect(response.status, JSON.stringify(json)).toBe(200);
    const created = json as CreateResponse;
    expect(created.project.metadata?.skillDiscoveryBinding).toBeUndefined();
    expect(created.project.metadata?.scenarioBinding).toMatchObject({
      provenance: 'automatic_default',
      pluginId: 'example-web-prototype',
    });
  });

  it.each(['off', 'observe'] as const)(
    'preserves legacy automatic routing when the behavior mode is %s',
    async (mode) => {
      process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = mode;
      const { url } = await daemon();
      const { response, json } = await createProject(url, mode, {
        conversationMode: 'design',
        skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
        metadata: { kind: 'prototype' },
      });

      expect(response.status, JSON.stringify(json)).toBe(200);
      const created = json as CreateResponse;
      expect(created.project.metadata?.skillDiscoveryBinding).toBeUndefined();
      expect(created.project.metadata?.scenarioBinding).toMatchObject({
        provenance: 'automatic_default',
        pluginId: 'example-web-prototype',
      });
      expect(created.project.appliedPluginSnapshotId).toEqual(expect.any(String));
    },
  );

  it.each([
    ['plugin', { pluginId: 'example-web-prototype' }],
    ['task profile', { automaticStrategyTaskProfile: 'prototype' }],
    ['Skill', { skillId: 'explicit-skill' }],
    ['example', { exampleReference: { pluginId: 'example-web-prototype', source: '/unused' } }],
    ['context plugin', { metadata: { kind: 'prototype', contextPlugins: [{ id: 'context-plugin' }] } }],
    ['non-Design mode', { conversationMode: 'chat' }],
  ])('fails closed when discovery is combined with an explicit %s', async (_label, conflict) => {
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    const { url } = started ?? await daemon();
    const { response, json } = await createProject(url, String(_label), {
      conversationMode: 'design',
      skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
      metadata: { kind: 'prototype' },
      ...conflict,
    });

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.stringContaining('skillDiscovery requires a typeless Design request'),
      },
    });
  });

  it.each([
    null,
    {},
    { mode: 'agent', catalog: 'open-design-official', extra: true },
    { mode: 'router', catalog: 'open-design-official' },
    { mode: 'agent', catalog: 'user-skills' },
  ])('rejects a non-canonical typed marker %#', async (skillDiscovery) => {
    const { url } = started ?? await daemon();
    const { response, json } = await createProject(url, 'invalid-marker', {
      conversationMode: 'design',
      skillDiscovery,
      metadata: { kind: 'prototype' },
    });

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: { code: 'BAD_REQUEST', message: 'skillDiscovery is invalid' },
    });
  });
});
