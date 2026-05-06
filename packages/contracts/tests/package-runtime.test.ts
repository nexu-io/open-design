import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageJson(): {
  exports?: Record<string, { default?: string; types?: string }>;
  files?: string[];
  main?: string;
  types?: string;
} {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
}

describe('@open-design/contracts package runtime shape', () => {
  it('exports built JavaScript instead of TypeScript source files', () => {
    const pkg = readPackageJson();

    expect(pkg.main).toBe('./dist/index.mjs');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.exports?.['.']?.default).toBe('./dist/index.mjs');
    expect(pkg.exports?.['.']?.types).toBe('./dist/index.d.ts');
    expect(pkg.exports?.['./critique']?.default).toBe('./dist/critique.mjs');
    expect(pkg.exports?.['./critique']?.types).toBe('./dist/critique.d.ts');
  });

  it('points every runtime export at generated files', async () => {
    await expect(access(join(packageRoot, 'dist/index.mjs'))).resolves.toBeUndefined();
    await expect(access(join(packageRoot, 'dist/index.d.ts'))).resolves.toBeUndefined();
    await expect(access(join(packageRoot, 'dist/critique.mjs'))).resolves.toBeUndefined();
    await expect(access(join(packageRoot, 'dist/critique.d.ts'))).resolves.toBeUndefined();
  });

  it('makes runtime exports importable through package exports', async () => {
    const contracts = await import('@open-design/contracts');
    const critique = await import('@open-design/contracts/critique');

    expect(contracts.composeSystemPrompt).toEqual(expect.any(Function));
    expect(contracts.exampleHealthResponse).toEqual({ ok: true, service: 'daemon' });
    expect(critique.defaultCritiqueConfig()).toMatchObject({
      enabled: false,
      protocolVersion: critique.CRITIQUE_PROTOCOL_VERSION,
    });
  });
});
