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

  it('can render a concise prompt summary from a manifest', () => {
    const manifest = extractComponentsManifest({
      brandId: 'sample',
      fixtureHtml: '<style>.btn { color: var(--accent); }</style><button class="btn">Ship</button>',
    });

    expect(summarizeComponentsManifestForPrompt(manifest)).toContain('components.manifest schema v1 for sample');
    expect(summarizeComponentsManifestForPrompt(manifest)).toContain('Buttons and calls to action');
  });
});
