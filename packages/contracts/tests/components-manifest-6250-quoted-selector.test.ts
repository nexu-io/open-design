import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

describe('quoted braces in selectors (#6250 reviewer #4)', () => {
  it('treats braces inside quoted attribute selectors as data, not rule openers', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "Make the opening-brace search quote-aware too. The new quote state
    //    begins only after `css.indexOf('{', index)` has already selected an
    //    opener, so a valid selector such as `.btn-a[data-icon="{"] { color:
    //    var(--a); }` treats the brace inside the attribute value as the rule
    //    boundary. ... manifest.selectors is `[]`, and the Buttons group has
    //    no selectors or token references ..."
    //
    // The fix: scan for the opening delimiter with the same single-quote,
    // double-quote, and escape state used for the closing delimiter. A
    // `{` / `}` that appears inside a quoted attribute selector (or any
    // other quoted selector context) must not terminate the selector scan.
    const manifest = extractComponentsManifest({
      brandId: 'quoted-selector-brace',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-a[data-icon="{"] { color: var(--a); }
          .btn-b { color: var(--b); }
        </style>
        <button class="btn-a btn-b">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-a[data-icon="{"]', '.btn-b']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-a[data-icon="{"]', '.btn-b']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });

  it('treats braces inside single-quoted attribute selectors as data', () => {
    // Same shape, single-quoted variant. Selector `.btn-a[data-icon='{']`
    // must NOT be split at the `{` inside the attribute.
    const manifest = extractComponentsManifest({
      brandId: 'quoted-selector-brace-single',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-a[data-icon='{'] { color: var(--a); }
          .btn-b { color: var(--b); }
        </style>
        <button class="btn-a btn-b">x</button>
      `,
    });

    // The selector is preserved verbatim — single quotes stay single,
    // double quotes stay double. We assert the single-quoted form here.
    expect(manifest.selectors).toEqual(
      expect.arrayContaining([".btn-a[data-icon='{']", '.btn-b']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining([".btn-a[data-icon='{']", '.btn-b']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });
});
