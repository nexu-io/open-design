import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getProject,
  listConversations,
  listMessages,
  listWorkspaceProjects,
  openDatabase,
  updateProject,
} from '../../src/db.js';
import {
  getTeamProjectMaterialization,
  latestTeamProjectMaterializationVersion,
  materializePulledTeamMirror,
  teamProjectMaterializationSupersedes,
} from '../../src/collab/team-mirror-materializer.js';
import type { AuthorizedTeamProjectPullReceipt } from '../../src/collab/authorized-team-project-pull.js';
import { projectResourceIdFor } from '../../src/integrations/vela-team-projects.js';

const roots: string[] = [];

const scope = {
  workspaceId: 'workspace-1',
  resourceTeamId: 'workspace-1',
  viewerMemberId: 'viewer-1',
  ownerMemberId: 'owner-1',
};
const resourceId = projectResourceIdFor('project-1', {
  teamId: scope.resourceTeamId,
  memberId: scope.ownerMemberId,
  role: 'member',
  lifecycleState: 'active',
  workspaceType: 'team',
});

function receipt(): AuthorizedTeamProjectPullReceipt {
  return {
    schemaVersion: 1,
    ...scope,
    projectId: 'project-1',
    resourceId,
    ref: 'published',
    version: 7,
    versionId: 'version-7',
    manifestDigest: `sha256:${'a'.repeat(64)}`,
    lifecycleState: 'active',
    authorizedAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T10:00:02.000Z',
  };
}

const input = {
  id: 'project-1',
  name: 'Pulled project',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
};

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function database() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-team-materialize-'));
  roots.push(root);
  return openDatabase(root, { dataDir: root });
}

describe('authorized team mirror SQLite materialization', () => {
  it('reads a newer legacy cursor after an authorized materialization', () => {
    expect(
      latestTeamProjectMaterializationVersion(
        { ...receipt(), version: 5 },
        '6',
        input.id,
        scope,
      ),
    ).toBe(6);
  });

  it('keeps a newer authorized cursor ahead of the legacy store', () => {
    expect(
      latestTeamProjectMaterializationVersion(
        receipt(),
        '6',
        input.id,
        scope,
      ),
    ).toBe(7);
  });

  it('ignores an authorized cursor with a mismatched scope or resource binding', () => {
    expect(
      latestTeamProjectMaterializationVersion(
        { ...receipt(), viewerMemberId: 'other-viewer', version: 9 },
        '6',
        input.id,
        scope,
      ),
    ).toBe(6);
    expect(
      latestTeamProjectMaterializationVersion(
        { ...receipt(), resourceId: 'non-canonical', version: 9 },
        null,
        input.id,
        scope,
      ),
    ).toBeNull();
  });

  it('rejects malformed, negative, fractional, and unsafe legacy cursors', () => {
    for (const legacy of ['', '-1', '1.5', '01', '9007199254740992']) {
      expect(
        latestTeamProjectMaterializationVersion(null, legacy, input.id, scope),
      ).toBeNull();
    }
  });

  it('classifies only a newer receipt with the same canonical binding as superseding', () => {
    const previous = { ...receipt(), version: 5, versionId: 'version-5' };

    expect(teamProjectMaterializationSupersedes(receipt(), previous)).toBe(true);
    expect(
      teamProjectMaterializationSupersedes(
        {
          ...previous,
          authorizedAt: '2026-07-26T10:00:01.000Z',
          expiresAt: '2026-07-26T10:00:03.000Z',
        },
        previous,
      ),
    ).toBe(true);
    expect(
      teamProjectMaterializationSupersedes(
        { ...receipt(), viewerMemberId: 'other-viewer' },
        previous,
      ),
    ).toBe(false);
    expect(
      teamProjectMaterializationSupersedes(
        { ...receipt(), resourceId: 'non-canonical' },
        previous,
      ),
    ).toBe(false);
    expect(
      teamProjectMaterializationSupersedes(
        { ...receipt(), version: 5, versionId: 'other-version-5' },
        previous,
      ),
    ).toBe(false);
  });

  it('commits metadata, binding, and the full authorization receipt together', async () => {
    const db = await database();

    materializePulledTeamMirror(db, input, scope, receipt());

    expect(getProject(db, input.id)?.name).toBe('Pulled project');
    expect(getTeamProjectMaterialization(db, scope.workspaceId, input.id))
      .toEqual(receipt());
  });

  it('refreshes an existing foreign mirror name when the owner metadata is newer', async () => {
    const db = await database();
    materializePulledTeamMirror(db, input, scope, receipt());

    materializePulledTeamMirror(db, {
      ...input,
      name: 'Renamed by owner',
      updatedAt: input.updatedAt + 10,
    }, scope, { ...receipt(), version: 8, versionId: 'version-8' });

    expect(getProject(db, input.id)).toMatchObject({
      name: 'Renamed by owner',
      updatedAt: input.updatedAt + 10,
    });
  });

  it('never overwrites an owner local rename from catalog materialization', async () => {
    const db = await database();
    const ownerScope = {
      ...scope,
      ownerMemberId: scope.viewerMemberId,
    };
    materializePulledTeamMirror(db, input, ownerScope);
    updateProject(db, input.id, { name: 'Pending owner rename', updatedAt: 20 });

    materializePulledTeamMirror(db, {
      ...input,
      name: 'Catalog retry name',
      updatedAt: 30,
    }, ownerScope);

    expect(getProject(db, input.id)).toMatchObject({
      name: 'Pending owner rename',
      updatedAt: 20,
    });
  });

  it('creates one stable local-only comment anchor without copying owner chat', async () => {
    const db = await database();

    materializePulledTeamMirror(db, input, scope, receipt());
    const first = listConversations(db, input.id);

    expect(first).toHaveLength(1);
    expect(first[0]?.messageCount).toBe(0);
    expect(listMessages(db, first[0]!.id)).toEqual([]);

    materializePulledTeamMirror(db, input, scope, {
      ...receipt(),
      version: 8,
      versionId: 'version-8',
    });
    const second = listConversations(db, input.id);

    expect(second.map((conversation) => conversation.id))
      .toEqual(first.map((conversation) => conversation.id));
    expect(listMessages(db, second[0]!.id)).toEqual([]);
  });

  it('rolls back metadata and binding when the exact receipt cursor cannot commit', async () => {
    const db = await database();
    db.exec(`
      CREATE TRIGGER reject_team_materialization
      BEFORE INSERT ON team_project_materializations
      BEGIN
        SELECT RAISE(ABORT, 'cursor unavailable');
      END;
    `);

    expect(() =>
      materializePulledTeamMirror(db, input, scope, receipt()),
    ).toThrow('cursor unavailable');

    expect(getProject(db, input.id)).toBeNull();
    expect(getTeamProjectMaterialization(db, scope.workspaceId, input.id))
      .toBeNull();
  });

  it('rejects a non-canonical but non-empty receipt resource id before mutation', async () => {
    const db = await database();

    expect(() =>
      materializePulledTeamMirror(db, input, scope, {
        ...receipt(),
        resourceId: 'resource-1',
      }),
    ).toThrow('receipt resource conflict');

    expect(getProject(db, input.id)).toBeNull();
  });
});

/**
 * The project card's time. `RecentProjectsStrip` renders one relative time per
 * card and `GET /api/workspaces/:id/projects` answers it as
 * `MAX(p.updated_at, wp.updated_at)` (see `normalizeWorkspaceProjectRow`'s
 * `lastActivityAt` in routes/project/index.ts, and `listWorkspaceProjects`'
 * own `ORDER BY` in db.ts). So BOTH halves have to answer "when did a person
 * last change this project's content" — a pull that stamps either one with
 * `Date.now()` is indistinguishable from a real edit.
 *
 * Reported by the owner: a member who opens the client hours later and pulls a
 * shared project sees 「刚刚更新」 on a project nobody touched. Materialization
 * already carries the origin's `updatedAt` into `projects`; the
 * `workspace_projects` binding written in the same transaction did not, and
 * `MAX` then surfaced the pull's own clock.
 */
describe('a team-mirror pull reports the origin content time, not the pull clock', () => {
  /** What the client renders for this project's card. */
  function displayedUpdatedAt(db: Awaited<ReturnType<typeof database>>) {
    const row = listWorkspaceProjects(db, scope.workspaceId).find(
      (candidate) => candidate.id === input.id,
    ) as { updatedAt: number; workspaceUpdatedAt: number | null } | undefined;
    if (!row) throw new Error('project is not listed in the workspace');
    return Math.max(row.updatedAt, row.workspaceUpdatedAt ?? 0);
  }

  it('does not advance the card time on a first pull', async () => {
    const db = await database();

    materializePulledTeamMirror(db, input, scope, receipt());

    expect(getProject(db, input.id)?.updatedAt).toBe(input.updatedAt);
    expect(displayedUpdatedAt(db)).toBe(input.updatedAt);
  });

  it('does not advance the card time on a re-pull of an already-bound mirror', async () => {
    const db = await database();

    materializePulledTeamMirror(db, input, scope, receipt());
    materializePulledTeamMirror(db, input, scope, {
      ...receipt(),
      version: 8,
      versionId: 'version-8',
    });

    expect(getProject(db, input.id)?.updatedAt).toBe(input.updatedAt);
    expect(displayedUpdatedAt(db)).toBe(input.updatedAt);
  });
});
