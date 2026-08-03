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
//   - `:not(.btn) { color: var(--tone) }` matched `/.btn(?:$|[-_:])/i` and
//     admitted this into Buttons.selectors / Buttons.tokenReferences even
//     though `:not(.btn)` selects *non*-button elements.
//   - `[data-label=".card"] { color: var(--tone) }` matched `/.card(?:$|[-_:])/i`
//     inside the attribute value and admitted this into Cards even though the
//     selector targets an element whose `[data-label]` happens to mention a
//     card name.
//
// Round-5 fix: `selectorMatchesTokens` no longer consults the class/word
// `selectorMatchers` family; only `attributeMatchers` (genuine attribute
// predicates like `[type=button]` / `[aria-hidden="true"]` / `[role=checkbox]`)
// run against the raw selector; element + class matching happens strictly on
// parsed tokens via tokenizeCompound (which itself keeps `:not()` *opaque*).
//
// Round-6 fixture matrix (PerishCode round-6 blocker):
// attribute predicates themselves must run on PARSED attribute-selector
// tokens, NOT on the raw compound string. Same opacity rule that round-5
// applied to class matchers now applies to attribute matchers:
//   - `:not([type=submit]) { color: var(--tone) }` must NOT admit to Buttons
//     even though `[type=submit]` text appears in the raw selector — the
//     predicate sits inside `:not()` which is component-erasing.
//   - `[data-label="[type=submit]"] { color: var(--tone) }` must NOT admit to
//     Buttons even though the attribute VALUE spells `[type=submit]` — it is
//     a data-label value, not a type attribute. The matcher regex should
//     run against the outer attribute token `[data-label="[type=submit]"]`,
//     not the inner quoted bracket.
//   - `:not([aria-hidden="true"]) { color: var(--tone) }` must NOT admit to
//     Icons (same logic as the buttons :not case).
// Positive controls `[type=submit]` and `[aria-hidden="true"]` continue to
// admit selectors to Buttons / Icons respectively so the matcher pipeline
// can still see genuine attribute predicates.

describe('#6250 round-5 — :not() and attribute-value opacity', () => {
  const html = `
<style>
  :not(.btn) { color: var(--tone-button) }
  [data-label=".card"] { color: var(--tone-card) }
  [type="submit"] { color: var(--tone-button-attr) }
  [aria-hidden="true"] { color: var(--tone-icon) }
  :not([type="submit"]) { color: var(--tone-button-not-attr) }
  :not([aria-hidden="true"]) { color: var(--tone-icon-not-attr) }
  [data-label="[type=submit]"] { color: var(--tone-button-attr-leak) }
  [role="checkbox"] { color: var(--tone-input-role-attr) }
  :not([role="checkbox"]) { color: var(--tone-input-role-not-attr) }
  [data-label="[role=checkbox]"] { color: var(--tone-input-role-attr-leak) }
</style>
<button>real button</button>
<input type="checkbox" />
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
    expect(buttons!.tokenReferences.some((r) => r === 'tone-button' || r === '--tone-button')).toBe(false);
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
    expect(cards!.tokenReferences.some((r) => r === 'tone-card' || r === '--tone-card')).toBe(false);
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

  // ----- Round-6: attribute predicate opacity (PerishCode round-6 blocker) -----

  it(':not([type="submit"]) is NOT admitted to Buttons — :not() erases attribute too', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons!.selectors.some((s) => s.includes(':not([type="submit"])'))).toBe(false);
    expect(buttons!.tokenReferences.some((r) => r === 'tone-button-not-attr' || r === '--tone-button-not-attr')).toBe(false);
  });

  it(':not([aria-hidden="true"]) is NOT admitted to Icons — :not() erases attribute too', () => {
    const icons = findGroup(manifest, 'icons');
    expect(icons).toBeDefined();
    expect(icons!.selectors.some((s) => s.includes(':not([aria-hidden="true"])'))).toBe(false);
    expect(icons!.tokenReferences.some((r) => r === 'tone-icon-not-attr' || r === '--tone-icon-not-attr')).toBe(false);
  });

  it('[data-label="[type=submit]"] is NOT admitted to Buttons — value text is not a real predicate', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons!.selectors.some((s) => s.includes('[data-label="[type=submit]"]'))).toBe(false);
    expect(buttons!.tokenReferences.some((r) => r === 'tone-button-attr-leak' || r === '--tone-button-attr-leak')).toBe(false);
  });

  it('positive control: [type="submit"] still contributes Buttons.tokenReferences', () => {
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons!.tokenReferences.some((r) => r === '--tone-button-attr')).toBe(true);
  });

  it('positive control: [aria-hidden="true"] still contributes Icons.tokenReferences', () => {
    const icons = findGroup(manifest, 'icons');
    expect(icons).toBeDefined();
    expect(icons!.tokenReferences.some((r) => r === '--tone-icon')).toBe(true);
  });

  // ----- Round-7: Inputs role attribute predicate opacity (PerishCode round-7 blocker) -----

  it(':not([role="checkbox"]) is NOT admitted to Inputs — :not() erases attribute too', () => {
    const inputs = findGroup(manifest, 'inputs');
    expect(inputs).toBeDefined();
    expect(inputs!.selectors.some((s) => s.includes(':not([role="checkbox"])'))).toBe(false);
    expect(inputs!.tokenReferences.some((r) => r === 'tone-input-role-not-attr' || r === '--tone-input-role-not-attr')).toBe(false);
  });

  it('[data-label="[role=checkbox]"] is NOT admitted to Inputs — value text is not a real predicate', () => {
    const inputs = findGroup(manifest, 'inputs');
    expect(inputs).toBeDefined();
    expect(inputs!.selectors.some((s) => s.includes('[data-label="[role=checkbox]"]'))).toBe(false);
    expect(inputs!.tokenReferences.some((r) => r === 'tone-input-role-attr-leak' || r === '--tone-input-role-attr-leak')).toBe(false);
  });

  it('positive control: [role="checkbox"] still admits to Inputs and contributes tokenReferences', () => {
    const inputs = findGroup(manifest, 'inputs');
    expect(inputs).toBeDefined();
    expect(inputs!.selectors.some((s) => s.includes('[role="checkbox"]'))).toBe(true);
    expect(inputs!.tokenReferences.some((r) => r === '--tone-input-role-attr')).toBe(true);
  });
});
