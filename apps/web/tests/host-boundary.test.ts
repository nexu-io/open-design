import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function filesUnder(dir: string): string[] {
  const entries = readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return filesUnder(path);
    return path;
  });
  return entries.filter((path) => /\.(ts|tsx|cts|mts)$/.test(path));
}

describe('host bridge boundary', () => {
  it('keeps web source and tests from directly reading preload globals', () => {
    const forbidden = [
      'electronAPI',
      '__odDesktop',
      '__OD_CLIENT_TYPE__',
      '__od__',
      'OPEN_DESIGN_HOST_GLOBAL',
    ];
    // Intentional bridge files: the type declaration and the desktop utility
    // module are the canonical places that reference preload globals so the
    // rest of the codebase doesn't have to.
    const allowed = [
      join(webRoot, 'src/types/electron.d.ts'),
      join(webRoot, 'src/utils/desktop.ts'),
    ];
    const candidates = [
      ...filesUnder(join(webRoot, 'src')),
      ...filesUnder(join(webRoot, 'tests')).filter((path) => !path.endsWith('host-boundary.test.ts')),
    ].filter((path) => !allowed.includes(path));
    const offenders = candidates.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${path.replace(`${webRoot}/`, '')}: ${token}`);
    });
    expect(offenders).toEqual([]);
  });
});
