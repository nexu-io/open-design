import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyManualEditPatch,
  hasManualEditRuntimeStyleOverride,
  isManualEditFullHtmlDocument,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditInsertedSibling,
  readManualEditOuterHtml,
  readManualEditRestoreDescriptor,
  readManualEditRuntimeOuterHtml,
  readManualEditSavedStyles,
  readManualEditStyles,
} from '../../src/edit-mode/source-patches';

const baseSource = `<!doctype html>
<html>
  <head>
    <style>:root { --brand: #111; }</style>
  </head>
  <body>
    <main>
      <h1 data-od-id="hero-title">Original title</h1>
      <a data-od-id="cta" href="/start">Start</a>
      <button data-od-id="button-cta">Start button</button>
      <a data-od-id="nested-cta" href="/nested"><span>Buy now</span><svg viewBox="0 0 1 1"></svg></a>
      <img data-od-id="hero-image" src="/old.png" alt="Old image">
      <section data-od-id="card" class="hero" style="color: red; padding: 8px;" data-keep="yes">Card</section>
      <p data-od-id="nested"><strong>Nested</strong> copy</p>
      <p>Generated path text</p>
    </main>
  </body>
</html>`;

const brandKitSource = `<!doctype html>
<html>
  <head>
    <script id="od-brand-payload" type="application/json">{"status":"ready","brand":{"name":"Acme","sourceUrl":"https://acme.test","colors":[{"hex":"#111111","name":"Ink","role":"foreground","usage":"body"}],"logo":{"primary":"logo.svg","alternates":["logo-alt.svg"],"notes":"Primary mark"},"voice":{"tone":"Direct","adjectives":["Useful"],"messagingPillars":["Ship fast"],"vocabulary":{"use":["clear"],"avoid":["vague"]}},"imagery":{"style":"Crisp UI","samples":[{"file":"imagery/a.png","caption":"Dashboard","kind":"product"}]}}}</script>
  </head>
  <body>
    <div id="root"></div>
    <script>document.getElementById('root').innerHTML = '<h1 data-od-id="brand-name" data-od-edit="text">Acme</h1>';</script>
  </body>
</html>`;

describe('manual edit source patches', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as typeof CSS;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
    Reflect.deleteProperty(globalThis, 'CSS');
  });

  it('updates only the selected text target', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-title').text).toBe('Edited title');
    expect(readManualEditFields(result.source, 'cta').text).toBe('Start');
  });

  it('updates link label and href', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'cta', text: 'Buy now', href: '/buy' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'cta')).toEqual({ text: 'Buy now', href: '/buy' });
  });

  it('treats buttons as label-only text targets instead of persisting href attributes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'button-cta', value: 'Buy button' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'button-cta');
    expect(html).toContain('Buy button');
    expect(html).not.toContain('href=');
    expect(readManualEditFields(result.source, 'button-cta')).toEqual({ text: 'Buy button' });
  });

  it('preserves nested link markup when only href changes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-cta', text: 'Buy now', href: '/buy' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'nested-cta');
    expect(html).toContain('href="/buy"');
    expect(html).toContain('<span>Buy now</span>');
    expect(html).toContain('<svg');
  });

  it('rejects label edits for links with nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-cta', text: 'Purchase', href: '/buy' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });

  it('updates image src and alt', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-image', id: 'hero-image', src: '/new.png', alt: 'New image' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-image')).toEqual({ src: '/new.png', alt: 'New image' });
  });

  it('adds and removes inline style properties', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'card',
      styles: {
        color: '',
        backgroundColor: '#ff0000',
        fontSize: '24px',
        paddingTop: '12px',
        marginLeft: '4px',
        borderTopWidth: '2px',
        borderStyle: 'solid',
        borderColor: '#000000',
        borderRadius: '8px',
        opacity: '0.5',
      },
    });

    expect(result.ok).toBe(true);
    const styles = readManualEditStyles(result.source, 'card');
    expect(styles.color).toBe('');
    expect(styles.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(styles.fontSize).toBe('24px');
    expect(styles.padding).toBe('12px 8px 8px');
    expect(styles.paddingTop).toBe('12px');
    expect(styles.marginLeft).toBe('4px');
    expect(styles.borderTopWidth).toBe('2px');
    expect(styles.borderStyle).toBe('solid');
    expect(styles.borderColor).toBe('rgb(0, 0, 0)');
    expect(styles.borderRadius).toBe('8px');
    expect(styles.opacity).toBe('0.5');
  });

  it('applies attributes additively and preserves class/style unless explicitly updated', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'card',
      attributes: { 'aria-label': 'Hero card', 'data-empty': '', 'data-od-id': 'blocked' },
    });

    expect(result.ok).toBe(true);
    const attrs = readManualEditAttributes(result.source, 'card');
    expect(attrs['aria-label']).toBe('Hero card');
    expect(attrs.class).toBe('hero');
    expect(attrs.style).toContain('color: red');
    expect(attrs['data-od-id']).toBe('card');
    expect(attrs['data-empty']).toBeUndefined();
  });

  it('preserves data-od-id when selected outerHTML omits it', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'card',
      html: '<section class="replacement">Replaced</section>',
    });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'card');
    expect(html).toContain('data-od-id="card"');
    expect(html).toContain('class="replacement"');
  });

  it('synthesizes the semantic id for runtime-only outerHTML replacements', () => {
    const result = applyManualEditPatch(brandKitSource, {
      kind: 'set-outer-html',
      id: 'brand-system-section',
      html: '<section class="replacement">Updated brand system</section>',
    });

    expect(result.ok).toBe(true);
    expect(readManualEditRuntimeOuterHtml(result.source, 'brand-system-section'))
      .toBe('<section class="replacement" data-od-id="brand-system-section">Updated brand system</section>');
  });

  it('replaces full source for snapshot-based undo history', () => {
    const source = '<!doctype html><html><body><h1 data-od-id="hero-title">Snapshot</h1></body></html>';
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });

    expect(result).toEqual({ ok: true, source });
  });

  it('updates CSS tokens in style tags', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-token', token: '--brand', value: '#f00' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('--brand: #f00;');
  });

  it('preserves fragment-shaped HTML when saving patches', () => {
    const source = '<main><h1 data-od-id="hero-title">Original title</h1></main>';
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('<main><h1 data-od-id="hero-title">Edited title</h1></main>');
    expect(result.source).not.toContain('<!doctype');
    expect(result.source).not.toContain('<html');
    expect(result.source).not.toContain('<body');
  });

  it('detects full documents after leading comments and keeps fragments distinct', () => {
    expect(isManualEditFullHtmlDocument('<!-- generated -->\n<!doctype html><html></html>')).toBe(true);
    expect(isManualEditFullHtmlDocument('<?xml version="1.0"?>\n<html></html>')).toBe(true);
    expect(isManualEditFullHtmlDocument('<main><h1>Fragment</h1></main>')).toBe(false);
  });

  it('preserves full documents with leading comments when saving patches', () => {
    const source = [
      '<!-- generated by open design -->',
      '<!doctype html><html><head><style>:root { --brand: #111; }</style></head>',
      '<body><main><h1 data-od-id="hero-title">Original title</h1></main></body></html>',
    ].join('\n');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('<!doctype html>');
    expect(result.source).toContain('<html>');
    expect(result.source).toContain('<head><style>:root { --brand: #111; }</style></head>');
    expect(result.source).toContain('<h1 data-od-id="hero-title">Edited title</h1>');
  });

  it('rejects removing the only rendered body element even when scripts remain', () => {
    const source = [
      '<!doctype html><html><body>',
      '<main data-od-id="app-root">App</main>',
      '<script>window.bootApp && window.bootApp();</script>',
      '</body></html>',
    ].join('');
    const result = applyManualEditPatch(source, { kind: 'remove-element', id: 'app-root' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cannot remove the last rendered element in the document.');
    expect(result.source).toContain('data-od-id="app-root"');
  });

  it('addresses unannotated elements with generated DOM path ids', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'path-0-7', value: 'Path target' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('Path target');
  });

  it('rejects text patches for nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'nested', value: 'Flat text' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });

  it('writes dynamic brand-kit text targets back to the embedded payload', () => {
    const result = applyManualEditPatch(brandKitSource, { kind: 'set-text', id: 'brand-name', value: 'Nexu' });

    expect(result.ok).toBe(true);
    const payload = readBrandPayload(result.source);
    expect(payload.brand.name).toBe('Nexu');
    expect(result.source).not.toContain('Target not found');
  });

  it('writes dynamic brand-kit palette and imagery fields back to the embedded payload', () => {
    const color = applyManualEditPatch(brandKitSource, { kind: 'set-text', id: 'brand-color-hex-0', value: '#FF5500' });
    expect(color.ok).toBe(true);
    const [updatedColor] = readBrandPayload(color.source).brand.colors;
    expect(updatedColor).toMatchObject({ hex: '#FF5500' });

    const image = applyManualEditPatch(color.source, {
      kind: 'set-image',
      id: 'brand-image-img-0',
      src: 'imagery/b.png',
      alt: 'Updated dashboard',
    });
    expect(image.ok).toBe(true);
    const [updatedImage] = readBrandPayload(image.source).brand.imagery.samples;
    expect(updatedImage).toMatchObject({
      file: 'imagery/b.png',
      caption: 'Updated dashboard',
    });
  });

  it('maps dynamic brand-kit logo thumbnails to primary and alternate logo slots', () => {
    const primary = applyManualEditPatch(brandKitSource, {
      kind: 'set-image',
      id: 'brand-logo-thumb-0',
      src: 'logos/primary-new.svg',
      alt: 'Updated primary',
    });
    expect(primary.ok).toBe(true);
    expect(readBrandPayload(primary.source).brand.logo).toMatchObject({
      primary: 'logos/primary-new.svg',
      notes: 'Updated primary',
    });

    const alternate = applyManualEditPatch(primary.source, {
      kind: 'set-image',
      id: 'brand-logo-thumb-1',
      src: 'logos/alternate-new.svg',
      alt: '',
    });
    expect(alternate.ok).toBe(true);
    expect(readBrandPayload(alternate.source).brand.logo.alternates[0]).toBe('logos/alternate-new.svg');
  });

  it('persists dynamic brand-kit static copy through runtime overrides', () => {
    const result = applyManualEditPatch(brandKitSource, {
      kind: 'set-text',
      id: 'brand-system-title',
      value: 'Component library',
    });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('id="od-manual-edit-runtime-overrides"');
    expect(result.source).toContain('id="od-manual-edit-runtime-apply"');
    expect(result.source).toContain('if (el && el.textContent !== value) el.textContent = value');
    expect(readRuntimeOverrides(result.source).text?.['brand-system-title']).toBe('Component library');
  });

  it('reads runtime style overrides back through readManualEditSavedStyles', () => {
    // Runtime-only targets persist set-style in the override <style> rule, not
    // in element markup — the saved-styles read must surface those values so
    // history replay (undo → redo) restores them instead of empty strings.
    const result = applyManualEditPatch(brandKitSource, {
      kind: 'set-style',
      id: 'brand-name',
      styles: { fontSize: '48px', color: '#ff5500' },
    });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('data-od-manual-edit-runtime-overrides');
    const styles = readManualEditSavedStyles(result.source, 'brand-name');
    expect(styles.fontSize).toBe('48px');
    expect(styles.color).toBe('#ff5500');
    // Untouched props stay empty, and a source without the rule reads as unstyled.
    expect(styles.fontWeight).toBe('');
    expect(readManualEditSavedStyles(brandKitSource, 'brand-name').fontSize).toBe('');
    // Source-backed elements keep reading their inline styles.
    expect(readManualEditSavedStyles(baseSource, 'card').color).toBe('red');
    // The predicate distinguishes "runtime style persisted" from "target gone".
    expect(hasManualEditRuntimeStyleOverride(result.source, 'brand-name')).toBe(true);
    expect(hasManualEditRuntimeStyleOverride(result.source, 'brand-tagline')).toBe(false);
    expect(hasManualEditRuntimeStyleOverride(brandKitSource, 'brand-name')).toBe(false);
  });

  it('merges successive runtime style patches instead of replacing the whole rule', () => {
    // Toolbar autosaves send only the touched property; a later partial patch
    // must not discard declarations an earlier save already persisted.
    const first = applyManualEditPatch(brandKitSource, {
      kind: 'set-style',
      id: 'brand-name',
      styles: { fontSize: '48px' },
    });
    const second = applyManualEditPatch(first.source, {
      kind: 'set-style',
      id: 'brand-name',
      styles: { color: '#ff5500' },
    });

    expect(second.ok).toBe(true);
    const merged = readManualEditSavedStyles(second.source, 'brand-name');
    expect(merged.fontSize).toBe('48px');
    expect(merged.color).toBe('#ff5500');

    // An explicitly empty incoming value deletes that declaration only.
    const cleared = applyManualEditPatch(second.source, {
      kind: 'set-style',
      id: 'brand-name',
      styles: { fontSize: '' },
    });
    expect(cleared.ok).toBe(true);
    const remaining = readManualEditSavedStyles(cleared.source, 'brand-name');
    expect(remaining.fontSize).toBe('');
    expect(remaining.color).toBe('#ff5500');

    // Deleting the last declaration removes the target's rule entirely.
    const emptied = applyManualEditPatch(cleared.source, {
      kind: 'set-style',
      id: 'brand-name',
      styles: { color: '' },
    });
    expect(emptied.ok).toBe(true);
    expect(hasManualEditRuntimeStyleOverride(emptied.source, 'brand-name')).toBe(false);
  });

  it('hides dynamic brand-kit targets instead of reporting target not found on delete', () => {
    const result = applyManualEditPatch(brandKitSource, { kind: 'remove-element', id: 'brand-system-section' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('[data-od-id="brand-system-section"]');
    expect(result.source).toContain('display: none !important');
  });

  it('rejects structural edits anchored to runtime-only brand-kit targets', () => {
    const duplicated = applyManualEditPatch(brandKitSource, { kind: 'duplicate-element', id: 'brand-name' });
    const inserted = applyManualEditPatch(brandKitSource, {
      kind: 'insert-html',
      id: 'brand-name',
      html: '<p>Pasted</p>',
    });

    expect(duplicated).toMatchObject({
      ok: false,
      source: brandKitSource,
      error: expect.stringContaining('runtime-rendered'),
    });
    expect(inserted).toMatchObject({
      ok: false,
      source: brandKitSource,
      error: expect.stringContaining('runtime-rendered'),
    });
  });

  it('duplicates an element right after the original and strips identity attrs from the clone', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'duplicate-element', id: 'card' });

    expect(result.ok).toBe(true);
    const dom = new JSDOM(result.source);
    const sections = dom.window.document.querySelectorAll('section');
    expect(sections).toHaveLength(2);
    // Clone directly follows the original as a sibling…
    expect(sections[0]!.nextElementSibling).toBe(sections[1]!);
    // …keeps the content and non-identity attributes…
    expect(sections[1]!.textContent).toBe('Card');
    expect(sections[1]!.getAttribute('data-keep')).toBe('yes');
    expect(sections[1]!.getAttribute('class')).toBe('hero');
    // …but never shares the manual-edit identity, which would make every
    // later patch on either element ambiguous.
    expect(sections[1]!.hasAttribute('data-od-id')).toBe(false);
    expect(dom.window.document.querySelectorAll('[data-od-id="card"]')).toHaveLength(1);
  });

  it('strips identity attrs from clone descendants too', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'duplicate-element', id: 'nested-cta' });

    expect(result.ok).toBe(true);
    const dom = new JSDOM(result.source);
    expect(dom.window.document.querySelectorAll('[data-od-id="nested-cta"]')).toHaveLength(1);
    expect(dom.window.document.querySelectorAll('a[href="/nested"]')).toHaveLength(2);
  });

  it('strips authored html ids from duplicated and pasted roots and descendants', () => {
    const authoredIdSource = '<main><section id="hero" data-od-id="hero"><a id="cta-link">Go</a></section></main>';
    const duplicated = applyManualEditPatch(authoredIdSource, { kind: 'duplicate-element', id: 'hero' });
    expect(duplicated.ok).toBe(true);
    const duplicatedDom = new JSDOM(duplicated.source);
    const duplicatedSections = duplicatedDom.window.document.querySelectorAll('section');
    expect(duplicatedSections).toHaveLength(2);
    expect(duplicatedSections[0]!.id).toBe('hero');
    expect(duplicatedSections[0]!.querySelector('a')!.id).toBe('cta-link');
    expect(duplicatedSections[1]!.hasAttribute('id')).toBe(false);
    expect(duplicatedSections[1]!.querySelector('a')!.hasAttribute('id')).toBe(false);

    const inserted = applyManualEditPatch(authoredIdSource, {
      kind: 'insert-html',
      id: 'hero',
      html: '<section id="pasted"><a id="pasted-link">Pasted</a></section>',
    });
    expect(inserted.ok).toBe(true);
    const insertedDom = new JSDOM(inserted.source);
    const pasted = insertedDom.window.document.querySelectorAll('section')[1]!;
    expect(pasted.hasAttribute('id')).toBe(false);
    expect(pasted.querySelector('a')!.hasAttribute('id')).toBe(false);
  });

  it('inserts pasted HTML after the anchor, sanitized and identity-stripped', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'insert-html',
      id: 'card',
      html: '<section class="hero" data-od-id="card" onclick="steal()">Pasted<script>evil()</script></section>',
    });

    expect(result.ok).toBe(true);
    const dom = new JSDOM(result.source);
    const sections = dom.window.document.querySelectorAll('section');
    expect(sections).toHaveLength(2);
    expect(sections[0]!.nextElementSibling).toBe(sections[1]!);
    expect(sections[1]!.textContent).toBe('Pasted');
    expect(sections[1]!.hasAttribute('onclick')).toBe(false);
    expect(sections[1]!.querySelector('script')).toBeNull();
    // The pasted block must never alias the copied element's identity.
    expect(dom.window.document.querySelectorAll('[data-od-id="card"]')).toHaveLength(1);
  });

  it('appends pasted HTML to the end of the body for the __body__ anchor', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'insert-html',
      id: '__body__',
      html: '<aside>Tail block</aside>',
    });

    expect(result.ok).toBe(true);
    const dom = new JSDOM(result.source);
    expect(dom.window.document.body.lastElementChild?.tagName.toLowerCase()).toBe('aside');
  });

  it('rejects pasted HTML without exactly one root element', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'insert-html',
      id: 'card',
      html: '<b>one</b><b>two</b>',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('exactly one root element');
  });

  it('duplicates inside fragment sources and keeps the fragment shape', () => {
    const result = applyManualEditPatch('<div data-od-id="only">Solo</div>', { kind: 'duplicate-element', id: 'only' });

    expect(result.ok).toBe(true);
    expect(result.source.match(/<div/g)).toHaveLength(2);
    expect(result.source).not.toContain('<html');
  });

  it('persists inline formatting through set-inner-html', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-inner-html',
      id: 'hero-title',
      html: 'Hello <span style="font-weight:700">bold</span> world',
    });

    expect(result.ok).toBe(true);
    expect(readManualEditOuterHtml(result.source, 'hero-title')).toContain('<span style="font-weight:700">bold</span>');
  });

  it('sanitizes executable content out of set-inner-html commits', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-inner-html',
      id: 'hero-title',
      html: 'Safe <script>alert(1)</script><span onclick="alert(2)" data-od-source-path="path-9">text</span><a href="javascript:alert(3)">link</a>',
    });

    expect(result.ok).toBe(true);
    const outer = readManualEditOuterHtml(result.source, 'hero-title');
    expect(outer).not.toContain('<script');
    expect(outer).not.toContain('onclick');
    expect(outer).not.toContain('javascript:');
    expect(outer).not.toContain('data-od-source-path');
    expect(outer).toContain('Safe');
    expect(outer).toContain('<span');
  });

  it('strips DOM and manual-edit identities from set-inner-html commits', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-inner-html',
      id: 'hero-title',
      html: '<span id="duplicate" data-od-id="hero-title" data-od-edit-selected="true">Safe <b id="nested" data-od-runtime-id="runtime-1">text</b></span>',
    });

    expect(result.ok).toBe(true);
    const doc = new DOMParser().parseFromString(result.source, 'text/html');
    const target = doc.querySelector('[data-od-id="hero-title"]');
    expect(target !== null).toBe(true);
    expect(target!.querySelector('[id]') === null).toBe(true);
    expect(target!.querySelector('[data-od-id]') === null).toBe(true);
    expect(target!.querySelector('[data-od-edit-selected]') === null).toBe(true);
    expect(target!.querySelector('[data-od-runtime-id]') === null).toBe(true);
    expect(target!.textContent).toBe('Safe text');
  });

  it('persists sanitized inline formatting for runtime-only brand-kit targets', () => {
    const result = applyManualEditPatch(brandKitSource, {
      kind: 'set-inner-html',
      id: 'brand-name',
      html: 'Acme <span style="font-weight: 700" onclick="alert(1)">Studios</span><script>steal()</script>',
    });

    expect(result.ok).toBe(true);
    const overrides = readRuntimeOverrides(result.source);
    expect(overrides.innerHtml?.['brand-name']).toContain('<span style="font-weight: 700">Studios</span>');
    expect(overrides.innerHtml?.['brand-name']).not.toContain('onclick');
    expect(overrides.innerHtml?.['brand-name']).not.toContain('<script');
  });

  // ---------------------------------------------------------------------------
  // Saved-source readback for the in-place DOM pipeline: after an insert /
  // duplicate / remove the host reconciles the live iframe from the SAVED
  // source, so these helpers must locate the mutated element and describe it
  // with an id the bridge can resolve.
  // ---------------------------------------------------------------------------

  it('reads back the element inserted after an authored-id anchor', () => {
    const result = applyManualEditPatch(baseSource, {
      id: 'hero-title',
      kind: 'insert-html',
      html: '<img src="pasted.png" alt="">',
    });
    expect(result.ok).toBe(true);

    const inserted = readManualEditInsertedSibling(result.source, 'hero-title');
    expect(inserted).not.toBeNull();
    expect(inserted!.html).toContain('pasted.png');
    // The pasted img carries no authored id, so it is addressed positionally:
    // main is body child 0, hero-title is its child 0 → the img is child 1.
    expect(inserted!.id).toBe('path-0-1');
  });

  it('reads back a duplicated element and a body-append insert', () => {
    const duplicated = applyManualEditPatch(baseSource, { id: 'cta', kind: 'duplicate-element' });
    expect(duplicated.ok).toBe(true);
    const clone = readManualEditInsertedSibling(duplicated.source, 'cta');
    expect(clone).not.toBeNull();
    // The clone is stripped of identity, so its id is its position.
    expect(clone!.id).toBe('path-0-2');
    expect(clone!.html).toContain('Start');

    const appended = applyManualEditPatch(baseSource, {
      id: '__body__',
      kind: 'insert-html',
      html: '<footer>New footer</footer>',
    });
    expect(appended.ok).toBe(true);
    const footer = readManualEditInsertedSibling(appended.source, '__body__');
    expect(footer).not.toBeNull();
    expect(footer!.html).toContain('New footer');
    expect(footer!.id).toBe('path-1');
  });

  it('returns null for a missing insert anchor', () => {
    expect(readManualEditInsertedSibling(baseSource, 'missing-anchor')).toBeNull();
  });

  it('describes how to restore a removed element next to its previous sibling', () => {
    const restore = readManualEditRestoreDescriptor(baseSource, 'cta');
    expect(restore).not.toBeNull();
    expect(restore!.op).toBe('insert-after');
    expect(restore!.anchorId).toBe('hero-title');
    expect(restore!.html).toContain('Start');
  });

  it('describes how to restore a first child by prepending into its parent', () => {
    const restore = readManualEditRestoreDescriptor(baseSource, 'hero-title');
    expect(restore).not.toBeNull();
    expect(restore!.op).toBe('prepend-child');
    // main has no authored id → positional parent anchor.
    expect(restore!.anchorId).toBe('path-0');
    expect(restore!.html).toContain('Original title');
  });

  it('describes a first body child restore with the __body__ anchor', () => {
    const source = '<!doctype html><html><body><main data-od-id="only">Only</main><footer data-od-id="footer">F</footer></body></html>';
    const restore = readManualEditRestoreDescriptor(source, 'only');
    expect(restore).not.toBeNull();
    expect(restore!.op).toBe('insert-at-index');
    expect(restore!.anchorId).toBe('__body__');
    expect(restore).toMatchObject({ index: 0 });
  });

  it('preserves the exact body-child slot when non-renderable siblings precede a removed element', () => {
    const source = '<!doctype html><html><body><script>boot()</script><main data-od-id="app">App</main><footer data-od-id="footer">F</footer></body></html>';
    const restore = readManualEditRestoreDescriptor(source, 'app');

    expect(restore).toMatchObject({
      op: 'insert-at-index',
      anchorId: '__body__',
      index: 1,
    });
  });

  it('returns null when the removed element cannot be located', () => {
    expect(readManualEditRestoreDescriptor(baseSource, 'missing-element')).toBeNull();
  });
});

function readBrandPayload(source: string): {
  brand: {
    name?: string;
    colors: Array<{ hex?: string }>;
    logo: { primary?: string; alternates: string[]; notes?: string };
    imagery: { samples: Array<{ file?: string; caption?: string }> };
  };
} {
  const dom = new JSDOM(source);
  return JSON.parse(dom.window.document.getElementById('od-brand-payload')?.textContent || '{}');
}

function readRuntimeOverrides(source: string): {
  text?: Record<string, string>;
  innerHtml?: Record<string, string>;
} {
  const dom = new JSDOM(source);
  return JSON.parse(dom.window.document.getElementById('od-manual-edit-runtime-overrides')?.textContent || '{}');
}
