import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { startServer } from '../src/server.js';
import { ensureWorkspaceResource, openDatabase } from '../src/db.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import {
  __resetPluginEventBufferForTests,
  recordPluginEvent,
} from '../src/plugins/events.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

function fakePlugin(
  id: string,
  sourceKind: InstalledPluginRecord['sourceKind'] = 'local',
): InstalledPluginRecord {
  const now = Date.now();
  return {
    id,
    title: id,
    version: '1.0.0',
    sourceKind,
    source: `/private/plugins/${id}`,
    trust: sourceKind === 'bundled' ? 'bundled' : 'trusted',
    capabilitiesGranted: [],
    manifest: { name: id, title: id, version: '1.0.0' } as InstalledPluginRecord['manifest'],
    fsPath: `/private/plugins/${id}`,
    installedAt: now,
    updatedAt: now,
  };
}

function headers(memberId: string) {
  return {
    'x-od-workspace-id': 'event-workspace',
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-role': 'member',
  };
}

beforeAll(async () => {
  const started = await startServer({ port: 0, returnServer: true }) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
  const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });

  for (const plugin of [
    fakePlugin('event-bundled', 'bundled'),
    fakePlugin('event-unbound'),
    fakePlugin('event-personal-a'),
    fakePlugin('event-personal-b'),
    fakePlugin('event-team'),
  ]) upsertInstalledPlugin(db, plugin);

  ensureWorkspaceResource(db, 'plugin', 'event-workspace', 'event-personal-a', {
    visibility: 'personal',
    createdByWorkspaceMemberId: 'event-member-a',
  });
  ensureWorkspaceResource(db, 'plugin', 'event-workspace', 'event-personal-b', {
    visibility: 'personal',
    createdByWorkspaceMemberId: 'event-member-b',
  });
  ensureWorkspaceResource(db, 'plugin', 'event-workspace', 'event-team', {
    visibility: 'team',
    createdByWorkspaceMemberId: 'event-member-a',
  });

  __resetPluginEventBufferForTests();
  for (const pluginId of [
    'event-bundled',
    'event-unbound',
    'event-personal-a',
    'event-personal-b',
    'event-team',
    '',
  ]) {
    recordPluginEvent({
      kind: pluginId ? 'plugin.installed' : 'plugin.marketplace-refreshed',
      pluginId,
      details: { source: `/private/source/${pluginId || 'global'}` },
    });
  }
});

afterAll(async () => {
  __resetPluginEventBufferForTests();
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('plugin event workspace isolation', () => {
  it('returns only events whose plugin is provably visible to the exact member', async () => {
    const response = await fetch(`${baseUrl}/api/plugins/events/snapshot`, {
      headers: headers('event-member-a'),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      events: Array<{ pluginId: string; details?: { source?: string } }>;
    };
    expect(body.events.map((event) => event.pluginId).sort()).toEqual([
      'event-bundled',
      'event-personal-a',
      'event-team',
    ]);
    expect(JSON.stringify(body)).not.toContain('event-personal-b');
    expect(JSON.stringify(body)).not.toContain('/private/source/event-personal-b');
  });

  it('keeps headerless local compatibility to bundled and unbound events only', async () => {
    const response = await fetch(`${baseUrl}/api/plugins/events/snapshot`);
    expect(response.status).toBe(200);
    const body = await response.json() as { events: Array<{ pluginId: string }> };
    expect(body.events.map((event) => event.pluginId).sort()).toEqual([
      'event-bundled',
      'event-unbound',
    ]);
  });

  it('summarizes the filtered slice instead of the process-global buffer', async () => {
    const response = await fetch(`${baseUrl}/api/plugins/events/stats`, {
      headers: headers('event-member-a'),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stats: {
        total: 3,
        byPluginId: {
          'event-bundled': 1,
          'event-personal-a': 1,
          'event-team': 1,
        },
      },
    });
  });

  it('filters both SSE backlog and live events with the same proof', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/plugins/events?since=10000`, {
      headers: headers('event-member-a'),
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    recordPluginEvent({
      kind: 'plugin.upgraded',
      pluginId: 'event-personal-b',
      details: { source: '/private/source/member-b-live' },
    });
    recordPluginEvent({
      kind: 'plugin.upgraded',
      pluginId: 'event-personal-a',
      details: { source: '/private/source/member-a-live' },
    });

    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timed out waiting for scoped plugin event')), 2_000);
      }),
    ]);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('event-personal-a');
    expect(text).not.toContain('event-personal-b');
    expect(text).not.toContain('member-b-live');
  });
});
