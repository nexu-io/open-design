import express from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCreatorBackupRoutes } from '../src/routes/creator-backup.js';

let dataDir: string;
let scratch: string;

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function buildApp(projectIds: string[] = ['project-1']) {
  const app = express();
  app.use(express.json());
  registerCreatorBackupRoutes(app, {
    db: {},
    paths: { RUNTIME_DATA_DIR: dataDir },
    projectStore: {
      getProject: (_db, projectId) => (projectIds.includes(projectId) ? { id: projectId } : null),
    },
  });
  return app;
}

function seed(projectId: string, content: unknown): void {
  const dir = path.join(dataDir, 'creator-workbench');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${projectId}.json`), JSON.stringify(content));
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'od-creator-backup-routes-'));
  dataDir = path.join(scratch, 'data');
  mkdirSync(dataDir, { recursive: true });
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('creator backup routes', () => {
  it('returns 404 for an unknown project on GET and POST', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const list = await fetch(`${baseUrl}/api/projects/missing/creator-backups`);
      expect(list.status).toBe(404);

      const create = await fetch(`${baseUrl}/api/projects/missing/creator-backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(create.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('creates a snapshot and lists it for the owning project', async () => {
    seed('project-1', { tasks: [{ id: 't1' }] });
    const { server, baseUrl } = await listen(buildApp());
    try {
      const create = await fetch(`${baseUrl}/api/projects/project-1/creator-backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'release-candidate' }),
      });
      expect(create.status).toBe(201);
      const { backup } = (await create.json()) as { backup: { id: string; fileCount: number; note?: string } };
      expect(backup.fileCount).toBe(1);
      expect(backup.note).toBe('release-candidate');

      const list = await fetch(`${baseUrl}/api/projects/project-1/creator-backups`);
      expect(list.status).toBe(200);
      const body = (await list.json()) as { backups: { id: string }[] };
      expect(body.backups.map((b) => b.id)).toContain(backup.id);
    } finally {
      server.close();
    }
  });

  it('scopes listings to the requested project', async () => {
    seed('project-1', { tasks: [] });
    seed('project-2', { tasks: [] });
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      await fetch(`${baseUrl}/api/projects/project-1/creator-backups`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      const list1 = await (await fetch(`${baseUrl}/api/projects/project-1/creator-backups`)).json() as { backups: unknown[] };
      const list2 = await (await fetch(`${baseUrl}/api/projects/project-2/creator-backups`)).json() as { backups: unknown[] };
      expect(list1.backups.length).toBe(1);
      expect(list2.backups.length).toBe(0);
    } finally {
      server.close();
    }
  });

  it('validates a snapshot (200 when consistent, 422 when tampered)', async () => {
    seed('project-1', { tasks: [] });
    const { server, baseUrl } = await listen(buildApp());
    try {
      const create = await fetch(`${baseUrl}/api/projects/project-1/creator-backups`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      const { backup } = (await create.json()) as { backup: { id: string } };

      const ok = await fetch(`${baseUrl}/api/projects/project-1/creator-backups/${backup.id}/validate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backupId: backup.id }),
      });
      expect(ok.status).toBe(200);
      expect((await ok.json() as { valid: boolean }).valid).toBe(true);

      // tamper with the committed file so its SHA-256 no longer matches
      const root = path.join(path.dirname(dataDir), 'backups', 'creator');
      const payloadDir = path.join(root, backup.id.replace(/[^A-Za-z0-9._-]/g, '_'));
      writeFileSync(path.join(payloadDir, 'creator-workbench', 'project-1.json'), '{"tasks":[{"id":"x"}]}'); // changes hash

      const bad = await fetch(`${baseUrl}/api/projects/project-1/creator-backups/${backup.id}/validate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backupId: backup.id }),
      });
      expect(bad.status).toBe(422);
      expect((await bad.json() as { valid: boolean }).valid).toBe(false);
    } finally {
      server.close();
    }
  });

  it('rejects a path-unsafe backup id with 400 on validate', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const res = await fetch(`${baseUrl}/api/projects/project-1/creator-backups/..%2fescape/validate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it('does NOT expose a restore HTTP endpoint', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const res = await fetch(`${baseUrl}/api/projects/project-1/creator-backups/any-id/restore`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backupId: 'any-id' }),
      });
      // route is not registered -> express returns 404
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
