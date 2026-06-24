import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyManualEditPatch,
  isManualEditFullHtmlDocument,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditOuterHtml,
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

  it('hides dynamic brand-kit targets instead of reporting target not found on delete', () => {
    const result = applyManualEditPatch(brandKitSource, { kind: 'remove-element', id: 'brand-system-section' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('[data-od-id="brand-system-section"]');
    expect(result.source).toContain('display: none !important');
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
} {
  const dom = new JSDOM(source);
  return JSON.parse(dom.window.document.getElementById('od-manual-edit-runtime-overrides')?.textContent || '{}');
}
