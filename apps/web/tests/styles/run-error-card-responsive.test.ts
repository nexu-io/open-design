import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/components/chat/RunErrorCard.module.css', import.meta.url),
  'utf8',
);

describe('OPEND-2539 — Task failed actions at minimum ChatPanel width', () => {
  it('switches the card footer to one predictable action per row from the card width', () => {
    expect(css).toMatch(/\.card\s*\{[\s\S]*?container-type:\s*inline-size\s*;/);
    expect(css).toMatch(/\.card\s*\{[\s\S]*?container-name:\s*run-error-card\s*;/);

    const compact = css.match(
      /@container\s+run-error-card\s*\(max-width:\s*20rem\)\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    expect(compact).toBeDefined();
    expect(compact).toMatch(/\.ops\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    expect(compact).toMatch(/\.actionGroup\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    expect(compact).toMatch(/\.action\s*\{[\s\S]*?width:\s*100%\s*;/);
  });
});
