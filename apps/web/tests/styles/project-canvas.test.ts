import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canvasCss = readFileSync(
  new URL('../../src/styles/workspace/canvas.css', import.meta.url),
  'utf8',
);

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return canvasCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('project canvas embedded viewer layout', () => {
  it('gives the live artifact viewer a real height inside the canvas node', () => {
    const body = declarationBlock('.canvas-node-body');
    const viewer = declarationBlock('.canvas-node-body > .viewer');

    expect(body).toContain('display: flex;');
    expect(body).toContain('min-height: 0;');
    expect(viewer).toContain('height: 100%;');
  });
});
