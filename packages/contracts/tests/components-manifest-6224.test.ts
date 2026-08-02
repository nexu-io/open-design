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

  it('closes the selector-matcher leak for prefix-sharing classnames across all anchored groups (#6250 PerishCode round-2)', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "Anchoring this `classMatchers` entry removes `navbar-button-thing`
    //    from `Buttons.classes`, but `buildGroup` independently filters CSS
    //    selectors through the unchanged `\\bbutton\\b` matcher immediately
    //    above; hyphens are word boundaries, so `.navbar-button-thing
    //    { color: var(--tone) }` still appears in `Buttons.selectors` and
    //    contributes `--tone` to `Buttons.tokenReferences`. Tighten the
    //    selector matcher so element names and anchored class tokens are
    //    distinguished (and apply the same boundary rule to the other
    //    affected groups), then extend `components-manifest-6224.test.ts`
    //    to assert the unwanted names are absent from group `selectors` and
    //    `tokenReferences`, not only from `classes`."
    //
    // Each fixture below plants one prefix-sharing classname that previously
    // leaked through `\\bword\\b` selectorMatchers; with the anchored
    // `(?:^|\\.?)word(?:$|[-_:])` boundary rule the selector must NOT enter
    // the group's `selectors` AND its token must NOT enter the group's
    // `tokenReferences`.
    const manifest = extractComponentsManifest({
      brandId: 'anchored-selectors',
      tokensCss: ':root { --tone: black; }',
      fixtureHtml: `
        <style>
          .navbar-button-thing { color: var(--tone); }
          .form-input-prepend { color: var(--tone); }
          .navbar-status-thing { color: var(--tone); }
          .navbar-extra-link { color: var(--tone); }
          .footer-section-link { color: var(--tone); }
          .desktop-headline-7 { color: var(--tone); }
          .hero-cta-banner { color: var(--tone); }
          .icon-prefix-thing { color: var(--tone); }
        </style>
        <button class="navbar-button-thing"></button>
        <input class="form-input-prepend" />
        <span class="navbar-status-thing">badge</span>
        <a class="navbar-extra-link">link</a>
        <nav class="footer-section-link">nav</nav>
        <h3 class="desktop-headline-7">Title</h3>
        <span class="hero-cta-banner">cta</span>
        <svg class="icon-prefix-thing"></svg>
      `,
    });

    // Each entry pairs an anchored group with a classname that contains the
    // group's anchor word but is NOT itself anchored as a token of that group:
    //   - buttons: `navbar-button-thing` — `button` is mid-token, classMatcher
    //     `/^button(?:$|-)/i` and selectorMatcher `/^(?:\\.)?button(?:$|[-_:])/i`
    //     both reject it.
    //   - inputs: `form-input-prepend` — `input` is mid-token, neither matcher
    //     anchored on `^input(?:$|[-_:])` nor `\\.field...` admits it.
    //   - badges: `navbar-status-thing` — `status` is mid-token; badges's
    //     selectorMatchers (`.badge`/`.chip`/`.tag`/`.pill`) don't list it and
    //     classMatchers `/^status(?:$|-)/i` rejects the mid-token form.
    //   - links: `navbar-extra-link` — `link` is a suffix only; selectorMatcher
    //     `\\.link(?:$|[-_:])` rejects (link is preceded by `-extra-`).
    //   - layout: `footer-section-link` — `section` is mid-token; selectorMatcher
    //     `/^(?:\\.\\.)?(?:section|main|nav)(?:$|[-_:])/i` rejects.
    //   - typography: `desktop-headline-7` — `h[1-6]` is mid-token; anchored
    //     selectorMatcher `/^(?:\\.)?h[1-6](?:$|[-_:])/i` rejects.
    //   - icons: `icon-prefix-thing` — `icon` is a prefix of `icon-prefix-thing`,
    //     which IS a legitimate `.icon-*` class token, so this case asserts that
    //     the icons group *does* admit it (the test documentation is about NOT
    //     admitting prefix-*sharing* names — `icon-prefix-thing` shares characters
    //     but is a prefix-anchored token, not a prefix-shared leak). Move it out
    //     of the wantAbsent list to keep the assertion honest.
    const wantAbsent = [
      { id: 'buttons', selector: '.navbar-button-thing' },
      { id: 'inputs', selector: '.form-input-prepend' },
      { id: 'badges', selector: '.navbar-status-thing' },
      { id: 'links', selector: '.navbar-extra-link' },
      { id: 'layout', selector: '.footer-section-link' },
      { id: 'typography', selector: '.desktop-headline-7' },
      { id: 'keyboard', selector: '.hero-cta-banner' },
    ];

    for (const { id, selector } of wantAbsent) {
      const group = manifest.groups.find((g) => g.id === id);
      expect(group, `group ${id} should exist`).toBeDefined();
      expect(
        group?.selectors,
        `group ${id} selectors must not admit prefix-sharing ${selector}`,
      ).not.toContain(selector);
      expect(
        group?.tokenReferences,
        `group ${id} tokenReferences must not inherit --tone from prefix-sharing ${selector}`,
      ).not.toContain('--tone');
    }

    // Sanity: legitimate prefix-anchored class tokens still classify correctly.
    const iconsSelectors = manifest.groups.find((g) => g.id === 'icons')?.selectors ?? [];
    expect(iconsSelectors).toContain('.icon-prefix-thing');
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

  it('treats braces inside quoted CSS values as data, not rule delimiters (#6250 reviewer #3)', () => {
    // PerishCode CHANGES_REQUESTED on PR #6250:
    //   "Treat braces inside quoted CSS values as data, not rule delimiters.
    //    This depth loop currently has no string/escape state, so valid CSS
    //    such as `.btn-a { content: "}"; color: var(--a); } .btn-b { color:
    //    var(--b); }` mis-parses."
    //
    // The scanner used to count every `{` / `}` it saw, including braces
    // inside a quoted string like `content: "}"`. That closed the wrapping
    // rule early, swallowed the second rule into the first one's body,
    // and dropped every selector + token reference after the quoted brace.
    //
    // The fix: track single / double quote state in iterateCssRules and
    // flattenNestedBody and ignore braces while inside a quoted value.
    // Handle `\"` and `\'` escapes so a quoted `}"` still terminates the
    // quoted context cleanly.
    const manifest = extractComponentsManifest({
      brandId: 'quoted-braces',
      tokensCss: ':root { --a: red; --b: blue; --c: green; }',
      fixtureHtml: `
        <style>
          .btn-a { content: "}"; color: var(--a); }
          .btn-b { content: '{'; background: var(--b); }
          .btn-c { content: '\\'\\';'; border-color: var(--c); }
        </style>
        <button class="btn-a btn-b btn-c">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(
      expect.arrayContaining(['.btn-a', '.btn-b', '.btn-c']),
    );
    const buttonsGroup = manifest.groups.find((g) => g.id === 'buttons');
    expect(buttonsGroup?.selectors).toEqual(
      expect.arrayContaining(['.btn-a', '.btn-b', '.btn-c']),
    );
    // All three tokens survive — the quoted braces do not truncate the
    // rule body and lose later declarations.
    expect(buttonsGroup?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b', '--c']),
    );

    // Severity check: a quoted `}` followed by a *second flat rule* must
    // not collapse the second rule into the first. Pre-fix behaviour:
    // `.btn-a { content: "}"; color: var(--a); } .btn-b { color: var(--b); }`
    // closed `.btn-a` at the quoted `}`, swallowed `.btn-b` as text, and
    // the manifest lost `.btn-b` + its --b reference entirely.
    const pair = extractComponentsManifest({
      brandId: 'quoted-pair',
      tokensCss: ':root { --a: red; --b: blue; }',
      fixtureHtml: `
        <style>
          .btn-a { content: "}"; color: var(--a); }
          .btn-b { color: var(--b); }
        </style>
        <button class="btn-a btn-b">x</button>
      `,
    });
    expect(pair.selectors).toEqual(
      expect.arrayContaining(['.btn-a', '.btn-b']),
    );
    const pairButtons = pair.groups.find((g) => g.id === 'buttons');
    expect(pairButtons?.tokenReferences).toEqual(
      expect.arrayContaining(['--a', '--b']),
    );
  });
});
