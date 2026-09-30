import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
import { createVelaShareBindingPrepare } from '../src/collab/vela-share-binding-prepare.js';
import type { fetchVelaWorkspaceDirectory } from '../src/collab/vela-workspace-context.js';
import type { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createShareBindingStartup } from '../src/collab/share-binding-startup.js';
import { createInMemoryPublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
const member: WorkspaceDirectoryItem = { workspaceId: 'w', workspaceName: 'W', workspaceType: 'personal', workspaceMemberId: 'o', role: 'member', memberStatus: 'active', lifecycleState: 'active' };
it.each([true, false])('runs stored binding with only the original verified member: matching=%s', async matches => {
  const db = new Database(':memory:');
  try {
    const publications = createInMemoryPublicFilePublicationStore(); const outbox = createShareBindingOutbox(db);
    const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html' };
    publications.set(scope, { slug: 'stable', fileName: scope.filePath, url: 'https://example.test/stable' });
    outbox.enqueue({ ...scope, resourceId: 'r', publicationRevision: publications.getRevision(scope)!.token,
      receipt: { filePath: scope.filePath, slug: 'stable', publishedAt: 1, version: 2, versionId: 'v2', entryPath: 'index.html' } });
    const session = { profile: 'test' as const, apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null };
    const fetchDirectory = vi.fn<typeof fetchVelaWorkspaceDirectory>(async options => {
      session.controlKey = 'other-account';
      expect(options!.readSession!()!.controlKey).toBe('synthetic');
      return { ok: true, items: [{ ...member, workspaceMemberId: matches ? 'o' : 'other' }] };
    });
    const runCommand = vi.fn<typeof runPinnedVelaCommand>().mockResolvedValue(JSON.stringify({ status: 'active', projectId: 'p', slug: 'stable', verifiedVersion: 2, verifiedVersionId: 'v2' }));
    const prepare = createVelaShareBindingPrepare({ dataRoot: tmpdir(), readSession: () => session, fetchDirectory, runCommand });
    const result = await createShareBindingStartup(outbox, { publications, prepare, mutations: createPublicFileMutations() })();
    expect(result.bound).toBe(matches ? 1 : 0); expect(result.deferred).toBe(matches ? 0 : 1);
    expect(runCommand).toHaveBeenCalledTimes(matches ? 1 : 0);
    if (matches) expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ session: expect.objectContaining({ controlKey: 'synthetic' }), workspaceId: 'w', args: ['share','bind','stable','--project-id','p','--source-file-path','pages/local.html','--resource-id','r','--version','2','--version-id','v2','--json'] }));
    expect(outbox.list()).toHaveLength(matches ? 0 : 1);
    if (!matches) expect(outbox.list()[0]?.failureCount).toBe(1);
  } finally { db.close(); }
});
