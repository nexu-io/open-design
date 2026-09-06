import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  scanHtmlHeadForStreamingInjection,
  streamFileWithInjectionAndManualEditSourceAnnotations,
} from '../../src/http/html-stream-injection.js';

describe('scanHtmlHeadForStreamingInjection', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function scan(source: string | Buffer) {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-html-stream-scan-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'index.html');
    await writeFile(filePath, source);
    return {
      source: Buffer.isBuffer(source) ? source : Buffer.from(source),
      result: await scanHtmlHeadForStreamingInjection(filePath),
    };
  }

  async function collect(source: string, injection: string, insertionOffset: number): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-html-stream-transform-'));
    dirs.push(dir);
    const filePath = path.join(dir, 'index.html');
    await writeFile(filePath, source);
    const chunks: Buffer[] = [];
    for await (const chunk of streamFileWithInjectionAndManualEditSourceAnnotations(
      filePath,
      Buffer.byteLength(source),
      insertionOffset,
      Buffer.from(injection),
    )) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  }

  it('inserts after an explicit head without disturbing a BOM, doctype, or leading comments', async () => {
    const fixture = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('<!doctype html><!-- lead --><HTML><HEAD data-x=">">'),
      Buffer.from('<script src="./support.js"></script></HEAD><BODY>ok</BODY></HTML>'),
    ]);
    const { source, result } = await scan(fixture);
    expect(source.subarray(0, result.insertionOffset).toString('utf8')).toBe(
      '\uFEFF<!doctype html><!-- lead --><HTML><HEAD data-x=">">',
    );
    expect(result.hasAuthoredBase).toBe(false);
  });

  it('recognizes an authored base but ignores base-shaped text in comments and scripts', async () => {
    const fake = await scan([
      '<!doctype html><html><head>',
      '<!-- <base href="/comment/"> -->',
      '<script>const sample = `<base href="/script/">`;</script>',
      '</head><body></body></html>',
    ].join(''));
    expect(fake.result.hasAuthoredBase).toBe(false);

    const real = await scan([
      '<!doctype html><html><head>',
      '<!-- <base href="/comment/"> -->',
      '<base href="/authored/">',
      '</head><body></body></html>',
    ].join(''));
    expect(real.result.hasAuthoredBase).toBe(true);
  });

  it('ignores inert base-shaped markup inside templates and noscript text', async () => {
    const fixture = await scan([
      '<html><head>',
      '<template><base href="/template/"><body>template body</body></template>',
      '<noscript><base href="/noscript/"></noscript>',
      '</head><body>real body</body></html>',
    ].join(''));
    expect(fixture.result.hasAuthoredBase).toBe(false);
  });

  it('uses the implicit head after html when the document omits a head tag', async () => {
    const { source, result } = await scan('<!doctype html><html><meta charset="utf-8"><body>ok</body></html>');
    expect(source.subarray(0, result.insertionOffset).toString()).toBe('<!doctype html><html>');
  });

  it('inserts after a doctype when both html and head tags are omitted', async () => {
    const { source, result } = await scan('<!doctype html>\n<main>ok</main>');
    expect(source.subarray(0, result.insertionOffset).toString()).toBe('<!doctype html>\n');
  });

  it('finds head tags and redirect signals split across read chunks', async () => {
    const padding = ' '.repeat((64 * 1024) - '<!doctype html><html>'.length - 2);
    const fixture = `<!doctype html><html>${padding}<head><script>location.replace('./next.html')</script></head><body/>`;
    const { source, result } = await scan(fixture);
    expect(source.subarray(0, result.insertionOffset).toString().endsWith('<head>')).toBe(true);
    expect(result.hasLoadTimeLocationNavigation).toBe(true);
  });

  it('keeps scanning body scripts after the head insertion point is known', async () => {
    const fixture = await scan([
      '<!doctype html><html><head><title>Preview</title></head>',
      '<body><main>Visible content</main>',
      '<script>location.replace("./next.html")</script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.hasLoadTimeLocationNavigation).toBe(true);
  });

  it('detects passive guard signals after the routing-preview prefix', async () => {
    const fixture = await scan([
      '<!doctype html><html><head><title>Late guards</title></head><body>',
      'x'.repeat((96 * 1024) + 1),
      '<input autofocus>',
      '<script type="text/babel" src="./app.jsx"></script>',
      '<script>location.replace("./next.html")</script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.needsSandboxShim).toBe(true);
    expect(fixture.result.needsFocusGuard).toBe(true);
    expect(fixture.result.needsRedirectGuard).toBe(true);
  });

  it('detects powered-preview signals in the same whole-document pass', async () => {
    const fixture = await scan([
      '<!doctype html><html><head><title>Late worker</title></head><body>',
      'x'.repeat((96 * 1024) + 1),
      '<script>new Worker("./worker.js")</script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.needsPoweredPreview).toBe(true);
  });

  it('routes external Babel modules through a same-origin powered preview', async () => {
    const fixture = await scan([
      '<!doctype html><html><head><title>JSX modules</title></head><body>',
      'x'.repeat((96 * 1024) + 1),
      '<script src="./components/app.jsx" defer type=text/babel></script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.needsPoweredPreview).toBe(true);
  });

  it('routes relative ES module graphs through a same-origin powered preview', async () => {
    const fixture = await scan([
      '<!doctype html><html><head><title>ES module graph</title></head><body>',
      'x'.repeat((96 * 1024) + 1),
      '<script type="module" src="./scripts/main.js"></script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.needsPoweredPreview).toBe(true);
  });

  it('recognizes a real Vite dev entry without matching inert script-shaped text', async () => {
    const inert = await scan([
      '<!doctype html><html><head>',
      '<script>const example = `<script type="module" src="/src/fake.tsx"></script>`;</script>',
      '<template><script type="module" src="/src/inert.tsx"></script></template>',
      '</head><body></body></html>',
    ].join(''));
    expect(inert.result.hasViteDevEntry).toBe(false);

    const authored = await scan([
      '<!doctype html><html><head>',
      '<script src="/src/main.tsx" type="MODULE"></script>',
      '</head><body></body></html>',
    ].join(''));
    expect(authored.result.hasViteDevEntry).toBe(true);
  });

  it('detects relative dynamic imports outside the routing prefix', async () => {
    const fixture = await scan([
      '<!doctype html><html><head></head><body>',
      'x'.repeat((96 * 1024) + 1),
      '<script type="module">import("./scripts/lazy.js")</script>',
      '</body></html>',
    ].join(''));
    expect(fixture.result.needsPoweredPreview).toBe(true);
  });

  it('detects an external Babel module tag split across stream chunks', async () => {
    const prefix = '<!doctype html><html><head></head><body>';
    const splitTagPrefix = '<script src="./app.jsx" type="text/ba';
    const padding = 'x'.repeat((64 * 1024) - prefix.length - splitTagPrefix.length);
    const fixture = await scan([
      prefix,
      padding,
      splitTagPrefix,
      'bel"></script></body></html>',
    ].join(''));
    expect(fixture.result.needsPoweredPreview).toBe(true);
  });

  it('collects Deck markup and inline navigation facts without retaining the document', async () => {
    const fixture = await scan([
      '<!doctype html><html data-od-deck-protocol="1"><head></head><body>',
      '<main id="deck-stage"><deck-stage><section class="slide">One</section></deck-stage></main>',
      '<script>window.addEventListener("message",function(event){if(event.data.type==="od:slide"){};});</script>',
      '<script>window.addEventListener("keydown",function(event){if(event.key==="ArrowRight"){};});</script>',
      '<script>window.addEventListener("hashchange",function(){const index=location.hash;});',
      'const prefix="#/";</script>',
      '</body></html>',
    ].join(''));

    expect(fixture.result).toMatchObject({
      hasDeckStageElement: true,
      hasFrameworkDeckId: true,
      hasExplicitDeckSlideElement: true,
      hasInlineSlideMessageListener: true,
      artifactDeckProtocolVersion: 1,
      hasInlineKeydownNavigation: true,
      hasInlineHashNavigation: true,
      inlineHashIndexPrefix: '#/',
      complete: true,
    });
  });

  it('classifies explicit and legacy Deck slides from real markup only', async () => {
    const explicit = await scan([
      '<html><head><script>const fake=`<section class="slide">fake</section>`;</script></head>',
      '<body><template><section class="ppt-slide">inert</section></template>',
      '<main><section class="deck-slide">real</section></main></body></html>',
    ].join(''));
    expect(explicit.result.hasExplicitDeckSlideElement).toBe(true);

    const legacy = await scan([
      '<html><body><main>',
      '<section data-screen-label="01 Cover">One</section>',
      '<section data-screen-label="02 Plan">Two</section>',
      '</main></body></html>',
    ].join(''));
    expect(legacy.result.hasLegacyDeckScreenSlides).toBe(true);

    const unrelated = await scan([
      '<html><body>',
      '<main><section data-screen-label="01 Card">One</section></main>',
      '<aside><section data-screen-label="02 Card">Two</section></aside>',
      '<script>const fake=`<section class="slide">fake</section>`;</script>',
      '</body></html>',
    ].join(''));
    expect(unrelated.result.hasExplicitDeckSlideElement).toBe(false);
    expect(unrelated.result.hasLegacyDeckScreenSlides).toBe(false);
  });

  it('keeps Deck source detection correct across 64 KiB read boundaries', async () => {
    const prefix = '<html><head></head><body><script>';
    const boundaryFragment = 'window.addEventListener("key';
    const padding = 'x'.repeat((64 * 1024) - prefix.length - boundaryFragment.length);
    const source = [
      prefix,
      padding,
      boundaryFragment,
      'down",function(event){if(event.key==="ArrowRight"){};});',
      'window.addEventListener("message",function(event){if(event.data.type==="od:slide"){};});',
      'window.addEventListener("hashchange",function(){return location.hash||"#/";});',
      '</script></body></html>',
    ].join('');
    const fixture = await scan(source);

    expect(fixture.result.hasInlineKeydownNavigation).toBe(true);
    expect(fixture.result.hasInlineSlideMessageListener).toBe(true);
    expect(fixture.result.hasInlineHashNavigation).toBe(true);
    expect(fixture.result.inlineHashIndexPrefix).toBe('#/');
    expect(fixture.result.scannedBytes).toBe(Buffer.byteLength(source));
  });

  it('does not treat inert template, comment, or script-string markup as Deck DOM', async () => {
    const fixture = await scan([
      '<html><head></head><body>',
      '<!-- <deck-stage id="deck-stage"></deck-stage> -->',
      '<template><deck-stage><div id="deck-stage"></div></deck-stage></template>',
      '<script>const sample=`<deck-stage id="deck-stage"></deck-stage>`;</script>',
      '<main>ordinary prototype</main>',
      '</body></html>',
    ].join(''));

    expect(fixture.result.hasDeckStageElement).toBe(false);
    expect(fixture.result.hasFrameworkDeckId).toBe(false);
  });

  it('scans large Deck files through EOF after all positive facts are known', async () => {
    const source = [
      '<html><head></head><body><deck-stage id="deck-stage">',
      '<script>addEventListener("message",()=>"od:slide");',
      'addEventListener("keydown",event=>event.key==="ArrowRight");',
      'addEventListener("hashchange",()=>location.hash="#/");</script>',
      'x'.repeat((2 * 1024 * 1024) + 17),
      '</deck-stage></body></html>',
    ].join('');
    const fixture = await scan(source);

    expect(fixture.result.complete).toBe(true);
    expect(fixture.result.scannedBytes).toBe(Buffer.byteLength(source));
    expect(fixture.result.hasInlineSlideMessageListener).toBe(true);
    expect(fixture.result.hasInlineKeydownNavigation).toBe(true);
  });

  it('does not close raw-text elements on end-tag-name prefixes', async () => {
    const fixture = await scan([
      '<html><head><script>',
      'const samples = "</scripture><base href=/fake-a/>";',
      'const other = "</script-not-a-tag><base href=/fake-b/>";',
      '</script></head><body>ok</body></html>',
    ].join(''));
    expect(fixture.result.hasAuthoredBase).toBe(false);
  });

  it('waits for the raw-text end-tag delimiter across read chunks', async () => {
    const prefix = '<html><head><script>';
    const splitCandidate = '</script';
    const padding = 'x'.repeat((64 * 1024) - prefix.length - splitCandidate.length);
    const fixture = await scan([
      prefix,
      padding,
      splitCandidate,
      'ure><base href=/fake/>',
      '</script><base href=/real/></head><body>ok</body></html>',
    ].join(''));
    expect(fixture.result.hasAuthoredBase).toBe(true);
  });

  it('treats self-closing syntax on raw-text elements as an opening tag', async () => {
    for (const [open, close] of [
      ['<script/>', '</script>'],
      ['<style />', '</style>'],
    ]) {
      const fixture = await scan([
        '<html><head>',
        open,
        '<base href=/fake/>',
        close,
        '</head><body>ok</body></html>',
      ].join(''));
      expect(fixture.result.hasAuthoredBase).toBe(false);
    }
  });

  it('recognizes a self-closing raw-text start tag split across read chunks', async () => {
    const prefix = '<html><head>';
    const splitCandidate = '<style ';
    const padding = ' '.repeat((64 * 1024) - prefix.length - splitCandidate.length);
    const fixture = await scan([
      prefix,
      padding,
      splitCandidate,
      '/><base href=/fake/></style>',
      '</head><body>ok</body></html>',
    ].join(''));
    expect(fixture.result.hasAuthoredBase).toBe(false);
  });

  it('keeps malformed attacker-sized tags bounded and returns a parser-safe fallback', async () => {
    const fixture = `<!doctype html><${'x'.repeat((256 * 1024) + 1)}`;
    const { result } = await scan(fixture);
    expect(result.insertionOffset).toBe('<!doctype html>'.length);
    expect(result.hasAuthoredBase).toBe(false);
  });

  it('streams runtime injection and source identities without corrupting UTF-8 authored text', async () => {
    const prefix = '<!doctype html><html><head>';
    const source = `${prefix}<title>中文</title></head><body><main><h1>你好 🌏</h1></main></body></html>`;
    const injection = '<script data-runtime>window.runtimeReady=true;</script>';

    const transformed = await collect(source, injection, Buffer.byteLength(prefix));

    expect(transformed).toContain(`${prefix}${injection}<title>中文</title>`);
    expect(transformed).toContain('<main data-od-source-path="source-0" data-od-generated-source-path>');
    expect(transformed).toContain('<h1 data-od-source-path="source-1" data-od-generated-source-path>你好 🌏</h1>');
  });

  it('keeps runtime script markup and authored raw text out of source ordinals', async () => {
    const source = '<html><head></head><body><script>const fake="<p>fake</p>";</script><p>real</p></body></html>';
    const injection = '<script>const injected="<section>runtime</section>";</script>';
    const insertionOffset = source.indexOf('</head>');

    const transformed = await collect(source, injection, insertionOffset);

    expect(transformed).toContain('<p data-od-source-path="source-0" data-od-generated-source-path>real</p>');
    expect(transformed.match(/data-od-source-path/g)).toHaveLength(1);
  });

  it('streams source identities after a 2 MiB body prefix', async () => {
    const prefix = '<html><head></head><body>';
    const source = `${prefix}${'x'.repeat((2 * 1024 * 1024) + 17)}<p>late target</p></body></html>`;

    const transformed = await collect(source, '<script>window.runtimeReady=true;</script>', prefix.indexOf('</head>'));

    expect(transformed).toContain('<p data-od-source-path="source-0" data-od-generated-source-path>late target</p>');
    expect(Buffer.byteLength(transformed)).toBeGreaterThan(Buffer.byteLength(source));
  });
});
