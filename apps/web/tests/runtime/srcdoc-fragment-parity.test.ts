import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { buildSrcdoc } from '../../src/runtime/srcdoc';

const nativeDomParser = globalThis.DOMParser;

describe('buildSrcdoc fragment navigation parity', () => {
  beforeEach(() => {
    const dom = new JSDOM();
    globalThis.DOMParser = dom.window.DOMParser as unknown as typeof DOMParser;
  });

  afterEach(() => {
    if (nativeDomParser == null) Reflect.deleteProperty(globalThis, 'DOMParser');
    else globalThis.DOMParser = nativeDomParser;
  });

  it('keeps leading fragment metadata and authored styles in head during runtime body restore', () => {
    const source = [
      '<meta charset="utf-8">',
      '<title>Fragment deck</title>',
      '<style>body { background: rgb(1, 2, 3); }</style>',
      '<main><h1>Styled content</h1></main>',
    ].join('');

    const result = parse(buildSrcdoc(source, {
      editBridge: true,
      selectionBridge: true,
      transportActivationGeneration: 'fragment-head-parity',
    }));

    expect(result.title).toBe('Fragment deck');
    expect(result.head.querySelector('style:not([data-od-edit-bridge-style])')?.textContent)
      .toContain('background: rgb(1, 2, 3)');
    expect(result.body.querySelector('main h1')?.textContent).toBe('Styled content');
    expect(result.body.querySelector('style')).toBeNull();
  });

  it('preserves quirks mode when the URL source has no doctype', () => {
    const source = '<section><h2>Runtime monitor</h2></section>';
    const urlDocument = new JSDOM(source).window.document;
    const srcDocDocument = new JSDOM(buildSrcdoc(source, { editBridge: true })).window.document;

    expect(urlDocument.compatMode).toBe('BackCompat');
    expect(srcDocDocument.compatMode).toBe(urlDocument.compatMode);
    expect(srcDocDocument.doctype).toBeNull();
  });
});

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}
