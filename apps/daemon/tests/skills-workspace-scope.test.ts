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
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';
import {
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';

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

async function fetchSkillIds(workspaceId?: string): Promise<string[]> {
  const resp = await fetch(
    `${baseUrl}/api/skills`,
    workspaceId
      ? {
          headers: {
            'x-od-workspace-id': workspaceId,
            'x-od-workspace-member-id': 'member-owner',
          },
        }
      : undefined,
  );
  const body = (await resp.json()) as { skills: Array<{ id: string }> };
  return body.skills.map((s) => s.id);
}

describe('GET /api/skills — workspace visibility scope', () => {
  it('keeps an unclaimed (unbound) skill visible from every workspace', async () => {
    const skillId = `wsscope-unclaimed-${Date.now()}`;
    await seedSkillFolder(skillId);

    expect(await fetchSkillIds('ws-scope-a')).toContain(skillId);
    expect(await fetchSkillIds('ws-scope-b')).toContain(skillId);
    // Also visible with no workspace header at all (unscoped catalog).
    expect(await fetchSkillIds()).toContain(skillId);
  });

  it('hides a skill claimed by a different workspace, but shows it from its own', async () => {
    const skillId = `wsscope-claimed-${Date.now()}`;
    await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'ws-scope-owner', 'member-owner');

    expect(await fetchSkillIds('ws-scope-owner')).toContain(skillId);
    expect(await fetchSkillIds('ws-scope-other')).not.toContain(skillId);
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
    // Still visible from its own workspace, and to any workspace for an
    // unclaimed sibling — this fix narrows one branch, not the whole filter.
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

    expect(resp.status).toBe(403);
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

  it('allows a workspace admin to delete a skill imported by someone else', async () => {
    const skillId = `wsgate-admin-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);
    bindSkillToWorkspace(skillId, 'skill-gate-3', 'member-owner');

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-admin', 'admin', 'skill-gate-3'),
    });

    expect(resp.status).toBe(200);
    expect(existsSync(folder)).toBe(false);
  });

  // No retroactive tagging (spec's stated design principle, same rule
  // design-systems and plugin already ship): a skill with no
  // workspace_resources row — every skill imported before this round shipped
  // — stays outside the isolation regime rather than becoming permanently
  // un-deletable the moment a caller happens to carry workspace headers.
  it('still allows deleting a legacy skill with no workspace binding at all', async () => {
    const skillId = `wsgate-legacy-${Date.now()}`;
    const folder = await seedSkillFolder(skillId);

    const resp = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: workspaceHeaders('member-someone-else', 'member', 'skill-gate-4'),
    });

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

    expect(resp.status).toBe(400);
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

    expect(resp.status).toBe(400);
    expect(existsSync(folder)).toBe(true);
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

  it('omits teamSynced for an unbound (legacy) skill', async () => {
    const skillId = `wsteamsynced-legacy-${Date.now()}`;
    await seedSkillFolder(skillId);

    const resp = await fetch(`${baseUrl}/api/skills`, {
      headers: workspaceHeaders('member-owner', 'member', 'ws-teamsynced-legacy'),
    });
    const body = (await resp.json()) as { skills: Array<{ id: string; teamSynced?: boolean }> };
    const skill = body.skills.find((s) => s.id === skillId);

    expect(skill).toBeTruthy();
    expect(skill?.teamSynced).toBeFalsy();
  });
});
