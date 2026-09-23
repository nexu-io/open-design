import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startFakeCollabHub, type FakeCollabHub } from '@/playwright/fake-collab-hub';

const WORKSPACE_ID = 'ws-receipt-contract';
const OWNER = {
  controlKey: 'owner-control-key',
  memberId: 'owner-member-id',
  name: 'Owner',
  role: 'owner' as const,
};
const MEMBER = {
  controlKey: 'member-control-key',
  memberId: 'viewer-member-id',
  name: 'Member',
  role: 'member' as const,
};

let hub: FakeCollabHub | undefined;
let fixtureRoot: string | undefined;

afterEach(async () => {
  await hub?.close();
  hub = undefined;
  if (fixtureRoot) await rm(fixtureRoot, { force: true, recursive: true });
  fixtureRoot = undefined;
});

describe('fake collaboration hub authorization receipts', () => {
  it('uses the daemon contract maximum lifetime for a completed pull', async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'open-design-fake-collab-hub-'));
    const sourceDir = join(fixtureRoot, 'source');
    const targetDir = join(fixtureRoot, 'target');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'index.html'), '<h1>receipt fixture</h1>', 'utf8');
    hub = await startFakeCollabHub({
      root: fixtureRoot,
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Receipt contract workspace',
      clients: [OWNER, MEMBER],
    });

    const projectId = 'project-receipt-contract';
    const resourceId = 'resource-receipt-contract';
    await command([
      'resource',
      'push',
      'project',
      resourceId,
      sourceDir,
      '--ref',
      'published',
      '--json',
      '--metadata-json',
      JSON.stringify({ projectId }),
    ]);
    await command([
      'team-projects',
      'upsert',
      projectId,
      '--resource-id',
      resourceId,
      '--display-name',
      'Receipt fixture',
    ]);
    const receipt = JSON.parse(await command([
      'team-projects',
      'pull',
      projectId,
      targetDir,
      '--expected-version',
      '1',
      '--json',
    ], MEMBER.controlKey)) as { authorizedAt: string; expiresAt: string };

    const authorizedAt = Date.parse(receipt.authorizedAt);
    expect(Date.parse(receipt.expiresAt) - authorizedAt).toBe(2_000);

    const inspection = JSON.parse(await command([
      'team-projects',
      'pull',
      projectId,
      '--authorize-only',
      '--expected-version',
      '1',
      '--json',
    ], MEMBER.controlKey)) as { manifestEntryCount: number };
    expect(inspection.manifestEntryCount).toBe(1);
  });

  it('forwards the resource command workspace instead of the agent trace workspace', async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'open-design-fake-collab-hub-'));
    const velaBin = join(fixtureRoot, 'vela');
    hub = await startFakeCollabHub({
      root: fixtureRoot,
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Workspace header contract',
      clients: [OWNER],
    });
    await hub.writeVelaBin(velaBin);

    const snapshot = JSON.parse(await velaCommand(
      velaBin,
      ['billing', 'workspace-snapshot', '--json'],
      undefined,
      'ws-selected-by-resource-command',
    )) as { workspaceId: string };

    expect(snapshot.workspaceId).toBe('ws-selected-by-resource-command');
  });
});

describe('fake collaboration hub Vela resource pulls', () => {
  it('keeps single pull compatibility and isolates batch item failures', async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'open-design-fake-collab-hub-'));
    const sourceDir = join(fixtureRoot, 'source');
    const otherSourceDir = join(fixtureRoot, 'other-source');
    const singleTarget = join(fixtureRoot, 'single-target');
    const otherTarget = join(fixtureRoot, 'other-target');
    const batchTarget = join(fixtureRoot, 'batch-target');
    const velaBin = join(fixtureRoot, 'vela');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(otherSourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'index.html'), '<h1>resource fixture</h1>', 'utf8');
    await writeFile(join(otherSourceDir, 'index.html'), '<h1>other workspace</h1>', 'utf8');
    hub = await startFakeCollabHub({
      root: fixtureRoot,
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Resource pull workspace',
      clients: [OWNER, MEMBER],
    });
    await hub.writeVelaBin(velaBin);

    await velaCommand(velaBin, [
      'resource', 'push', 'plugin', 'plugin-present', sourceDir, '--json',
    ]);
    await velaCommand(
      velaBin,
      ['resource', 'push', 'plugin', 'plugin-present', otherSourceDir, '--json'],
      undefined,
      'ws-other',
    );

    const single = JSON.parse(await velaCommand(velaBin, [
      'resource', 'pull', 'plugin', 'plugin-present', singleTarget, '--json',
    ])) as { version: number };
    expect(single.version).toBe(1);
    await expect(readFile(join(singleTarget, 'index.html'), 'utf8'))
      .resolves.toContain('resource fixture');
    await velaCommand(
      velaBin,
      ['resource', 'pull', 'plugin', 'plugin-present', otherTarget, '--json'],
      undefined,
      'ws-other',
    );
    await expect(readFile(join(otherTarget, 'index.html'), 'utf8'))
      .resolves.toContain('other workspace');

    const batch = JSON.parse(await velaCommand(
      velaBin,
      ['resource', 'pull-batch', '--requests-file', '-', '--json'],
      JSON.stringify({
        requests: [
          {
            key: 'present',
            kind: 'plugin',
            resourceId: 'plugin-present',
            dir: batchTarget,
            ref: 'published',
          },
          {
            key: 'missing',
            kind: 'skill',
            resourceId: 'skill-missing',
            dir: join(fixtureRoot, 'missing-target'),
            ref: 'published',
          },
        ],
      }),
    )) as {
      results: Array<{ key: string; ok: boolean; errorCode?: string }>;
      succeeded: number;
      failed: number;
    };
    expect(batch).toMatchObject({
      succeeded: 1,
      failed: 1,
      results: [
        { key: 'present', ok: true },
        { key: 'missing', ok: false, errorCode: 'resource_not_found' },
      ],
    });
    await expect(readFile(join(batchTarget, 'index.html'), 'utf8'))
      .resolves.toContain('resource fixture');
  });
});

async function command(
  args: string[],
  controlKey = OWNER.controlKey,
): Promise<string> {
  if (!hub) throw new Error('fake collaboration hub is not running');
  const response = await fetch(`${hub.url}/__e2e/command`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${controlKey}`,
      'content-type': 'application/json',
      'x-vela-workspace-id': WORKSPACE_ID,
    },
    body: JSON.stringify({ args }),
  });
  const raw = await response.text();
  expect(response.ok, raw).toBe(true);
  const body = JSON.parse(raw) as { stdout: string };
  return body.stdout;
}

async function velaCommand(
  bin: string,
  args: string[],
  input?: string,
  workspaceId = WORKSPACE_ID,
): Promise<string> {
  if (!hub) throw new Error('fake collaboration hub is not running');
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, {
      env: {
        ...process.env,
        OPEN_DESIGN_WORKSPACE_ID: WORKSPACE_ID,
        VELA_WORKSPACE_ID: workspaceId,
        VELA_API_URL: hub!.url,
        VELA_CONTROL_KEY: OWNER.controlKey,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`fake Vela exited ${String(code)}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}
