import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';
import { ensureWorkspaceProject, insertProject, openDatabase } from '../src/db.js';
import { createSnapshot } from '../src/plugins/snapshots.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let exportRoot: string;

beforeAll(async () => {
  exportRoot = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-export-scope-'));
  const started = await startServer({ port: 0, returnServer: true }) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
  const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
  for (const [projectId, visibility] of [
    ['snapshot-personal-project', 'personal'],
    ['snapshot-team-project', 'team'],
    ['snapshot-unbound-project', null],
  ] as const) {
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: projectId,
      createdAt: now,
      updatedAt: now,
    });
    if (visibility) {
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId: 'snapshot-workspace',
        visibility,
        resourceState: 'active',
        createdByWorkspaceMemberId: 'snapshot-owner',
        updatedByWorkspaceMemberId: 'snapshot-owner',
        createdAt: now,
        updatedAt: now,
      });
    }
    createSnapshot(db, {
      projectId,
      pluginId: 'snapshot-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'digest',
      taskKind: 'new-generation',
      inputs: { secretPrompt: `${visibility ?? 'unbound'}-private-input` },
      resolvedContext: { items: [] },
      capabilitiesGranted: [],
      capabilitiesRequired: [],
      assetsStaged: [],
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
    });
  }
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(exportRoot, { recursive: true, force: true });
});

function headers(memberId: string, role: 'owner' | 'admin' | 'member' = 'member') {
  return {
    'x-od-workspace-id': 'snapshot-workspace',
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-role': role,
  };
}

function snapshotId(projectId: string): string {
  const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
  const row = db.prepare(
    'SELECT id FROM applied_plugin_snapshots WHERE project_id = ?',
  ).get(projectId) as { id: string };
  return row.id;
}

describe('applied plugin snapshot workspace isolation', () => {
  it('hides Personal show and canon payloads from another member, including owner/admin', async () => {
    const id = snapshotId('snapshot-personal-project');
    const other = headers('snapshot-admin', 'admin');
    const show = await fetch(`${baseUrl}/api/applied-plugins/${id}`, { headers: other });
    const canon = await fetch(`${baseUrl}/api/applied-plugins/${id}/canon`, { headers: other });
    expect(show.status).toBe(403);
    expect(canon.status).toBe(403);
    expect(await show.text()).not.toContain('personal-private-input');
    expect(await canon.text()).not.toContain('personal-private-input');
  });

  it('allows the Personal creator and every active Team member on a Team snapshot', async () => {
    const personal = await fetch(
      `${baseUrl}/api/applied-plugins/${snapshotId('snapshot-personal-project')}`,
      { headers: headers('snapshot-owner') },
    );
    const team = await fetch(
      `${baseUrl}/api/applied-plugins/${snapshotId('snapshot-team-project')}`,
      { headers: headers('snapshot-member') },
    );
    expect(personal.status).toBe(200);
    expect(team.status).toBe(200);
  });

  it('filters the global list by exact Workspace/member while retaining Team snapshots', async () => {
    const owner = await fetch(`${baseUrl}/api/applied-plugins`, {
      headers: headers('snapshot-owner'),
    });
    const member = await fetch(`${baseUrl}/api/applied-plugins`, {
      headers: headers('snapshot-member'),
    });
    const ownerBody = await owner.json() as { snapshots: Array<{ inputs: Record<string, string> }> };
    const memberBody = await member.json() as { snapshots: Array<{ inputs: Record<string, string> }> };
    expect(ownerBody.snapshots).toHaveLength(2);
    expect(memberBody.snapshots).toHaveLength(1);
    expect(memberBody.snapshots[0]?.inputs.secretPrompt).toBe('team-private-input');
  });

  it('keeps the headerless compatibility list limited to provably unbound projects', async () => {
    const response = await fetch(`${baseUrl}/api/applied-plugins`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      snapshots: Array<{ projectId: string; inputs: Record<string, string> }>;
    };
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0]?.inputs.secretPrompt).toBe('unbound-private-input');
    expect(JSON.stringify(body)).not.toContain('personal-private-input');
    expect(JSON.stringify(body)).not.toContain('team-private-input');
  });

  it('computes inventory statistics from the caller-visible snapshots only', async () => {
    const owner = await fetch(`${baseUrl}/api/plugins/stats`, {
      headers: headers('snapshot-owner'),
    });
    const member = await fetch(`${baseUrl}/api/plugins/stats`, {
      headers: headers('snapshot-member'),
    });
    expect(owner.status).toBe(200);
    expect(member.status).toBe(200);
    await expect(owner.json()).resolves.toMatchObject({ snapshots: { total: 2 } });
    await expect(member.json()).resolves.toMatchObject({ snapshots: { total: 1 } });
  });

  it('does not count Workspace-bound snapshots in headerless statistics', async () => {
    const response = await fetch(`${baseUrl}/api/plugins/stats`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ snapshots: { total: 1 } });
  });

  it('authorizes snapshot export before reading or materializing private bytes', async () => {
    const response = await fetch(`${baseUrl}/api/applied-plugins/export`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers('snapshot-admin', 'admin'),
      },
      body: JSON.stringify({
        snapshotId: snapshotId('snapshot-personal-project'),
        target: 'agent-skill',
        outDir: exportRoot,
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('personal-private-input');
  });

  it('rejects an export without an authorized project or snapshot target', async () => {
    const response = await fetch(`${baseUrl}/api/applied-plugins/export`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers('snapshot-owner', 'owner'),
      },
      body: JSON.stringify({ target: 'agent-skill', outDir: exportRoot }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PLUGIN_EXPORT_TARGET_REQUIRED' },
    });
  });
});
