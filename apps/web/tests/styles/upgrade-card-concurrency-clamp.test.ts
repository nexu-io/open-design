import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-4605 - concurrency upgrade card: long-copy languages (fr/fa) must not
// stretch the card. Source-level assertions on UpgradeCard.module.css:
// .whyBody clamped to 3 lines, overflow hidden, anywhere word-break.
const css = readFileSync(
  new URL('../../src/components/chat/UpgradeCard.module.css', import.meta.url),
  'utf8',
);

const FRENCH_LONG = 'Votre essai gratuit est termine et la limite de simultaneite de votre ' +
  'equipe a ete atteinte. Pour lancer de nouvelles taches, passez a un offre payante ' +
  'qui offre des quotas plus eleves ainsi que des fonctionnalites avancees pour les ' +
  'equipes. Contactez notre equipe si vous avez besoin daide pour choisir loffre.';

const breakables: Array<[string, string]> = [
  ['fr', FRENCH_LONG],
  ['fa', FRENCH_LONG],
];

describe('OPEND-4605 - concurrency card clamp for long-copy locales', () => {
  it('clamps .whyBody to 3 lines with overflow hidden', () => {
    const block = css.match(/\.whyBody\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/display:\s*-webkit-box\s*;/);
    expect(block).toMatch(/-webkit-box-orient:\s*vertical\s*;/);
    expect(block).toMatch(/-webkit-line-clamp:\s*3\s*;/);
    expect(block).toMatch(/overflow:\s*hidden\s*;/);
  });

  it('breaks long words instead of overflowing horizontally', () => {
    const block = css.match(/\.whyBody\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-word/);
  });

  it('keeps the concurrency card width fixed at min(100%, 480px)', () => {
    const conc = css.match(/\.concurrency\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(conc).toBeDefined();
    expect(conc).toMatch(/width:\s*min\(100%,\s*480px\)\s*;/);
    expect(conc).toMatch(/min-height:\s*118px\s*;/);
  });

  it('long-copy locale fixture is actually long enough to wrap past 3 lines', () => {
    // at ~21px/line in a 480px card, the fixture must exceed 3 lines worth of text
    expect(FRENCH_LONG.length).toBeGreaterThan(180);
    expect(breakables.length).toBe(2);
  });
});
