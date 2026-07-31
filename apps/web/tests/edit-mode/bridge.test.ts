import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildManualEditBridge,
  buildManualEditBridgeStyle,
  buildManualEditKeyboardGuard,
  isMeaningfulManualEditElement,
  isManualEditHostNode,
  isSourceMappableManualEditElement,
  manualEditDomPathForElement,
  manualEditElementIsTextLike,
  manualEditKindForElement,
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

  it('keeps source-mappable display:none targets available for the layers panel', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <h1 data-od-source-path="path-0-0">Visible title</h1>
        <section data-od-source-path="path-0-1" style="display:none">
          <p data-od-source-path="path-0-1-0">Hidden author notes</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const visible = dom.window.document.querySelector('h1')!;
    const hiddenSection = dom.window.document.querySelector('section')!;
    const hiddenParagraph = dom.window.document.querySelector('p')!;
    visible.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    hiddenSection.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    hiddenParagraph.getBoundingClientRect = hiddenSection.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    expect(targetsMessage?.targets?.map((target) => target.id)).toEqual([
      'path-0-0',
      'path-0-1',
      'path-0-1-0',
    ]);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-1')?.isHidden).toBe(true);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-1-0')?.isHidden).toBe(true);

    dom.window.close();
  });

  it('treats hidden containers as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="display:none">
          <p data-od-source-path="path-0-0-0">Hidden layout copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const paragraph = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    paragraph.getBoundingClientRect = section.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0');
    const hiddenParagraph = targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(true);
    expect(hiddenParagraph?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not treat visibility-hidden block containers as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="visibility:hidden">
          <p data-od-source-path="path-0-0-0">Hidden block copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const paragraph = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    paragraph.getBoundingClientRect = () => ({
      x: 8, y: 8, width: 140, height: 20,
      top: 8, right: 148, bottom: 28, left: 8,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not treat block containers hidden only by an ancestor as layout editable targets', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <div data-od-source-path="path-0-0" style="display:none">
          <section data-od-source-path="path-0-0-0">Nested hidden section</section>
        </div>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const wrapper = dom.window.document.querySelector('div')!;
    const section = dom.window.document.querySelector('section')!;
    wrapper.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    section.getBoundingClientRect = wrapper.getBoundingClientRect;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean; isLayoutContainer?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    const hiddenSection = targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0');
    expect(hiddenSection?.isHidden).toBe(true);
    expect(hiddenSection?.isLayoutContainer).toBe(false);

    dom.window.close();
  });

  it('does not mark visibility:visible descendants as hidden', async () => {
    const posts: Array<{ type?: string; targets?: Array<{ id: string; isHidden?: boolean }> }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-source-path="path-0-0" style="visibility:hidden">
          <p data-od-source-path="path-0-0-0" style="visibility:visible">Visible child copy</p>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const section = dom.window.document.querySelector('section')!;
    const visibleChild = dom.window.document.querySelector('p')!;
    section.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 32,
      top: 0, right: 160, bottom: 32, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    visibleChild.getBoundingClientRect = () => ({
      x: 8, y: 8, width: 140, height: 20,
      top: 8, right: 148, bottom: 28, left: 8,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; targets?: Array<{ id: string; isHidden?: boolean }> });
    }) as typeof dom.window.parent.postMessage;

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: true },
    }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const targetsMessage = posts.find((message) => message.type === 'od-edit-targets');
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-0')?.isHidden).toBe(true);
    expect(targetsMessage?.targets?.find((target) => target.id === 'path-0-0-0')?.isHidden).toBe(false);

    dom.window.close();
  });

  it('does not expose runtime-only path targets unless they carry a source marker', () => {
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
    expect(bridge).toContain('return el;');
    expect(bridge).not.toContain('if (isPrimaryTarget(el)) return el;');
  });

  it('selects and announces ordinary HTML elements after srcdoc source-path annotation', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0"><section data-od-source-path="path-0-0"><h1 data-od-source-path="path-0-0-0">Plain title</h1><p data-od-source-path="path-0-0-1">Plain body</p></section></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('h1') as HTMLElement;
    title.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 160, height: 36,
      top: 0, right: 160, bottom: 36, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(title.getAttribute('data-od-runtime-id')).toBe('path-0-0-0');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-hover',
      target: expect.objectContaining({ id: 'path-0-0-0', label: 'Plain title' }),
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'path-0-0-0', kind: 'text' }),
    }, '*');

    dom.window.close();
  });

  it('ignores runtime-inserted elements that are not present in source', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0"><h1 data-od-source-path="path-0-0">Source title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const runtimePill = dom.window.document.createElement('span');
    runtimePill.className = 'status-pill ready';
    runtimePill.textContent = 'Brand ready';
    dom.window.document.body.appendChild(runtimePill);
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    runtimePill.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
    runtimePill.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(runtimePill.hasAttribute('data-od-runtime-id')).toBe(false);
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-hover',
    }), '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-background' }, '*');

    dom.window.close();
  });

  it('selects runtime-inserted brand kit elements that carry stable data-od-id markers', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0"><div id="root"></div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.createElement('h1');
    title.setAttribute('data-od-id', 'brand-name');
    title.setAttribute('data-od-edit', 'text');
    title.textContent = 'Runtime brand';
    title.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 180, height: 42,
      top: 0, right: 180, bottom: 42, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.document.getElementById('root')?.appendChild(title);
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-hover',
      target: expect.objectContaining({ id: 'brand-name', label: 'Runtime brand' }),
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'brand-name', kind: 'text' }),
    }, '*');

    dom.window.close();
  });

  it('adds stable ids to legacy runtime brand kit elements before selection', () => {
    const dom = new JSDOM(
      `<script id="od-brand-payload" type="application/json">{"brand":{"name":"Runtime brand"}}</script><main data-od-source-path="path-0"><div id="root"></div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.createElement('h1');
    title.className = 'kit-title';
    title.textContent = 'Runtime brand';
    title.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 180, height: 42,
      top: 0, right: 180, bottom: 42, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    dom.window.document.getElementById('root')?.appendChild(title);
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(title.getAttribute('data-od-id')).toBe('brand-name');
    expect(title.getAttribute('data-od-edit')).toBe('text');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-hover',
      target: expect.objectContaining({ id: 'brand-name', label: 'Runtime brand' }),
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'brand-name', kind: 'text' }),
    }, '*');

    dom.window.close();
  });

  it('prefers the deepest source-mapped child over an annotated group on hover', async () => {
    const posts: Array<{ type?: string; target?: { id: string; label?: string } }> = [];
    const dom = new JSDOM(
      `<main>
        <section data-od-id="hero-group">
          <span data-od-source-path="path-0-0-0">Small label</span>
        </section>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const span = dom.window.document.querySelector('span')!;
    dom.window.parent.postMessage = ((message: unknown) => {
      posts.push(message as { type?: string; target?: { id: string; label?: string } });
    }) as typeof dom.window.parent.postMessage;

    span.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));

    const hover = posts.find((message) => message.type === 'od-edit-hover');
    expect(hover?.target?.id).toBe('path-0-0-0');
    expect(hover?.target?.label).toBe('Small label');

    dom.window.close();
  });

  // Chrome-picker parity: graphic leaves (canvas/svg/video) are pickable
  // levels of their own — clicking one must select it, not its card. A canvas
  // missing from the discovery selector was exactly the "child can't be
  // selected" bug on generated art cells.
  it('selects graphic leaf elements (canvas) instead of climbing to the card', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0"><div class="stat" data-od-source-path="path-0-0"><canvas data-od-source-path="path-0-0-0"></canvas><p data-od-source-path="path-0-0-1">Copy</p></div></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const canvas = dom.window.document.querySelector('canvas') as HTMLElement;
    canvas.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 220, height: 160,
      top: 0, right: 220, bottom: 160, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    canvas.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'path-0-0-0', tagName: 'canvas', kind: 'container' }),
    }, '*');

    dom.window.close();
  });

  it('acks live preview style patches by id and version', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain("type: 'od-edit-preview-style-applied'");
    expect(bridge).toContain('version: Number(version) || 0, ok: true');
    expect(bridge).toContain("ok: false, error: 'Target not found'");
  });

  it('restores iframe scroll when a live style preview reflows content', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">A wrapping title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="hero"]') as HTMLElement;
    const scroller = dom.window.document.documentElement;
    Object.defineProperty(dom.window.document, 'scrollingElement', { configurable: true, value: scroller });
    scroller.scrollLeft = 12;
    scroller.scrollTop = 320;

    const setProperty = title.style.setProperty.bind(title.style);
    vi.spyOn(title.style, 'setProperty').mockImplementation((name, value, priority) => {
      setProperty(name, value, priority);
      // Model Chromium scroll anchoring when a style change above the viewport
      // alters layout. The edit bridge must put the viewport back exactly.
      scroller.scrollLeft = 0;
      scroller.scrollTop = 244;
    });

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-preview-style', id: 'hero', styles: { fontSize: '32px' }, version: 9 },
    }));

    expect(scroller.scrollLeft).toBe(12);
    expect(scroller.scrollTop).toBe(320);
    dom.window.close();
  });

  it('reports resolved layout values so gesture math never adds px deltas to % offsets', () => {
    const bridge = buildManualEditBridge(true);

    // Computed position/left/top override the inline-first style read; 'auto'
    // falls back to offset-parent geometry (margin corrected).
    expect(bridge).toContain("styles.position = computed.position || ''");
    expect(bridge).toContain('el.offsetLeft - marginLeft');
    expect(bridge).toContain('el.offsetTop - marginTop');
    expect(bridge).toContain('fixedRect.left - marginLeft');
  });

  it('applies od-edit-apply-dom by swapping one element in place and acks the result', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">Old title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'hero', html: '<h1 data-od-id="hero">Restored</h1>', version: 7 },
    }));

    expect(dom.window.document.querySelector('[data-od-id="hero"]')?.textContent).toBe('Restored');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 7, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('acks od-edit-apply-dom with ok:false when the element cannot be found', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="hero">Old title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'missing', html: '<p>x</p>', version: 8 },
    }));

    expect(dom.window.document.querySelector('[data-od-id="hero"]')?.textContent).toBe('Old title');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 8, ok: false },
      '*',
    );

    dom.window.close();
  });

  it('previews hover as a dashed outline and keeps the selected outline solid', () => {
    const style = buildManualEditBridgeStyle();

    // Hover = dashed preview; click = solid. The hover rule must skip the
    // selected element so its solid frame never flickers dashed underneath
    // the host-side ManualEditSelectionOverlay.
    expect(style).toContain('outline: 1.5px dashed rgba(37, 99, 235, 0.65) !important');
    expect(style).toContain(':hover:not([data-od-edit-selected])');
    expect(style).toMatch(/\[data-od-edit-selected\]\s*\{\s*\n\s*outline: 1px solid/);
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

  it('turns text targets into inline editors and commits changed text on explicit finish', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
      detail: 2,
    }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(title.getAttribute('data-od-editing')).toBe('true');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({
        id: 'title',
        kind: 'text',
      }),
    }, '*');

    title.textContent = 'Edited title';

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-text-finish', commit: true },
    }));

    expect(title.hasAttribute('contenteditable')).toBe(false);
    expect(title.hasAttribute('data-od-editing')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-commit',
      id: 'title',
      value: 'Edited title',
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-session',
      id: 'title',
      active: false,
      committed: true,
      changed: true,
    }, '*');

    dom.window.close();
  });

  it('selects a text target on the first click without entering inline edit', () => {
    // Regression: making a text box contenteditable on the SELECTING click
    // reflows deck text (releases its line-clamp/height cap) so the element
    // visibly grows the instant it is selected. The first click must only
    // select — no contenteditable, no reflow.
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: 8, clientY: 8,
    }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-select',
      target: expect.objectContaining({ id: 'title', kind: 'text' }),
    }, '*');
    expect(title.hasAttribute('contenteditable')).toBe(false);
    expect(title.hasAttribute('data-od-editing')).toBe(false);

    dom.window.close();
  });

  it('enters inline edit on a second click of the already-selected text target', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    // First click selects only.
    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: 8, clientY: 8,
    }));
    expect(title.hasAttribute('contenteditable')).toBe(false);

    // The host echoes the selection back, marking the element selected; a
    // second click on the now-selected element begins editing.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));
    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: 8, clientY: 8,
    }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(title.getAttribute('data-od-editing')).toBe('true');

    dom.window.close();
  });

  // #3646 focus-loss half: once editing, blurring the iframe (e.g. moving the
  // pointer to the host's floating inspector) must NOT end the session or
  // commit. Only an explicit finish (Enter/Escape/od-edit-text-finish) commits.
  it('keeps the inline edit active on blur and commits only on explicit finish', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
      detail: 2,
    }));
    title.textContent = 'Edited title';
    title.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: false }));

    // Blur is no longer a commit trigger — the session stays live.
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(title.getAttribute('data-od-editing')).toBe('true');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-commit',
    }), '*');

    // The host drives the commit explicitly.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-text-finish', commit: true },
    }));

    expect(title.hasAttribute('contenteditable')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-commit',
      id: 'title',
      value: 'Edited title',
    }, '*');

    dom.window.close();
  });

  // #3646 / review fix: clicking empty background while editing must commit and
  // end the session (and tell the host), so host and iframe never desync.
  it('commits an in-flight inline edit when clicking empty background', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
    title.textContent = 'Edited';
    dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-text-commit',
      id: 'title',
      value: 'Edited',
    }, '*');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-session',
      id: 'title',
      active: false,
    }), '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-background' }, '*');
    expect(title.hasAttribute('contenteditable')).toBe(false);

    dom.window.close();
  });

  it('cancels inline text edits with Escape without posting a commit', () => {
    const dom = new JSDOM(
      `<main><p data-od-id="body">Original body</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const body = dom.window.document.querySelector('[data-od-id="body"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
    body.textContent = 'Draft body';
    body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    }));

    expect(body.textContent).toBe('Original body');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-commit',
    }), '*');

    dom.window.close();
  });

  it('removes a window keydown listener registered with the original callback, so the wrapper is not left firing', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();

    dom.window.addEventListener('keydown', listener);
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    dom.window.removeEventListener('keydown', listener);
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    dom.window.close();
  });

  it('removes a document keydown listener registered with the original callback, so the wrapper is not left firing', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();

    dom.window.document.addEventListener('keydown', listener);
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    dom.window.document.removeEventListener('keydown', listener);
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    dom.window.close();
  });

  it('treats duplicate addEventListener with the same callback and capture as a no-op, matching native behavior', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();

    dom.window.addEventListener('keydown', listener, true);
    dom.window.addEventListener('keydown', listener, true); // duplicate — should be no-op
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1); // fires once, not twice

    dom.window.removeEventListener('keydown', listener, true); // single remove clears it
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1); // no longer fires

    dom.window.close();
  });

  it('matches the capture flag when removing a wrapped keydown listener', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const bubbleListener = vi.fn();
    const captureListener = vi.fn();

    dom.window.addEventListener('keydown', bubbleListener, false);
    dom.window.addEventListener('keydown', captureListener, true);

    dom.window.removeEventListener('keydown', bubbleListener, false);
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(bubbleListener).not.toHaveBeenCalled();
    expect(captureListener).toHaveBeenCalledTimes(1);

    dom.window.close();
  });

  it('cleans up wrapped entry after a once:true listener fires, allowing re-registration', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();

    dom.window.addEventListener('keydown', listener, { once: true, capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1); // once fires once

    // After once fires, the browser removed the handler; re-adding the same callback should work
    dom.window.addEventListener('keydown', listener, { once: true, capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b' }));
    expect(listener).toHaveBeenCalledTimes(2); // re-registered and fired again

    dom.window.close();
  });

  it('cleans up wrapped entry when an AbortSignal aborts, allowing re-registration', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();
    const controller = new dom.window.AbortController();

    dom.window.addEventListener('keydown', listener, { signal: controller.signal, capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    controller.abort(); // browser removes the handler; our bookkeeping must also drop the entry

    // Re-adding the same callback/capture should now succeed (not be treated as a duplicate)
    const controller2 = new dom.window.AbortController();
    dom.window.addEventListener('keydown', listener, { signal: controller2.signal, capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b' }));
    expect(listener).toHaveBeenCalledTimes(2);

    dom.window.close();
  });

  it('allows re-adding a once listener after it was suppressed by the edit guard', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();

    // Set editingEl so shouldBlock() returns true for events inside it
    const editable = dom.window.document.createElement('div');
    editable.setAttribute('data-od-editing', 'true');
    dom.window.document.body.appendChild(editable);
    (dom.window as any).__odEditGuard.editingEl = editable;

    // Register a once listener on window (capture phase) — dispatch from inside editable so guard suppresses it
    dom.window.addEventListener('keydown', listener, { once: true, capture: true });
    editable.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(listener).not.toHaveBeenCalled(); // suppressed by guard

    // The once handler was consumed (both by browser and our bookkeeping)
    // Re-adding the same callback should work
    (dom.window as any).__odEditGuard.editingEl = null; // clear guard so next event fires
    dom.window.addEventListener('keydown', listener, { once: true, capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b' }));
    expect(listener).toHaveBeenCalledTimes(1); // re-registered and fired

    dom.window.close();
  });

  it('does not leave a stale entry when addEventListener is called with an already-aborted signal', () => {
    const guardHtml = buildManualEditKeyboardGuard();
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>${guardHtml}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const listener = vi.fn();
    const controller = new dom.window.AbortController();
    controller.abort(); // already aborted before registration

    // Registering with an already-aborted signal should not leave a stale entry
    dom.window.addEventListener('keydown', listener, { signal: controller.signal, capture: true });

    // The listener should not fire (browser ignores registration with aborted signal)
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a' }));
    expect(listener).not.toHaveBeenCalled();

    // Re-registering the same callback/capture should succeed (not be blocked by a stale dedup entry)
    dom.window.addEventListener('keydown', listener, { capture: true });
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'b' }));
    expect(listener).toHaveBeenCalledTimes(1);

    dom.window.close();
  });

  it('blocks clicks on unmapped elements while edit mode is enabled', () => {
    const dom = new JSDOM(
      `<main><button id="cta">Launch</button></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const button = dom.window.document.getElementById('cta') as HTMLButtonElement;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    const result = button.dispatchEvent(event);

    expect(result).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(clicked).not.toHaveBeenCalled();

    dom.window.close();
  });
});

describe('manual edit rich text sessions', () => {
  it('classifies inline-formatted elements as text-like, blocks on block children', () => {
    const dom = new JSDOM(
      '<main><h1 id="rich">Hello <strong>bold <em>nested</em></strong></h1><div id="block">Text <p>para</p></div><p id="empty"></p></main>',
    );
    const doc = dom.window.document;

    expect(manualEditElementIsTextLike(doc.getElementById('rich')!)).toBe(true);
    expect(manualEditKindForElement(doc.getElementById('rich')!)).toBe('text');
    expect(manualEditElementIsTextLike(doc.getElementById('block')!)).toBe(false);
    expect(manualEditKindForElement(doc.getElementById('block')!)).toBe('container');
    expect(manualEditElementIsTextLike(doc.getElementById('empty')!)).toBe(false);
  });

  it('starts an inline edit on elements with inline formatting children', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Hello <strong>bold</strong></h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');

    dom.window.close();
  });

  it('escalates commits to od-edit-html-commit when the session produced inline markup', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    // Simulate what a formatting execCommand does to the live element.
    title.innerHTML = 'Original <span style="font-weight:700">title</span>';

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-text-finish', commit: true },
    }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-html-commit',
      id: 'title',
      value: 'Original <span style="font-weight:700">title</span>',
    }, '*');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-text-commit' }), '*');

    dom.window.close();
  });

  it('reverts to the original inline markup when the session is cancelled', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Keep <em>this</em></h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    title.innerHTML = 'Trashed';

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-text-finish', commit: false },
    }));

    expect(title.innerHTML).toBe('Keep <em>this</em>');

    dom.window.close();
  });

  it('switches the session to rich editing when a format command arrives', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Original title</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-format', command: 'bold' },
    }));

    // JSDOM has no execCommand — the upgrade to rich editing is the
    // observable part of the format path here.
    expect(title.getAttribute('contenteditable')).toBe('true');

    dom.window.close();
  });

  it('consumes Home/End inside a session so the page never scrolls to its edges', () => {
    // Chromium double-books Home/End in a contenteditable: the caret moves AND
    // the document smooth-scrolls to its top/bottom. The session key handler
    // must preventDefault and move the caret itself.
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Hello world</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');

    const endEvent = new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    title.dispatchEvent(endEvent);
    expect(endEvent.defaultPrevented).toBe(true);
    const selection = dom.window.getSelection()!;
    expect(selection.isCollapsed).toBe(true);
    // Caret parked at the element's content end (element-anchored range:
    // offset counts child nodes, so end == childNodes.length).
    expect(selection.anchorNode).toBe(title);
    expect(selection.anchorOffset).toBe(title.childNodes.length);

    const shiftHome = new dom.window.KeyboardEvent('keydown', { key: 'Home', shiftKey: true, bubbles: true, cancelable: true });
    title.dispatchEvent(shiftHome);
    expect(shiftHome.defaultPrevented).toBe(true);
    // Shift+Home extends the selection back to the content start.
    expect(dom.window.getSelection()!.isCollapsed).toBe(false);

    dom.window.close();
  });

  it('keeps a double-click word selection instead of collapsing it to a caret', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Hello world</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    // Double-click starts the session (a single click only selects).
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(title.getAttribute('contenteditable')).toBe('plaintext-only');

    // Simulate the browser's native dblclick word selection…
    const range = dom.window.document.createRange();
    range.selectNodeContents(title);
    const selection = dom.window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    // …then the click event that follows it (detail: 2). The bridge must NOT
    // collapse the selection back to a caret.
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(dom.window.getSelection()!.isCollapsed).toBe(false);

    dom.window.close();
  });

  it('reports selection formatting state so the toolbar can highlight B/I/U/S', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Hello world</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    // Select the whole text run and announce it — the toolbar reads `format`
    // (queryCommandState-backed) rather than the element's inline styles.
    const range = dom.window.document.createRange();
    range.selectNodeContents(title);
    const selection = dom.window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'od-edit-text-selection',
        id: 'title',
        hasRange: true,
        format: expect.objectContaining({
          bold: expect.any(Boolean),
          italic: expect.any(Boolean),
          underline: expect.any(Boolean),
          strike: expect.any(Boolean),
        }),
      }),
      '*',
    );

    dom.window.close();
  });

  it('inserts a pasted element in place via od-edit-apply-dom instead of reloading', () => {
    const dom = new JSDOM(
      `<main data-od-id="wrap"><p data-od-id="anchor">One</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'anchor', op: 'insert-after', html: '<img src="x.png" alt="">', version: 11 },
    }));

    const anchor = dom.window.document.querySelector('[data-od-id="anchor"]')!;
    expect(anchor.nextElementSibling?.tagName.toLowerCase()).toBe('img');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 11, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('re-broadcasts targets when an inserted image becomes measurable after load', () => {
    const dom = new JSDOM(
      `<main data-od-id="wrap"><p data-od-id="anchor">One</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'anchor', op: 'insert-after', html: '<img src="slow.png" alt="">', version: 18 },
    }));
    const image = dom.window.document.querySelector('img')!;
    image.getBoundingClientRect = () => ({
      x: 0, y: 24, width: 160, height: 90,
      top: 24, right: 160, bottom: 114, left: 0,
      toJSON: () => ({}),
    } as DOMRect);
    postMessage.mockClear();

    image.dispatchEvent(new dom.window.Event('load'));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-targets',
      targets: expect.arrayContaining([expect.objectContaining({ id: 'path-0-1', kind: 'image' })]),
    }), '*');

    dom.window.close();
  });

  it('preserves iframe scroll while an in-place image insert changes layout', () => {
    const dom = new JSDOM(
      `<main data-od-id="wrap"><p data-od-id="anchor">One</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const scroller = dom.window.document.documentElement;
    Object.defineProperty(dom.window.document, 'scrollingElement', { configurable: true, value: scroller });
    scroller.scrollLeft = 8;
    scroller.scrollTop = 640;
    const anchor = dom.window.document.querySelector('[data-od-id="anchor"]') as HTMLElement;
    const insertAdjacentElement = anchor.insertAdjacentElement.bind(anchor);
    vi.spyOn(anchor, 'insertAdjacentElement').mockImplementation((position, element) => {
      const inserted = insertAdjacentElement(position, element);
      // Model browser scroll anchoring/autoscroll caused by inserted media.
      scroller.scrollLeft = 0;
      scroller.scrollTop = 724;
      return inserted;
    });

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'anchor', op: 'insert-after', html: '<img src="clipboard.png" alt="">', version: 21 },
    }));

    expect(scroller.scrollLeft).toBe(8);
    expect(scroller.scrollTop).toBe(640);
    dom.window.close();
  });

  it('appends a pasted element to the body via od-edit-apply-dom append-child', () => {
    const dom = new JSDOM(
      `<main data-od-id="wrap"><p data-od-id="anchor">One</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: '__body__', op: 'append-child', html: '<img src="y.png" alt="">', version: 12 },
    }));

    const lastChild = dom.window.document.body.lastElementChild as HTMLElement | null;
    expect(lastChild?.tagName.toLowerCase()).toBe('img');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 12, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('removes an element in place via od-edit-apply-dom remove and restamps siblings', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0">
        <p data-od-source-path="path-0-0">First</p>
        <p data-od-source-path="path-0-1">Second</p>
        <p data-od-source-path="path-0-2">Third</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'path-0-1', op: 'remove', version: 13 },
    }));

    const paragraphs = dom.window.document.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.textContent).toBe('First');
    // Positional identity follows the shift: former path-0-2 is now path-0-1,
    // so the next click patches the RIGHT source element.
    expect(paragraphs[1]!.textContent).toBe('Third');
    expect(paragraphs[1]!.getAttribute('data-od-source-path')).toBe('path-0-1');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 13, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('restamps positional ids after an in-place insert so later patches stay aligned', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0">
        <p data-od-source-path="path-0-0" data-od-id="path-0-0">First</p>
        <p data-od-source-path="path-0-1" data-od-id="path-0-1" data-od-runtime-id="path-0-1">Second</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'path-0-0', op: 'insert-after', html: '<img src="x.png" alt="">', version: 14 },
    }));

    // The inserted element is stamped immediately (selectable without reload)…
    const img = dom.window.document.querySelector('img')!;
    expect(img.getAttribute('data-od-source-path')).toBe('path-0-1');
    // …and the shifted sibling's positional stamps all move to the new
    // position, including the auto-annotated data-od-id and the stale
    // runtime-id (which is dropped for re-derivation).
    const second = dom.window.document.querySelectorAll('p')[1]!;
    expect(second.textContent).toBe('Second');
    expect(second.getAttribute('data-od-source-path')).toBe('path-0-2');
    expect(second.getAttribute('data-od-id')).toBe('path-0-2');
    expect(second.getAttribute('data-od-runtime-id')).toBeNull();

    dom.window.close();
  });

  it('never rewrites authored semantic data-od-id values during restamp', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0">
        <p data-od-source-path="path-0-0" data-od-id="hero-title">First</p>
        <p data-od-source-path="path-0-1" data-od-id="hero-subtitle">Second</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'hero-title', op: 'insert-after', html: '<img src="x.png" alt="">', version: 15 },
    }));

    const second = dom.window.document.querySelectorAll('p')[1]!;
    // Authored ids are position-independent identity — they must survive.
    expect(second.getAttribute('data-od-id')).toBe('hero-subtitle');
    // The positional source-path still tracks the shift underneath.
    expect(second.getAttribute('data-od-source-path')).toBe('path-0-2');

    dom.window.close();
  });

  it('prepends a restored element into its parent via od-edit-apply-dom prepend-child', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0">
        <p data-od-source-path="path-0-0">Only</p>
      </main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'path-0', op: 'prepend-child', html: '<h1>Restored</h1>', version: 16 },
    }));

    const main = dom.window.document.querySelector('main')!;
    expect(main.firstElementChild?.tagName.toLowerCase()).toBe('h1');
    expect(main.firstElementChild?.getAttribute('data-od-source-path')).toBe('path-0-0');
    expect(main.children[1]!.getAttribute('data-od-source-path')).toBe('path-0-1');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 16, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('restores a body child at its exact source index past leading scripts', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body><script>window.booted = true;</script><footer data-od-id="footer">Footer</footer>${buildManualEditBridge(true)}</body></html>`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-apply-dom',
        id: '__body__',
        op: 'insert-at-index',
        fields: { index: 1 },
        html: '<main data-od-id="app">App</main>',
        version: 17,
      },
    }));

    const sourceChildren = Array.from(dom.window.document.body.children)
      .filter((child) => !child.matches('[data-od-edit-bridge]'));
    expect(sourceChildren.map((child) => child.tagName.toLowerCase())).toEqual(['script', 'main', 'footer']);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od-edit-apply-dom-result', version: 17, ok: true },
      '*',
    );

    dom.window.close();
  });

  it('mirrors runtime-target content in place via od-edit-apply-dom apply-content', () => {
    const dom = new JSDOM(
      `<main><h1 data-od-id="brand-name">Acme</h1><img data-od-id="brand-logo-img" src="old.png" alt="Old"></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'brand-name', op: 'apply-content', fields: { text: 'Acme Studios' }, version: 21 },
    }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'brand-logo-img', op: 'apply-content', fields: { src: 'new.png', alt: 'New' }, version: 22 },
    }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-apply-dom',
        id: 'brand-name',
        op: 'apply-content',
        fields: { html: 'Acme <strong>Studios</strong>' },
        version: 24,
      },
    }));

    expect(dom.window.document.querySelector('[data-od-id="brand-name"]')?.textContent).toBe('Acme Studios');
    expect(dom.window.document.querySelector('[data-od-id="brand-name"] strong')?.textContent).toBe('Studios');
    const img = dom.window.document.querySelector('[data-od-id="brand-logo-img"]')!;
    expect(img.getAttribute('src')).toBe('new.png');
    expect(img.getAttribute('alt')).toBe('New');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-apply-dom-result', version: 21, ok: true }, '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-apply-dom-result', version: 22, ok: true }, '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-apply-dom-result', version: 24, ok: true }, '*');

    // Attribute maps skip unsafe names and remove empty values.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'od-edit-apply-dom',
        id: 'brand-logo-img',
        op: 'apply-content',
        fields: { attributes: { title: 'Logo', alt: '', onclick: 'alert(1)', 'data-od-id': 'hijack' } },
        version: 23,
      },
    }));
    expect(img.getAttribute('title')).toBe('Logo');
    expect(img.hasAttribute('alt')).toBe(false);
    expect(img.hasAttribute('onclick')).toBe(false);
    expect(img.getAttribute('data-od-id')).toBe('brand-logo-img');

    dom.window.close();
  });

  it('keeps a replaced element source-mappable by restamping its clean saved markup', () => {
    const dom = new JSDOM(
      `<main data-od-source-path="path-0"><h1 data-od-source-path="path-0-0">Old</h1></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );

    // Saved-source html carries no annotations; without the restamp the
    // replaced element would silently vanish from the targets broadcast.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-apply-dom', id: 'path-0-0', op: 'replace', html: '<h1>Restored title</h1>', version: 17 },
    }));

    const title = dom.window.document.querySelector('h1')!;
    expect(title.textContent).toBe('Restored title');
    expect(title.getAttribute('data-od-source-path')).toBe('path-0-0');

    dom.window.close();
  });
});

describe('manual edit keyboard forwarding', () => {
  function loadDom() {
    const dom = new JSDOM(
      `<main><h1 data-od-id="title">Title</h1><p data-od-id="body">Body</p></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    return dom;
  }

  it('forwards Cmd/Ctrl+Z as undo and Shift+Cmd/Ctrl+Z as redo', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'z', metaKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-history', op: 'undo' }, '*');

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-history', op: 'redo' }, '*');

    dom.window.close();
  });

  it('forwards Delete and Cmd/Ctrl+D for the selected target only', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    // No selection → no delete/duplicate requests.
    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Delete', bubbles: true, cancelable: true,
    }));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-delete-request' }), '*');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Delete', bubbles: true, cancelable: true,
    }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-delete-request', id: 'title' }, '*');

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'd', metaKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-duplicate-request', id: 'title' }, '*');

    dom.window.close();
  });

  it('forwards Cmd/Ctrl+C as an element copy unless real text is selected', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'c', metaKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-copy-request', id: 'title' }, '*');

    // Highlighted text keeps native copy — Cmd+C is never hijacked then.
    postMessage.mockClear();
    dom.window.getSelection()!.selectAllChildren(dom.window.document.querySelector('[data-od-id="body"]')!);
    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'c', metaKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-copy-request' }), '*');

    dom.window.close();
  });

  it('defers Cmd/Ctrl+V to the native paste event, falling back to element paste', async () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    // Nothing selected → keydown paste is inert (no anchor to paste against).
    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'v', metaKey: true, bubbles: true, cancelable: true,
    }));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-paste-request' }), '*');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));

    // The shortcut must NOT cancel the keydown — preventDefault suppresses the
    // native paste event, the only reader of clipboard IMAGE bytes (that was
    // the "image paste stopped working" regression) — and must not post
    // synchronously. The element-paste request fires from the one-shot
    // fallback only when no paste event follows.
    const shortcut = new dom.window.KeyboardEvent('keydown', {
      key: 'v', metaKey: true, bubbles: true, cancelable: true,
    });
    dom.window.document.body.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-paste-request' }), '*');
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-paste-request', id: 'title' }, '*');
    });

    dom.window.close();
  });

  it('lets a clipboard image win over the Cmd/Ctrl+V element-paste fallback', async () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));

    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'v', metaKey: true, bubbles: true, cancelable: true,
    }));
    // The browser delivers the native paste event right after the keydown. An
    // image on the clipboard must insert as an image, and the armed fallback
    // must be disarmed — no trailing element-paste request.
    const image = new dom.window.File(['png-bytes'], 'shot.png', { type: 'image/png' });
    const imagePaste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', { value: { files: [image] } });
    dom.window.document.body.dispatchEvent(imagePaste);

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'od-edit-paste-image', id: 'title', name: 'shot.png', mime: 'image/png',
      }), '*');
    });
    // Outlive the 150ms fallback window before asserting it stayed silent.
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-paste-request' }), '*');

    dom.window.close();
  });

  it('routes paste to element paste or image insert by clipboard payload', async () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-selected-target', id: 'title' },
    }));

    const textPaste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', { value: { files: [] } });
    dom.window.document.body.dispatchEvent(textPaste);
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-paste-request', id: 'title' }, '*');

    // Images post BYTES, not the File handle — clipboard handles can be
    // neutered after the event turn (net::ERR_UPLOAD_FILE_CHANGED on upload).
    const image = new dom.window.File(['png-bytes'], 'shot.png', { type: 'image/png' });
    const imagePaste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', { value: { files: [image] } });
    dom.window.document.body.dispatchEvent(imagePaste);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'od-edit-paste-image', id: 'title', name: 'shot.png', mime: 'image/png',
      }), '*');
    });
    const imageMessage = postMessage.mock.calls
      .map(([message]) => message as { type?: string; buffer?: ArrayBuffer })
      .find((message) => message.type === 'od-edit-paste-image')!;
    expect(new TextDecoder().decode(imageMessage.buffer!)).toBe('png-bytes');

    dom.window.close();
  });

  it('inserts a dropped image at the deepest selectable element under the drop point', async () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');
    const body = dom.window.document.querySelector('[data-od-id="body"]')!;
    const image = new dom.window.File(['jpg-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [image] } });

    body.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'od-edit-paste-image', id: 'body', name: 'photo.jpg', mime: 'image/jpeg',
      }), '*');
    });

    dom.window.close();
  });

  it('keeps Cmd+Z native while the session still holds unsaved typing', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    title.textContent = 'Changed';
    postMessage.mockClear();

    const undoKey = new dom.window.KeyboardEvent('keydown', {
      key: 'z', metaKey: true, bubbles: true, cancelable: true,
    });
    title.dispatchEvent(undoKey);

    // The browser's own contenteditable undo owns the in-session steps; the
    // bridge must neither consume the key nor escalate to global history yet.
    expect(undoKey.defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-history' }), '*');
    expect(title.getAttribute('data-od-editing')).toBe('true');

    dom.window.close();
  });

  it('escalates Cmd+Z to the host global history once the session has no local changes left', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;

    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    postMessage.mockClear();

    const undoKey = new dom.window.KeyboardEvent('keydown', {
      key: 'z', metaKey: true, bubbles: true, cancelable: true,
    });
    title.dispatchEvent(undoKey);

    // Content equals the session original — nothing left to undo locally, so
    // the session closes (no commit: nothing changed) and the shortcut walks
    // the host's global operation chain instead of dead-ending in this element.
    expect(undoKey.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'od-edit-history', op: 'undo' }, '*');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od-edit-text-session', id: 'title', active: false,
    }), '*');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-text-commit' }), '*');
    expect(title.hasAttribute('contenteditable')).toBe(false);

    dom.window.close();
  });

  it('re-broadcasts targets when the host asks for a refresh', () => {
    const dom = loadDom();
    const postMessage = vi.spyOn(dom.window.parent, 'postMessage');

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-refresh-targets' },
    }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'od-edit-targets' }), '*');

    dom.window.close();
  });
});

// Edit mode must render the page inert: its own lightboxes, delegated click
// handlers, hover scripts, and anchor defaults are page "operations" a click
// in edit mode must never trigger — clicking selects/edits, nothing else.
describe('manual edit page inertness', () => {
  it('keeps page handlers and anchor defaults inert for clicks inside a live inline edit', () => {
    const dom = new JSDOM(
      `<main><a href="#" data-od-id="card"><h1 data-od-id="title">Original</h1></a></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const title = dom.window.document.querySelector('[data-od-id="title"]') as HTMLElement;
    title.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8, detail: 2 }));
    expect(title.getAttribute('data-od-editing')).toBe('true');

    // Page-style handlers: a delegated document listener (gallery lightbox /
    // sandbox-shim anchor interception) and a direct anchor listener. A caret
    // click inside the editing element must reach neither — the shim path is
    // exactly what scrolled the canvas to the top mid-edit (href="#").
    const delegated = vi.fn();
    dom.window.document.addEventListener('click', delegated);
    const anchorClick = vi.fn();
    dom.window.document.querySelector('a')!.addEventListener('click', anchorClick);

    const caretClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 8 });
    title.dispatchEvent(caretClick);

    expect(delegated).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(caretClick.defaultPrevented).toBe(true);
    // The session survives — the click only repositions the caret natively.
    expect(title.getAttribute('data-od-editing')).toBe('true');

    dom.window.close();
  });

  it('blocks page pointer and hover handlers while edit mode is enabled, restores them on exit', () => {
    const dom = new JSDOM(
      `<main><button id="cta" data-od-source-path="path-0-0">Launch</button></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const button = dom.window.document.getElementById('cta') as HTMLButtonElement;
    const pressed = vi.fn();
    const hovered = vi.fn();
    button.addEventListener('mousedown', pressed);
    button.addEventListener('mouseover', hovered);

    button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    expect(pressed).not.toHaveBeenCalled();
    expect(hovered).not.toHaveBeenCalled();

    // Leaving edit mode hands the page back its own interactions.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od-edit-mode', enabled: false },
    }));
    button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(pressed).toHaveBeenCalledTimes(1);

    dom.window.close();
  });

  it('blocks form submission while edit mode is enabled', () => {
    const dom = new JSDOM(
      `<main><form id="signup"><button type="submit">Go</button></form></main>${buildManualEditBridge(true)}`,
      { runScripts: 'dangerously', url: 'http://localhost' },
    );
    const form = dom.window.document.getElementById('signup') as HTMLFormElement;
    const submitted = vi.fn();
    form.addEventListener('submit', submitted);

    const submit = new dom.window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);

    expect(submitted).not.toHaveBeenCalled();
    expect(submit.defaultPrevented).toBe(true);

    dom.window.close();
  });
});
