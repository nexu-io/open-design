import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const allowedBridgeFiles = new Set([
  'src/native/desktop-bridge.ts',
  'tests/native/desktop-bridge.test.ts',
]);

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
    const candidates = [
      ...filesUnder(join(webRoot, 'src')),
      ...filesUnder(join(webRoot, 'tests')).filter((path) => !path.endsWith('host-boundary.test.ts')),
    ];
    const offenders = candidates.flatMap((path) => {
      const relativePath = path.replace(`${webRoot}/`, '');
      if (allowedBridgeFiles.has(relativePath)) return [];
      const source = readFileSync(path, 'utf8');
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${relativePath}: ${token}`);
    });
    expect(offenders).toEqual([]);
  });
});
