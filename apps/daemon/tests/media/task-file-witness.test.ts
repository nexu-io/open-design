import http from 'node:http';
import path from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectFile } from '@open-design/contracts';
import { closeDatabase, insertProject, openDatabase } from '../../src/db.js';
import { insertMediaTask } from '../../src/media/tasks.js';
import { ensureProject } from '../../src/projects.js';
import { startServer } from '../../src/server.js';
import { resolveMediaTaskProjectFile } from '../../src/routes/media.js';

function projectFile(input: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    size: 3,
    mtime: 1_000,
    kind: 'image',
    mime: 'image/png',
    ...input,
  };
}

describe('media task file identity witness', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    closeDatabase();
  });

  it('tolerates a sub-millisecond mtime truncation but not filesystem-granularity drift', () => {
    const witness = { name: 'gone.png', size: 3, mtime: 1_000.456, kind: 'image' };

    expect(resolveMediaTaskProjectFile(witness, [projectFile({ name: 'moved.png', mtime: 1_000 })]))
      .toMatchObject({ name: 'moved.png' });
    // A 2s FAT-granularity drift is not an identity witness; stay fail-closed.
    expect(resolveMediaTaskProjectFile(witness, [projectFile({ name: 'moved.png', mtime: 3_000 })]))
      .toBeNull();
  });

  it('fails closed when the only size+mtime match is a different kind of file', () => {
    expect(resolveMediaTaskProjectFile(
      { name: 'gone.png', size: 3, mtime: 1_000, kind: 'image' },
      [projectFile({ name: 'notes.txt', kind: 'text', mime: 'text/plain' })],
    )).toBeNull();
  });

  it('refuses a project file that another media task already claimed by name', () => {
    const files = [projectFile({ name: 'kept.png' })];

    // Without a claim the witness resolves...
    expect(resolveMediaTaskProjectFile({ name: 'gone.png', size: 3, mtime: 1_000 }, files))
      .toMatchObject({ name: 'kept.png' });
    // ...but not when `kept.png` is already the confirmed output of another task.
    expect(resolveMediaTaskProjectFile(
      { name: 'gone.png', size: 3, mtime: 1_000 },
      files,
      new Set(['kept.png']),
    )).toBeNull();
  });

  it('never hands one surviving file to two moved media tasks', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectId = `project_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Contested media witness project',
      createdAt: now,
      updatedAt: now,
    });

    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = await ensureProject(projectsRoot, projectId);
    // One survivor. Two tasks recorded identical size+mtime witnesses, so
    // neither of them can prove it owns the file that is still there.
    const survivorPath = path.join(projectDir, 'survivor.png');
    await writeFile(survivorPath, Buffer.from('abc'));
    const survivor = await stat(survivorPath);

    const firstTaskId = `task_${randomUUID()}`;
    const secondTaskId = `task_${randomUUID()}`;
    for (const [taskId, name] of [[firstTaskId, 'first.png'], [secondTaskId, 'second.png']] as const) {
      insertMediaTask(db, {
        id: taskId,
        projectId,
        runId,
        status: 'done',
        surface: 'image',
        progress: ['done'],
        file: {
          name,
          size: survivor.size,
          mtime: survivor.mtimeMs,
          kind: 'image',
          mime: 'image/png',
        },
        startedAt: now - 500,
        endedAt: now,
      });
    }

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/media/tasks?includeDone=1`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      tasks: Array<{ taskId: string; file?: { name?: string } }>;
    };
    const withFiles = body.tasks.filter((task) => task.file?.name);
    expect(withFiles).toEqual([]);
  });
});
