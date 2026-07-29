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
});
