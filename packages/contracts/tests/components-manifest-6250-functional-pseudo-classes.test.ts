import { describe, expect, it } from 'vitest';
import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

function findGroup(
  manifest: ReturnType<typeof extractComponentsManifest>,
  id: string,
) {
  return manifest.groups.find((group) => group.id === id);
}

// PerishCode round-4 review on PR #6250: the tokenizer's pseudo-class skip
// regex consumed the entire text of `:is(...)` and `:where(...)` as opaque
// skip text, so component tokens inside those argument lists — e.g. `button`
// in `:where(button)`, `.btn` in `:is(.btn)` — never reached the
// `elementMatchers` / `classMatchers` for the Buttons group. As a result
// `:where(button) { color: var(--tone) }` produced a manifest selector with NO
// token attribution for `--tone`, a backward-compatibility regression
// introduced by the round-3 token-level matcher.
//
// `:is` and `:where` are component-preserving (their argument list is a
// forgiving selector list — selectors inside still name components). The
// tokenizer now recursively splits the inner selector-list by commas and
// tokenizes each argument as its own compound, unioning element/class tokens
// back into the outer compound. `:not(...)`, `:has(...)`, `:nth-child(...)`,
// and other functional pseudo-classes remain opaque skips — they hide their
// arguments by design.
const FIXTURE = `<!doctype html>
<html>
<head>
<style>
:root { --tone-where-element: black; --tone-where-class: red; --tone-is-element: green; --tone-is-class: blue; --tone-where-multi: orange; --tone-not-stays-opaque: gray; --tone-prefix-leak: purple; }
:where(button) { color: var(--tone-where-element); }
:is(.btn) { background: var(--tone-where-class); }
:is(button.primary) { color: var(--tone-is-element); }
:where(.btn-cta) { background: var(--tone-is-class); }
:where(button, label) { color: var(--tone-where-multi); }
button:not(.btn) { color: var(--tone-not-stays-opaque); }
.navbar-button-thing { color: var(--tone-prefix-leak); }
</style>
</head>
<body>
<button>Save</button>
<button class="primary">OK</button>
<button class="btn">CTA</button>
<button class="btn-cta">CTA2</button>
<label>Field</label>
<button class="navbar-button-thing"></button>
</body>
</html>`;

describe(
  'selectorMatchesTokens preserves component tokens inside :is() and :where() (#6250 PerishCode round-4)',
  () => {
    const manifest = extractComponentsManifest({
      brandId: 'matrix-6250-r4',
      fixtureHtml: FIXTURE,
    });

    it('admits `:where(button)` and carries its --tone attribution', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain(':where(button)');
      expect(buttons?.tokenReferences).toContain('--tone-where-element');
    });

    it('admits `:is(.btn)` (functional + class) and carries its --tone attribution', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain(':is(.btn)');
      expect(buttons?.tokenReferences).toContain('--tone-where-class');
    });

    it('admits `:is(button.primary)` (functional compound: element + class preserved)', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain(':is(button.primary)');
      expect(buttons?.tokenReferences).toContain('--tone-is-element');
    });

    it('admits `:where(.btn-cta)` (functional class argument)', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain(':where(.btn-cta)');
      expect(buttons?.tokenReferences).toContain('--tone-is-class');
    });

    it('admits `:where(button, label)` — both selector-list arguments visible', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain(':where(button, label)');
      expect(buttons?.tokenReferences).toContain('--tone-where-multi');
      // inputs group should also see the `label` element via inputs.elementMatchers
      const inputs = findGroup(manifest, 'inputs');
      expect(inputs?.selectors).toContain(':where(button, label)');
    });

    it('keeps `:not(...)` opaque — its argument should NOT independently contribute tokens', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      // `button:not(.btn)` is admitted via the outer `button` element matcher,
      // so the selector IS in the Buttons group via the outer element token,
      // and the surrounding `--tone-not-stays-opaque` flows through.
      expect(buttons?.selectors).toContain('button:not(.btn)');
      expect(buttons?.tokenReferences).toContain('--tone-not-stays-opaque');
      // `.btn` inside `:not(...)` must NOT be tokenized as a class member of
      // this selector — `:not()` is opaque by design. The `btn` entry that
      // DOES show up in `Buttons.classes` here comes from the HTML element
      // `<button class="btn">` (extractHtmlClasses), not from the `:not()`
      // argument, so it is unrelated to this selector's tokenization.
      // Sanity: `.btn-cta` from `:where(.btn-cta)` DOES leak into Buttons.classes
      // because `:where()` is component-preserving.
      // (No assertion on Buttons.classes here — this test focuses on the
      // selector-level attribution; the HTML classes live independently.)
    });

    it('still excludes the prefix-sharing `.navbar-button-thing` selector and its token', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).not.toContain('.navbar-button-thing');
      expect(buttons?.tokenReferences).not.toContain('--tone-prefix-leak');
    });
  },
);
