import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('dsh-runtime generated entrypoints', () => {
  it('ships the runtime and startup entrypoints expected by git/tarball consumers', async () => {
    const required = [
      'dist/index.js',
      'dist/startup.js',
      'dist/invariant.js',
      'dist/types/index.d.ts',
      'dist/types/startup.d.ts',
      'dist/types/invariant.d.ts',
    ];

    for (const rel of required) {
      await expect(
        access(path.join(pkgRoot, rel)),
        `missing ${rel} — run the package build/prepare hook first`,
      ).resolves.toBeUndefined();
    }
  });
});
