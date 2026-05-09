import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  listAllDesignSystems,
  listDesignSystems,
  mergeDesignSystemLists,
  readDesignSystem,
  readDesignSystemFromAny,
} from '../src/design-systems.js';

let bundledDir: string;
let userDir: string;

beforeAll(async () => {
  bundledDir = await mkdtemp(path.join(tmpdir(), 'od-ds-bundled-'));
  userDir = await mkdtemp(path.join(tmpdir(), 'od-ds-user-'));

  await mkdir(path.join(bundledDir, 'alpha'), { recursive: true });
  await writeFile(
    path.join(bundledDir, 'alpha', 'DESIGN.md'),
    '# Alpha\n\n> Category: Bundled\n\nBundled alpha body.\n',
    'utf8',
  );
  await mkdir(path.join(bundledDir, 'beta'), { recursive: true });
  await writeFile(
    path.join(bundledDir, 'beta', 'DESIGN.md'),
    '# Beta\n\n> Category: Bundled\n\nBundled beta body.\n',
    'utf8',
  );

  // `alpha` collides with a bundled id so we can verify user-wins. `gamma`
  // is user-only and should appear in the merged list.
  await mkdir(path.join(userDir, 'alpha'), { recursive: true });
  await writeFile(
    path.join(userDir, 'alpha', 'DESIGN.md'),
    '# Alpha (user)\n\n> Category: Custom\n\nUser alpha override.\n',
    'utf8',
  );
  await mkdir(path.join(userDir, 'gamma'), { recursive: true });
  await writeFile(
    path.join(userDir, 'gamma', 'DESIGN.md'),
    '# Gamma\n\n> Category: Custom\n\nUser-only gamma.\n',
    'utf8',
  );
});

afterAll(async () => {
  await rm(bundledDir, { recursive: true, force: true });
  await rm(userDir, { recursive: true, force: true });
});

describe('listAllDesignSystems', () => {
  it('merges user and bundled, with user winning on id collision', async () => {
    const merged = await listAllDesignSystems(bundledDir, userDir);
    const ids = merged.map((d) => d.id).sort();
    expect(ids).toEqual(['alpha', 'beta', 'gamma']);
    const alpha = merged.find((d) => d.id === 'alpha')!;
    expect(alpha.title).toBe('Alpha (user)');
    expect(alpha.category).toBe('Custom');
  });

  it('still returns bundled list when the user folder does not exist', async () => {
    const missingUserDir = path.join(userDir, '__does_not_exist__');
    const merged = await listAllDesignSystems(bundledDir, missingUserDir);
    expect(merged.map((d) => d.id).sort()).toEqual(['alpha', 'beta']);
  });
});

describe('mergeDesignSystemLists', () => {
  it('keeps user entries first and drops bundled duplicates', async () => {
    const bundled = await listDesignSystems(bundledDir);
    const user = await listDesignSystems(userDir);
    const merged = mergeDesignSystemLists(user, bundled);
    expect(merged[0]?.id).toBe('alpha');
    expect(merged.find((d) => d.id === 'alpha')?.title).toBe('Alpha (user)');
    expect(merged.filter((d) => d.id === 'alpha')).toHaveLength(1);
  });
});

describe('readDesignSystemFromAny', () => {
  it('returns the user copy when the id exists in both', async () => {
    const body = await readDesignSystemFromAny(bundledDir, userDir, 'alpha');
    expect(body).toContain('User alpha override.');
  });

  it('falls back to bundled when the user folder lacks the id', async () => {
    const body = await readDesignSystemFromAny(bundledDir, userDir, 'beta');
    expect(body).toContain('Bundled beta body.');
  });

  it('returns null when neither root has the id', async () => {
    const body = await readDesignSystemFromAny(bundledDir, userDir, 'nope');
    expect(body).toBeNull();
  });

  it('matches readDesignSystem output for a bundled-only id', async () => {
    const direct = await readDesignSystem(bundledDir, 'beta');
    const merged = await readDesignSystemFromAny(bundledDir, userDir, 'beta');
    expect(merged).toBe(direct);
  });
});
