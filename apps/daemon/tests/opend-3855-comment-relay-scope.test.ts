import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { commentRelayScope, personalCommentRelayFilePaths } from '../src/collab/comment-relay-scope.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';

const owner: WorkspaceCollabContext = {
  workspaceId: 'w', teamId: 'w', workspaceMemberId: 'owner', workspaceType: 'team', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const binding = { workspaceId: 'w', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'owner' };

// Existing pure eligibility helper + real persisted publication, no network/auth mock.
it.each(['team', 'personal'] as const)('OPEND-3855: creator exact-file relay does not require project promotion in a %s workspace', workspaceType => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
    const publications = createSqlitePublicFilePublicationStore(db);
    const context = { ...owner, workspaceType };
    const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'public.html' };
    const resolve = (filePath = 'public.html', current = context, local = binding, projectId = 'p') =>
      commentRelayScope({ binding: local, context: current, projectId, filePath, publications });
    expect(resolve()).toBeNull();
    publications.set(scope, { slug: 'stable', url: 'https://viewer.example.test/stable', fileName: 'public.html' });
    expect.soft(resolve()).toEqual({ workspaceId: 'w', teamId: 'w', ownerMemberId: 'owner', relayScope: 'personal' });
    expect.soft([...personalCommentRelayFilePaths({ binding, context, projectId: 'p', publications })]).toEqual(['public.html']);
    // Knowing the project, file, or slug must not widen creator/publication scope.
    expect(resolve('private.html')).toBeNull();
    expect(resolve('public.html', context, binding, 'other-project')).toBeNull();
    expect(resolve('public.html', { ...context, workspaceMemberId: 'peer' })).toBeNull();
    expect(resolve('public.html', { ...context, workspaceId: 'other-workspace' })).toBeNull();
    expect(resolve('public.html', { ...context, memberStatus: 'removed' })).toBeNull();
    expect(resolve('public.html', context, { ...binding, resourceState: 'deleted' })).toBeNull();
    expect(resolve('public.html', context, { ...binding, createdByWorkspaceMemberId: '' })).toBeNull();
    publications.delete(scope);
    expect(resolve()).toBeNull();
  } finally { db.close(); }
});

it('team-visible project relay remains available without a public file link', () => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
    expect(commentRelayScope({ binding: { ...binding, visibility: 'team' }, context: owner,
      projectId: 'p', filePath: 'private.html', publications: createSqlitePublicFilePublicationStore(db) }))
      .toEqual({ workspaceId: 'w', teamId: 'w', ownerMemberId: 'owner', relayScope: 'team' });
  } finally { db.close(); }
});
