import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProjectRoot } from '../src/server.js';

describe('resolveProjectRoot', () => {
  it('resolves the repository root from the source daemon directory', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon'))).toBe(root);
  });

  it('resolves the repository root from the compiled daemon dist directory', () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    expect(resolveProjectRoot(path.join(root, 'apps', 'daemon', 'dist'))).toBe(root);
  });
});
