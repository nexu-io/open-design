// AGENTS.md -> "Daemon data directory contract" lists this exact pattern as a
// known escape candidate:
//
//   `openDatabase(projectRoot)` calls that rely on its fallback instead of
//   passing the resolved data root.
//
// Before this spec, that call with no `dataDir` fell back to
// `path.join(projectRoot, '.od')` and opened a SQLite store there — a second
// store outside the resolved `RUNTIME_DATA_DIR`, which breaks namespace
// isolation and the packaged data-root guarantee. The contract is that the
// data root is an explicit argument, never inferred, so an omitted `dataDir`
// must fail loudly instead of silently inventing a location.

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../src/db.js';

let scratchDirs: string[] = [];

async function scratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

afterEach(async () => {
  closeDatabase();
  for (const dir of scratchDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  scratchDirs = [];
});

describe('openDatabase data-root contract', () => {
  it('opens the database under the explicit data root, not the project root', async () => {
    const projectRoot = await scratch('od-db-project-');
    const dataDir = await scratch('od-db-data-');

    openDatabase(projectRoot, { dataDir });

    expect(existsSync(path.join(dataDir, 'app.sqlite'))).toBe(true);
    expect(existsSync(path.join(projectRoot, '.od'))).toBe(false);
  });

  it('refuses to invent a data root when dataDir is omitted', async () => {
    const projectRoot = await scratch('od-db-bare-');
    // Simulate an untyped or unchecked caller (plain JS, or a cast): the
    // fallback is what this spec is about, so the call is deliberately made
    // outside the type system.
    const uncheckedOpen = openDatabase as unknown as (
      projectRoot: string,
      options?: { dataDir?: string },
    ) => unknown;

    expect(() => uncheckedOpen(projectRoot)).toThrow(/dataDir/);

    // The legacy store must not have been created on the way to the error.
    expect(existsSync(path.join(projectRoot, '.od'))).toBe(false);
  });
});