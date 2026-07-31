import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

describe('CSS escapes in selectors and declaration values (#6250 reviewer #5)', () => {
  it('treats an escaped structural brace at top level as selector data, not as opener', () => {
    // PerishCode 7-31 09:10 on PR #6250:
    //   "Exercise an actual outside-quote escaped brace in this regression
    //    suite. This fixture currently contains `content: "}"`, so the brace
    //    is protected by the quote-state logic added in the preceding commit;
    //    it never reaches the new `char === '\\'` branch. Likewise, the first
    //    test uses `\:` even though a colon cannot be mistaken for a rule
    //    opener, so neither test would fail if the outside-quote escape
    //    handling at `iterateCssRules` lines 389 and 465 were removed. That
    //    leaves the final commit's structural-delimiter fix unprotected
    //    despite the test names and comments claiming otherwise. Replace or
    //    extend these fixtures with the reproduced boundary cases — for
    //    example `.btn-a\{literal { ... }` followed by a flat rule, and an
    //    unquoted escaped `\}` in a declaration — and assert both selectors
    //    and both token references survive."
    //
    // This test reproduces that exact case. Without the outside-quote escape
    // handling in the opener scan (lines 389-392), `.btn-a\{literal` would
    // parse as `.btn-a\` (broken selector, then an `{` opener at the literal
    // brace) + `literal { color: var(--a); }` parsed as a *second* rule whose
    // selector is `literal`. With the fix, `.btn-a\{literal` is consumed as
    // one selector (the `\{` escape keeps the `{` as identifier data) and the
    // opener scan finds the *real* opener that follows `literal `.
    //
    // We pair it with an immediately-following flat rule so a regression that
    // mistreats the escaped brace as the opener also breaks the second rule's
    // boundaries (because the bogus rule body would eat the rest of the
    // input). Asserting both selectors + both `--a`/`--b` token references
    // survive proves the structural-delimiter handling is intact end-to-end.
    const manifest = extractComponentsManifest({
      brandId: 'css-escape-class',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-a\\{literal { color: var(--a); }
          .btn-b { color: var(--b); }
        </style>
        <button class="btn-a{literal btn-b">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-a\\{literal', '.btn-b']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup).toBeDefined();
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-a\\{literal', '.btn-b']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });

  it('treats an unquoted escaped closing brace in a declaration as data', () => {
    // PerishCode 7-31 09:10: "an unquoted escaped `\}` in a declaration —
    // and assert both selectors and both token references survive."
    //
    // A CSS declaration value may legally contain an escaped `}` outside
    // quotes — e.g. `content: \};` (the `\}` is data, not the rule
    // terminator). Without the outside-quote escape handling in the body
    // scan (lines 465-468), the parser would treat `\}` as an escape pair
    // *and* then immediately after, the unescaped `}` that follows would
    // close the rule — which is correct in this trivial case but breaks
    // when there's more content after. The interesting boundary is when
    // the escaped `}` is followed by additional declarations before the
    // real terminator. Here we assert that `color: var(--a)` after the
    // escaped `}` is still recorded, and that the second flat rule's
    // `.btn-plain` selector + `--b` reference both survive.
    //
    // Using `attr(data-after, "\\}")` keeps the escape outside any quoted
    // string — the inner `"\\}"` is purely part of the attr() expression
    // payload *after* CSS-tokenization, so the opt-in is the literal `\}`
    // (without surrounding CSS quotes) at the CSS-rule level. To make the
    // outside-quote guarantee unambiguous, we use `content: "\\}"` *without*
    // surrounding CSS quotes — i.e. write it as a raw identifier escape,
    // not a string. That's the only form that actually exercises the
    // outside-quote escape branch in the body scanner; the previous fixture
    // (`content: "}"`) was inside a CSS string so the quote-state branch
    // caught it instead.
    const manifest = extractComponentsManifest({
      brandId: 'css-escape-decl-value',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-escape::after { content: \\}; color: var(--a); }
          .btn-plain { color: var(--b); }
        </style>
        <button class="btn-escape btn-plain">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-escape::after', '.btn-plain']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup).toBeDefined();
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-escape::after', '.btn-plain']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });
});
