import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('bundled plugin craft context', () => {
  it('pins the Creative Voltage seed-pitch deck to the typography craft rules', async () => {
    const manifestPath = path.join(
      repoRoot,
      'plugins',
      '_official',
      'examples',
      'fs-creative-voltage',
      'open-design.json',
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      od?: { context?: { craft?: string[] } };
    };

    expect(manifest.od?.context?.craft).toContain('typography');
  });
});
