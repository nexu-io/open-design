import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  cssCommaListItem,
  pseudoBorderNeedsMaterialization,
  reduceBackgroundImageLayers,
  runDomToPptx,
  type PseudoBorderSnapshot,
} from '../../src/main/deck-capture.js';

// dom-to-pptx parses background-image with the greedy regex
// `/linear-gradient\((.*)\)/` behind a bare `includes('linear-gradient')` guard,
// so any multi-layer stack (radial + linear washes, scrim-over-photo,
// repeating-gradient textures) used to come back from the editable PPTX export
// as one corrupt gradient. These tests pin the reduction that now runs in the
// render window before the engine reads the style.
describe('reduceBackgroundImageLayers', () => {
  test('single plain linear-gradient is left untouched', () => {
    const input = 'linear-gradient(135deg, rgb(11, 20, 36) 0%, rgb(16, 28, 50) 100%)';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: false,
      value: input,
      fallbackColor: null,
      selectedLayerIndex: 0,
    });
  });

  test('single url() is left untouched', () => {
    const input = 'url("http://127.0.0.1:1234/raw/assets/photo.png")';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: false,
      value: input,
      fallbackColor: null,
      selectedLayerIndex: 0,
    });
  });

  test('none is a no-op', () => {
    expect(reduceBackgroundImageLayers('none')).toEqual({
      changed: false,
      value: 'none',
      fallbackColor: null,
      selectedLayerIndex: null,
    });
  });

  test('radial wash over base linear-gradient keeps the linear base layer', () => {
    // The layer list is top-first, so the linear-gradient is the visual base.
    const linear = 'linear-gradient(160deg, rgb(11, 20, 36) 0%, rgb(20, 33, 56) 100%)';
    const input = `radial-gradient(ellipse at 30% 20%, rgba(212, 175, 55, 0.08), transparent 60%), ${linear}`;
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: linear,
      fallbackColor: null,
      selectedLayerIndex: 1,
    });
  });

  test('scrim gradient over url() photo keeps the photo, not the scrim', () => {
    const url = 'url("https://example.com/hero.jpg")';
    const input = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), ${url}`;
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: url,
      fallbackColor: null,
      selectedLayerIndex: 1,
    });
  });

  test('commas inside color stops never split a layer', () => {
    const input =
      'linear-gradient(90deg, rgba(212, 175, 55, 0.35) 0%, rgba(212, 175, 55, 0) 100%), ' +
      'linear-gradient(0deg, rgb(11, 20, 36), rgb(11, 20, 36))';
    const out = reduceBackgroundImageLayers(input);
    expect(out.changed).toBe(true);
    expect(out.value).toBe('linear-gradient(0deg, rgb(11, 20, 36), rgb(11, 20, 36))');
    expect(out.selectedLayerIndex).toBe(1);
  });

  test('repeating-gradient texture stack drops the image and surfaces a fallback color', () => {
    // repeating-linear-gradient matches the engine's `includes('linear-gradient')`
    // guard and used to render as one wrong full-element gradient.
    const input =
      'repeating-linear-gradient(0deg, rgba(11, 20, 36, 0.04) 0px, rgba(11, 20, 36, 0.04) 1px, transparent 1px, transparent 36px), ' +
      'repeating-linear-gradient(90deg, rgba(11, 20, 36, 0.04) 0px, rgba(11, 20, 36, 0.04) 1px, transparent 1px, transparent 36px)';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: 'rgba(11, 20, 36, 0.04)',
      selectedLayerIndex: null,
    });
  });

  test('lone radial-gradient drops to none with the first stop as fallback color', () => {
    const input = 'radial-gradient(circle at 50% 0%, rgb(26, 42, 71) 0%, rgb(11, 20, 36) 70%)';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: 'rgb(26, 42, 71)',
      selectedLayerIndex: null,
    });
  });

  test('conic-gradient with hex stops falls back to the first hex color', () => {
    const input = 'conic-gradient(from 0deg, #0b1424, #d4af37, #0b1424)';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: '#0b1424',
      selectedLayerIndex: null,
    });
  });

  test('oklch radial-gradient falls back to the first color stop, not null', () => {
    const input = 'radial-gradient(circle, oklch(0.28 0.04 250), oklch(0.18 0.03 250))';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: 'oklch(0.28 0.04 250)',
      selectedLayerIndex: null,
    });
  });

  test('display-p3 color() stops are kept as fallback and direction tokens are skipped', () => {
    const input =
      'conic-gradient(from 90deg, color(display-p3 0.2 0.15 0.4), color(display-p3 0.1 0.08 0.2))';
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: 'color(display-p3 0.2 0.15 0.4)',
      selectedLayerIndex: null,
    });
  });

  test('named color stops are kept as fallback', () => {
    expect(reduceBackgroundImageLayers('repeating-linear-gradient(45deg, red, blue)')).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: 'red',
      selectedLayerIndex: null,
    });
  });

  test('quoted url hashes are not treated as hex fallback colors', () => {
    const input = "image-set(url('https://host/#123.png') 1x, url('https://host/#456.png') 2x)";
    expect(reduceBackgroundImageLayers(input)).toEqual({
      changed: true,
      value: 'none',
      fallbackColor: null,
      selectedLayerIndex: null,
    });
  });
});

// Matching background-* lists are comma-separated like background-image. Picking
// the surviving layer's image without its size/position/repeat stretches photos
// (the vendored URL path treats the whole leftover list as objectFit).
describe('cssCommaListItem', () => {
  test('picks the matching layer from a multi-value background-size list', () => {
    expect(cssCommaListItem('cover, 100% 100%', 1)).toBe('100% 100%');
    expect(cssCommaListItem('cover, 100% 100%', 0)).toBe('cover');
  });

  test('a single authored value applies to every layer index', () => {
    expect(cssCommaListItem('cover', 1)).toBe('cover');
  });

  test('commas inside functions never split a list item', () => {
    expect(cssCommaListItem('image-set(url("a.png") 1x, url("b.png") 2x), contain', 0)).toBe(
      'image-set(url("a.png") 1x, url("b.png") 2x)',
    );
    expect(cssCommaListItem('image-set(url("a.png") 1x, url("b.png") 2x), contain', 1)).toBe(
      'contain',
    );
  });

  test('out-of-range multi-value lists cycle so a leftover comma list never survives', () => {
    // Three image layers with two sizes: CSS list cycling maps index 2 back to `cover`.
    expect(cssCommaListItem('cover, contain', 2)).toBe('cover');
    expect(cssCommaListItem('cover, contain', 3)).toBe('contain');
    expect(cssCommaListItem('', 0)).toBeNull();
  });
});

// dom-to-pptx draws a contentless ::before/::after as ONE rect whose `line`
// outlines all four sides, so partial-border decorations (corner brackets,
// rotated arrow heads) exported as full boxes. These tests pin the detector
// that decides which pseudos get materialized as real per-side-border elements.
describe('pseudoBorderNeedsMaterialization', () => {
  const base: PseudoBorderSnapshot = {
    content: '""',
    display: 'block',
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '0px',
  };

  test('corner bracket (top + left borders only) needs materialization', () => {
    expect(
      pseudoBorderNeedsMaterialization({ ...base, borderTopWidth: '2px', borderLeftWidth: '2px' }),
    ).toBe(true);
  });

  test('arrow head (right + bottom borders, rotated) needs materialization', () => {
    expect(
      pseudoBorderNeedsMaterialization({ ...base, borderRightWidth: '3px', borderBottomWidth: '3px' }),
    ).toBe(true);
  });

  test('uniform four-side border is the case the engine already draws right', () => {
    expect(
      pseudoBorderNeedsMaterialization({
        ...base,
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
      }),
    ).toBe(false);
  });

  test('four sides with unequal widths still need materialization', () => {
    expect(
      pseudoBorderNeedsMaterialization({
        ...base,
        borderTopWidth: '4px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
      }),
    ).toBe(true);
  });

  test('borderless pseudo is left alone', () => {
    expect(pseudoBorderNeedsMaterialization(base)).toBe(false);
  });

  test('text-content pseudo rides the engine text path and is left alone', () => {
    expect(
      pseudoBorderNeedsMaterialization({ ...base, content: '"→"', borderBottomWidth: '2px' }),
    ).toBe(false);
  });

  test('content: none means no pseudo box exists', () => {
    expect(
      pseudoBorderNeedsMaterialization({ ...base, content: 'none', borderTopWidth: '2px' }),
    ).toBe(false);
  });

  test('display: none pseudo is left alone', () => {
    expect(
      pseudoBorderNeedsMaterialization({ ...base, display: 'none', borderTopWidth: '2px' }),
    ).toBe(false);
  });
});

// runDomToPptx is serialized into the render window, so its wiring can only be
// pinned through its source (matching the existing background-stabilization
// tests in scroll-stitch-geometry.test.ts).
describe('runDomToPptx fidelity wiring', () => {
  const source = runDomToPptx.toString();
  const renderSource = readFileSync(new URL('../../src/main/deck-capture.ts', import.meta.url), 'utf8');

  test('normalizes background paint and materializes uneven pseudo borders', () => {
    expect(source).toContain('normalizeBackgroundPaint(slides');
    expect(source).toContain('materializeUnevenPseudoBorders(slides');
    // Both passes must run AFTER the injected slide background layer exists so
    // that layer is normalized too.
    expect(source.indexOf('ensureExplicitSlideBackgrounds(slides')).toBeLessThan(
      source.indexOf('normalizeBackgroundPaint(slides'),
    );
    // Replacements are created first so normalizeBackgroundPaint also reduces
    // layered paint copied onto the new boxes. Match the call sites (lastIndexOf),
    // not the nested function declarations.
    expect(source.lastIndexOf('materializeUnevenPseudoBorders(slides')).toBeLessThan(
      source.lastIndexOf('normalizeBackgroundPaint(slides'),
    );
    // The neutralizing rule must zero the paint, not just suppress the box —
    // the engine reads a suppressed pseudo's computed border as if it existed.
    expect(source).toContain('content:none!important;border:0!important');
  });

  test('rewrites the selected layer geometry together with background-image', () => {
    expect(source).toContain('cssCommaListItem(style.backgroundSize, reduced.selectedLayerIndex)');
    expect(source).toContain('cssCommaListItem(style.backgroundPosition, reduced.selectedLayerIndex)');
    expect(source).toContain('cssCommaListItem(style.backgroundRepeat, reduced.selectedLayerIndex)');
    expect(source).toContain('cssCommaListItem(style.backgroundOrigin, reduced.selectedLayerIndex)');
    expect(source).toContain('cssCommaListItem(style.backgroundClip, reduced.selectedLayerIndex)');
    expect(renderSource).toContain(
      'const cssCommaListItem = ${cssCommaListItem.toString()}',
    );
    expect(renderSource).toContain(
      'const firstCssColorStop = ${firstCssColorStop.toString()}',
    );
    expect(source).toContain('firstCssColorStop(input)');
  });

  test('inserts ::before replacements before existing children and appends ::after', () => {
    expect(source).toContain('element.insertBefore(box, element.firstChild)');
    expect(source).toContain('element.appendChild(box)');
    expect(source).toContain('pseudo === "::before"');
  });

  test('keeps stand-ins outside text hosts so the engine still classifies them as text', () => {
    expect(source).toContain('isPptxTextHost(element)');
    expect(source).toContain('parent.insertBefore(box, element)');
    expect(source).toContain('parent.insertBefore(box, element.nextSibling)');
  });

  test('never probes pseudos on export-generated nodes', () => {
    expect(source).toContain('element.getAttribute("data-od-pptx-bg") === "true"');
    expect(source).toContain('element.getAttribute("data-od-pptx-pseudo-box") === "true"');
  });

  test('suppresses overlay stand-ins whose placement or visual context cannot be reproduced', () => {
    expect(source).toContain('if (ps.position === "fixed") continue');
    expect(source).toContain('composableOverlayOpacity(element, parent)');
  });

  test('copies non-border pseudo paint onto the replacement before neutralizing the original', () => {
    expect(source).toContain('["background-image", ps.backgroundImage]');
    expect(source).toContain('["box-shadow", ps.boxShadow]');
    expect(source).toContain('["filter", ps.filter]');
    expect(source).toContain('["right", ps.right]');
    expect(source).toContain('["bottom", ps.bottom]');
    expect(source).toContain('["visibility", ps.visibility]');
    expect(source).toContain('["background-origin", ps.backgroundOrigin]');
    expect(source).toContain('["background-clip", ps.backgroundClip]');
  });
});

class FakeStyle {
  private readonly values = new Map<string, { value: string; priority: string }>();

  setProperty(name: string, value: string, priority = ''): void {
    this.values.set(name, { value, priority });
  }

  getPropertyValue(name: string): string {
    return this.values.get(name)?.value ?? '';
  }

  getPropertyPriority(name: string): string {
    return this.values.get(name)?.priority ?? '';
  }

  removeProperty(name: string): string {
    const previous = this.values.get(name)?.value ?? '';
    this.values.delete(name);
    return previous;
  }

  toCamelRecord(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, { value }] of this.values) {
      const camel = name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
      out[camel] = value;
    }
    return out;
  }
}

type FakeNode = {
  attrs: Record<string, string>;
  childNodes: FakeNode[];
  children: FakeNode[];
  firstChild: FakeNode | null;
  nextSibling: FakeNode | null;
  parentElement: FakeNode | null;
  style: FakeStyle;
  tagName: string;
  textContent: string;
  appendChild: (child: FakeNode) => FakeNode;
  closest: () => null;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  insertBefore: (child: FakeNode, ref: FakeNode | null) => FakeNode;
  prepend: (child: FakeNode) => FakeNode;
  querySelectorAll: (selector: string) => FakeNode[];
  setAttribute: (name: string, value: string) => void;
};

const previousGlobals = {
  document: globalThis.document,
  fetch: globalThis.fetch,
  getComputedStyle: globalThis.getComputedStyle,
  Node: globalThis.Node,
  NodeFilter: globalThis.NodeFilter,
  window: globalThis.window,
};

afterEach(() => {
  Object.assign(globalThis, previousGlobals);
  vi.restoreAllMocks();
});

function fakeNode(): FakeNode {
  const node: FakeNode = {
    attrs: {},
    childNodes: [],
    children: [],
    firstChild: null,
    nextSibling: null,
    parentElement: null,
    style: new FakeStyle(),
    tagName: 'DIV',
    textContent: '',
    appendChild(child) {
      return node.insertBefore(child, null);
    },
    closest: () => null,
    getAttribute(name) {
      return node.attrs[name] ?? null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    insertBefore(child, ref) {
      if (child.parentElement) {
        const siblings = child.parentElement.children;
        const current = siblings.indexOf(child);
        if (current >= 0) siblings.splice(current, 1);
        child.parentElement.childNodes = [...child.parentElement.children];
        child.parentElement.firstChild = child.parentElement.children[0] ?? null;
      }
      child.parentElement = node;
      const index = ref ? node.children.indexOf(ref) : -1;
      if (index >= 0) node.children.splice(index, 0, child);
      else node.children.push(child);
      node.childNodes = [...node.children];
      node.firstChild = node.children[0] ?? null;
      for (let i = 0; i < node.children.length; i++) {
        node.children[i].nextSibling = node.children[i + 1] ?? null;
      }
      return child;
    },
    prepend(child) {
      return node.insertBefore(child, node.firstChild);
    },
    querySelectorAll(selector) {
      if (selector === '*') {
        const all: FakeNode[] = [];
        const walk = (current: FakeNode) => {
          for (const child of current.children) {
            all.push(child);
            walk(child);
          }
        };
        walk(node);
        return all;
      }
      if (selector === ':scope > [data-od-pptx-bg]') {
        return node.children.filter((child) => child.getAttribute('data-od-pptx-bg') === 'true');
      }
      if (selector === 'h1, h2, h3') return [];
      return [];
    },
    setAttribute(name, value) {
      node.attrs[name] = value;
    },
  };
  return node;
}

function installFidelityDom(options: {
  after?: Record<string, string>;
  before?: Record<string, string>;
  beforeTarget?: 'host' | 'backgroundLayer';
  hostLinkText?: string;
  hostStyle?: Record<string, string>;
  hostText?: string;
  slideBackground: Record<string, string>;
}): { content: FakeNode; host: FakeNode; slide: FakeNode } {
  const slide = fakeNode();
  const host = fakeNode();
  const content = fakeNode();
  let link: FakeNode | null = null;
  slide.appendChild(host);
  if (options.hostText != null) {
    host.tagName = 'P';
    host.textContent = options.hostText;
    if (options.hostLinkText) {
      link = fakeNode();
      link.tagName = 'A';
      link.textContent = options.hostLinkText;
      host.appendChild(link);
    }
  } else {
    host.appendChild(content);
  }

  const computed = new Map<FakeNode, Record<string, string>>();
  computed.set(slide, {
    backgroundClip: 'border-box',
    backgroundColor: 'rgb(11, 20, 36)',
    backgroundImage: 'none',
    backgroundOrigin: 'padding-box',
    backgroundPosition: '0% 0%',
    backgroundRepeat: 'repeat',
    backgroundSize: 'auto',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    lineHeight: '24px',
    overflow: 'hidden',
    position: 'relative',
    textAlign: 'left',
    zIndex: 'auto',
    ...options.slideBackground,
  });
  computed.set(host, {
    backgroundClip: 'border-box',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    backgroundOrigin: 'padding-box',
    backgroundPosition: '0% 0%',
    backgroundRepeat: 'repeat',
    backgroundSize: 'auto',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    lineHeight: '24px',
    overflow: 'visible',
    position: 'relative',
    textAlign: 'left',
    zIndex: 'auto',
    ...options.hostStyle,
  });
  computed.set(content, { ...computed.get(host)! });
  if (link) {
    computed.set(link, {
      backgroundClip: 'border-box',
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      display: 'inline',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      lineHeight: '24px',
      overflow: 'visible',
      position: 'static',
      textAlign: 'left',
      zIndex: 'auto',
    });
  }

  const beforeTargets = (el: FakeNode): boolean =>
    options.beforeTarget === 'backgroundLayer'
      ? el.getAttribute('data-od-pptx-bg') === 'true'
      : el === host;

  const body = fakeNode();
  const documentElement = fakeNode();
  const fakeDocument = {
    baseURI: 'https://example.test/decks/signal/index.html',
    body,
    createElement: () => fakeNode(),
    createTreeWalker: () => ({ nextNode: () => null }),
    documentElement,
    fonts: undefined,
    head: {
      appendChild: (node: FakeNode) => node,
    },
    querySelectorAll: (selector: string) => {
      if (selector === '.slide') return [slide];
      if (selector === 'style') return [];
      if (selector === '*') return [slide, host, content];
      return [];
    },
  };

  Object.assign(globalThis, {
    document: fakeDocument as unknown as Document,
    fetch: vi.fn(async () => new Response('')),
    getComputedStyle: ((el: FakeNode, pseudo?: string) => {
      if (pseudo === '::before') {
        return {
          backgroundClip: 'padding-box',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          backgroundOrigin: 'padding-box',
          backgroundPosition: '0% 0%',
          backgroundRepeat: 'repeat',
          backgroundSize: 'auto',
          borderBottomColor: 'rgb(212, 175, 55)',
          borderBottomStyle: 'solid',
          borderBottomWidth: '0px',
          borderLeftColor: 'rgb(212, 175, 55)',
          borderLeftStyle: 'solid',
          borderLeftWidth: '0px',
          borderRadius: '0px',
          borderRightColor: 'rgb(212, 175, 55)',
          borderRightStyle: 'solid',
          borderRightWidth: '0px',
          borderTopColor: 'rgb(212, 175, 55)',
          borderTopStyle: 'solid',
          borderTopWidth: '0px',
          boxShadow: 'none',
          boxSizing: 'border-box',
          content: 'none',
          display: 'block',
          filter: 'none',
          height: '24px',
          left: '0px',
          margin: '0px',
          opacity: '1',
          pointerEvents: 'none',
          position: 'absolute',
          right: 'auto',
          bottom: 'auto',
          top: '0px',
          transform: 'none',
          transformOrigin: 'center',
          visibility: 'visible',
          width: '24px',
          zIndex: 'auto',
          ...(beforeTargets(el) ? options.before : undefined),
        };
      }
      if (pseudo === '::after') {
        return {
          backgroundClip: 'padding-box',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          backgroundOrigin: 'padding-box',
          backgroundPosition: '0% 0%',
          backgroundRepeat: 'repeat',
          backgroundSize: 'auto',
          borderBottomColor: 'rgb(212, 175, 55)',
          borderBottomStyle: 'solid',
          borderBottomWidth: '0px',
          borderLeftColor: 'rgb(212, 175, 55)',
          borderLeftStyle: 'solid',
          borderLeftWidth: '0px',
          borderRadius: '0px',
          borderRightColor: 'rgb(212, 175, 55)',
          borderRightStyle: 'solid',
          borderRightWidth: '0px',
          borderTopColor: 'rgb(212, 175, 55)',
          borderTopStyle: 'solid',
          borderTopWidth: '0px',
          boxShadow: 'none',
          boxSizing: 'border-box',
          content: 'none',
          display: 'block',
          filter: 'none',
          height: '16px',
          left: 'auto',
          margin: '0px',
          opacity: '1',
          pointerEvents: 'none',
          position: 'absolute',
          right: 'auto',
          bottom: 'auto',
          top: 'auto',
          transform: 'none',
          transformOrigin: 'center',
          visibility: 'visible',
          width: '16px',
          zIndex: 'auto',
          ...(el === host ? options.after : undefined),
        };
      }
      const base =
        computed.get(el) ?? {
          backgroundClip: 'border-box',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          backgroundOrigin: 'padding-box',
          backgroundPosition: '0% 0%',
          backgroundRepeat: 'repeat',
          backgroundSize: 'auto',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          lineHeight: '24px',
          overflow: 'visible',
          position: 'relative',
          textAlign: 'left',
          zIndex: 'auto',
        };
      return { ...base, ...el.style.toCamelRecord() };
    }) as unknown as typeof getComputedStyle,
    Node: class FakeDomNode {
      static readonly TEXT_NODE = 3;
    },
    NodeFilter: class FakeNodeFilter {
      static readonly SHOW_TEXT = 4;
    },
    window: {
      domToPptx: {
        exportToPptx: async () => new Blob(['pptx']),
      },
    },
  });

  return { content, host, slide };
}

describe('runDomToPptx fidelity integration', () => {
  test('keeps the selected photo layer size instead of the leftover comma list', async () => {
    const { slide } = installFidelityDom({
      slideBackground: {
        backgroundImage:
          'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("https://example.com/hero.jpg")',
        backgroundPosition: '0% 0%, 80% 20%',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundSize: 'cover, 100% 100%',
      },
    });

    const result = await runDomToPptx('.slide');

    expect(result.error).toBeUndefined();
    expect(slide.style.getPropertyValue('background-image')).toBe('url("https://example.com/hero.jpg")');
    expect(slide.style.getPropertyValue('background-size')).toBe('100% 100%');
    expect(slide.style.getPropertyValue('background-position')).toBe('80% 20%');
  });

  test('inserts a ::before bracket ahead of content and an ::after arrow after it', async () => {
    const { content, host } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        boxShadow: '0 0 12px rgb(212, 175, 55)',
        backgroundImage: 'linear-gradient(rgb(212, 175, 55), rgb(184, 148, 31))',
        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
      },
      after: {
        content: '""',
        borderRightWidth: '3px',
        borderBottomWidth: '3px',
        left: 'auto',
        top: 'auto',
      },
    });

    const result = await runDomToPptx('.slide');
    const replacementBefore = host.children.find(
      (child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true' && child !== content,
    );
    const boxes = host.children.filter((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(boxes).toHaveLength(2);
    expect(host.children[0]).toBe(boxes[0]);
    expect(host.children[host.children.length - 1]).toBe(boxes[1]);
    expect(host.children.includes(content)).toBe(true);
    expect(replacementBefore?.style.getPropertyValue('box-shadow')).toBe('0 0 12px rgb(212, 175, 55)');
    expect(replacementBefore?.style.getPropertyValue('background-image')).toBe(
      'linear-gradient(rgb(212, 175, 55), rgb(184, 148, 31))',
    );
    expect(replacementBefore?.style.getPropertyValue('filter')).toBe(
      'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
    );
  });

  test('keeps a bottom-right arrow on right/bottom instead of dropping auto left/top', async () => {
    const { host } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      after: {
        content: '""',
        borderRightWidth: '3px',
        borderBottomWidth: '3px',
        left: 'auto',
        top: 'auto',
        right: '0px',
        bottom: '0px',
      },
    });

    const result = await runDomToPptx('.slide');
    const arrow = host.children.find((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(arrow?.style.getPropertyValue('right')).toBe('0px');
    expect(arrow?.style.getPropertyValue('bottom')).toBe('0px');
    expect(arrow?.style.getPropertyValue('left')).toBe('');
    expect(arrow?.style.getPropertyValue('top')).toBe('');
  });

  test('does not materialize a visibility:hidden pseudo into a visible box', async () => {
    const { host } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        visibility: 'hidden',
      },
    });

    const result = await runDomToPptx('.slide');
    const boxes = host.children.filter((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(boxes).toHaveLength(0);
  });

  test('reduces layered paint copied onto a materialized pseudo', async () => {
    const { host } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        backgroundImage:
          'linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url("https://example.com/bracket.png")',
        backgroundSize: 'cover, 100% 100%',
      },
    });

    const result = await runDomToPptx('.slide');
    const box = host.children.find((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(box?.style.getPropertyValue('background-image')).toBe('url("https://example.com/bracket.png")');
    expect(box?.style.getPropertyValue('background-size')).toBe('100% 100%');
  });

  test('cycles a short background-size list when the surviving layer is past the last authored size', async () => {
    const { slide } = installFidelityDom({
      slideBackground: {
        backgroundImage:
          'radial-gradient(circle, rgb(0, 0, 0), transparent), ' +
          'linear-gradient(rgb(11, 20, 36), rgb(11, 20, 36)), ' +
          'url("https://example.com/hero.jpg")',
        backgroundSize: 'cover, contain',
      },
    });

    const result = await runDomToPptx('.slide');

    expect(result.error).toBeUndefined();
    expect(slide.style.getPropertyValue('background-image')).toBe('url("https://example.com/hero.jpg")');
    expect(slide.style.getPropertyValue('background-size')).toBe('cover');
  });

  test('copies non-default background-origin and background-clip onto the replacement', async () => {
    const { host } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        backgroundImage: 'url("https://example.com/bracket.png")',
        backgroundOrigin: 'border-box',
        backgroundClip: 'border-box',
      },
    });

    const result = await runDomToPptx('.slide');
    const box = host.children.find((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(box?.style.getPropertyValue('background-origin')).toBe('border-box');
    expect(box?.style.getPropertyValue('background-clip')).toBe('border-box');
  });

  test('keeps direct text, a link, and spacing on the host when both pseudos materialize', async () => {
    const { host, slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      hostText: 'See the  docs',
      hostLinkText: 'docs',
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
      },
      after: {
        content: '""',
        borderRightWidth: '3px',
        borderBottomWidth: '3px',
        left: 'auto',
        top: 'auto',
      },
    });
    const originalChildren = [...host.children];

    const result = await runDomToPptx('.slide');
    const boxes = slide.children.filter((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');
    const link = host.children.find((child) => child.tagName === 'A');

    expect(result.error).toBeUndefined();
    expect(host.textContent).toBe('See the  docs');
    expect(link?.textContent).toBe('docs');
    expect(host.children).toEqual(originalChildren);
    expect(host.children.some((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true')).toBe(
      false,
    );
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.parentElement === slide)).toBe(true);
    expect(slide.children.indexOf(boxes[0])).toBeLessThan(slide.children.indexOf(host));
    expect(slide.children.indexOf(boxes[1])).toBeGreaterThan(slide.children.indexOf(host));
  });

  test('a generic pseudo rule matching the injected background layer creates no extra shapes', async () => {
    const { slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      beforeTarget: 'backgroundLayer',
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
      },
    });

    const result = await runDomToPptx('.slide');
    const everyNode = [slide, ...slide.querySelectorAll('*')];
    const boxes = everyNode.filter((node) => node.getAttribute('data-od-pptx-pseudo-box') === 'true');
    const bgLayer = everyNode.find((node) => node.getAttribute('data-od-pptx-bg') === 'true');

    expect(result.error).toBeUndefined();
    expect(bgLayer).toBeDefined();
    expect(bgLayer?.getAttribute('data-od-pptx-pseudo-before')).toBeNull();
    expect(boxes).toHaveLength(0);
  });

  test('suppresses a fixed pseudo on a text host instead of rebasing viewport offsets', async () => {
    const { host, slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      hostText: 'Anchor',
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        position: 'fixed',
      },
    });

    const result = await runDomToPptx('.slide');
    const everyNode = [slide, ...slide.querySelectorAll('*')];
    const boxes = everyNode.filter((node) => node.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(boxes).toHaveLength(0);
    // The original pseudo is still neutralized so the engine cannot draw it as a full box.
    expect(host.getAttribute('data-od-pptx-pseudo-before')).not.toBeNull();
  });

  test('suppresses an overlay stand-in when the text host is transformed', async () => {
    const { slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      hostText: 'Rotated label',
      hostStyle: { transform: 'rotate(6deg)' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
      },
    });

    const result = await runDomToPptx('.slide');
    const everyNode = [slide, ...slide.querySelectorAll('*')];
    const boxes = everyNode.filter((node) => node.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(boxes).toHaveLength(0);
  });

  test('suppresses an overlay stand-in when the text host clips overflow', async () => {
    const { slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      hostText: 'Clipped label',
      hostStyle: { overflow: 'hidden' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
      },
    });

    const result = await runDomToPptx('.slide');
    const everyNode = [slide, ...slide.querySelectorAll('*')];
    const boxes = everyNode.filter((node) => node.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(boxes).toHaveLength(0);
  });

  test('folds a translucent text host opacity into the overlay stand-in', async () => {
    const { host, slide } = installFidelityDom({
      slideBackground: { backgroundColor: 'rgb(11, 20, 36)' },
      hostText: 'Faded label',
      hostStyle: { opacity: '0.5' },
      before: {
        content: '""',
        borderTopWidth: '2px',
        borderLeftWidth: '2px',
        opacity: '0.8',
      },
    });

    const result = await runDomToPptx('.slide');
    const box = slide.children.find((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true');

    expect(result.error).toBeUndefined();
    expect(box).toBeDefined();
    expect(box?.parentElement).toBe(slide);
    expect(host.children.some((child) => child.getAttribute('data-od-pptx-pseudo-box') === 'true')).toBe(
      false,
    );
    expect(box?.style.getPropertyValue('opacity')).toBe('0.4');
  });
});
