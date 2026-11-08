import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { CommentFileMutation, CommentFileState } from '@open-design/contracts';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';

test('the root-receipt fixture admits copied bytes, not proposals, foreign receipts or stale CAS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-root-receipts-'));
  const owner = { controlKey: 'mock-owner', memberId: 'owner', name: 'Owner', role: 'owner' as const };
  const other = { controlKey: 'mock-other', memberId: 'other', name: 'Other', role: 'member' as const };
  const hub = await startFakeCollabHub({ root, workspaceId: 'w', workspaceName: 'Fixture', clients: [owner, other] });
  try {
    const command = async (args: string[], identity: typeof owner | typeof other = owner) => {
      const response = await fetch(`${hub.url}/__e2e/command`, { method: 'POST',
        headers: { authorization: `Bearer ${identity.controlKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ args }) });
      const body = await response.json() as { stdout?: string };
      return { status: response.status, stdout: body.stdout };
    };
    const read = async () => {
      const result = await command(['team-projects', 'get', 'p', '--json']);
      expect(result.status).toBe(200);
      if (!result.stdout) throw new Error('missing catalog response');
      return JSON.parse(result.stdout) as { resourceId: string; metadata: { _commentFiles?: CommentFileState } | null };
    };
    expect((await command(['team-projects', 'ensure-private', 'p'])).status).toBe(200);
    const resourceId = (await read()).resourceId;
    const bytes = join(root, 'bytes');
    await mkdir(bytes);
    await writeFile(join(bytes, 'a.html'), '<h1>Actual fixture snapshot</h1>');
    expect((await command(['resource', 'push', 'project', resourceId, bytes])).status).toBe(200);
    const file = { sourceFileId: randomUUID(), sourceFilePath: 'a.html', entryPath: 'a.html', retired: false };
    const mutation: CommentFileMutation = { schemaVersion: 1, baseRevision: 0, resourceId, versionId: 'v1', files: [file] };
    const upsert = (proposal: unknown, identity: typeof owner | typeof other = owner) => command(['team-projects', 'upsert', 'p',
      '--resource-id', resourceId, '--metadata-json', JSON.stringify({ _commentFiles: proposal })], identity);
    // All rejections must leave the fixture's authoritative roster absent.
    for (const proposal of [
      { ...mutation, baseRevision: 1 },
      { ...mutation, versionId: 'v999' },
      { ...mutation, resourceId: 'unowned-root' },
      { schemaVersion: 1, revision: 1, files: [] },
      { ...mutation, files: [{ ...file, sourceFilePath: '../a.html', entryPath: '../a.html' }] },
      { ...mutation, files: [{ ...file, sourceFilePath: 'missing.html', entryPath: 'missing.html' }] },
      { ...mutation, files: [{ ...file, receipt: { resourceId, versionId: 'v1' } }] },
    ]) {
      expect((await upsert(proposal)).status).toBe(500);
      expect((await read()).metadata?._commentFiles).toBeUndefined();
    }
    expect((await upsert(mutation, other)).status).toBe(500);
    expect((await read()).metadata?._commentFiles).toBeUndefined();
    expect((await upsert(mutation)).status).toBe(200);
    const admitted: CommentFileState = { schemaVersion: 1, revision: 1,
      files: [{ ...file, resourceId, versionId: 'v1' }] };
    expect((await read()).metadata?._commentFiles).toEqual(admitted);
    expect((await upsert(mutation)).status).toBe(500);
    expect((await read()).metadata?._commentFiles).toEqual(admitted);
    expect((await command(['team-projects', 'upsert', 'p', '--metadata-json', JSON.stringify({ label: 'rename' })])).status).toBe(200);
    expect((await read()).metadata?._commentFiles).toEqual(admitted);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
  }
});
