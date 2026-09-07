// ---------------------------------------------------------------------------
// GUARDRAIL: the file-mutation routes keep workspace-artifact identity in sync.
//
// `renameWorkspaceArtifactPath` and `deleteWorkspaceArtifact` are unit-tested
// in `chat-artifacts-store.test.ts`. Nothing tested that a route ever CALLS
// them, and all three call sites sit inside a `try { … } catch { console.warn }`
// — so deleting the call, or throwing inside it, produced a green suite and a
// silently wrong workspace pointer:
//
//   * rename not followed  -> a card's click target still names the old path,
//                             which no longer exists.
//   * delete not tombstoned -> the identity stays live at a freed path, so a
//                             later file that takes the name inherits the
//                             deleted file's history instead of getting a
//                             fresh identity.
//
// Both delete routes are covered. They are separate handlers over the same
// bookkeeping (`/files/:name` and the `/raw/*` splat), so one can lose the call
// while the other keeps it.
// ---------------------------------------------------------------------------

import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/db.js';
import {
  ensureWorkspaceArtifactForPath,
  getWorkspaceArtifact,
  getLiveWorkspaceArtifactByPath,
} from '../src/chat-artifacts/store.js';

const projectId = 'proj-file-route-wiring';

describe('file mutation routes move workspace artifact identity', () => {
  let server: http.Server;
  let baseUrl: string;
  let dataDir: string;
  let projectDir: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    dataDir = process.env.OD_DATA_DIR!;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectId }),
    });
    expect(created.status).toBe(200);
    projectDir = path.join(dataDir, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    closeDatabase();
  });

  async function seedFileWithIdentity(name: string): Promise<string> {
    await writeFile(path.join(projectDir, name), Buffer.from(`bytes-for-${name}`, 'utf8'));
    const db = openDatabase(dataDir, { dataDir });
    const row = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: name,
      kind: 'html',
    });
    return row.id;
  }

  it('follows a rename instead of stranding the identity on the old path', async () => {
    const artifactId = await seedFileWithIdentity('before.html');

    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'before.html', to: 'after.html' }),
    });
    expect(renamed.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    // Same identity, new path — not a second row, and not a stale pointer.
    expect(getWorkspaceArtifact(db, artifactId)?.currentPath).toBe('after.html');
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'before.html')).toBeNull();
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'after.html')?.id).toBe(artifactId);
  });

  it('tombstones the identity when DELETE /files/:name removes the file', async () => {
    const artifactId = await seedFileWithIdentity('doomed-by-name.html');

    const deleted = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/doomed-by-name.html`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    const row = getWorkspaceArtifact(db, artifactId);
    expect(row?.deletedAt, 'the deleted file left a tombstone').toBeTruthy();
    expect(row?.currentPath).toBeNull();
    // The path is free again: a later file that takes the name must get its
    // own identity rather than inheriting this one's history.
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'doomed-by-name.html')).toBeNull();
  });

  it('tombstones the identity when DELETE /raw/* removes the file', async () => {
    const artifactId = await seedFileWithIdentity('doomed-by-raw.html');

    const deleted = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/doomed-by-raw.html`,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(200);

    const db = openDatabase(dataDir, { dataDir });
    const row = getWorkspaceArtifact(db, artifactId);
    expect(row?.deletedAt, 'the deleted file left a tombstone').toBeTruthy();
    expect(row?.currentPath).toBeNull();
    expect(getLiveWorkspaceArtifactByPath(db, projectId, 'doomed-by-raw.html')).toBeNull();
  });
});
