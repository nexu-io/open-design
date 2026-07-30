import { describe, expect, it } from 'vitest';

import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

describe('components manifest extraction (#6224 regression suite)', () => {
  it('keeps every flat consecutive rule attributable (#6224 part 1)', () => {
    // The legacy `(?:^|[{}])\s*([^@{}][^{}]*?)\s*\{([^{}]*)\}` regex consumed
    // each rule's closing `}` as the *next* rule's `[{}]` anchor, so half the
    // rules in a flat sheet were silently dropped. Three flat rules in a row
    // is the minimal repro: the middle rule used to vanish.
    const manifest = extractComponentsManifest({
      brandId: 'flatrules',
      tokensCss: ':root { --a: red; --b: blue; --c: green; }',
      fixtureHtml: `
        <style>
          .first { color: var(--a); }
          .second { background: var(--b); }
          .third { border-color: var(--c); }
        </style>
        <div class="first second third">x</div>
      `,
    });

    expect(manifest.selectors).toEqual(['.first', '.second', '.third']);
    // Each rule's token reference survives — no half-rule loss.
    const references = manifest.selectors.map((sel) => sel);
    expect(references).toContain('.first');
    expect(references).toContain('.second');
    expect(references).toContain('.third');
  });

  it('flattens one level of CSS nesting so nested tokens attribute to parent (#6224 part 2)', () => {
    // Tailwind v4 / native CSS nesting emits `.parent { &:hover { ... } }`.
    // The legacy `[^{}]*` body regex couldn't match the nested block at all,
    // mis-attributing inner tokens to the declaration text as a fake
    // selector. The brace scanner folds nested declarations into the
    // parent's body so inner tokens count toward the parent selector.
    const manifest = extractComponentsManifest({
      brandId: 'nesting',
      tokensCss: ':root { --hover: red; --idle: blue; }',
      fixtureHtml: `
        <style>
          .parent {
            color: var(--idle);
            &:hover {
              background: var(--hover);
            }
          }
        </style>
        <div class="parent">x</div>
      `,
    });

    // .parent selector is captured exactly once; no spurious selectors
    // synthesised from declaration text.
    expect(manifest.selectors).toEqual(['.parent']);
  });

  it('anchors classMatchers so prefix-sharing classnames do not cross-group (#6224 part 3)', () => {
    // The legacy `/button/i` substring matcher matched `.nav-btn` because
    // "button" appears literally inside the *word* "navbar-button-thing".
    // The anchored `/^button(?:$|-)/i` form rejects `.nav-btn`,
    // `.navbar-button-thing`, and similar prefix-sharing classnames.
    const manifest = extractComponentsManifest({
      brandId: 'anchored',
      tokensCss: ':root { --tone: black; }',
      fixtureHtml: `
        <style>
          .btn-primary { color: var(--tone); }
          .navbar-button-thing { color: var(--tone); }
          .status-active { color: var(--tone); }
          .mystatus { color: var(--tone); }
          .form-control { color: var(--tone); }
          .platform-form { color: var(--tone); }
        </style>
        <button class="btn-primary">Go</button>
        <nav class="navbar-button-thing">Home</nav>
        <span class="status-active">1</span>
        <span class="mystatus">2</span>
        <input class="form-control" />
        <div class="platform-form">x</div>
      `,
    });

    const buttonsClasses = manifest.groups.find((g) => g.id === 'buttons')?.classes ?? [];
    const badgesClasses = manifest.groups.find((g) => g.id === 'badges')?.classes ?? [];
    const inputsClasses = manifest.groups.find((g) => g.id === 'inputs')?.classes ?? [];

    // Anchored: .btn-primary has prefix `btn-` → matches `/^btn(?:$|-)/i`. ✓
    expect(buttonsClasses).toContain('btn-primary');
    // Anchored: .navbar-button-thing does NOT start with `button` or `btn-`,
    // so it no longer matches via the `/button/i` substring leak.
    expect(buttonsClasses).not.toContain('navbar-button-thing');

    // Anchored: .status-active starts with `status-` → badges. ✓
    expect(badgesClasses).toContain('status-active');
    // Anchored: .mystatus ends with `status` but does not start with
    // `status` or `status-`, so it is NOT swept into badges.
    expect(badgesClasses).not.toContain('mystatus');

    // Anchored: .form-control has prefix `form-` → inputs. ✓
    expect(inputsClasses).toContain('form-control');
    // Anchored: .platform-form contains `form` as a suffix only — anchored
    // `/^form(?:$|-)/i` rejects it.
    expect(inputsClasses).not.toContain('platform-form');
  });

  it('keeps traversing supported at-rule bodies for token attribution (#6250 reviewer #1)', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "keep traversing supported at-rule bodies for token attribution"
    //
    // The current scanner replaces `@media ... {` with `{` (via
    // stripContainerAtRuleHeaders) and then treats everything inside the
    // at-rule as one giant body of the *empty* selector that opened the
    // at-rule. Rules inside `@media`/`@supports`/`@container`/`@layer`
    // therefore lose their selector + token attribution — every selector
    // inside `@media (min-width: 600px) { .inside-media { color: var(--bg) } }`
    // is silently dropped, and the inner rule's token references are lost entirely.
    //
    // The fix: the scanner must descend into supported at-rule bodies and
    // emit the inner rules with their real selectors preserved.
    //
    // We use `.btn-*` selectors so the inner rules land in the buttons group,
    // where we can assert both the selector survival and token attribution.
    const manifest = extractComponentsManifest({
      brandId: 'at-rule',
      tokensCss: ':root { --bg: #fff; --fg: #000; }',
      fixtureHtml: `
        <style>
          .btn-outside { color: var(--fg); }
          @media (min-width: 600px) {
            .btn-inside-media { background: var(--bg); }
            .btn-inside-media-two { border-color: var(--fg); }
          }
          @supports (display: grid) {
            .btn-inside-supports { color: var(--fg); }
          }
          @layer framework {
            .btn-inside-layer { background: var(--bg); }
          }
        </style>
        <button class="btn-outside btn-inside-media btn-inside-media-two btn-inside-supports btn-inside-layer">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining([
        '.btn-outside',
        '.btn-inside-media',
        '.btn-inside-media-two',
        '.btn-inside-supports',
        '.btn-inside-layer',
      ]),
    );
    // Inner rules keep their token attribution, not lost to the at-rule wrapper.
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining([
        '.btn-outside',
        '.btn-inside-media',
        '.btn-inside-media-two',
        '.btn-inside-supports',
        '.btn-inside-layer',
      ]),
    );
    // .btn-inside-media carries --bg, .btn-inside-media-two carries --fg.
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--bg', '--fg']),
    );
  });

  it('preserves nested-rule token references so the parent group receives outer and nested tokens (#6250 reviewer #2)', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "preserve nested-rule token references so the parent group receives
    //    both outer and nested tokens"
    //
    // When a rule has BOTH outer declarations AND a nested block, the
    // resulting parent-group entry must include both the outer-body tokens
    // AND the nested-block tokens (no silent loss of nested-only tokens).
    // The minimal failing case: `.btn-parent { color: var(--outer); &:focus { background: var(--inner); } }`.
    // We use `.btn-parent` so the selector lands in the buttons group, where
    // we can assert both tokens end up on the same group entry.
    const manifest = extractComponentsManifest({
      brandId: 'nested-both',
      tokensCss: ':root { --outer: red; --inner: blue; }',
      fixtureHtml: `
        <style>
          .btn-parent {
            color: var(--outer);
            &:focus {
              background: var(--inner);
            }
          }
        </style>
        <button class="btn-parent">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(['.btn-parent']);
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toContain('.btn-parent');
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--inner', '--outer']),
    );

    // Deeper nesting: an `.btn-ancestor` rule wraps two levels of CSS nesting.
    // All three tokens (--a / --b / --c) must end up on the buttons group,
    // proving nested-rule token references are preserved at every depth —
    // not just the first nesting level.
    const deep = extractComponentsManifest({
      brandId: 'nested-deep',
      tokensCss: ':root { --a: red; --b: green; --c: blue; }',
      fixtureHtml: `
        <style>
          .btn-ancestor {
            color: var(--a);
            & .descendant {
              color: var(--b);
              & .granddesc {
                background: var(--c);
              }
            }
          }
        </style>
        <button class="btn-ancestor">
          <span class="descendant">
            <span class="granddesc">x</span>
          </span>
        </button>
      `,
    });
    expect(deep.selectors).toContain('.btn-ancestor');
    const deepButtons = deep.groups.find((g) => g.id === 'buttons');
    expect(deepButtons?.selectors).toContain('.btn-ancestor');
    expect(deepButtons?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b', '--c']),
    );
  });
});
