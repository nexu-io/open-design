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

function packagePath(target: string): string {
  return join(packageRoot, target.replace(/^\.\//, ''));
}

describe('@open-design/contracts package runtime shape', () => {
  it('exports built JavaScript instead of TypeScript source files', () => {
    const pkg = readPackageJson();

    expect(pkg.main).toBe('./dist/index.mjs');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.exports?.['.']?.default).toBe('./dist/index.mjs');
    expect(pkg.exports?.['.']?.types).toBe('./dist/index.d.ts');
    expect(pkg.exports?.['./api/amrWallet']?.default).toBe('./dist/api/amrWallet.mjs');
    expect(pkg.exports?.['./api/amrWallet']?.types).toBe('./dist/api/amrWallet.d.ts');
    expect(pkg.exports?.['./api/connectionTest']?.default).toBe('./dist/api/connectionTest.mjs');
    expect(pkg.exports?.['./api/connectionTest']?.types).toBe('./dist/api/connectionTest.d.ts');
    expect(pkg.exports?.['./api/research']?.default).toBe('./dist/api/research.mjs');
    expect(pkg.exports?.['./api/research']?.types).toBe('./dist/api/research.d.ts');
    expect(pkg.exports?.['./runtime/deck-stage-fallback']?.default).toBe(
      './dist/runtime/deck-stage-fallback.mjs',
    );
    expect(pkg.exports?.['./runtime/deck-stage-fallback']?.types).toBe(
      './dist/runtime/deck-stage-fallback.d.ts',
    );
    expect(pkg.exports?.['./api/handoff']?.default).toBe('./dist/api/handoff.mjs');
    expect(pkg.exports?.['./api/handoff']?.types).toBe('./dist/api/handoff.d.ts');
    expect(pkg.exports?.['./critique']?.default).toBe('./dist/critique.mjs');
    expect(pkg.exports?.['./critique']?.types).toBe('./dist/critique.d.ts');
  });

  it('points every runtime export at generated files', async () => {
    const pkg = readPackageJson();
    const exports = Object.entries(pkg.exports ?? {});

    expect(exports.length).toBeGreaterThan(0);
    for (const [_name, target] of exports) {
      expect(target.default).toMatch(/^\.\/dist\/.+\.mjs$/);
      expect(target.types).toMatch(/^\.\/dist\/.+\.d\.ts$/);
      await expect(access(packagePath(target.default!))).resolves.toBeUndefined();
      await expect(access(packagePath(target.types!))).resolves.toBeUndefined();
    }
  });

  it('makes runtime exports importable through package exports', async () => {
    const contracts = await import('@open-design/contracts');
    const amrWallet = await import('@open-design/contracts/api/amrWallet');
    const connectionTest = await import('@open-design/contracts/api/connectionTest');
    const research = await import('@open-design/contracts/api/research');
    const handoff = await import('@open-design/contracts/api/handoff');
    const critique = await import('@open-design/contracts/critique');
    const deckStageFallback = await import('@open-design/contracts/runtime/deck-stage-fallback');

    expect(contracts.composeSystemPrompt).toEqual(expect.any(Function));
    expect(contracts.exampleHealthResponse).toEqual({ ok: true, service: 'daemon' });
    expect(amrWallet.AMR_WALLET_SNAPSHOT_STATUSES).toEqual([
      'signed_out',
      'available',
      'unavailable',
    ]);
    expect(contracts.AMR_WALLET_SNAPSHOT_STATUSES).toEqual([
      'signed_out',
      'available',
      'unavailable',
    ]);
    expect(connectionTest.validateBaseUrl).toEqual(expect.any(Function));
    expect(connectionTest.isLoopbackApiHost).toEqual(expect.any(Function));
    expect(connectionTest.isBlockedExternalApiHostname).toEqual(expect.any(Function));
    expect(research.RESEARCH_DEFAULT_MAX_SOURCES.shallow).toBe(5);
    expect(deckStageFallback.injectDeckStageFallback).toEqual(expect.any(Function));
    // The handoff DTO module is interface-only except for HANDOFF_SCHEMA_VERSION,
    // which exists precisely so esbuild emits a real `.mjs` and NodeNext
    // consumers can resolve the subpath. Importing it through the package
    // `exports` map proves the built publish surface — esbuild entrypoint,
    // exports entry, and root re-export — actually resolves, which a test
    // importing `../src/api/handoff` would not catch.
    expect(handoff.HANDOFF_SCHEMA_VERSION).toBe(2);
    expect(contracts.HANDOFF_SCHEMA_VERSION).toBe(2);
    expect(critique.defaultCritiqueConfig()).toMatchObject({
      enabled: false,
      protocolVersion: critique.CRITIQUE_PROTOCOL_VERSION,
    });
  });
});
