import { describe, expect, it } from 'vitest';

import { extractComponentsManifest, summarizeComponentsManifestForPrompt } from '../src/design-systems/components-manifest.js';

describe('components manifest extraction', () => {
  it('summarizes tokens, selectors, html classes, and component groups deterministically', () => {
    const manifest = extractComponentsManifest({
      brandId: 'sample',
      tokensCss: ':root { --bg: #fff; --accent: #05f; --radius-md: 12px; }',
      fixtureHtml: `
        <!doctype html>
        <html>
          <head>
            <title>Sample fixture</title>
            <meta name="description" content="A compact fixture." />
            <style>
              :root { --bg: #fff; --accent: #05f; --radius-md: 12px; }
              .btn, button {
                color: var(--accent);
                border-radius: var(--radius-md);
              }
              .card { background: var(--bg); }
              .stack-4 { gap: 16px; }
            </style>
          </head>
          <body>
            <main class="stack-4">
              <article class="card">
                <button class="btn">Ship</button>
              </article>
            </main>
          </body>
        </html>
      `,
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixture).toMatchObject({
      title: 'Sample fixture',
      description: 'A compact fixture.',
      styleBlockCount: 1,
      selectorCount: 4,
      classCount: 3,
    });
    expect(manifest.tokens.declared).toEqual(['--accent', '--bg', '--radius-md']);
    expect(manifest.tokens.referenced).toEqual(['--accent', '--bg', '--radius-md']);
    expect(manifest.selectors).toEqual(['.btn', '.card', '.stack-4', 'button']);
    expect(manifest.classes).toEqual(['btn', 'card', 'stack-4']);
    expect(manifest.groups.find((group) => group.id === 'buttons')).toMatchObject({
      present: true,
      selectors: ['.btn', 'button'],
      classes: ['btn'],
      elements: ['button'],
    });
    expect(manifest.groups.find((group) => group.id === 'layout')).toMatchObject({
      present: true,
      selectors: ['.stack-4'],
      classes: ['stack-4'],
      elements: ['main'],
    });
    expect(manifest.literals.pixelValues).toBe(1);
  });

  it('attributes token references to every consecutive flat rule', () => {
    const manifest = extractComponentsManifest({
      brandId: 'issue-6224',
      fixtureHtml: `
        <style>
          :root { --a: #111; --b: #222; --c: #333; --d: #444; }
          .btn-a { color: var(--a); }
          .btn-b { color: var(--b); }
          .btn-c { color: var(--c); }
          .btn-d { color: var(--d); }
        </style>
        <button class="btn-a">x</button>
      `,
    });

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['.btn-a', '.btn-b', '.btn-c', '.btn-d']);
    expect(buttons?.tokenReferences).toEqual(['--a', '--b', '--c', '--d']);
  });

  it('attributes tokens inside nested rules to real selectors, never to declaration text', () => {
    const manifest = extractComponentsManifest({
      brandId: 'issue-6224',
      fixtureHtml: `
        <style>
          :root { --chip-bg: #eee; --chip-hover: #ddd; }
          .chip-demo { background: var(--chip-bg); &:hover { background: var(--chip-hover); } }
        </style>
        <span class="chip-demo">chip</span>
      `,
    });

    expect(manifest.selectors).toEqual(['.chip-demo', '.chip-demo:hover']);

    const badges = manifest.groups.find((group) => group.id === 'badges');
    expect(badges?.selectors).toContain('.chip-demo');
    expect(badges?.tokenReferences).toEqual(['--chip-bg', '--chip-hover']);
  });

  it('does not classify utility classes into unrelated groups via substring matches', () => {
    const manifest = extractComponentsManifest({
      brandId: 'issue-6224',
      fixtureHtml: `
        <style>
          .card-demo { padding: 1rem; }
          .select-none { user-select: none; }
        </style>
        <div class="card-demo grid-cols-2 transition-transform select-none">x</div>
      `,
    });

    const inputs = manifest.groups.find((group) => group.id === 'inputs');
    expect(inputs?.selectors).toEqual([]);
    expect(inputs?.present).toBe(false);

    const layout = manifest.groups.find((group) => group.id === 'layout');
    expect(layout?.present).toBe(false);

    const cards = manifest.groups.find((group) => group.id === 'cards');
    expect(cards?.present).toBe(true);
  });

  it('matches select as a type selector, not as literal text in class names or attribute values', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; }
          select { color: var(--accent); }
          .foo select:hover { color: var(--accent); }
          .select-none { user-select: none; }
          [data-action='select'] { color: var(--accent); }
        </style>
        <div data-action="select">x</div>
      `,
    });

    const inputs = manifest.groups.find((group) => group.id === 'inputs');
    expect(inputs?.selectors).toEqual(['.foo select:hover', 'select']);
    expect(inputs?.tokenReferences).toEqual(['--accent']);
  });

  it('matches form-control names only where a type selector can occur', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-form-controls',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --muted: #889; }
          form > input { color: var(--accent); }
          :is(select) { color: var(--accent); }
          .field-row:has(select) { color: var(--accent); }
          .transition-input { transition: color 120ms; color: var(--muted); }
          [data-kind="label"] { color: var(--muted); }
          x-widget::part(select) { color: var(--muted); }
          ::-webkit-input-placeholder { color: var(--muted); }
        </style>
        <div class="field-row transition-input" data-kind="label">x</div>
      `,
    });

    const inputs = manifest.groups.find((group) => group.id === 'inputs');
    expect(inputs?.selectors).toEqual([':is(select)', '.field-row:has(select)', 'form > input']);
    expect(inputs?.tokenReferences).toEqual(['--accent']);
  });

  it('matches group element names only where a type selector can occur', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-element-groups',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --muted: #889; }
          button { color: var(--accent); }
          section > main { color: var(--accent); }
          .transition-button { transition: transform 120ms; color: var(--muted); }
          .foo-section-bar { color: var(--muted); }
          .nav-link { color: var(--muted); }
          [data-kind="button"] { color: var(--muted); }
        </style>
        <button class="transition-button">x</button>
      `,
    });

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['button']);
    expect(buttons?.tokenReferences).toEqual(['--accent']);

    const layout = manifest.groups.find((group) => group.id === 'layout');
    expect(layout?.selectors).toEqual(['section > main']);
    expect(layout?.tokenReferences).toEqual(['--accent']);
  });

  it('masks value-typed pseudo-class arguments but keeps selector-bearing ones matchable', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-pseudo-args',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --muted: #889; }
          li:nth-child(2 of input) { color: var(--accent); }
          :host(select) { color: var(--accent); }
          .copy:lang(select) { color: var(--muted); }
          :state(label) { color: var(--muted); }
        </style>
        <input class="copy" />
      `,
    });

    const inputs = manifest.groups.find((group) => group.id === 'inputs');
    expect(inputs?.selectors).toEqual([':host(select)', 'li:nth-child(2 of input)']);
    expect(inputs?.tokenReferences).toEqual(['--accent']);
  });

  it('consumes full CSS hex escapes and decodes escaped type-selector names', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-hex-escapes',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --muted: #889; }
          \\62 utton { color: var(--accent); }
          .foo\\20 button { color: var(--muted); }
          .bar\\2c section { color: var(--muted); }
        </style>
        <button class="btn">x</button>
      `,
    });

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['\\62 utton']);
    expect(buttons?.tokenReferences).toEqual(['--accent']);

    const layout = manifest.groups.find((group) => group.id === 'layout');
    expect(layout?.selectors).toEqual([]);
  });

  it('keeps quoted delimiters in declaration values out of the prelude split', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-quoted-prelude',
      fixtureHtml: `
        <style>
          :root { --base: #05f; --hover: #04d; }
          .btn { content: "["; color: var(--base); &:hover { color: var(--hover); } }
          .chip { content: "("; color: var(--base); &:hover { color: var(--hover); } }
        </style>
        <button class="btn">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(['.btn', '.btn:hover', '.chip', '.chip:hover']);

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['.btn', '.btn:hover']);
    expect(buttons?.tokenReferences).toEqual(['--base', '--hover']);

    const badges = manifest.groups.find((group) => group.id === 'badges');
    expect(badges?.selectors).toEqual(['.chip', '.chip:hover']);
    expect(badges?.tokenReferences).toEqual(['--base', '--hover']);
  });

  it('keeps balanced brace blocks in custom-property values as declaration text', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226-custom-prop-blocks',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --inside: #f0f; }
          .btn { --payload: { color: var(--inside); }; --pay\\6c oad-b: { color: var(--extra); }; color: var(--accent); }
          .card { background: #fff; }
        </style>
        <button class="btn">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(['.btn', '.card']);

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['.btn']);
    expect(buttons?.tokenReferences).toEqual(['--accent', '--extra', '--inside']);
  });

  it('traverses @scope and @starting-style blocks like other grouping at-rules', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --pop: #f0f; }
          @scope (.shell) {
            .btn { color: var(--accent); }
          }
          .card { background: #fff; @starting-style { background: var(--pop); } }
        </style>
        <button class="btn">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(['.btn', '.card']);

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.tokenReferences).toEqual(['--accent']);

    const cards = manifest.groups.find((group) => group.id === 'cards');
    expect(cards?.tokenReferences).toEqual(['--pop']);
  });

  it('treats braces and comment markers inside CSS strings as text, not structure', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --card-bg: #fff; }
          .btn::before { content: '{'; color: var(--accent); }
          .card { background: var(--card-bg); }
          .chip::after { content: "}"; color: var(--accent); }
          .kbd-hint::before { content: 'a\\'{'; color: var(--accent); }
          .pill { content: '/*'; background-image: url('data:image/svg+xml,<svg>{}</svg>'); } /* real comment */
          .tag { color: var(--accent); }
        </style>
        <button class="btn">x</button>
      `,
    });

    expect(manifest.selectors).toEqual([
      '.btn::before',
      '.card',
      '.chip::after',
      '.kbd-hint::before',
      '.pill',
      '.tag',
    ]);

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.tokenReferences).toEqual(['--accent']);

    const cards = manifest.groups.find((group) => group.id === 'cards');
    expect(cards?.tokenReferences).toEqual(['--card-bg']);

    const badges = manifest.groups.find((group) => group.id === 'badges');
    expect(badges?.selectors).toEqual(['.chip::after', '.pill', '.tag']);
    expect(badges?.tokenReferences).toEqual(['--accent']);
  });

  it('honors CSS escapes so escaped quotes and braces are text, not structure', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; --card-bg: #fff; }
          .content-\\[\\'x\\'\\]::before { color: var(--accent); }
          .card { background: var(--card-bg); }
          .badge-\\{x\\} { color: var(--accent); }
          .chip { background-image: url(data:image/svg+xml,<svg>{}</svg>); color: var(--accent); }
          .tag { color: var(--accent); }
        </style>
        <button class="btn">x</button>
      `,
    });

    expect(manifest.selectors).toEqual([
      ".badge-\\{x\\}",
      '.card',
      '.chip',
      ".content-\\[\\'x\\'\\]::before",
      '.tag',
    ]);

    const cards = manifest.groups.find((group) => group.id === 'cards');
    expect(cards?.tokenReferences).toEqual(['--card-bg']);

    const badges = manifest.groups.find((group) => group.id === 'badges');
    expect(badges?.selectors).toEqual([".badge-\\{x\\}", '.chip', '.tag']);
    expect(badges?.tokenReferences).toEqual(['--accent']);
  });

  it('expands & only as the nesting selector, never inside quoted attribute values', () => {
    const manifest = extractComponentsManifest({
      brandId: 'pr-6226',
      fixtureHtml: `
        <style>
          :root { --accent: #05f; }
          .btn { &[data-label="A&B"] { color: var(--accent); } }
        </style>
        <button class="btn" data-label="A&amp;B">x</button>
      `,
    });

    expect(manifest.selectors).toEqual(['.btn', '.btn[data-label="A&B"]']);

    const buttons = manifest.groups.find((group) => group.id === 'buttons');
    expect(buttons?.selectors).toEqual(['.btn', '.btn[data-label="A&B"]']);
    expect(buttons?.tokenReferences).toEqual(['--accent']);
  });

  it('can render a concise prompt summary from a manifest', () => {
    const manifest = extractComponentsManifest({
      brandId: 'sample',
      fixtureHtml: '<style>.btn { color: var(--accent); }</style><button class="btn">Ship</button>',
    });

    expect(summarizeComponentsManifestForPrompt(manifest)).toContain('components.manifest schema v1 for sample');
    expect(summarizeComponentsManifestForPrompt(manifest)).toContain('Buttons and calls to action');
  });
});
