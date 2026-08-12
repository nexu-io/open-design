// A readonly member's version-history GET must not write into the project.
//
// Reported as "a member can still open the time machine on a readonly shared
// project". Investigation (2026-07-27, feature-test hub, real owner/member
// daemons) found the *entry point* is intentional — 飞书 recvq56vFjQKfT
// deliberately un-gated it, because browsing history is a read action and the
// restore button keeps its own `viewerOnly` gate — and the restore ENDPOINT is
// correctly gated: a real member's headers get 403
// WORKSPACE_PROJECT_PERMISSION_DENIED, headerless gets 401.
//
// What is NOT correct is what the readonly member's GET does on the way to
// rendering that history:
//
//   GET /api/projects/:id/files/*/versions calls
//   `ensureCurrentProjectFileVersion` whenever the manifest is empty, which
//   takes a lock and CREATES a version on disk. On a member's mirror of
//   someone else's shared project that is a write into a project whose own
//   banner says "你可以查看和评论，但不能通过 Chat 或编辑工具修改 Artifact".
//
// It is also the reason the feature cannot deliver what recvq56vFjQKfT asked
// for. `.file-versions` is in `MEMBER_MIRROR_EXCLUDED_ENTRIES`
// (collab/vela-cli-resource-adapter.ts), so the owner's real history NEVER
// syncs to a member. Measured live: the owner had 4 versions; the member's
// panel showed exactly 1, labelled "Version 1", created by their own GET at
// the moment they opened the panel. The member was not reading the owner's
// history — they were reading a synthetic one their own read had just
// manufactured.
//
// Invariant this file pins: the baseline-version bootstrap belongs to callers
// with write authority over the project. A caller whose workspace identity
// proves it cannot write still gets to READ the history (no 401/403 — the
// entry stays open per recvq56vFjQKfT), it just gets the truthful empty
// history instead of a fabricated entry, and leaves nothing behind on disk.
//
// A persisted Workspace binding also means a headerless caller is not allowed
// to enter this data plane. It must prove the exact Workspace/member pair;
// absence of identity must neither expose history nor fabricate a local
// baseline version.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { openDatabase, updateWorkspaceProject } from '../src/db.js';

const WORKSPACE_ID = 'ws-readonly-mirror';
const OWNER_MEMBER_ID = 'member-owner-readonly-mirror';
const READER_MEMBER_ID = 'member-reader-readonly-mirror';

describe('version history on a readonly shared mirror', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, {
        method: 'DELETE',
        headers: memberHeaders(OWNER_MEMBER_ID, 'member'),
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function projectsRoot(): string {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    return path.join(dataDir, 'projects');
  }

  async function versionRootExists(projectId: string): Promise<boolean> {
    try {
      await fs.stat(path.join(projectsRoot(), projectId, '.file-versions'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A team-bound project owned by `OWNER_MEMBER_ID`. The production create
   * endpoint establishes the exact owner binding first; the fixture then marks
   * that same row as a pulled Team mirror without invoking the remote hub.
   *
   * Content is then written straight to the project directory instead of
   * through the file-write API, because that API bootstraps a version of its
   * own. The result is the shape a freshly pulled member mirror has: real
   * content on disk, no version manifest — `.file-versions` is in
   * `MEMBER_MIRROR_EXCLUDED_ENTRIES`, so a mirror never receives the owner's.
   */
  async function seedTeamProject(): Promise<string> {
    const id = `readonly-mirror-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...memberHeaders(OWNER_MEMBER_ID, 'member') },
      body: JSON.stringify({ id, name: 'Readonly mirror project' }),
    });
    expect(created.status).toBe(200);
    projectsToClean.push(id);

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const db = openDatabase(projectsRoot(), { dataDir });
    expect(updateWorkspaceProject(db, WORKSPACE_ID, id, {
      visibility: 'team',
      syncState: 'synced',
      resourceHubResourceId: `hub-${id}`,
    })).not.toBeNull();

    const dir = path.join(projectsRoot(), id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><html><body><h1>owner content</h1></body></html>',
      'utf8',
    );
    await fs.rm(path.join(dir, '.file-versions'), { recursive: true, force: true });
    return id;
  }

  function memberHeaders(memberId: string, role: 'owner' | 'member') {
    return {
      'x-od-workspace-id': WORKSPACE_ID,
      'x-od-workspace-member-id': memberId,
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': role,
      'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-member-status': 'active',
      'x-od-workspace-can-share-projects': 'true',
      'x-od-workspace-can-write-synced-files': 'true',
    };
  }

  async function getVersions(projectId: string, headers?: Record<string, string>) {
    const resp = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/index.html/versions`,
      headers ? { headers } : undefined,
    );
    expect(resp.status).toBe(200);
    return (await resp.json()) as { versions: { id: string; label?: string | null }[] };
  }

  it('does not fabricate a version, or write one, for a member who cannot write the project', async () => {
    const projectId = await seedTeamProject();
    expect(await versionRootExists(projectId)).toBe(false);

    const body = await getVersions(projectId, memberHeaders(READER_MEMBER_ID, 'member'));

    // The read still succeeds — the entry point stays open (recvq56vFjQKfT).
    // It just reports the truth: this mirror carries no version history.
    expect(body.versions).toEqual([]);
    // And it left nothing behind in a project the member cannot write.
    expect(await versionRootExists(projectId)).toBe(false);
  });

  it('still bootstraps a baseline version for the member who owns the project', async () => {
    const projectId = await seedTeamProject();

    const body = await getVersions(projectId, memberHeaders(OWNER_MEMBER_ID, 'member'));

    expect(body.versions.length).toBe(1);
    expect(await versionRootExists(projectId)).toBe(true);
  });

  it('rejects a headerless caller for a Workspace-bound project without writing', async () => {
    const projectId = await seedTeamProject();
    expect(await versionRootExists(projectId)).toBe(false);

    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/index.html/versions`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_CONTEXT_REQUIRED' },
    });
    expect(await versionRootExists(projectId)).toBe(false);
  });
});
