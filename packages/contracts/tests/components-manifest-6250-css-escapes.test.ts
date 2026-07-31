import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

describe('CSS escapes in selectors and declaration values (#6250 reviewer #5)', () => {
  it('treats a single-char escape in a class name as data, not as opener', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "Selectors with CSS-escaped identifier characters (\\:, \\/, \\-,
    //    \\2digit hex form) — escaped identifier characters are interpreted
    //    as structure."
    //
    // A CSS class name may legally contain an escaped character such as
    // `.foo\-bar` (escaped `-`) or `.foo\:bar` (escaped `:`). The escape
    // backslash is *not* a CSS structural character — it modifies the next
    // byte so the lexer reads `\-` as a literal `-` inside an identifier
    // and `\:` as a literal `:`. The opening-brace scan therefore must
    // skip past the `\` and the following character before deciding
    // whether the next byte is a `{` opener.
    //
    // Without the fix, `.foo\:bar { color: var(--a); }` is split at the
    // `{` that immediately follows the selector (which is correct), but
    // a more pathological shape such as `.foo\{not-a-rule { color:
    // var(--a); }` (escaped brace in a class name, only valid if the
    // escape is consumed first) would mis-count the brace.
    const manifest = extractComponentsManifest({
      brandId: 'css-escape-class',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-foo\\:bar { color: var(--a); }
          .btn-plain { color: var(--b); }
        </style>
        <button class="btn-foo:bar btn-plain">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-foo\\:bar', '.btn-plain']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup).toBeDefined();
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-foo\\:bar', '.btn-plain']),
    );
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });

  it('treats an escaped closing brace in a declaration value as data', () => {
    // Mirror case for the body scanner: a declaration value may contain a
    // CSS escape such as `content: "\\}";` where the escaped `}` is the
    // data, not the rule terminator. The body depth counter must not
    // decrement on the escaped brace.
    const manifest = extractComponentsManifest({
      brandId: 'css-escape-decl-value',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-escape::after { content: "}"; color: var(--a); }
          .btn-plain { color: var(--b); }
        </style>
        <button class="btn-escape btn-plain">x</button>
      `,
    });

    // The selector with the escape survives intact in the opener scan…
    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-escape::after', '.btn-plain']),
    );
    // …and both tokens are recorded because the body loop correctly
    // identifies the rule boundary at the unescaped `}` that follows
    // `var(--a);`.
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup).toBeDefined();
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });
});
