import { describe, expect, it } from 'vitest';

import {
  MAX_STANDALONE_ENTRY_BYTES,
  MAX_STANDALONE_FIRST_LEVEL_CANDIDATES,
  MAX_STANDALONE_OUTPUT_BYTES,
  MAX_STANDALONE_RAW_BYTES,
  StandaloneHtmlExportError,
  bundleStandaloneHtml,
  type StandaloneAssetReader,
} from '../../src/artifacts/standalone-html.js';

function assetReader(files: Record<string, { body: string | Buffer; mime: string }>): StandaloneAssetReader {
  return async (path) => {
    const file = files[path];
    if (!file) return null;
    const buffer = Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body);
    return {
      buffer,
      mime: file.mime,
      size: buffer.length,
    };
  };
}

describe('bundleStandaloneHtml', () => {
  it('embeds nested HTML, CSS, images, fonts, modules, and workers into one file', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'pages/index.html',
      html: `<!doctype html>
        <html><head>
          <link rel="stylesheet" href="../styles/main.css">
          <style>.inline { background: url('../assets/inline.svg') }</style>
        </head><body>
          <img id="hero" src="../assets/hero.png?rev=7"
            srcset="../assets/hero.png 1x, /assets/hero@2x.png#crop 2x">
          <script type="module" src="../scripts/main.js"></script>
        </body></html>`,
      readAsset: assetReader({
        'styles/main.css': {
          body: `@import "./nested/theme.css";
            @font-face { font-family: Demo; src: url('../fonts/demo.woff2?v=1') }
            body { background: url('../assets/bg.svg#shape') }`,
          mime: 'text/css',
        },
        'styles/nested/theme.css': {
          body: `.card { mask-image: url('../../assets/mask.svg') }`,
          mime: 'text/css',
        },
        'scripts/main.js': {
          body: `import { reveal } from './motion.js';
            import('./lazy.js').then(({ lazy }) => lazy());
            const icon = new URL('../assets/icon.svg', import.meta.url);
            const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
            const shared = new SharedWorker('./shared-worker.js');
            reveal(document.querySelector('#hero'), icon, worker, shared);`,
          mime: 'text/javascript',
        },
        'scripts/motion.js': {
          body: `export function reveal(node) { node.dataset.revealed = 'yes'; }`,
          mime: 'text/javascript',
        },
        'scripts/lazy.js': {
          body: `export const lazy = () => document.body.dataset.lazy = 'yes';`,
          mime: 'text/javascript',
        },
        'scripts/worker.js': {
          body: `import { answer } from './worker-helper.js'; importScripts('./legacy-worker.js'); postMessage(answer);`,
          mime: 'text/javascript',
        },
        'scripts/shared-worker.js': {
          body: `self.onconnect = () => {};`,
          mime: 'text/javascript',
        },
        'scripts/legacy-worker.js': {
          body: `self.legacyReady = true;`,
          mime: 'text/javascript',
        },
        'scripts/worker-helper.js': {
          body: `export const answer = 42;`,
          mime: 'text/javascript',
        },
        'assets/hero.png': { body: Buffer.from([1, 2, 3]), mime: 'image/png' },
        'assets/hero@2x.png': { body: Buffer.from([4, 5, 6]), mime: 'image/png' },
        'assets/inline.svg': { body: '<svg/>', mime: 'image/svg+xml' },
        'assets/bg.svg': { body: '<svg id="shape"/>', mime: 'image/svg+xml' },
        'assets/mask.svg': { body: '<svg/>', mime: 'image/svg+xml' },
        'assets/icon.svg': { body: '<svg/>', mime: 'image/svg+xml' },
        'fonts/demo.woff2': { body: Buffer.from([7, 8, 9]), mime: 'font/woff2' },
      }),
    });

    expect(result.html).toContain('data:image/png;base64,AQID');
    expect(result.html).toContain('data:image/png;base64,BAUG#crop');
    expect(result.html).toContain('data:font/woff2;base64,BwgJ');
    expect(result.html).toContain('data:image/svg+xml;base64,PHN2Zy8+');
    expect(result.html).toContain('data:image/svg+xml;base64,PHN2ZyBpZD0ic2hhcGUiLz4=#shape');
    expect(result.html).toContain('type="importmap"');
    expect(result.html).toContain('od-project:/scripts/motion.js');
    expect(result.html).toContain('data:text/javascript;base64,');
    expect(result.html).not.toMatch(/(?:src|href)=["'](?:\.\.\/|\/assets\/)/);
    expect(result.html).not.toContain('./shared-worker.js');
    expect(result.html).not.toContain('./legacy-worker.js');
    expect(result.externalDependencies).toEqual([]);
  });

  it('rewrites local srcset candidates alongside an existing data URL', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<img srcset="data:image/png;base64,AAAA 1x, assets/hero.png 2x">',
      readAsset: assetReader({
        'assets/hero.png': { body: Buffer.from('hero'), mime: 'image/png' },
      }),
    });
    expect(result.html).toContain('data:image/png;base64,AAAA 1x');
    expect(result.html).toContain('data:image/png;base64,aGVybw== 2x');
    expect(result.html).not.toContain('assets/hero.png');
  });

  it('resolves document resources against the first local base href and strips base hrefs', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'pages/index.html',
      html: `<!doctype html><html><head>
        <base href="../assets/">
        <base href="../wrong/">
        <style>.hero { background: url('background.svg') }</style>
      </head><body><img src="logo.png"></body></html>`,
      readAsset: assetReader({
        'assets/logo.png': { body: 'right-logo', mime: 'image/png' },
        'assets/background.svg': { body: '<svg id="right"/>', mime: 'image/svg+xml' },
        'pages/logo.png': { body: 'wrong-logo', mime: 'image/png' },
      }),
    });

    expect(result.html).toContain('data:image/png;base64,cmlnaHQtbG9nbw==');
    expect(result.html).toContain('data:image/svg+xml;base64,PHN2ZyBpZD0icmlnaHQiLz4=');
    expect(result.html).not.toMatch(/<base\b[^>]*\bhref\s*=/iu);
  });

  it('rejects TypeScript and JSX sources instead of emitting browser-invalid JavaScript', async () => {
    await expect(bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module" src="scripts/main.tsx"></script>',
      readAsset: assetReader({
        'scripts/main.tsx': {
          body: 'const label: string = "offline"; document.body.append(<div>{label}</div>);',
          mime: 'text/javascript',
        },
      }),
    })).rejects.toMatchObject({
      kind: 'invalid-source',
      dependency: 'scripts/main.tsx',
      chain: ['index.html', 'scripts/main.tsx'],
    });
  });

  it('preserves defer timing by keeping the rewritten classic script external as a data URL', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script defer src="scripts/app.js"></script>',
      readAsset: assetReader({
        'scripts/app.js': { body: 'window.ready = true;', mime: 'text/javascript' },
      }),
    });
    expect(result.html).toMatch(/<script defer src="data:text\/javascript;base64,/u);
    expect(result.html).not.toContain('src="scripts/app.js"');
  });

  it('embeds external JSON-LD as data instead of parsing it as JavaScript', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="application/ld+json" src="schema.json"></script>',
      readAsset: assetReader({
        'schema.json': {
          body: '{"@context":"https://schema.org","name":"Offline"}',
          mime: 'application/ld+json',
        },
      }),
    });

    expect(result.html).toContain('<script type="application/ld+json">');
    expect(result.html).toContain('{"@context":"https://schema.org","name":"Offline"}');
    expect(result.html).not.toContain('src="schema.json"');
  });

  it('rewrites real CSS URL tokens while ignoring URL-looking strings and comments', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: `<div style="content:'url(missing-string.png)';
        --commented: /* url(missing-comment.png) */ none;
        --asset: url('assets/real.png'); background-image: var(--asset)"></div>`,
      readAsset: assetReader({
        'assets/real.png': { body: 'real-image', mime: 'image/png' },
      }),
    });

    expect(result.html).toContain('url(missing-string.png)');
    expect(result.html).toContain('url(missing-comment.png)');
    expect(result.html).toContain('--asset: url(&quot;data:image/png;base64,cmVhbC1pbWFnZQ==&quot;)');
    expect(result.html).not.toContain("url('assets/real.png')");
  });

  it('rewrites style attributes together with whole script and stylesheet node replacements', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: `<script style="background:url('assets/script.png')" src="scripts/app.js"></script>
        <link style="background:url('assets/link.png')" rel="stylesheet" href="styles/app.css">`,
      readAsset: assetReader({
        'scripts/app.js': { body: 'window.ready = true;', mime: 'text/javascript' },
        'styles/app.css': { body: 'body { color: red; }', mime: 'text/css' },
        'assets/script.png': { body: 'script-image', mime: 'image/png' },
        'assets/link.png': { body: 'link-image', mime: 'image/png' },
      }),
    });

    expect(result.html).toContain('data:image/png;base64,c2NyaXB0LWltYWdl');
    expect(result.html).toContain('data:image/png;base64,bGluay1pbWFnZQ==');
    expect(result.html).not.toMatch(/(?:src|href)="(?:scripts|styles|assets)\//u);
    expect(result.html).not.toContain('assets/script.png');
    expect(result.html).not.toContain('assets/link.png');
  });

  it('preserves CSS import layer, supports, and media conditions when inlining', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<link rel="stylesheet" href="styles/main.css">',
      readAsset: assetReader({
        'styles/main.css': {
          body: '@import "./theme.css" layer(theme) supports(display: grid) screen and (min-width: 1px);',
          mime: 'text/css',
        },
        'styles/theme.css': { body: '.grid{display:grid}', mime: 'text/css' },
      }),
    });
    expect(result.html).toContain('@layer theme');
    expect(result.html).toContain('@supports (display: grid)');
    expect(result.html).toContain('@media screen and (min-width: 1px)');
  });

  it('preserves disabled and alternate stylesheet state on embedded links', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: `<link rel="stylesheet" disabled href="styles/disabled.css">
        <link rel="alternate stylesheet" title="Dark" href="styles/dark.css">`,
      readAsset: assetReader({
        'styles/disabled.css': { body: 'body{color:red}', mime: 'text/css' },
        'styles/dark.css': { body: 'body{color:white}', mime: 'text/css' },
      }),
    });

    expect(result.html).toMatch(/<link rel="stylesheet" disabled href="data:text\/css;base64,/u);
    expect(result.html).toMatch(/<link rel="alternate stylesheet" title="Dark" href="data:text\/css;base64,/u);
    expect(result.html).not.toContain('<style data-od-inline-asset');
    expect(result.html).not.toContain('styles/disabled.css');
    expect(result.html).not.toContain('styles/dark.css');
  });

  it('rejects recursive iframe documents with a dependency chain', async () => {
    await expect(bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<iframe src="nested.html"></iframe>',
      readAsset: assetReader({
        'nested.html': { body: '<iframe src="index.html"></iframe>', mime: 'text/html' },
        'index.html': { body: '<iframe src="nested.html"></iframe>', mime: 'text/html' },
      }),
    })).rejects.toMatchObject({
      kind: 'dependency-cycle',
      dependency: 'index.html',
      chain: ['index.html', 'nested.html', 'index.html'],
    });
  });

  it('embeds non-HTML iframe resources with their original media type', async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const pdf = Buffer.from('%PDF-1.7');
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<iframe src="preview.png#crop"></iframe><iframe src="report.pdf#page=2"></iframe>',
      readAsset: assetReader({
        'preview.png': { body: image, mime: 'image/png' },
        'report.pdf': { body: pdf, mime: 'application/pdf' },
      }),
    });

    expect(result.html).toContain(`src="data:image/png;base64,${image.toString('base64')}#crop"`);
    expect(result.html).toContain(`src="data:application/pdf;base64,${pdf.toString('base64')}#page=2"`);
    expect(result.html).not.toContain('data:text/html');
  });

  it('rewrites resource links without requiring navigation or metadata links as files', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: `<link rel="canonical" href="/products/demo">
        <link rel="alternate" href="next.html">
        <link rel="icon" href="assets/icon.png">
        <link rel="manifest" href="app.webmanifest">
        <link rel="modulepreload" href="scripts/chunk.js">`,
      readAsset: assetReader({
        'assets/icon.png': { body: 'icon', mime: 'image/png' },
        'app.webmanifest': { body: '{}', mime: 'application/manifest+json' },
        'scripts/chunk.js': { body: 'export {};', mime: 'text/javascript' },
      }),
    });

    expect(result.html).toContain('rel="canonical" href="/products/demo"');
    expect(result.html).toContain('rel="alternate" href="next.html"');
    expect(result.html).toContain('rel="icon" href="data:image/png;base64,');
    expect(result.html).toContain('rel="manifest" href="data:application/manifest+json;base64,');
    expect(result.html).toContain('rel="modulepreload" href="data:text/javascript;base64,');
  });

  it('leaves remote dependencies untouched and lists them in the document', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: `<!doctype html><html><head>
        <link rel="stylesheet" href="https://cdn.example.com/site.css">
      </head><body><img src="https://cdn.example.com/hero.png"></body></html>`,
      readAsset: assetReader({}),
    });

    expect(result.externalDependencies).toEqual([
      'https://cdn.example.com/hero.png',
      'https://cdn.example.com/site.css',
    ]);
    expect(result.html).toContain('data-od-external-dependencies');
    expect(result.html).toContain('https://cdn.example.com/hero.png');
  });

  it('fails with a reference chain instead of emitting a broken local URL', async () => {
    await expect(bundleStandaloneHtml({
      entryPath: 'pages/index.html',
      html: '<link rel="stylesheet" href="../styles/main.css">',
      readAsset: assetReader({
        'styles/main.css': {
          body: `.hero { background: url('../assets/missing.png') }`,
          mime: 'text/css',
        },
      }),
    })).rejects.toMatchObject({
      name: 'StandaloneHtmlExportError',
      kind: 'missing-local-dependency',
      dependency: 'assets/missing.png',
      chain: ['pages/index.html', 'styles/main.css', 'assets/missing.png'],
    } satisfies Partial<StandaloneHtmlExportError>);
  });

  it('rejects project-root escape attempts before reading them', async () => {
    const reads: string[] = [];
    await expect(bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<img src="../outside.png">',
      readAsset: async (path) => {
        reads.push(path);
        return null;
      },
    })).rejects.toMatchObject({
      name: 'StandaloneHtmlExportError',
      kind: 'path-outside-project',
    });
    expect(reads).toEqual([]);
  });

  it('keeps the legacy inline budgets as compatibility floors', () => {
    expect(MAX_STANDALONE_ENTRY_BYTES).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    expect(MAX_STANDALONE_FIRST_LEVEL_CANDIDATES).toBeGreaterThanOrEqual(500);
    expect(MAX_STANDALONE_RAW_BYTES).toBeGreaterThanOrEqual(52 * 1024 * 1024);
    expect(MAX_STANDALONE_OUTPUT_BYTES).toBeGreaterThan(50 * 1024 * 1024);
  });

  it('counts unquoted first-level script attributes before reading dependencies', async () => {
    let reads = 0;
    await expect(bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script src=app.js></script>'.repeat(MAX_STANDALONE_FIRST_LEVEL_CANDIDATES + 1),
      readAsset: async () => {
        reads += 1;
        return { buffer: Buffer.from(''), mime: 'text/javascript', size: 0 };
      },
    })).rejects.toMatchObject({
      kind: 'limit-exceeded',
      limit: 'firstLevelCandidates',
    });
    expect(reads).toBe(0);
  });

  it('rejects repeated composite references before assembling an oversized output and reads the asset once', async () => {
    let reads = 0;
    const body = Buffer.alloc(90, 1);
    await expect(bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<img srcset="same.bin 1x"><img srcset="same.bin 2x">',
      limits: { outputBytes: 230 },
      readAsset: async () => {
        reads += 1;
        return { buffer: body, mime: 'application/octet-stream', size: body.length };
      },
    })).rejects.toMatchObject({
      kind: 'limit-exceeded',
      limit: 'outputBytes',
    });
    expect(reads).toBe(1);
  });
});
