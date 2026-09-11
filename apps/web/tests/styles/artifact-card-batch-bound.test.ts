import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const toolsCss = readFileSync(
  resolve(import.meta.dirname, '../../src/styles/viewer/tools.css'),
  'utf8',
);

describe('artifact-card batch bounds', () => {
  it('keeps a large gallery inside the chat visual budget without dropping cards', () => {
    const rule = toolsCss.match(/\.artifact-cards\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/max-height\s*:\s*min\(50vh,\s*360px\)/);
    expect(rule).toMatch(/overflow-y\s*:\s*auto/);
  });
});
