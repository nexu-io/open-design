import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

describe('@supports with quoted braces in selector (#6250 round-8 blocker)', () => {
  it('survives quoted braces inside @supports selector() wrapper plus trailing rule', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250 (2026-08-03 23:53):
    //   "Make the supported-at-rule header rewrite use the same lexical
    //    rules as this quote-aware scan. Both extractor paths call
    //    `stripContainerAtRuleHeaders` before reaching `iterateCssRules`,
    //    and that helper still uses `@(media|supports|container|layer)\b[^{]*\{`;
    //    therefore a valid wrapper such as
    //    `@supports selector(.btn-a[data-icon=\"{\"]) { .btn-a { color: var(--a) } }`
    //    is truncated at the quoted brace before this scanner can protect it.
    //    I reproduced this through `extractComponentsManifest` with a
    //    following `.btn-b` rule: `manifest.selectors` and the Buttons group's
    //    `tokenReferences` are both empty, so the supported at-rule also erases
    //    the subsequent flat rule."
    //
    // Round-8 fix: drop the stripContainerAtRuleHeaders pre-pass and let
    // iterateCssRules recurse through supported at-rules directly. The
    // wrapper header must survive intact, its body must be recursed, and
    // both the inner .btn-a selector and the trailing .btn-b selector (plus
    // its token reference) must surface.
    const manifest = extractComponentsManifest({
      brandId: 'supports-quoted-brace',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          @supports selector(.btn-a[data-icon="{"]) {
            .btn-a[data-icon="{"] { color: var(--a); }
          }
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

  it('preserves trailing flat rules after a supported at-rule with quoted braces', () => {
    // Regression: before round-8, the non-quote-aware pre-pass truncated
    // at the quoted brace inside the @supports header, swallowing the
    // inner .btn-a rule AND the trailing .btn-b rule. Round-8 must not
    // lose either selector or the trailing rule's token reference.
    const manifest = extractComponentsManifest({
      brandId: 'supports-quoted-brace-trailing',
      tokensCss: ':root { --a: red; --b: blue; --c: green; }',
      fixtureHtml: `
        <style>
          @supports selector(.btn-a[data-icon="{"]) {
            .btn-a[data-icon="{"] { color: var(--a); }
          }
          .btn-b { color: var(--b); }
          .btn-c { color: var(--c); }
        </style>
        <button class="btn-a btn-b btn-c">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-a[data-icon="{"]', '.btn-b', '.btn-c']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-a[data-icon="{"]', '.btn-b', '.btn-c']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b', '--c']),
    );
  });
});
