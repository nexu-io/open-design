import { describe, expect, it } from 'vitest';

import { buildSrcdoc } from '../../src/runtime/srcdoc';

// These specs deliberately run with no `DOMParser` on globalThis (the web
// suite's default environment is node, and only the specs that need one stub
// it). That matters: `annotateMissingOdIds` early-returns without a parser, so
// nothing upstream normalizes the document into `<html><head>…`. What is left
// is each injector locating its own boundary — which is the property under
// test. Relying on an upstream round-trip to synthesize a `<head>` is exactly
// how the daemon copies of this logic stayed broken until #7410.
describe('buildSrcdoc injection points', () => {
  it('leaves a script that builds an HTML document string intact', () => {
    const authored = 'const doc = `<head><title>Slip</title></head><body>slip</body>`;';
    const html = `<!doctype html><html><body><script>${authored}<\/script><p>hi</p></body></html>`;

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain(authored);
  });

  it('leaves markup stored on an attribute intact', () => {
    const authored = 'data-tpl="<head></head><body>slip</body>"';
    const html = `<!doctype html><html><body><div ${authored}></div><p>hi</p></body></html>`;

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain(authored);
  });

  it('does not mistake `<header>` for the document head', () => {
    const html = '<!doctype html><html><body><header>nav</header><p>hi</p></body></html>';

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain('<header>nav</header>');
  });

  it('keeps a deck bridge out of a script that writes `</body>`', () => {
    const authored = 'const doc = `<body>slip</body>`;';
    const html = `<!doctype html><html><head></head><body><script>${authored}<\/script><p>hi</p></body></html>`;

    const srcdoc = buildSrcdoc(html, { deck: true });

    expect(srcdoc).toContain(authored);
  });

  it('sanitizes a title whose open tag carries a quoted `>`', () => {
    // The open tag ends at the real `>`, not the one inside the attribute
    // value; ending early would swallow part of the title text.
    const html = '<!doctype html><html><head><title data-x="a>b">Invoice Q1</title></head>'
      + '<body><p>hi</p></body></html>';

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain('<title data-x="a>b">Invoice Q1</title>');
  });

  it('ends a title at a close the parser accepts, not the one spelling', () => {
    // `</title >` closes the element. A `indexOf('</title>')` misses it and
    // takes the next `</title>` in the document — here one inside an authored
    // script string — so the rewrite range spans everything between.
    const html = '<!doctype html><html><head><title>Invoice Q1</title ></head>'
      + '<body><script>const doc = `<title>Slip</title>`;<\/script>'
      + '<p>hi</p></body></html>';

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain('<title>Invoice Q1</title >');
    expect(srcdoc).toContain('const doc = `<title>Slip</title>`;');
  });

  it('does not accept a longer tag name as the title close', () => {
    // `</title-page>` is not a close, so the whole `a</title-page>b` is title
    // text and is sanitized as one string. Taking it as the close would title
    // the document `a` and leave `b` as stray text before `</head>`.
    const html = '<!doctype html><html><head><title>a</title-page>b</title></head>'
      + '<body><p>hi</p></body></html>';

    const srcdoc = buildSrcdoc(html);

    expect(srcdoc).toContain('<title>a-title-page-b</title>');
  });

  it('keeps every injected bridge outside the authored script', () => {
    const authored = 'const doc = `<head></head><body>slip</body>`;';
    const html = `<!doctype html><html><body><script>${authored}<\/script><p>hi</p></body></html>`;

    const srcdoc = buildSrcdoc(html, {
      deck: true,
      editBridge: true,
      selectionBridge: true,
      previewFocusGuard: true,
      previewObservability: true,
    });

    const scriptStart = srcdoc.indexOf('const doc = `');
    const scriptEnd = srcdoc.indexOf('<\/script>', scriptStart);
    const authoredScript = srcdoc.slice(scriptStart, scriptEnd);
    expect(authoredScript).not.toMatch(/data-od-/);
  });
});
