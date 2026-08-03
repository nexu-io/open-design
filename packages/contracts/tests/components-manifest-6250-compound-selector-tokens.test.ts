import { describe, expect, it } from 'vitest';
import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

function findGroup(
  manifest: ReturnType<typeof extractComponentsManifest>,
  id: string,
) {
  return manifest.groups.find((group) => group.id === id);
}

// PerishCode round-3 review on PR #6250: the previous `^`-anchored full-selector
// regex (e.g. `/^(?:\.)?button(?:$|[-_:])/i`) silently dropped token attribution
// for ordinary compound and complex CSS selectors such as `button.primary` and
// `.dialog > button`. The new `selectorMatchesTokens`/`tokenizeCompound`
// helpers examine element and class tokens at combinator/compound boundaries
// instead, so these legitimate selectors keep their token references in the
// manifest while prefix-sharing names (`navbar-button-thing`) remain excluded.
//
// This fixture matrix locks both behaviors in:
//   - positive selectors stay in their group with the right token reference
//   - the negative prefix-sharing selector is excluded
const FIXTURE = `<!doctype html>
<html>
<head>
<style>
:root { --tone-primary: black; --tone-hover: gray; --tone-form: blue; --tone-leak: red; }
button.primary { color: var(--tone-primary); }
button.primary:hover { background: var(--tone-hover); }
.dialog > button { color: var(--tone-hover); }
form input { color: var(--tone-form); }
.navbar-button-thing { color: var(--tone-leak); }
</style>
</head>
<body>
<button class="primary">Save</button>
<div class="dialog"><button>OK</button></div>
<form><input /></form>
<button class="navbar-button-thing"></button>
</body>
</html>`;

describe(
  'selectorMatchesTokens preserves compound/complex selector attribution (#6250 PerishCode round-3)',
  () => {
    const manifest = extractComponentsManifest({ brandId: 'matrix-6250-r3', fixtureHtml: FIXTURE });

    it('admits `button.primary` (compound: element + class)', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain('button.primary');
      expect(buttons?.tokenReferences).toContain('--tone-primary');
    });

    it('admits `button.primary:hover` (compound + pseudo-class)', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain('button.primary:hover');
      expect(buttons?.tokenReferences).toContain('--tone-hover');
    });

    it('admits `.dialog > button` (descendant combinator + element)', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).toContain('.dialog > button');
      expect(buttons?.tokenReferences).toContain('--tone-hover');
    });

    it('admits `form input` (descendant combinator across two compounds)', () => {
      const inputs = findGroup(manifest, 'inputs');
      expect(inputs).toBeDefined();
      expect(inputs?.selectors).toContain('form input');
      expect(inputs?.tokenReferences).toContain('--tone-form');
    });

    it('still excludes the prefix-sharing `.navbar-button-thing` selector and its token', () => {
      const buttons = findGroup(manifest, 'buttons');
      expect(buttons).toBeDefined();
      expect(buttons?.selectors).not.toContain('.navbar-button-thing');
      expect(buttons?.tokenReferences).not.toContain('--tone-leak');
    });
  },
);
