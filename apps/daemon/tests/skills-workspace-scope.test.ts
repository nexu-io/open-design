// Skill's workspace-isolation onboarding (specs/current/
// 04-resource-workspace-isolation.md §9.1): skill previously had NO
// persistent attribution at all — no table, no metadata.json, nothing —
// which meant `GET /api/skills` returned one flat list to every workspace
// and `DELETE /api/skills/:id` let ANY caller delete ANY skill regardless of
// who imported it or whether it was a team share. Skill now binds into the
// generic `workspace_resources` table (see db.ts) exactly like plugin does:
//
//   - `listSkills`'s workspace filter (skills.ts's `skillVisibleFromWorkspace`)
//     — mirrors `listInstalledPlugins`'s one-way "unclaimed visible
//     everywhere, claimed elsewhere hidden" rule.
//   - `DELETE /api/skills/:id` is gated by the shared
//     `enforceWorkspaceResourceMutation` (collab/workspace-resource-mutation.ts),
//     the same gate `POST /api/plugins/:id/uninstall` uses — see
//     tests/plugins-uninstall-workspace-gate.test.ts for the plugin
//     equivalent this file mirrors.
//
// Follows the same "seed the skill folder directly on disk, alongside the
// real running server, then bind it via db.ts" pattern as the plugin test:
// db.ts caches one SQLite instance per resolved data dir, and
// RUNTIME_DATA_DIR / OD_DATA_DIR agree within one vitest file, so this
// reuses the server's own connection instead of racing a second one.

import type http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';
import {
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';
import { materializeWorkspaceScopedTeamResource } from '../src/collab/team-resource-materialization.js';
import { workspaceTeamSkillBindingResourceId } from '../src/skills/workspace-team-binding.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let userSkillsDir: string;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
  // Same data root the running server resolved RUNTIME_DATA_DIR from (see
  // server.ts's `USER_SKILLS_DIR = path.join(RUNTIME_DATA_DIR, 'skills')`);
  // tests/setup.ts pins OD_DATA_DIR to an isolated temp dir before any test
  // imports server.ts, and it is already absolute, so resolveDataDir()
  // returns it unchanged.
  userSkillsDir = path.join(process.env.OD_DATA_DIR!, 'skills');
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function workspaceHeaders(memberId: string, role: 'owner' | 'admin' | 'member', workspaceId: string) {
  return {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': memberId,
    'x-od-workspace-role': role,
  };
}

async function seedSkillFolder(skillId: string): Promise<string> {
  const folder = path.join(userSkillsDir, skillId);
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, 'SKILL.md'),
    `---\nname: "${skillId}"\ndescription: "Test skill ${skillId}."\n---\n\nBody for ${skillId}.\n`,
  );
  return folder;
}

function bindSkillToWorkspace(skillId: string, workspaceId: string, createdByWorkspaceMemberId: string) {
  const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
  return ensureWorkspaceResource(db, 'skill', workspaceId, skillId, {
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId,
    updatedByWorkspaceMemberId: createdByWorkspaceMemberId,
  });
}

async function fetchSkills(
  workspaceId?: string,
  workspaceMemberId = 'member-owner',
): Promise<Array<{ id: string; source?: string; teamSynced?: boolean }>> {
  const resp = await fetch(
    `${baseUrl}/api/skills`,
    workspaceId
      ? {
          headers: {
            'x-od-workspace-id': workspaceId,
            'x-od-workspace-member-id': workspaceMemberId,
          },
        }
      : undefined,
  );
  const body = (await resp.json()) as {
    skills: Array<{ id: string; source?: string; teamSynced?: boolean }>;
  };
  return body.skills;
}

async function fetchSkillIds(
  workspaceId?: string,
  workspaceMemberId = 'member-owner',
): Promise<string[]> {
  return (await fetchSkills(workspaceId, workspaceMemberId)).map((skill) => skill.id);
}

describe('GET /api/skills — workspace visibility scope', () => {
  it('quarantines an unclaimed user skill from every explicit workspace', async () => {
    const skillId = `wsscope-unclaimed-${Date.now()}`;
    await seedSkillFolder(skillId);

    expect(await fetchSkillIds('ws-scope-a', 'member-a')).not.toContain(skillId);
    expect(await fetchSkillIds('ws-scope-b', 'member-b')).not.toContain(skillId);
    // Signed-out/local catalog remains able to use the preserved legacy skill.
    expect(await fetchSkillIds()).toContain(skillId);
  });

  it('hides a skill claimed by a different workspace, but shows it from its own', async () => {
    const skillId = `wsscope-claimed-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-owner', 'member-owner');

    expect(await fetchSkillIds('ws-scope-owner')).toContain(skillId);
    expect(await fetchSkillIds('ws-scope-other')).not.toContain(skillId);
  });

  it('hides an unshared personal skill from another member in the same workspace', async () => {
    const skillId = `wsscope-personal-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-team', 'member-owner');

    expect(await fetchSkillIds('ws-scope-team', 'member-owner')).toContain(skillId);
    expect(await fetchSkillIds('ws-scope-team', 'member-other')).not.toContain(skillId);

    const detail = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      headers: workspaceHeaders('member-other', 'admin', 'ws-scope-team'),
    });
    const files = await fetch(`${baseUrl}/api/skills/${skillId}/files`, {
      headers: workspaceHeaders('member-other', 'owner', 'ws-scope-team'),
    });
    expect(detail.status).toBe(404);
    expect(files.status).toBe(404);
  });

  it('shows a shared Team skill to another member in the same workspace', async () => {
    const skillId = `wsscope-team-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-team-shared', 'member-owner');
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    updateWorkspaceResource(db, 'skill', 'ws-scope-team-shared', skillId, {
      visibility: 'team',
    });

    expect(await fetchSkillIds('ws-scope-team-shared', 'member-other')).toContain(skillId);
    const detail = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      headers: workspaceHeaders('member-other', 'member', 'ws-scope-team-shared'),
    });
    expect(detail.status).toBe(200);
  });

  it('falls back to the bundled skill when another member owns a same-id user shadow', async () => {
    const skillId = 'agent-browser';
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-shadow', 'member-owner');

    const mine = (await fetchSkills('ws-scope-shadow', 'member-owner'))
      .find((skill) => skill.id === skillId);
    const other = (await fetchSkills('ws-scope-shadow', 'member-other'))
      .find((skill) => skill.id === skillId);

    expect(mine?.source).toBe('user');
    expect(other?.source).toBe('built-in');
  });

  it('keeps a built-in edit shadow private and rejects a same-id overwrite by another member', async () => {
    const skillId = 'full-page-screenshot';
    const ownerHeaders = {
      ...workspaceHeaders('member-owner', 'member', 'ws-scope-edit-shadow'),
      'content-type': 'application/json',
    };
    const otherHeaders = {
      ...workspaceHeaders('member-other', 'admin', 'ws-scope-edit-shadow'),
      'content-type': 'application/json',
    };
    const ownerEdit = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'PUT',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: skillId,
        description: 'Private owner edit',
        body: 'PRIVATE OWNER SKILL BODY',
      }),
    });
    expect(ownerEdit.status).toBe(200);

    const ownerDetail = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      headers: ownerHeaders,
    });
    const otherDetail = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      headers: otherHeaders,
    });
    const ownerBody = await ownerDetail.text();
    const otherBody = await otherDetail.text();
    expect(ownerBody).toContain('PRIVATE OWNER SKILL BODY');
    expect(otherBody).not.toContain('PRIVATE OWNER SKILL BODY');
    expect(JSON.parse(otherBody).source).toBe('built-in');

    const overwrite = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'PUT',
      headers: otherHeaders,
      body: JSON.stringify({
        name: skillId,
        description: 'Attacker edit',
        body: 'ATTACKER OVERWRITE',
      }),
    });
    expect(overwrite.status).toBe(409);
    const ownerAfter = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      headers: ownerHeaders,
    });
    expect(await ownerAfter.text()).toContain('PRIVATE OWNER SKILL BODY');
  });

  // spec 04 §10: the symmetric case plugin/design-system already pin — a
  // CLAIMED skill must not leak to a caller with no workspace identity at
  // all (signed-out client, headerless `curl`), not just to a caller scoped
  // to a DIFFERENT workspace. Before this fix, `GET /api/skills` with no
  // header fell through to the unfiltered "no scope = everything" branch the
  // same way plugin/design-system did — "no scope" must not mean "trust
  // everything" (recvqbeDjAsejl / recvqbklNGDqYY).
  it('hides a claimed skill from a caller with no workspace header at all', async () => {
    const skillId = `wsscope-headerless-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-headerless', 'member-owner');

    expect(await fetchSkillIds()).not.toContain(skillId);
    // Still visible from its exact owner identity.
    expect(await fetchSkillIds('ws-scope-headerless')).toContain(skillId);
  });
});

describe('DELETE /api/skills/:id — workspace ownership gate', () => {
  it('rejects a non-owner, non-privileged member of the same workspace', async () => {
    const skillId = `wsgate-member-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-1', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-other', 'member', 'skill-gate-1'),
    });

    expect(resp.status).toBe(404);
    expect(existsSync(folder)).toBe(true);
  });

  it('allows the member who imported the skill to delete it', async () => {
    const skillId = `wsgate-self-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-2', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-owner', 'member', 'skill-gate-2'),
    });

    expect(resp.status).toBe(200);
    expect(existsSync(folder)).toBe(false);
    // The binding row is cleaned up too — no orphan left behind for a future
    // re-import of the same id to find and silently reuse.
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    expect(getWorkspaceResourceByResourceId(db, 'skill', skillId)).toBeUndefined();
  });

  it('does not let a workspace admin discover or delete another member\'s Personal skill', async () => {
    const skillId = `wsgate-admin-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-3', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-admin', 'admin', 'skill-gate-3'),
    });

    expect(resp.status).toBe(404);
    expect(existsSync(folder)).toBe(true);
  });

  it('quarantines a legacy unbound skill from an explicitly scoped caller', async () => {
    const skillId = `wsgate-legacy-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-someone-else', 'member', 'skill-gate-4'),
    });

    expect(resp.status).toBe(404);
    expect(existsSync(folder)).toBe(true);
  });

  it('keeps a legacy unbound skill manageable from the headerless local lane', async () => {
    const skillId = `wsgate-legacy-local-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, { method: 'DELETE' });

    expect(resp.status).toBe(200);
    expect(existsSync(folder)).toBe(false);
  });

  it('rejects a headerless caller against a team-visibility skill', async () => {
    const skillId = `wsgate-team-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-5', 'member-owner');
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    updateWorkspaceResource(db, 'skill', 'skill-gate-5', skillId, { visibility: 'team' });

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, { method: 'DELETE' });

    expect(resp.status).toBe(404);
    expect(existsSync(folder)).toBe(true);
  });

  // spec 04 §10 fix #3: `enforceWorkspaceResourceMutation`'s null-ctx branch
  // used to only refuse a `visibility: 'team'` row, letting a headerless
  // caller delete any BOUND-BUT-`personal` skill (`bindSkillToWorkspace`
  // above defaults to `visibility: 'personal'`) — a claimed resource is a
  // claimed resource regardless of who else it's shared with.
  it('rejects a headerless caller against a personal-visibility (but bound) skill too', async () => {
    const skillId = `wsgate-personal-headerless-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-6', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, { method: 'DELETE' });

    expect(resp.status).toBe(404);
    expect(existsSync(folder)).toBe(true);
  });
});

describe('Team Skill mutation targets', () => {
  it.each(['PUT', 'DELETE'] as const)(
    'rejects %s without modifying a same-id Personal skill',
    async (method) => {
      const skillId = `team-same-id-mutation-${method.toLowerCase()}-${Date.now()}`;
      const workspaceId = `team-same-id-workspace-${method.toLowerCase()}`;
      const personalFolder = await seedSkillFolder(skillId);
      bindSkillToWorkspace(skillId, workspaceId, 'member-owner');
      const personalBefore = await readFile(path.join(personalFolder, 'SKILL.md'), 'utf8');

      const materialized = await materializeWorkspaceScopedTeamResource({
        kindRoot: userSkillsDir,
        storageName: skillId,
        identity: {
          kind: 'skill',
          workspaceId,
          resourceId: skillId,
          hubResourceId: `skill-${workspaceId}-${skillId}`,
        },
        pullInto: async (directory) => {
          await writeFile(
            path.join(directory, 'SKILL.md'),
            `---\nname: "${skillId}"\ndescription: Team copy.\n---\n\nTEAM SKILL BODY\n`,
          );
        },
        verifyWorkspaceScope: async () => true,
        verifyStillShared: async () => true,
      });
      expect(materialized.status).toBe('committed');
      const teamFolder = materialized.status === 'committed' ? materialized.targetDir : '';
      const teamBefore = await readFile(path.join(teamFolder, 'SKILL.md'), 'utf8');
      const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
      ensureWorkspaceResource(
        db,
        'skill',
        workspaceId,
        workspaceTeamSkillBindingResourceId(workspaceId, skillId),
        { visibility: 'team', resourceState: 'active' },
      );

      const response = await fetch(`${baseUrl}/api/skills/${skillId}`, {
        method,
        headers: {
          ...workspaceHeaders('member-owner', 'owner', workspaceId),
          ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}),
        },
        ...(method === 'PUT'
          ? {
              body: JSON.stringify({
                name: skillId,
                description: 'Attempted overwrite',
                body: 'MUTATED PERSONAL BODY',
              }),
            }
          : {}),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_RESOURCE_MANAGE_DENIED' },
      });
      expect(await readFile(path.join(personalFolder, 'SKILL.md'), 'utf8'))
        .toBe(personalBefore);
      expect(await readFile(path.join(teamFolder, 'SKILL.md'), 'utf8'))
        .toBe(teamBefore);
      expect(existsSync(personalFolder)).toBe(true);
      expect(existsSync(teamFolder)).toBe(true);
    },
  );
});

describe('POST /api/skills/install — same-id ownership preflight', () => {
  it('does not let another member install over an existing Personal skill identity', async () => {
    const skillId = `wsgate-install-${Date.now()}`;
    const ownerFolder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-install-gate', 'member-owner');
    const ownerBefore = await readFile(path.join(ownerFolder, 'SKILL.md'), 'utf8');
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'od-skill-conflict-'));
    const attackerSource = path.join(sourceRoot, 'different-folder-name');
    await mkdir(attackerSource);
    await writeFile(
      path.join(attackerSource, 'SKILL.md'),
      `---\nname: "${skillId}"\ndescription: attacker\n---\n\nATTACKER BYTES\n`,
    );

    try {
      const response = await fetch(`${baseUrl}/api/skills/install`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...workspaceHeaders('member-other', 'admin', 'skill-install-gate'),
        },
        body: JSON.stringify({ source: 'local', path: attackerSource }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WORKSPACE_RESOURCE_ID_CONFLICT' },
      });
      expect(await readFile(path.join(ownerFolder, 'SKILL.md'), 'utf8')).toBe(ownerBefore);
      expect(existsSync(path.join(userSkillsDir, 'different-folder-name'))).toBe(false);
      const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
      expect(getWorkspaceResourceByResourceId(db, 'skill', skillId)).toMatchObject({
        workspaceId: 'skill-install-gate',
        createdByWorkspaceMemberId: 'member-owner',
      });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});

// Skill previously had NO field at all distinguishing a skill materialized
// from a TEAMMATE's team share from one the caller authored themselves — both
// read `source: 'user'`. Design-system (`metadata.json`'s `teamSynced`) and
// plugin (`installed_plugins.source`'s `team:plugin:` prefix) already carried
// this; skill was the one kind missing it entirely, so unsharing a skill
// team-side made the puller's stale copy silently reappear as "Personal"
// instead of just dropping out of the Team scope. `teamSynced` on
// `SkillSummary` closes that gap, sourced from the same `workspace_resources`
// binding `syncSharedTeamSkill`'s `markTeamSynced` (server.ts) already writes
// as `visibility: 'team'` — this test only exercises the READ side (the
// `GET /api/skills` projection), not the write path itself.
describe('GET /api/skills — teamSynced projection', () => {
  it('reports teamSynced:true for a skill bound with visibility "team"', async () => {
    const skillId = `wsteamsynced-team-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-teamsynced-1', 'member-owner');
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    updateWorkspaceResource(db, 'skill', 'ws-teamsynced-1', skillId, { visibility: 'team' });

    const resp = await fetch(`${baseUrl}/api/skills`, {
      headers: workspaceHeaders('member-owner', 'member', 'ws-teamsynced-1'),
    });
    const body = (await resp.json()) as { skills: Array<{ id: string; teamSynced?: boolean }> };
    const skill = body.skills.find((s) => s.id === skillId);

    expect(skill?.teamSynced).toBe(true);
  });

  it('hides a tombstoned Team mirror while retaining its recovery copy and attribution', async () => {
    const workspaceId = 'ws-teamsynced-tombstone';
    const skillId = `wsteamsynced-tombstone-${Date.now()}`;
    const materialized = await materializeWorkspaceScopedTeamResource({
      kindRoot: userSkillsDir,
      storageName: skillId,
      identity: {
        kind: 'skill',
        workspaceId,
        resourceId: skillId,
        hubResourceId: `skill-${workspaceId}-${skillId}`,
      },
      pullInto: (directory) => writeFile(
        path.join(directory, 'SKILL.md'),
        `---\nname: "${skillId}"\ndescription: "Test Team skill ${skillId}."\n---\n\nBody for ${skillId}.\n`,
      ),
      verifyWorkspaceScope: async () => true,
      verifyStillShared: async () => true,
    });
    expect(materialized.status).toBe('committed');
    const folder = materialized.status === 'committed' ? materialized.targetDir : '';
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    const bindingId = workspaceTeamSkillBindingResourceId(workspaceId, skillId);
    ensureWorkspaceResource(db, 'skill', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-owner',
    });

    expect(await fetchSkillIds(workspaceId)).toContain(skillId);

    updateWorkspaceResource(db, 'skill', workspaceId, bindingId, { resourceState: 'deleted' });

    expect(await fetchSkillIds(workspaceId)).not.toContain(skillId);
    expect(existsSync(folder)).toBe(true);
    expect(getWorkspaceResourceByResourceId(db, 'skill', bindingId)).toMatchObject({
      workspaceId,
      visibility: 'team',
      resourceState: 'deleted',
    });
  });

  it('omits teamSynced for a personal-visibility bound skill (the sharer\'s own copy)', async () => {
    const skillId = `wsteamsynced-personal-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-teamsynced-2', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills`, {
      headers: workspaceHeaders('member-owner', 'member', 'ws-teamsynced-2'),
    });
    const body = (await resp.json()) as { skills: Array<{ id: string; teamSynced?: boolean }> };
    const skill = body.skills.find((s) => s.id === skillId);

    expect(skill).toBeTruthy();
    expect(skill?.teamSynced).toBeFalsy();
  });

  it('keeps an unbound legacy skill out of an explicit workspace', async () => {
    const skillId = `wsteamsynced-legacy-${Date.now()}`;
    await seedSkillFolder(skillId);

    const resp = await fetch(`${baseUrl}/api/skills`, {
      headers: workspaceHeaders('member-owner', 'member', 'ws-teamsynced-legacy'),
    });
    const body = (await resp.json()) as { skills: Array<{ id: string; teamSynced?: boolean }> };
    const skill = body.skills.find((s) => s.id === skillId);

    expect(skill).toBeUndefined();
    expect((await fetchSkills()).find((row) => row.id === skillId)?.teamSynced).toBeFalsy();
  });
});
