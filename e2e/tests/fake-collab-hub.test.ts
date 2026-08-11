import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
