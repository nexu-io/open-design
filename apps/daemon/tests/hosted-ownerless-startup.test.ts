import type http from 'node:http';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';

const dataDir = process.env.OD_DATA_DIR as string;
const dbFileNames = ['app.sqlite', 'app.sqlite-shm', 'app.sqlite-wal'];

function resetDatabaseFiles(): void {
  closeDatabase();
  for (const fileName of dbFileNames) {
    rmSync(path.join(dataDir, fileName), { force: true });
  }
}

function seedOwnerlessUpgradeRows(): void {
  const db = openDatabase(process.cwd(), { dataDir });
  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  ).run('legacy-project', 'Legacy project', now, now);
  db.prepare(
    `INSERT INTO templates (id, name, source_project_id, files_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('legacy-template', 'Legacy template', 'legacy-project', '[]', now);
  db.prepare(
    `INSERT INTO routines
       (id, name, prompt, schedule_kind, schedule_value, project_mode, project_id,
        enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'legacy-routine',
    'Legacy routine',
    'Run the legacy routine',
    'daily',
    '09:00',
    'reuse',
    'legacy-project',
    1,
    now,
    now,
  );
  closeDatabase();
}

async function expectStartupFailure(): Promise<Error> {
  const result = await startServer({ port: 0, returnServer: true }).then(
    (started) => ({ started: started as { server?: http.Server } }),
    (error: unknown) => ({ error }),
  );
  if ('started' in result) {
    await new Promise<void>((resolve) => result.started.server?.close(() => resolve()));
    throw new Error('expected multitenant startup to fail');
  }
  return result.error instanceof Error ? result.error : new Error(String(result.error));
}

describe('hosted ownerless data startup guard', () => {
  let originalMultitenant: string | undefined;

  beforeEach(() => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    process.env.OD_MULTITENANT = '1';
    resetDatabaseFiles();
  });

  afterEach(() => {
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    resetDatabaseFiles();
  });

  it('fails multitenant startup instead of silently hiding legacy projects and routines', async () => {
    seedOwnerlessUpgradeRows();

    const error = await expectStartupFailure();

    expect(error.message).toContain('OD_MULTITENANT=1 cannot start with ownerless legacy data');
    expect(error.message).toContain('projects=1');
    expect(error.message).toContain('routines=1');
    expect(error.message).toContain('templates=1');
  });
});
