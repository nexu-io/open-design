import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildManualEditBridge,
  isMeaningfulManualEditElement,
  isManualEditHostNode,
  isSourceMappableManualEditElement,
  manualEditDomPathForElement,
  manualEditStableIdForElement,
} from '../../src/edit-mode/bridge';

describe('manual edit bridge target normalization', () => {
  it('prefers explicit data-od-id over generated ids', () => {
    const dom = new JSDOM('<main><h1 data-od-id="hero">Title</h1></main>');
    const target = dom.window.document.querySelector('h1')!;

    expect(manualEditStableIdForElement(target)).toBe('hero');
    expect(target.getAttribute('data-od-runtime-id')).toBeNull();
  });

  it('generates stable DOM path ids for unannotated elements', () => {
    const dom = new JSDOM('<main><section><p>First</p><p>Second</p></section></main>');
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(target.getAttribute('data-od-runtime-id')).toBe('path-0-0-1');
  });

  it('generates DOM path ids against source-shaped children, ignoring host shim nodes', () => {
    const dom = new JSDOM(
      '<script data-od-sandbox-shim></script><main><section><p>First</p><p>Second</p></section></main><script data-od-edit-bridge></script>',
    );
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(isManualEditHostNode(dom.window.document.querySelector('[data-od-sandbox-shim]')!)).toBe(true);
    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
  });

  it('discovers meaningful elements and ignores tiny or irrelevant elements', () => {
    const dom = new JSDOM('<main><h1 data-od-source-path="path-0-0">Title</h1><script>1</script></main>');
    const title = dom.window.document.querySelector('h1')!;
    const script = dom.window.document.querySelector('script')!;

    expect(isMeaningfulManualEditElement(title, { width: 80, height: 24 })).toBe(true);
    expect(isMeaningfulManualEditElement(title, { width: 3, height: 24 })).toBe(false);
    expect(isMeaningfulManualEditElement(script, { width: 80, height: 24 })).toBe(false);
  });

  it('does not expose path targets unless they carry a source path marker', () => {
    const dom = new JSDOM('<main><h1>Runtime title</h1><p data-od-source-path="path-0-1">Source text</p></main>');
    const runtimeTitle = dom.window.document.querySelector('h1')!;
    const sourceText = dom.window.document.querySelector('p')!;

    expect(isSourceMappableManualEditElement(runtimeTitle)).toBe(false);
    expect(isSourceMappableManualEditElement(sourceText)).toBe(true);
    expect(isMeaningfulManualEditElement(runtimeTitle, { width: 80, height: 24 })).toBe(false);
  });

  it('omits selected outerHTML from bulk target posts but includes it for selected targets', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain('targets.push(targetFrom(nodes[i], false))');
    expect(bridge).toContain("target: targetFrom(el, true)");
    expect(bridge).toContain('if (!isSourceMappable(nodes[i])) continue;');
    expect(bridge).toContain('if (isPrimaryTarget(el)) return el;');
  });

  it('acks live preview style patches by id and version', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain("type: 'od-edit-preview-style-applied'");
    expect(bridge).toContain('version: Number(version) || 0, ok: true');
    expect(bridge).toContain("ok: false, error: 'Target not found'");
  });

  it('moves the runtime selected marker between selected targets', () => {
    const dom = new JSDOM(
      `<main>
        <h1 data-od-id="title">Title</h1>
        <p data-od-id="body">Body</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]')!;
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));
    expect(title.getAttribute('data-od-edit-selected')).toBe('true');
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'body' },
    }));
    expect(title.hasAttribute('data-od-edit-selected')).toBe(false);
    expect(body.getAttribute('data-od-edit-selected')).toBe('true');

    dom.window.close();
  });

  it('clears runtime selected markers for null selection and edit-mode exit', () => {
    const dom = new JSDOM(
      `<main>
        <h1 data-od-id="title">Title</h1>
        <p data-od-id="body" data-od-edit-selected="true">Body</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: null },
    }));
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'body' },
    }));
    expect(body.getAttribute('data-od-edit-selected')).toBe('true');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: false },
    }));
    expect(body.hasAttribute('data-od-edit-selected')).toBe(false);

    dom.window.close();
  });

  it('keeps runtime selection marker out of source-shaped target data', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain("attr.name === 'data-od-edit-selected'");
    expect(bridge).toContain('replace(/\\sdata-od-edit-selected="[^"]*"/g, \'\')');
    expect(bridge).toContain('[data-od-edit-selected]');
  });

  it('marks flex/grid targets as layout containers', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain('isLayoutContainer: isLayoutContainer(el)');
    expect(bridge).toContain("display.indexOf('flex') >= 0 || display.indexOf('grid') >= 0");
  });
});
