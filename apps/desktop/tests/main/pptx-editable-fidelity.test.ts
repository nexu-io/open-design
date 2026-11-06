import { afterEach, describe, expect, test, vi } from 'vitest';

import { fetchGoogleFontStylesheets, runDomToPptx } from '../../src/main/deck-capture.js';

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
}

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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fakeElement(): HTMLElement {
  return {
    childNodes: [],
    children: [],
    closest: () => null,
    getAttribute: () => null,
    prepend: () => undefined,
    querySelectorAll: () => [],
    style: new FakeStyle(),
  } as unknown as HTMLElement;
}

function installEditablePptxDom(options: {
  headingWithBreak?: boolean;
  importedCss: string;
  sourceCss: string;
  onExport: (
    injectedStyles: string[],
    heading: HTMLElement | null,
    exportOptions: Record<string, unknown>,
  ) => void;
}): void {
  const slide = fakeElement();
  const heading = options.headingWithBreak ? fakeElement() : null;
  if (heading) heading.querySelector = ((selector: string) => (selector === 'br' ? fakeElement() : null)) as HTMLElement['querySelector'];
  slide.querySelectorAll = ((selector: string) =>
    selector === 'h1, h2, h3' && heading ? [heading] : []) as unknown as HTMLElement['querySelectorAll'];
  const body = fakeElement();
  const documentElement = fakeElement();
  const injectedStyles: string[] = [];

  const fakeDocument = {
    baseURI: 'https://example.test/decks/course/index.html',
    body,
    createElement: (tagName: string) => {
      if (tagName !== 'style') return fakeElement();
      return {
        setAttribute: () => undefined,
        textContent: '',
      };
    },
    createTreeWalker: () => ({ nextNode: () => null }),
    documentElement,
    head: {
      appendChild: (node: { textContent?: string }) => {
        injectedStyles.push(node.textContent ?? '');
        return node;
      },
    },
    querySelectorAll: (selector: string) => {
      if (selector === '.slide') return [slide];
      if (selector === 'style') return [{ textContent: options.sourceCss }];
      return [];
    },
  };

  Object.assign(globalThis, {
    document: fakeDocument as unknown as Document,
    fetch: vi.fn(async () => new Response(options.importedCss)),
    getComputedStyle: () => ({
      backgroundClip: 'border-box',
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      backgroundOrigin: 'padding-box',
      backgroundPosition: '0% 0%',
      backgroundRepeat: 'repeat',
      backgroundSize: 'auto',
      fontFamily: 'Fraunces, serif',
      position: 'relative',
      zIndex: 'auto',
    }),
    Node: class FakeNode {
      static readonly TEXT_NODE = 3;
    },
    NodeFilter: class FakeNodeFilter {
      static readonly SHOW_TEXT = 4;
    },
    window: {
      domToPptx: {
        exportToPptx: async (_target: unknown, exportOptions: Record<string, unknown>) => {
          options.onExport(injectedStyles, heading, exportOptions);
          return new Blob(['pptx']);
        },
      },
    },
  });
}

describe('editable PPTX font fidelity', () => {
  test('keeps semicolons inside a quoted @import URL', async () => {
    const importedUrl =
      'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400&family=Source+Sans+3:wght@400';
    installEditablePptxDom({
      sourceCss: `@import url('${importedUrl}');`,
      importedCss: "@font-face { font-family: 'Fraunces'; src: url('./fraunces.woff2'); }",
      onExport: () => undefined,
    });

    const result = await runDomToPptx('.slide');

    expect(result.error).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledWith(importedUrl);
  });

  test('asks Google Fonts for TTF-compatible CSS in the desktop process', async () => {
    const fetcher = vi.fn(async () => new Response("@font-face { src: url('font.ttf'); }"));

    const stylesheets = await fetchGoogleFontStylesheets(
      ['https://fonts.googleapis.com/css2?family=Fraunces', 'https://example.test/fonts.css'],
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('https://fonts.googleapis.com/css2?family=Fraunces', {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: expect.any(AbortSignal),
    });
    expect(stylesheets).toEqual([
      {
        cssText: "@font-face { src: url('font.ttf'); }",
        url: 'https://fonts.googleapis.com/css2?family=Fraunces',
      },
    ]);
  });

  test('stops waiting when a Google Fonts stylesheet request never resolves', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>(() => {
          requestSignal = init?.signal ?? undefined;
        }),
    );

    const pending = fetchGoogleFontStylesheets(
      ['https://fonts.googleapis.com/css2?family=Fraunces'],
      fetcher,
    );
    const settled = vi.fn();
    void pending.then(settled);

    await vi.runAllTimersAsync();

    expect(settled).toHaveBeenCalledWith([]);
    expect(requestSignal?.aborted).toBe(true);
  });

  test('exposes @font-face rules from imported stylesheets before export', async () => {
    let exportedStyles: string[] = [];
    installEditablePptxDom({
      sourceCss: "@import url('https://fonts.example/fraunces.css');",
      importedCss: `@font-face {
        font-family: 'Fraunces';
        src: url('./fraunces.woff2') format('woff2');
      }`,
      onExport: (injectedStyles) => {
        exportedStyles = injectedStyles;
      },
    });

    const result = await runDomToPptx('.slide');

    expect(result.error).toBeUndefined();
    expect(exportedStyles.join('\n')).toContain("font-family: 'Fraunces'");
    expect(exportedStyles.join('\n')).toContain('https://fonts.example/fraunces.woff2');
  });

  test('preserves imported fonts across layered-background prepare and export phases', async () => {
    const importedUrl = 'https://fonts.example/fraunces.css';
    const importedCss = `@font-face {
      font-family: 'Fraunces';
      src: url('./fraunces.woff2') format('woff2');
    }`;
    let exportedOptions: Record<string, unknown> = {};
    installEditablePptxDom({
      sourceCss: `@import url('${importedUrl}');`,
      importedCss: '',
      onExport: (_injectedStyles, _heading, exportOptions) => {
        exportedOptions = exportOptions;
      },
    });

    const overrides = [{ cssText: importedCss, url: importedUrl }];
    const prepared = await runDomToPptx('.slide', {}, 'prepare', overrides);
    const exported = await runDomToPptx('.slide', {}, 'export-prepared', overrides);

    expect(prepared).toEqual({ prepared: true });
    expect(exported.error).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(exportedOptions.fonts).toEqual([
      {
        name: 'Fraunces',
        urls: ['https://fonts.example/fraunces.woff2'],
      },
    ]);
  });

  test('embeds one regular Latin face per family instead of merging incompatible variants and subsets', async () => {
    let exportedStyles: string[] = [];
    let exportedOptions: Record<string, unknown> = {};
    installEditablePptxDom({
      sourceCss: "@import url('https://fonts.example/deck-fonts.css');",
      importedCss: `
        @font-face { font-family: 'Fraunces'; font-style: italic; font-weight: 400; src: url('./fraunces-italic.woff2'); }
        @font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 400; src: url('./fraunces-symbols.woff2'); unicode-range: U+2000-206F; }
        @font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 400; src: url('./fraunces-latin.woff2'); unicode-range: U+0000-00FF; }
        @font-face { font-family: 'Source Sans 3'; font-style: normal; font-weight: 400; src: url('./source-sans-regular.woff2'); }
        @font-face { font-family: 'Source Sans 3'; font-style: normal; font-weight: 700; src: url('./source-sans-bold.woff2'); }
      `,
      onExport: (injectedStyles, _heading, exportOptions) => {
        exportedStyles = injectedStyles;
        exportedOptions = exportOptions;
      },
    });

    const result = await runDomToPptx('.slide');
    const css = exportedStyles.join('\n');

    expect(result.error).toBeUndefined();
    expect(css).toContain('fraunces-latin.woff2');
    expect(css).not.toContain('fraunces-symbols.woff2');
    expect(css).toContain('source-sans-regular.woff2');
    expect(css).not.toContain('fraunces-italic.woff2');
    expect(css).not.toContain('source-sans-bold.woff2');
    expect(exportedOptions.fonts).toEqual([
      {
        name: 'Fraunces',
        urls: ['https://fonts.example/fraunces-latin.woff2'],
      },
      {
        name: 'Source Sans 3',
        urls: ['https://fonts.example/source-sans-regular.woff2'],
      },
    ]);
  });

  test('keeps authored heading lines from soft-wrapping again in PowerPoint', async () => {
    let exportedHeading: HTMLElement | null = null;
    installEditablePptxDom({
      headingWithBreak: true,
      sourceCss: '',
      importedCss: '',
      onExport: (_injectedStyles, heading) => {
        exportedHeading = heading;
      },
    });

    const result = await runDomToPptx('.slide');

    expect(result.error).toBeUndefined();
    expect(exportedHeading).not.toBeNull();
    expect(exportedHeading!.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(exportedHeading!.style.getPropertyPriority('white-space')).toBe('important');
  });
});
