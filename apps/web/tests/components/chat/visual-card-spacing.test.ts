import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSIO = readFileSync(
  resolve(HERE, '../../../src/styles/viewer/composio.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`).exec(COMPOSIO);
  return match?.[1] ?? '';
}

describe('visual direction picker spacing', () => {
  it('keeps the switch and card stage inside the design-spec 11px side gutters', () => {
    expect(declarationsFor('.qf-visual-bar')).toMatch(/margin-inline:\s*11px/);
    expect(declarationsFor('.qf-visual-stage')).toMatch(/margin-inline:\s*11px/);
  });

  it('keeps the design-spec 8px gutter between grid cards', () => {
    expect(
      declarationsFor(".qf-visual-picker[data-view='grid'] .qf-visual-stack"),
    ).toMatch(/gap:\s*8px/);
  });
});
