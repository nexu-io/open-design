import { describe, expect, it } from 'vitest';
import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

function findGroup(
  manifest: ReturnType<typeof extractComponentsManifest>,
  id: string,
) {
  return manifest.groups.find((g) => g.id === id);
}

// Round-5 fixture matrix for `selectorMatchesTokens` (PR #6250 follow-up):
// `:not(.btn)` and `[data-label=".card"]` must NOT cross-attribute tokens to
// the buttons / cards groups even though the raw selector text contains
// component-name substrings (`PerishCode round-5 blocker`).
//
// With the round-3/round-4 implementation, the regex `selectorMatchers` family
// still ran against the raw selector before tokenizeCompound, so:
//   - `:not(.btn) { color: var(--tone) }` matched `/\.btn(?:$|[-_:])/i` and
//     admitted this into Buttons.selectors / Buttons.tokenReferences even
//     though `:not(.btn)` selects *non*-button elements.
//   - `[data-label=".card"] { color: var(--tone) }` matched `/\.card(?:$|[-_:])/i`
//     inside the attribute value and admitted this into Cards even though the
//     selector targets an element whose `[data-label]` happens to mention a
//     card name.
//
// Round-5 fix: `selectorMatchesTokens` no longer consults the class/word
// `selectorMatchers` family; only `attributeMatchers` (genuine attribute
// predicates like `[type=button]` / `[aria-hidden="true"]` / `[role=checkbox]`)
// run against the raw selector; element + class matching happens strictly on
// parsed tokens via tokenizeCompound (which itself keeps `:not()` *opaque*).

describe('#6250 round-5 — :not() and attribute-value opacity', () => {
  const html = `
<style>
  :not(.btn) { color: var(--tone-button) }
  [data-label=".card"] { color: var(--tone-card) }
  [type="submit"] { color: var(--tone-button-attr) }
  [aria-hidden="true"] { color: var(--tone-icon) }
</style>
<button>real button</button>
`;

  const manifest = extractComponentsManifest({
    brandId: 'test-brand',
    fixtureHtml: html,
  });

  it(':not(.btn) is NOT admitted to Buttons.selectors — :not() is opaque', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    const has = buttons!.selectors.some((s) => s.includes(':not(.btn)'));
    expect(has).toBe(false);
  });

  it(':not(.btn) does not contribute Buttons.tokenReferences either', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons!.tokenReferences.some((r) => r === 'tone-button')).toBe(false);
  });

  it('[data-label=".card"] is NOT admitted to Cards.selectors', () => {
    const cards = findGroup(manifest, 'cards');
    expect(cards).toBeDefined();
    const has = cards!.selectors.some((s) => s.includes('[data-label'));
    expect(has).toBe(false);
  });

  it('[data-label=".card"] does not contribute Cards.tokenReferences either', () => {
    const cards = findGroup(manifest, 'cards');
    expect(cards).toBeDefined();
    expect(cards!.tokenReferences.some((r) => r === 'tone-card')).toBe(false);
  });

  it('[type="submit"] IS still admitted to Buttons via attributeMatchers', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons!.selectors.some((s) => s.includes('[type="submit"]'))).toBe(true);
  });

  it('[aria-hidden="true"] IS still admitted to Icons via attributeMatchers', () => {
    const icons = findGroup(manifest, 'icons');
    expect(icons).toBeDefined();
    expect(icons!.selectors.some((s) => s.includes('[aria-hidden="true"]'))).toBe(true);
  });
});
