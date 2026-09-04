import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  bgraBitmapHasPaint,
  cjkPromotedFontFamily,
  captureEditablePptxLayeredBackgrounds,
  captureUntilPainted,
  collectLayeredPptxBackgroundTargets,
  isolateLayeredPptxBackground,
  pngInspectionHasPaint,
  restoreLayeredPptxBackgroundIsolation,
  runDomToPptx,
} from '../../src/main/deck-capture.js';

const execFileP = promisify(execFile);
const desktopRoot = fileURLToPath(new URL('../..', import.meta.url));

function bgraWithUniformAlpha(alpha: number): Buffer {
  const bitmap = Buffer.alloc(16);
  for (let pixel = 0; pixel < 4; pixel += 1) {
    bitmap[pixel * 4] = 18;
    bitmap[pixel * 4 + 1] = 54;
    bitmap[pixel * 4 + 2] = 99;
    bitmap[pixel * 4 + 3] = alpha;
  }
  return bitmap;
}

const ELECTRON_CAPTURE_UNTIL_PAINTED_SOURCE = `
function pngInspectionHasPaint(png) {
  return png.maxAlpha > 0;
}
async function captureUntilPainted(capture, isPainted, options) {
  const attempts = options.attempts == null ? 3 : options.attempts;
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await capture();
    if (isPainted(last)) return last;
    if (attempt < attempts - 1 && options.onRetry) await options.onRetry();
  }
  throw new Error('transparent chromium capture: ' + options.label);
}
function bgraBitmapHasPaint(bitmap) {
  if (bitmap.length < 4) return false;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    if (bitmap[offset] > 0) return true;
  }
  return false;
}
function pngBufferHasPaint(data) {
  return bgraBitmapHasPaint(nativeImage.createFromBuffer(data).toBitmap());
}
`;

class FakeStyle {
  private readonly values = new Map<string, { priority: string; value: string }>();

  getPropertyPriority(name: string): string {
    return this.values.get(name)?.priority ?? '';
  }

  getPropertyValue(name: string): string {
    return this.values.get(name)?.value ?? '';
  }

  setProperty(name: string, value: string, priority = ''): void {
    this.values.set(name, { priority, value });
  }
}

function fakeElement(tagName = 'DIV'): HTMLElement {
  const attributes = new Map<string, string>();
  const children: HTMLElement[] = [];
  const element = {
    children,
    childNodes: children,
    className: '',
    closest: () => null,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    innerText: '',
    offsetHeight: 80,
    offsetLeft: 24,
    offsetTop: 32,
    offsetWidth: 160,
    parentElement: null,
    append: (child: HTMLElement) => {
      (child as unknown as { parentElement: HTMLElement | null }).parentElement = element as unknown as HTMLElement;
      children.push(child);
    },
    insertBefore: (child: HTMLElement, before: HTMLElement) => {
      (child as unknown as { parentElement: HTMLElement | null }).parentElement = element as unknown as HTMLElement;
      const index = children.indexOf(before);
      if (index < 0) children.push(child);
      else children.splice(index, 0, child);
    },
    prepend: (child: HTMLElement) => {
      (child as unknown as { parentElement: HTMLElement | null }).parentElement = element as unknown as HTMLElement;
      children.unshift(child);
    },
    querySelectorAll: (selector: string) => {
      if (selector === ':scope > [data-od-pptx-bg]') {
        return children.filter((child) => child.getAttribute('data-od-pptx-bg') === 'true');
      }
      if (selector !== '*') return [];
      const result: HTMLElement[] = [];
      const visit = (parent: HTMLElement) => {
        Array.from(parent.children).forEach((child) => {
          result.push(child as HTMLElement);
          visit(child as HTMLElement);
        });
      };
      visit(element as unknown as HTMLElement);
      return result;
    },
    remove: () => {
      const parent = element.parentElement as HTMLElement | null;
      if (!parent) return;
      const siblings = parent.children as unknown as HTMLElement[];
      const index = siblings.indexOf(element as unknown as HTMLElement);
      if (index >= 0) siblings.splice(index, 1);
      element.parentElement = null;
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: new FakeStyle(),
    tagName,
    textContent: '',
  };
  return element as unknown as HTMLElement;
}

type ComputedStyle = Record<string, string>;

function computedStyle(element: HTMLElement, overrides: Partial<ComputedStyle> = {}): ComputedStyle {
  const inline = element.style as unknown as FakeStyle;
  const value = (name: string, fallback: string) => inline.getPropertyValue(name) || fallback;
  return {
    backgroundClip: value('background-clip', 'border-box'),
    backgroundColor: value('background-color', 'transparent'),
    backgroundImage: value('background-image', 'none'),
    backgroundOrigin: value('background-origin', 'padding-box'),
    backgroundPosition: value('background-position', '0% 0%'),
    backgroundRepeat: value('background-repeat', 'repeat'),
    backgroundSize: value('background-size', 'auto'),
    borderBottomWidth: '0px',
    borderLeftWidth: '0px',
    borderRadius: '0px',
    borderRightWidth: '0px',
    borderTopWidth: '0px',
    content: 'none',
    display: 'block',
    maskImage: 'none',
    webkitMaskImage: 'none',
    fontFamily: 'sans-serif',
    overflow: 'visible',
    paddingBottom: '0px',
    paddingLeft: '0px',
    paddingRight: '0px',
    paddingTop: '0px',
    position: value('position', 'static'),
    zIndex: value('z-index', 'auto'),
    ...overrides,
  };
}

function descendants(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>('*'));
}

function stubExportDom(slide: HTMLElement, styles: Map<HTMLElement, Partial<ComputedStyle>>) {
  const body = fakeElement('BODY');
  const documentElement = fakeElement('HTML');
  const created: HTMLElement[] = [];
  const fakeDocument = {
    body,
    createElement: (tagName: string) => {
      const element = fakeElement(tagName.toUpperCase());
      created.push(element);
      return element;
    },
    createTreeWalker: () => ({ nextNode: () => null }),
    documentElement,
    querySelectorAll: (selector: string) =>
      selector === '.slide' ? [slide] : selector === '*' ? [slide, ...descendants(slide)] : [],
  };

  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('getComputedStyle', (element: HTMLElement, pseudo?: string) =>
    pseudo ? computedStyle(element, { backgroundImage: 'none', content: 'none' }) : computedStyle(element, styles.get(element)),
  );
  vi.stubGlobal('Node', class FakeNode { static readonly TEXT_NODE = 3; });
  vi.stubGlobal('NodeFilter', class FakeNodeFilter { static readonly SHOW_TEXT = 4; });

  return created;
}

async function runExport(
  onExport?: () => void,
  layeredBackgrounds?: Parameters<typeof runDomToPptx>[1],
): Promise<void> {
  vi.stubGlobal('window', {
    domToPptx: {
      exportToPptx: async () => {
        onExport?.();
        return new Blob(['pptx']);
      },
    },
  });

  const result = await runDomToPptx('.slide', layeredBackgrounds);
  expect(result.error).toBeUndefined();
}

describe('chromium empty-capture retry', () => {
  test('treats fully transparent inspections as unpainted', () => {
    expect(pngInspectionHasPaint({ maxAlpha: 0 })).toBe(false);
    expect(pngInspectionHasPaint({ maxAlpha: 8 })).toBe(true);
    expect(pngInspectionHasPaint({ maxAlpha: 255 })).toBe(true);
  });

  test('treats BGRA bitmaps with any visible alpha as painted', () => {
    expect(bgraBitmapHasPaint(bgraWithUniformAlpha(0))).toBe(false);
    expect(bgraBitmapHasPaint(bgraWithUniformAlpha(1))).toBe(true);
    expect(bgraBitmapHasPaint(bgraWithUniformAlpha(15))).toBe(true);
    expect(bgraBitmapHasPaint(bgraWithUniformAlpha(255))).toBe(true);
  });

  test('treats real PNG buffers with any visible alpha as painted', async () => {
    const probeDir = await mkdtemp(join(tmpdir(), 'od-pptx-png-paint-'));
    await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
    await writeFile(
      join(probeDir, 'main.cjs'),
      `
const { app, nativeImage } = require('electron');
${ELECTRON_CAPTURE_UNTIL_PAINTED_SOURCE}
function pngWithUniformAlpha(alpha) {
  const bitmap = Buffer.alloc(16);
  for (let pixel = 0; pixel < 4; pixel += 1) {
    bitmap[pixel * 4] = 18;
    bitmap[pixel * 4 + 1] = 54;
    bitmap[pixel * 4 + 2] = 99;
    bitmap[pixel * 4 + 3] = alpha;
  }
  return nativeImage.createFromBitmap(bitmap, { height: 2, width: 2 }).toPNG();
}
app.whenReady().then(() => {
  process.stdout.write('OD_PNG_PAINT:' + JSON.stringify({
    0: pngBufferHasPaint(pngWithUniformAlpha(0)),
    1: pngBufferHasPaint(pngWithUniformAlpha(1)),
    15: pngBufferHasPaint(pngWithUniformAlpha(15)),
    255: pngBufferHasPaint(pngWithUniformAlpha(255)),
  }) + '\\n');
  app.quit();
});
`,
    );
    try {
      const electronRelativePath = (await readFile(
        join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
        'utf8',
      )).trim();
      const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
      const args = process.platform === 'linux' ? ['-a', electronPath, probeDir] : [probeDir];
      const { stdout, stderr } = await execFileP(command, args, { env, timeout: 10_000 });
      const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('OD_PNG_PAINT:'));
      if (!marker) throw new Error(`Electron paint probe returned no result: ${stdout || stderr}`);
      expect(JSON.parse(marker.slice('OD_PNG_PAINT:'.length))).toEqual({
        0: false,
        1: true,
        15: true,
        255: true,
      });
    } finally {
      await rm(probeDir, { force: true, recursive: true });
    }
  }, 15_000);

  test('retries a transparent capture then returns paint', async () => {
    const retries: number[] = [];
    let attempts = 0;
    const result = await captureUntilPainted(
      async () => {
        attempts += 1;
        return attempts === 1 ? { maxAlpha: 0, opaquePixels: 0, translucentPixels: 0 } : { maxAlpha: 255, opaquePixels: 8, translucentPixels: 0 };
      },
      pngInspectionHasPaint,
      { label: 'retry-fixture', onRetry: async () => { retries.push(attempts); } },
    );
    expect(attempts).toBe(2);
    expect(retries).toEqual([1]);
    expect(result.opaquePixels).toBe(8);
  });

  test('throws a transparent-capture error after exhausted retries', async () => {
    await expect(captureUntilPainted(
      async () => ({ maxAlpha: 0, opaquePixels: 0, translucentPixels: 0 }),
      pngInspectionHasPaint,
      { attempts: 3, label: 'chromium-slide-filter-foreground.png' },
    )).rejects.toThrow('transparent chromium capture: chromium-slide-filter-foreground.png');
  });
});

describe('editable PPTX layered backgrounds', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('isolates supported authored gradient layers for Chromium capture before native conversion', async () => {
    const slide = fakeElement();
    const paper = fakeElement();
    slide.prepend(paper);
    const backgroundImage =
      'linear-gradient(rgba(26, 26, 26, 0.018) 1px, rgba(0, 0, 0, 0) 1px), linear-gradient(rgb(248, 246, 241), rgb(248, 246, 241))';
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'absolute' }],
      [
        paper,
        {
          backgroundColor: 'rgb(248, 246, 241)',
          backgroundImage,
          backgroundPosition: '0% 0%, 0% 0%',
          backgroundRepeat: 'repeat, repeat',
          backgroundSize: '100% 44px, 100% 100%',
          position: 'absolute',
        },
      ],
    ]);
    stubExportDom(slide, styles);

    let layeredBackground: HTMLElement | undefined;
    await runExport(() => {
      layeredBackground = Array.from(paper.children).find(
        (child) => child.getAttribute('data-od-pptx-layered-bg') === 'true',
      ) as HTMLElement | undefined;
    });

    expect((paper.style as unknown as FakeStyle).getPropertyValue('background-image')).toBe('none');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-image')).toBe(
      backgroundImage,
    );
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-color')).toBe(
      'rgb(248, 246, 241)',
    );
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-size')).toBe(
      '100% 44px, 100% 100%',
    );
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-repeat')).toBe(
      'repeat, repeat',
    );
  });

  test.each([
    'repeating-linear-gradient(90deg, red 0 8px, blue 8px 16px), linear-gradient(white, black)',
    'conic-gradient(from 45deg, red, blue), radial-gradient(white, black)',
  ])('leaves html2canvas-unsupported layers on the authored element: %s', async (backgroundImage) => {
    const slide = fakeElement();
    const panel = fakeElement();
    slide.prepend(panel);
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'absolute' }],
      [panel, { backgroundImage, position: 'absolute' }],
    ]);
    const created = stubExportDom(slide, styles);

    await runExport();

    expect(created.filter((element) => element.tagName === 'OD-PPTX-LAYERED-BACKGROUND')).toHaveLength(0);
    expect((panel.style as unknown as FakeStyle).getPropertyValue('background-image')).toBe('');
  });

  test('rasterizes a static layered panel without changing its containing block semantics', async () => {
    const slide = fakeElement();
    const panel = fakeElement();
    const outerAnchoredChild = fakeElement();
    panel.prepend(outerAnchoredChild);
    slide.prepend(panel);
    const backgroundImage = 'linear-gradient(white, transparent), radial-gradient(circle, white, black)';
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'relative' }],
      [
        panel,
        {
          backgroundImage,
          position: 'static',
        },
      ],
      [outerAnchoredChild, { position: 'absolute' }],
    ]);
    stubExportDom(slide, styles);

    let layeredBackground: HTMLElement | undefined;
    await runExport(() => {
      layeredBackground = Array.from(panel.children).find(
        (child) => child.getAttribute('data-od-pptx-layered-bg') === 'true',
      ) as HTMLElement | undefined;
    });

    expect((panel.style as unknown as FakeStyle).getPropertyValue('background-image')).toBe('none');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-image')).toBe(
      backgroundImage,
    );
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('inset')).toBe('auto');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('left')).toBe('24px');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('top')).toBe('32px');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('width')).toBe('160px');
    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('height')).toBe('80px');
    expect((panel.style as unknown as FakeStyle).getPropertyValue('position')).toBe('');
    expect((outerAnchoredChild.style as unknown as FakeStyle).getPropertyValue('position')).toBe('');
  });

  test('copies background blending onto the no-capture fallback layer', async () => {
    const slide = fakeElement();
    const panel = fakeElement();
    slide.prepend(panel);
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'relative' }],
      [
        panel,
        {
          backgroundBlendMode: 'multiply, screen',
          backgroundImage: 'linear-gradient(white, transparent), radial-gradient(circle, white, black)',
          position: 'absolute',
        },
      ],
    ]);
    stubExportDom(slide, styles);

    let layeredBackground: HTMLElement | undefined;
    await runExport(() => {
      layeredBackground = Array.from(panel.children).find(
        (child) => child.getAttribute('data-od-pptx-layered-bg') === 'true',
      ) as HTMLElement | undefined;
    });

    expect((layeredBackground?.style as unknown as FakeStyle).getPropertyValue('background-blend-mode')).toBe(
      'multiply, screen',
    );
  });

  test('does not turn static content wrappers into containing blocks', async () => {
    const slide = fakeElement();
    const panel = fakeElement();
    const wrapper = fakeElement();
    const outerAnchoredChild = fakeElement();
    wrapper.prepend(outerAnchoredChild);
    panel.prepend(wrapper);
    slide.prepend(panel);
    panel.setAttribute('data-od-pptx-layer-capture-id', 'layer-1');
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'relative' }],
      [
        panel,
        {
          backgroundImage: 'linear-gradient(white, transparent), radial-gradient(circle, white, black)',
          position: 'relative',
        },
      ],
      [wrapper, { position: 'static' }],
      [outerAnchoredChild, { position: 'absolute' }],
    ]);
    stubExportDom(slide, styles);

    await runExport(undefined, {
      'layer-1': {
        dataUrl: 'data:image/png;base64,cG5n',
        height: 80,
        left: 24,
        slideIndex: 0,
        top: 32,
        width: 160,
      },
    });

    expect(slide.children[0]?.getAttribute('data-od-pptx-layered-bg')).toBe('true');
    expect(slide.children[1]).toBe(panel);
    expect((wrapper.style as unknown as FakeStyle).getPropertyValue('position')).toBe('');
    expect((wrapper.style as unknown as FakeStyle).getPropertyValue('z-index')).toBe('');
    expect((outerAnchoredChild.style as unknown as FakeStyle).getPropertyValue('position')).toBe('');
  });

  test.each([
    { clip: { backgroundClip: 'text' }, name: 'standard' },
    { clip: { webkitBackgroundClip: 'text' }, name: 'WebKit' },
  ])('keeps a $name text-clipped layered gradient on the authored text path', async ({ clip }) => {
    const slide = fakeElement();
    const title = fakeElement();
    title.textContent = 'Gradient title';
    slide.prepend(title);
    const backgroundImage = 'linear-gradient(90deg, red, blue), linear-gradient(white, black)';
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [slide, { position: 'relative' }],
      [
        title,
        {
          backgroundImage,
          color: 'transparent',
          position: 'absolute',
          ...clip,
        },
      ],
    ]);
    const created = stubExportDom(slide, styles);

    let exportedBackgroundOverride = '';
    await runExport(() => {
      exportedBackgroundOverride = (title.style as unknown as FakeStyle).getPropertyValue('background-image');
    });

    expect(exportedBackgroundOverride).toBe('');
    expect(created.filter((element) => element.tagName === 'OD-PPTX-LAYERED-BACKGROUND')).toHaveLength(0);
  });

  test('emits one Chromium capture layer for a slide with a supported layered background', async () => {
    const slide = fakeElement();
    const styles = new Map<HTMLElement, Partial<ComputedStyle>>([
      [
        slide,
        {
          backgroundColor: 'rgb(248, 246, 241)',
          backgroundImage: 'linear-gradient(transparent, white), radial-gradient(circle, white, transparent)',
          position: 'absolute',
        },
      ],
    ]);
    const created = stubExportDom(slide, styles);

    await runExport();

    expect(created.filter((element) => element.tagName === 'OD-PPTX-LAYERED-BACKGROUND')).toHaveLength(1);
    expect(created.filter((element) => element.getAttribute('data-od-pptx-bg') === 'true')).toHaveLength(0);
  });

  test('emits PNG media for standard and pseudo layered backgrounds', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.supported).toMatchObject({ captures: 1, media: [expect.stringMatching(/\.png$/)] });
    expect(media.pseudo, JSON.stringify(media.pseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
  }, 30_000);

  test('keeps layered-background captures at 2x CSS resolution on a dpr=2 renderer', async () => {
    const capture = await probeDpr2LayeredBackgroundCapture();

    expect(capture).toMatchObject({ devicePixelRatio: 2, height: 120, width: 240 });
  }, 20_000);

  test('bounds clipped-backdrop hit testing independently of overlap area', async () => {
    const capture = await probeDpr2LayeredBackgroundCapture();

    expect(capture.largeAreaHitTests).toBeLessThanOrEqual(4_101);
  }, 20_000);

  test('includes a 1px clipped backdrop nested in a layered blend compositor root', async () => {
    const capture = await probeDpr2LayeredBackgroundCapture();

    expect(capture.largeStripeExportedRgb).toEqual(capture.largeStripeChromiumRgb);
  }, 30_000);

  test('captures standard and WebKit text-clipped layered gradients as Chromium-painted text', async () => {
    const media = await probeLayeredBackgroundMedia();
    const cases = [
      {
        chromium: media.textClipStandardChromium,
        comparison: media.textClipStandardChromiumComparison,
        exported: media.textClipStandard,
        name: 'standard',
        nativeContent: media.textClipStandardNativeContent,
      },
      {
        chromium: media.textClipWebkitChromium,
        comparison: media.textClipWebkitChromiumComparison,
        exported: media.textClipWebkit,
        name: 'WebKit',
        nativeContent: media.textClipWebkitNativeContent,
      },
    ];

    for (const fixture of cases) {
      expect(fixture.exported, `${fixture.name}: ${JSON.stringify(fixture.exported)}`).toMatchObject({
        captures: 1,
        media: [expect.stringMatching(/\.png$/)],
      });
      const comparisonContext = JSON.stringify({
        chromium: fixture.chromium,
        exported: fixture.exported.pngs[0],
        comparison: fixture.comparison,
      });
      expect(fixture.comparison.meanChannelDelta, comparisonContext).toBeLessThanOrEqual(8);
      expect(fixture.comparison.maxChannelDelta, comparisonContext).toBeLessThanOrEqual(224);
      expect(fixture.nativeContent).toBe(-1);
    }
  }, 30_000);

  test('captures standard and WebKit text-clipped layered pseudos as Chromium-painted text', async () => {
    const captures = await probePseudoTextClipCaptures();
    const cases = [
      {
        name: 'standard',
        result: captures.standard,
        suppressAfter: false,
        suppressBefore: true,
      },
      {
        name: 'WebKit',
        result: captures.webkit,
        suppressAfter: true,
        suppressBefore: false,
      },
    ];

    for (const fixture of cases) {
      expect(fixture.result, `${fixture.name}: ${JSON.stringify(fixture.result)}`).toMatchObject({
        captures: 1,
        entirePseudo: true,
        suppressAfter: fixture.suppressAfter,
        suppressBefore: fixture.suppressBefore,
      });
      expect(fixture.result.paintedPixels, fixture.name).toBeGreaterThan(0);
      expect(fixture.result.transparentPixels, fixture.name).toBeGreaterThan(0);
    }
  }, 20_000);

  test('keeps layered pseudo backgrounds behind native pseudo content', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.pseudoLayerOrder.background, JSON.stringify(media.pseudoLayerOrder)).toBeGreaterThanOrEqual(0);
    expect(media.pseudoLayerOrder.content).toBeGreaterThanOrEqual(0);
    expect(media.pseudoLayerOrder.background).toBeLessThan(media.pseudoLayerOrder.content);
  }, 30_000);

  test('keeps an opaque pseudo fallback in raster media without covering native content and border', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.pseudo.pngs;

    expect(image?.centerRgb, JSON.stringify(image)).toEqual([250, 0, 200]);
    expect(media.pseudoNativeStyle.content).toBeGreaterThanOrEqual(0);
    expect(media.pseudoNativeStyle.border).toBeGreaterThanOrEqual(0);
    expect(media.pseudoNativeStyle.fallbackFill).toBe(-1);
  }, 30_000);

  test('preserves a layered pseudo box shadow in its exported raster media', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.pseudoShadow.pngs;

    expect(media.pseudoShadow, JSON.stringify(media.pseudoShadow)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.topLeftRgb, JSON.stringify(image)).toEqual([255, 0, 0]);
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([0, 0, 255]);
  }, 30_000);

  test('flattens a multiply-blended layered background against an authored pseudo backdrop', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.blended.pngs;

    expect(media.blended, JSON.stringify(media.blended)).toMatchObject({
      captures: 2,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([64, 96, 64]);
  }, 30_000);

  test('flattens a multiply-blended layered background against nested backdrop descendants', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.nestedBlended.pngs;

    expect(media.nestedBlended, JSON.stringify(media.nestedBlended)).toMatchObject({
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([64, 96, 64]);
  }, 30_000);

  test('uses CSS paint order when selecting a blended background backdrop', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.paintOrderedBackdrop.pngs;

    expect(media.paintOrderedBackdrop, JSON.stringify(media.paintOrderedBackdrop)).toMatchObject({
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([64, 96, 64]);
  }, 30_000);

  test('includes a narrow clipped stripe in a layered blend target backdrop', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.clippedStripeBackdrop, JSON.stringify(media.clippedStripeBackdrop)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.clippedStripeBackdropChromium,
      exported: media.clippedStripeBackdrop.pngs[0],
      comparison: media.clippedStripeBackdropChromiumComparison,
    });
    expect(media.clippedStripeBackdropChromiumComparison.meanChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(1);
    expect(media.clippedStripeBackdropChromiumComparison.maxChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(16);
  }, 30_000);

  test('includes an explicit slide background behind a materialized layered pseudo', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.stackingSlide.pngs;

    expect(media.stackingSlide, JSON.stringify(media.stackingSlide)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([64, 96, 64]);
  }, 30_000);

  test('aligns a captured layered background with native content after export normalization', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.alignmentGeometry, JSON.stringify(media.alignmentGeometry)).toEqual({
      background: { height: 971550, width: 2171700, x: 1314450, y: 1028700 },
      content: { height: 971550, width: 2171700, x: 1314450, y: 1028700 },
    });
  }, 30_000);

  test('flattens a backdrop-filtered layered background against its authored backdrop', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.backdropFiltered.pngs;

    expect(media.backdropFiltered, JSON.stringify(media.backdropFiltered)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // Chromium's backdrop-filter color rounding can differ by one channel
    // level across platforms while preserving the same rendered color.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [96, 223, 223][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
  }, 30_000);

  test('preserves background blending for standard and backdrop-dependent pseudos', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [standard] = media.backgroundBlendPseudo.pngs;
    const [materialized] = media.materializedBackgroundBlend.pngs;

    expect(standard?.centerRgb, JSON.stringify(standard)).toEqual([64, 96, 64]);
    expect(materialized?.centerRgb, JSON.stringify(materialized)).toEqual([64, 96, 64]);
  }, 30_000);

  test('captures non-empty backdrop-dependent pseudos with their Chromium-painted foregrounds', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.compositedPseudoContent.pngs;

    expect(media.compositedPseudoContent, JSON.stringify(media.compositedPseudoContent)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // The PPTX path resamples Chromium's 2x capture when embedding it, so
    // compare bounded pixel error rather than requiring byte-identical PNGs.
    const comparison = media.compositedPseudoContentChromiumComparison;
    const comparisonContext = JSON.stringify({ chromium: media.compositedPseudoContentChromium, exported: image });
    expect(comparison.meanChannelDelta, comparisonContext).toBeLessThanOrEqual(8);
    expect(comparison.maxChannelDelta, comparisonContext).toBeLessThanOrEqual(160);
    expect(media.compositedPseudoContentNativeContent).toBe(-1);
  }, 30_000);

  test('captures a filtered layered pseudo with its generated content and border', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.selfFilteredPseudo, JSON.stringify(media.selfFilteredPseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.selfFilteredPseudoChromium,
      exported: media.selfFilteredPseudo.pngs[0],
      comparison: media.selfFilteredPseudoChromiumComparison,
    });
    expect(media.selfFilteredPseudoChromiumComparison.meanChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(8);
    expect(media.selfFilteredPseudoChromiumComparison.maxChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(160);
    expect(media.selfFilteredPseudoNativeContent).toBe(-1);
  }, 30_000);

  test('captures a real blended target with its Chromium-painted foreground', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.realBlend, JSON.stringify(media.realBlend)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.realBlendChromium,
      exported: media.realBlend.pngs[0],
      comparison: media.realBlendChromiumComparison,
    });
    expect(media.realBlendChromiumComparison.meanChannelDelta, comparisonContext).toBeLessThanOrEqual(10);
    expect(media.realBlendChromiumComparison.maxChannelDelta, comparisonContext).toBeLessThanOrEqual(64);
    expect(media.realBlendNativeContent).toBe(-1);
  }, 30_000);

  test('keeps a materialized pseudo fallback in its PNG without a duplicate native fill', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.materializedOpaquePseudo.pngs;

    expect(media.materializedOpaquePseudo, JSON.stringify(media.materializedOpaquePseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [185, 89, 144][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(media.materializedOpaquePseudoNativeFill).toBe(-1);
  }, 30_000);

  test('captures only the layered background pixels from a replaced element', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.replaced.pngs;

    expect(media.replaced, JSON.stringify(media.replaced)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image).toBeDefined();
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.translucentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.opaquePixels, JSON.stringify(image)).toBe(0);
    expect(media.replacedForegroundMedia).toHaveLength(1);
  }, 30_000);

  test('keeps a slide-root layered pseudo background above the opaque slide background', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.rootPseudo.pngs;

    expect(media.rootPseudo, JSON.stringify(media.rootPseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.translucentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(media.rootPseudoLayerOrder.slideBackground).toBeGreaterThanOrEqual(0);
    expect(media.rootPseudoLayerOrder.background).toBeGreaterThanOrEqual(0);
    expect(media.rootPseudoLayerOrder.content).toBeGreaterThanOrEqual(0);
    expect(media.rootPseudoLayerOrder.slideBackground).toBeLessThan(media.rootPseudoLayerOrder.background);
    expect(media.rootPseudoLayerOrder.background).toBeLessThan(media.rootPseudoLayerOrder.content);
  }, 30_000);

  test('skips hidden, zero-sized, and off-slide layered backgrounds without aborting export', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.skippedTargets).toBe(0);
  }, 30_000);

  test('preserves clipping and effective opacity in the exported layered-background pixels', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.composited.pngs;

    expect(media.composited.captures).toBe(1);
    expect(image).toBeDefined();
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(image?.maxAlpha).toBeLessThanOrEqual(136);
  }, 30_000);

  test('captures a layered target foreground with its own opacity applied once', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.nestedOpacity.pngs;

    expect(media.nestedOpacity, JSON.stringify(media.nestedOpacity)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.nestedOpacityChromium,
      exported: image,
      comparison: media.nestedOpacityChromiumComparison,
    });
    expect(media.nestedOpacityChromiumComparison.meanChannelDelta, comparisonContext).toBeLessThanOrEqual(8);
    expect(media.nestedOpacityChromiumComparison.maxChannelDelta, comparisonContext).toBeLessThanOrEqual(96);
    // Electron's bitmap is premultiplied: the authored [50, 0, 100] group
    // color appears at half intensity alongside the ancestor's 0.5 alpha.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [25, 0, 50][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(image?.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(image?.maxAlpha).toBeLessThanOrEqual(136);
    expect(media.nestedOpacityNativeContent).toBe(-1);
    expect(media.nestedOpacityNativeShape).toBe(-1);
    expect(image?.topLeftRgb[0], JSON.stringify(image)).toBeGreaterThan(image?.topLeftRgb[1] ?? 0);
  }, 30_000);

  test('keeps a whole-paint slide capture as the export root with full-slide geometry', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.slideRootMask, JSON.stringify(media.slideRootMask)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(media.slideRootMaskGeometry).toEqual({
      height: 5_143_500,
      width: 9_144_000,
      x: 0,
      y: 0,
    });
    expect(media.slideRootMaskNativeContent).toBe(-1);
  }, 30_000);

  test('captures intermediate compositor paint with a partially transparent layered child', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.nestedCompositor.pngs;

    expect(media.nestedCompositor, JSON.stringify(media.nestedCompositor)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // Chromium composites the half-transparent red child over the intermediate
    // green fill, applies brightness(.5), then applies the outer half opacity.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [25, 25, 0][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(image?.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(image?.maxAlpha).toBeLessThanOrEqual(136);
    expect(media.nestedCompositorNativeFill).toBe(-1);
  }, 30_000);

  test('captures a painted static wrapper inside an opacity group without re-emitting its fill', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.paintedWrapper.pngs;

    expect(media.paintedWrapper, JSON.stringify(media.paintedWrapper)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // Chromium paints the half-transparent red child over the static green
    // wrapper, then applies the outer half opacity to that complete group.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [50, 50, 0][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(image?.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(image?.maxAlpha).toBeLessThanOrEqual(136);
    expect(media.paintedWrapperOrder.image).toBeGreaterThanOrEqual(0);
    expect(media.paintedWrapperOrder.nativeFill).toBe(-1);
    expect(media.paintedWrapperOrder.image).toBeLessThan(media.paintedWrapperOrder.nativeContent);
  }, 30_000);

  test('captures a compositor root solid background below its native foreground', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.solidCompositor.pngs;

    expect(media.solidCompositor, JSON.stringify(media.solidCompositor)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // The red root background and translucent blue child are composited first,
    // then the root's half opacity is applied to the complete captured paint.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [50, 10, 60][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(image?.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(image?.maxAlpha).toBeLessThanOrEqual(136);
    expect(media.solidCompositorOrder.image).toBeGreaterThanOrEqual(0);
    expect(media.solidCompositorOrder.nativeFill).toBe(-1);
    expect(media.solidCompositorOrder.image).toBeLessThan(media.solidCompositorOrder.nativeContent);
  }, 30_000);

  test('propagates blended-child backdrop dependency to its opacity capture root', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.groupedBackdrop.pngs;

    expect(media.groupedBackdrop, JSON.stringify(media.groupedBackdrop)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    // Chromium isolates the blend inside the opacity group, then composites
    // that half-opacity group over the authored green backdrop.
    expect(
      image?.centerRgb.every((channel, index) => Math.abs(channel - [128, 160, 128][index]!) <= 1),
      JSON.stringify(image),
    ).toBe(true);
    expect(image?.minAlpha).toBe(255);
  }, 30_000);

  test('captures an ancestor blend context with its layered child and backdrop', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.ancestorBlend.pngs;

    expect(media.ancestorBlend, JSON.stringify(media.ancestorBlend)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.centerRgb, JSON.stringify(image)).toEqual([64, 96, 64]);
    expect(image?.minAlpha).toBe(255);
  }, 30_000);

  test('captures native foreground inside an unsupported ancestor filter context', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.ancestorFilterForeground, JSON.stringify(media.ancestorFilterForeground)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.ancestorFilterForegroundChromium,
      exported: media.ancestorFilterForeground.pngs[0],
      comparison: media.ancestorFilterForegroundChromiumComparison,
    });
    expect(media.ancestorFilterForegroundChromiumComparison.meanChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(8);
    expect(media.ancestorFilterForegroundChromiumComparison.maxChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(160);
    expect(media.ancestorFilterForegroundNativeContent).toBe(-1);
  }, 30_000);

  test('captures slide-root filter effects with layered backgrounds and native foreground', async () => {
    const media = await probeLayeredBackgroundMedia();

    expect(media.slideFilterForeground, JSON.stringify(media.slideFilterForeground)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: media.slideFilterForegroundChromium,
      exported: media.slideFilterForeground.pngs[0],
      comparison: media.slideFilterForegroundChromiumComparison,
    });
    expect(media.slideFilterForegroundChromiumComparison.meanChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(8);
    expect(media.slideFilterForegroundChromiumComparison.maxChannelDelta, comparisonContext)
      .toBeLessThanOrEqual(160);
    expect(media.slideFilterForegroundNativeContent).toBe(-1);
  }, 30_000);

  test.each([
    ['a layered element clip path', 'selfClipForeground'],
    ['an ancestor clip path', 'ancestorClipForeground'],
    ['an ancestor prefixed mask', 'ancestorMaskForeground'],
  ] as const)('captures native foreground inside %s', async (_label, key) => {
    const media = await probeLayeredBackgroundMedia();
    const probe = media[key];

    expect(probe.exported, JSON.stringify(probe.exported)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    const comparisonContext = JSON.stringify({
      chromium: probe.chromium,
      exported: probe.exported.pngs[0],
      comparison: probe.comparison,
    });
    expect(probe.comparison.meanChannelDelta, comparisonContext).toBeLessThanOrEqual(8);
    expect(probe.comparison.maxChannelDelta, comparisonContext).toBeLessThanOrEqual(160);
    expect(probe.nativeContent).toBe(-1);
    expect(probe.nativeBorder).toBe(-1);
  }, 30_000);

  test('captures a real masked element complete instead of emitting unmasked native foreground', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.masked.pngs;

    expect(media.masked.captures).toBe(1);
    expect(media.masked.media).toEqual([expect.stringMatching(/\.png$/)]);
    expect(image).toBeDefined();
    expect(image?.transparentPixels).toBeGreaterThan(0);
    expect(image?.translucentPixels).toBeGreaterThan(0);
    expect(image?.maxAlpha).toBeGreaterThan(240);
    expect(media.maskedNativeContent).toBe(-1);
  }, 30_000);

  test('preserves mask geometry on a normal layered pseudo background', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.normalMaskedPseudo.pngs;

    expect(media.normalMaskedPseudo, JSON.stringify(media.normalMaskedPseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image).toBeDefined();
    expect(image?.minAlpha).toBe(0);
    expect(image?.maxAlpha).toBe(255);
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(image?.opaquePixels ?? 0);
  }, 30_000);

  test('preserves mask geometry on a background-blended layered pseudo', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.compositedMaskedPseudo.pngs;

    expect(media.compositedMaskedPseudo, JSON.stringify(media.compositedMaskedPseudo)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image).toBeDefined();
    expect(image?.minAlpha).toBe(0);
    expect(image?.maxAlpha).toBe(255);
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(image?.opaquePixels ?? 0);
  }, 30_000);

  test('masks pseudo content and border in the captured layer without native duplicates', async () => {
    const media = await probeLayeredBackgroundMedia();
    const [image] = media.maskedPseudoContent.pngs;

    expect(media.maskedPseudoContent, JSON.stringify(media.maskedPseudoContent)).toMatchObject({
      captures: 1,
      media: [expect.stringMatching(/\.png$/)],
    });
    expect(image?.transparentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.translucentPixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(image?.opaquePixels, JSON.stringify(image)).toBeGreaterThan(0);
    expect(media.maskedPseudoContentMediaCount).toBe(1);
    expect(media.maskedPseudoContentOrder.image).toBeGreaterThanOrEqual(0);
    expect(media.maskedPseudoContentOrder.nativeContent).toBe(-1);
    expect(media.maskedPseudoContentOrder.image).toBeLessThan(media.maskedPseudoContentOrder.sibling);
  }, 30_000);
});

type LayeredBackgroundProbe = {
  alignmentGeometry: {
    background: PptxGeometry | null;
    content: PptxGeometry | null;
  };
  ancestorBlend: LayeredBackgroundExport;
  ancestorClipForeground: PaintClipForegroundProbe;
  ancestorFilterForeground: LayeredBackgroundExport;
  ancestorFilterForegroundChromium: PngProbe;
  ancestorFilterForegroundChromiumComparison: PngComparison;
  ancestorFilterForegroundNativeContent: number;
  ancestorMaskForeground: PaintClipForegroundProbe;
  backdropFiltered: LayeredBackgroundExport;
  backgroundBlendPseudo: LayeredBackgroundExport;
  blended: LayeredBackgroundExport;
  composited: LayeredBackgroundExport;
  compositedMaskedPseudo: LayeredBackgroundExport;
  compositedPseudoContent: LayeredBackgroundExport;
  compositedPseudoContentChromium: PngProbe;
  compositedPseudoContentChromiumComparison: PngComparison;
  compositedPseudoContentNativeContent: number;
  clippedStripeBackdrop: LayeredBackgroundExport;
  clippedStripeBackdropChromium: PngProbe;
  clippedStripeBackdropChromiumComparison: PngComparison;
  groupedBackdrop: LayeredBackgroundExport;
  masked: LayeredBackgroundExport;
  maskedNativeContent: number;
  maskedPseudoContent: LayeredBackgroundExport;
  maskedPseudoContentMediaCount: number;
  maskedPseudoContentOrder: { image: number; nativeContent: number; sibling: number };
  materializedBackgroundBlend: LayeredBackgroundExport;
  materializedOpaquePseudo: LayeredBackgroundExport;
  materializedOpaquePseudoNativeFill: number;
  nestedBlended: LayeredBackgroundExport;
  nestedCompositor: LayeredBackgroundExport;
  nestedCompositorNativeFill: number;
  nestedOpacity: LayeredBackgroundExport;
  nestedOpacityChromium: PngProbe;
  nestedOpacityChromiumComparison: PngComparison;
  nestedOpacityNativeContent: number;
  nestedOpacityNativeShape: number;
  normalMaskedPseudo: LayeredBackgroundExport;
  paintOrderedBackdrop: LayeredBackgroundExport;
  paintedWrapper: LayeredBackgroundExport;
  paintedWrapperOrder: { image: number; nativeContent: number; nativeFill: number };
  pseudo: LayeredBackgroundExport;
  pseudoLayerOrder: { background: number; content: number };
  pseudoNativeStyle: { border: number; content: number; fallbackFill: number };
  pseudoShadow: LayeredBackgroundExport;
  realBlend: LayeredBackgroundExport;
  realBlendChromium: PngProbe;
  realBlendChromiumComparison: PngComparison;
  realBlendNativeContent: number;
  replaced: LayeredBackgroundExport;
  replacedForegroundMedia: string[];
  rootPseudo: LayeredBackgroundExport;
  rootPseudoLayerOrder: { background: number; content: number; slideBackground: number };
  skippedTargets: number;
  selfFilteredPseudo: LayeredBackgroundExport;
  selfFilteredPseudoChromium: PngProbe;
  selfFilteredPseudoChromiumComparison: PngComparison;
  selfFilteredPseudoNativeContent: number;
  selfClipForeground: PaintClipForegroundProbe;
  slideFilterForeground: LayeredBackgroundExport;
  slideFilterForegroundChromium: PngProbe;
  slideFilterForegroundChromiumComparison: PngComparison;
  slideFilterForegroundNativeContent: number;
  slideRootMask: LayeredBackgroundExport;
  slideRootMaskGeometry: PptxGeometry | null;
  slideRootMaskNativeContent: number;
  solidCompositor: LayeredBackgroundExport;
  solidCompositorOrder: { image: number; nativeContent: number; nativeFill: number };
  stackingSlide: LayeredBackgroundExport;
  supported: LayeredBackgroundExport;
  textClipStandard: LayeredBackgroundExport;
  textClipStandardChromium: PngProbe;
  textClipStandardChromiumComparison: PngComparison;
  textClipStandardNativeContent: number;
  textClipWebkit: LayeredBackgroundExport;
  textClipWebkitChromium: PngProbe;
  textClipWebkitChromiumComparison: PngComparison;
  textClipWebkitNativeContent: number;
};

type PptxGeometry = { height: number; width: number; x: number; y: number };

type PngComparison = {
  maxChannelDelta: number;
  meanChannelDelta: number;
};

type LayeredBackgroundExport = { captures: number; media: string[]; pngs: PngProbe[] };

type PaintClipForegroundProbe = {
  chromium: PngProbe;
  comparison: PngComparison;
  exported: LayeredBackgroundExport;
  nativeBorder: number;
  nativeContent: number;
};

type PngProbe = {
  centerRgb: [number, number, number];
  height: number;
  maxAlpha: number;
  minAlpha: number;
  name: string;
  opaquePixels: number;
  translucentPixels: number;
  transparentPixels: number;
  topLeftRgb: [number, number, number];
  width: number;
};

let layeredBackgroundProbePromise: Promise<LayeredBackgroundProbe> | undefined;
let dpr2LayeredBackgroundProbePromise: ReturnType<typeof runDpr2LayeredBackgroundCapture> | undefined;

function probeLayeredBackgroundMedia(): Promise<LayeredBackgroundProbe> {
  layeredBackgroundProbePromise ??= runLayeredBackgroundMediaProbe();
  return layeredBackgroundProbePromise;
}

function probeDpr2LayeredBackgroundCapture(): ReturnType<typeof runDpr2LayeredBackgroundCapture> {
  dpr2LayeredBackgroundProbePromise ??= runDpr2LayeredBackgroundCapture();
  return dpr2LayeredBackgroundProbePromise;
}

async function runDpr2LayeredBackgroundCapture(): Promise<{
  devicePixelRatio: number;
  height: number;
  largeAreaHitTests: number;
  largeStripeChromiumRgb: [number, number, number];
  largeStripeExportedRgb: [number, number, number];
  width: number;
}> {
  const probeDir = await mkdtemp(join(tmpdir(), 'od-pptx-layered-dpr2-'));
  await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
  await writeFile(
    join(probeDir, 'main.cjs'),
    `
const { app, BrowserWindow, nativeImage } = require('electron');

const SLIDE_SELECTOR = '.slide';
const collectLayeredPptxBackgroundTargets = ${collectLayeredPptxBackgroundTargets.toString()};
const isolateLayeredPptxBackground = ${isolateLayeredPptxBackground.toString()};
const restoreLayeredPptxBackgroundIsolation = ${restoreLayeredPptxBackgroundIsolation.toString()};
const captureEditablePptxLayeredBackgrounds = ${captureEditablePptxLayeredBackgrounds.toString()};
${ELECTRON_CAPTURE_UNTIL_PAINTED_SOURCE}

async function nextFrames(window) {
  await window.webContents.executeJavaScript(
    'new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})})',
    true,
  );
}

async function queryDevicePixelRatio(window) {
  try {
    const value = await window.webContents.executeJavaScript('window.devicePixelRatio || 1', true);
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function rgbAt(image, logicalX, logicalY, logicalWidth, logicalHeight) {
  const size = image.getSize();
  const x = Math.min(size.width - 1, Math.max(0, Math.floor(logicalX * size.width / logicalWidth)));
  const y = Math.min(size.height - 1, Math.max(0, Math.floor(logicalY * size.height / logicalHeight)));
  const bitmap = image.toBitmap();
  const offset = (y * size.width + x) * 4;
  return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]];
}

async function captureCdpPngUntilPainted(dbg, clip, label, window) {
  return captureUntilPainted(
    async () => {
      const screenshot = await dbg.sendCommand('Page.captureScreenshot', {
        captureBeyondViewport: true,
        clip,
        format: 'png',
        fromSurface: true,
      });
      if (!screenshot.data) throw new Error('Chromium returned no capture for ' + label);
      return screenshot.data;
    },
    (data) => pngBufferHasPaint(Buffer.from(data, 'base64')),
    { label, onRetry: () => nextFrames(window) },
  );
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    height: 180,
    show: false,
    useContentSize: true,
    width: 320,
    webPreferences: { contextIsolation: false, nodeIntegration: false, sandbox: true },
  });
  try {
    const html = '<!doctype html><style>html,body{margin:0}.slide{position:relative;width:320px;height:180px}.target{position:absolute;left:12px;top:10px;width:120px;height:60px;background-image:linear-gradient(red,blue),linear-gradient(white,black)}</style><section class="slide"><div class="target"></div></section>';
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    window.setOpacity(0);
    window.showInactive();
    await nextFrames(window);
    const captures = await captureEditablePptxLayeredBackgrounds(window);
    const capture = Object.values(captures)[0];
    if (!capture) throw new Error('No layered background capture was produced');
    const image = nativeImage.createFromBuffer(Buffer.from(capture.dataUrl.split(',')[1], 'base64'));
    const size = image.getSize();
    const largeHtml = '<!doctype html><style>html,body{margin:0}.slide{position:relative;width:1920px;height:1080px}.compositor{position:absolute;inset:0;opacity:.999}.backdrop,.large-target{position:absolute;inset:0}.backdrop{background:rgb(128,192,128);clip-path:polygon(7px 0,8px 0,8px 100%,7px 100%)}.large-target{background-image:linear-gradient(rgb(128,128,128),rgb(128,128,128)),linear-gradient(transparent,transparent);mix-blend-mode:multiply}</style><section class="slide"><div class="compositor"><div class="backdrop"></div><div class="large-target"></div></div></section>';
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(largeHtml));
    await nextFrames(window);
    const dbg = window.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Page.enable');
    const stripeClip = { height: 1, scale: 1, width: 1, x: 7, y: 540 };
    const largeReferenceShot = { data: await captureCdpPngUntilPainted(dbg, stripeClip, 'dpr2-large-reference', window) };
    const [largeTarget] = await window.webContents.executeJavaScript(
      '(' + collectLayeredPptxBackgroundTargets.toString() + ')(".slide")',
      true,
    );
    if (!largeTarget) throw new Error('No large layered background target was produced');
    const largeGeometry = await window.webContents.executeJavaScript(
      '(() => {'
        + 'const restoreLayeredPptxBackgroundIsolation=' + restoreLayeredPptxBackgroundIsolation.toString() + ';'
        + 'return (' + isolateLayeredPptxBackground.toString() + ')(".slide",' + JSON.stringify(largeTarget.id) + ');'
      + '})()',
      true,
    );
    if (!largeGeometry) throw new Error('Could not isolate the large layered background target');
    await nextFrames(window);
    const largeExportedShot = { data: await captureCdpPngUntilPainted(dbg, stripeClip, 'dpr2-large-exported', window) };
    await window.webContents.executeJavaScript(
      '(' + restoreLayeredPptxBackgroundIsolation.toString() + ')()',
      true,
    );
    dbg.detach();
    const largeReferenceImage = nativeImage.createFromBuffer(Buffer.from(largeReferenceShot.data, 'base64'));
    const largeExportedImage = nativeImage.createFromBuffer(Buffer.from(largeExportedShot.data, 'base64'));
    const largeStripeChromiumRgb = rgbAt(largeReferenceImage, 0.5, 0.5, 1, 1);
    const largeStripeExportedRgb = rgbAt(largeExportedImage, 0.5, 0.5, 1, 1);
    const largeAreaProbe = await window.webContents.executeJavaScript(
      '(() => {'
        + 'let calls=0;try{'
          + 'const restoreLayeredPptxBackgroundIsolation=' + restoreLayeredPptxBackgroundIsolation.toString() + ';'
          + 'Object.defineProperty(document,"elementsFromPoint",{configurable:true,value:()=>{calls+=1;return[];}});'
          + '(' + isolateLayeredPptxBackground.toString() + ')(".slide",' + JSON.stringify(largeTarget.id) + ');'
          + 'return{calls};'
        + '}catch(error){return{calls,error:String(error&&error.stack?error.stack:error)}}'
      + '})()',
      true,
    );
    if (largeAreaProbe.error) throw new Error(largeAreaProbe.error);
    const largeAreaHitTests = largeAreaProbe.calls;
    const result = {
      devicePixelRatio: await queryDevicePixelRatio(window),
      largeAreaHitTests,
      largeStripeChromiumRgb,
      largeStripeExportedRgb,
      ...size,
    };
    await new Promise((resolve, reject) => {
      process.stdout.write('OD_PPTX_DPR2_PROBE:' + JSON.stringify(result) + '\\n', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    window.destroy();
  }
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\\n');
  app.exit(1);
});
`,
  );

  try {
    const electronRelativePath = (await readFile(
      join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
      'utf8',
    )).trim();
    const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
    const electronArgs = [
      '--force-device-scale-factor=2',
      '--no-sandbox',
      '--disable-gpu',
      probeDir,
    ];
    const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
    const args = process.platform === 'linux' ? ['-a', electronPath, ...electronArgs] : electronArgs;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let stderr: string;
    let stdout: string;
    try {
      ({ stderr, stdout } = await execFileP(command, args, { env, timeout: 10_000 }));
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(
        [
          failure.message,
          failure.stdout ? `stdout:\n${failure.stdout}` : '',
          failure.stderr ? `stderr:\n${failure.stderr}` : '',
        ].filter(Boolean).join('\n'),
      );
    }
    const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('OD_PPTX_DPR2_PROBE:'));
    if (!marker) throw new Error(`Electron DPR=2 probe returned no result: ${stdout || stderr}`);
    return JSON.parse(marker.slice('OD_PPTX_DPR2_PROBE:'.length)) as {
      devicePixelRatio: number;
      height: number;
      largeAreaHitTests: number;
      largeStripeChromiumRgb: [number, number, number];
      largeStripeExportedRgb: [number, number, number];
      width: number;
    };
  } finally {
    await rm(probeDir, { force: true, recursive: true });
  }
}

type PseudoTextClipCaptureProbe = {
  captures: number;
  entirePseudo: boolean;
  paintedPixels: number;
  suppressAfter: boolean;
  suppressBefore: boolean;
  transparentPixels: number;
};

async function probePseudoTextClipCaptures(): Promise<{
  standard: PseudoTextClipCaptureProbe;
  webkit: PseudoTextClipCaptureProbe;
}> {
  const probeDir = await mkdtemp(join(tmpdir(), 'od-pptx-pseudo-text-clip-'));
  const collectSource = `(${collectLayeredPptxBackgroundTargets.toString()})(".slide")`;
  const isolateSource = `(id => {
    const restoreLayeredPptxBackgroundIsolation = ${restoreLayeredPptxBackgroundIsolation.toString()};
    return (${isolateLayeredPptxBackground.toString()})(".slide", id);
  })`;
  const restoreSource = `(${restoreLayeredPptxBackgroundIsolation.toString()})()`;
  await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
  await writeFile(
    join(probeDir, 'main.cjs'),
    `
const { app, BrowserWindow, nativeImage } = require('electron');

${ELECTRON_CAPTURE_UNTIL_PAINTED_SOURCE}

async function nextFrames(window) {
  await window.webContents.executeJavaScript(
    'new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})})',
    true,
  );
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    height: 180,
    show: false,
    useContentSize: true,
    width: 320,
    webPreferences: { contextIsolation: false, nodeIntegration: false, sandbox: true },
  });
  try {
    const html = '<!doctype html><style>html,body{margin:0}.slide{position:relative;width:320px;height:180px}.standard,.webkit{position:absolute;top:58px;width:140px;height:64px}.standard{left:6px}.webkit{right:6px}.standard::before,.webkit::after{position:absolute;inset:0;color:transparent;font:700 18px/64px sans-serif;text-align:center;background-image:linear-gradient(90deg,rgb(255,48,96),rgb(32,160,255)),linear-gradient(white,white)}.standard::before{content:"Standard pseudo";background-clip:text}.webkit::after{content:"WebKit pseudo";-webkit-background-clip:text}</style><section class="slide"><div class="standard" data-probe="standard"></div><div class="webkit" data-probe="webkit"></div></section>';
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    window.setOpacity(0);
    window.showInactive();
    await window.webContents.executeJavaScript(
      'new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})})',
      true,
    );
    const targets = await window.webContents.executeJavaScript(${JSON.stringify(collectSource)}, true);
    const details = await window.webContents.executeJavaScript(
      'Object.fromEntries(Array.from(document.querySelectorAll("[data-probe]"), (host) => { const helper = host.querySelector("[data-od-pptx-materialized-pseudo]"); return [host.getAttribute("data-probe"), { captures: host.querySelectorAll("[data-od-pptx-layer-capture-id]").length, entirePseudo: helper?.getAttribute("data-od-pptx-materialized-entire-pseudo") === "true", paintedPixels: 0, suppressAfter: host.getAttribute("data-od-pptx-suppress-after") === "true", suppressBefore: host.getAttribute("data-od-pptx-suppress-before") === "true", transparentPixels: 0 }]; }))',
      true,
    );
    const probeByTarget = await window.webContents.executeJavaScript(
      'Object.fromEntries(Array.from(document.querySelectorAll("[data-od-pptx-layer-capture-id]"), (target) => [target.getAttribute("data-od-pptx-layer-capture-id"), target.closest("[data-probe]").getAttribute("data-probe")]))',
      true,
    );
    const devicePixelRatio = await window.webContents.executeJavaScript('window.devicePixelRatio || 1', true);
    const dbg = window.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Page.enable');
    await dbg.sendCommand('Emulation.setDefaultBackgroundColorOverride', {
      color: { a: 0, b: 0, g: 0, r: 0 },
    });
    for (const target of targets) {
      const geometry = await window.webContents.executeJavaScript(
        ${JSON.stringify(isolateSource)} + '(' + JSON.stringify(target.id) + ')',
        true,
      );
      await nextFrames(window);
      const screenshotData = await captureUntilPainted(
        async () => {
          const screenshot = await dbg.sendCommand('Page.captureScreenshot', {
            captureBeyondViewport: true,
            clip: {
              height: geometry.height,
              scale: 1 / devicePixelRatio,
              width: geometry.width,
              x: geometry.pageX,
              y: geometry.pageY,
            },
            format: 'png',
            fromSurface: true,
          });
          if (!screenshot.data) throw new Error('Chromium returned no capture for ' + target.id);
          return screenshot.data;
        },
        (data) => pngBufferHasPaint(Buffer.from(data, 'base64')),
        { label: target.id, onRetry: () => nextFrames(window) },
      );
      const bitmap = nativeImage.createFromBuffer(Buffer.from(screenshotData, 'base64')).toBitmap();
      let paintedPixels = 0;
      let transparentPixels = 0;
      for (let offset = 3; offset < bitmap.length; offset += 4) {
        if (bitmap[offset] < 16) transparentPixels += 1;
        else paintedPixels += 1;
      }
      const probe = details[probeByTarget[target.id]];
      probe.paintedPixels = paintedPixels;
      probe.transparentPixels = transparentPixels;
      await window.webContents.executeJavaScript(${JSON.stringify(restoreSource)}, true);
    }
    await new Promise((resolve, reject) => {
      process.stdout.write('OD_PPTX_PSEUDO_TEXT_CLIP:' + JSON.stringify(details) + '\\n', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
    window.destroy();
  }
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\\n');
  app.exit(1);
});
`,
  );

  try {
    const electronRelativePath = (await readFile(
      join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
      'utf8',
    )).trim();
    const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
    const electronArgs = [probeDir, '--no-sandbox', '--disable-gpu'];
    const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
    const args = process.platform === 'linux' ? ['-a', electronPath, ...electronArgs] : electronArgs;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let stderr: string;
    let stdout: string;
    try {
      ({ stderr, stdout } = await execFileP(command, args, { env, timeout: 10_000 }));
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(
        [
          failure.message,
          failure.stdout ? `stdout:\n${failure.stdout}` : '',
          failure.stderr ? `stderr:\n${failure.stderr}` : '',
        ].filter(Boolean).join('\n'),
      );
    }
    const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('OD_PPTX_PSEUDO_TEXT_CLIP:'));
    if (!marker) throw new Error(`Electron pseudo text-clip probe returned no result: ${stdout || stderr}`);
    return JSON.parse(marker.slice('OD_PPTX_PSEUDO_TEXT_CLIP:'.length)) as {
      standard: PseudoTextClipCaptureProbe;
      webkit: PseudoTextClipCaptureProbe;
    };
  } finally {
    await rm(probeDir, { force: true, recursive: true });
  }
}

async function runLayeredBackgroundMediaProbe(): Promise<LayeredBackgroundProbe> {
  const probeDir = await mkdtemp(join(tmpdir(), 'od-pptx-layered-probe-'));
  const invocationSource = `(captures => {
    const cjkPromotedFontFamily = ${cjkPromotedFontFamily.toString()};
    return (${runDomToPptx.toString()})(".slide", captures, "export-prepared");
  })`;
  const prepareSource = `(() => {
    const cjkPromotedFontFamily = ${cjkPromotedFontFamily.toString()};
    return (${runDomToPptx.toString()})(".slide", {}, "prepare");
  })()`;
  const collectSource = `(${collectLayeredPptxBackgroundTargets.toString()})(".slide")`;
  const isolateSource = `(id => {
    const restoreLayeredPptxBackgroundIsolation = ${restoreLayeredPptxBackgroundIsolation.toString()};
    return (${isolateLayeredPptxBackground.toString()})(".slide", id);
  })`;
  const restoreSource = `(${restoreLayeredPptxBackgroundIsolation.toString()})()`;
  await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
  await writeFile(
    join(probeDir, 'main.cjs'),
    `
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFile } = require('node:fs/promises');
const { gunzipSync, inflateRawSync } = require('node:zlib');

${ELECTRON_CAPTURE_UNTIL_PAINTED_SOURCE}

const fixtures = {
  supported: '<div class="supported"></div>',
  pseudo: '<div class="pseudo"></div>',
  pseudoShadow: '<div class="pseudo-shadow"></div>',
  blended: '<div class="blended-backdrop"></div><div class="blended"></div>',
  nestedBlended: '<div class="nested-blended-backdrop"><div class="nested-blended-texture"></div></div><div class="nested-blended"></div>',
  nestedCompositor: '<div class="nested-compositor"><div class="nested-compositor-intermediate"><div class="nested-compositor-child"></div></div></div>',
  paintedWrapper: '<div class="painted-wrapper-root"><div class="painted-wrapper-panel"><div class="painted-wrapper-child"></div><div class="painted-wrapper-label">Painted wrapper label</div></div></div>',
  nestedOpacity: '<div class="nested-opacity"><div class="nested-opacity-child"></div><div class="nested-opacity-label">Native nested opacity label</div><div class="nested-opacity-shape"></div></div>',
  solidCompositor: '<div class="solid-compositor"><div class="solid-compositor-child"></div><div class="solid-compositor-label">Solid compositor label</div></div>',
  ancestorBlend: '<div class="ancestor-blend-backdrop"></div><div class="ancestor-blend-context"><div class="ancestor-blend-child"></div></div>',
  ancestorClipForeground: '<div class="ancestor-clip-foreground"><div class="ancestor-clip-layer"></div><div class="ancestor-clip-label">Ancestor clipped foreground</div></div>',
  ancestorFilterForeground: '<div class="ancestor-filter-context"><div class="ancestor-filter-layer"></div><div class="ancestor-filter-label">Filtered ancestor label</div><div class="ancestor-filter-shape"></div></div>',
  ancestorMaskForeground: '<div class="ancestor-mask-foreground"><div class="ancestor-mask-layer"></div><div class="ancestor-mask-label">Ancestor masked foreground</div></div>',
  normalMaskedPseudo: '<div class="normal-masked-pseudo"></div>',
  compositedMaskedPseudo: '<div class="composited-masked-pseudo"></div>',
  maskedPseudoContent: '<div class="masked-pseudo-content"></div><div class="masked-pseudo-sibling">Native after mask</div>',
  paintOrderedBackdrop: '<div class="paint-above"></div><div class="paint-target"></div><div class="paint-below"></div>',
  replaced: '<img class="replaced" alt="" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2260%22%3E%3Crect width=%22120%22 height=%2260%22 fill=%22%23ff00ff%22/%3E%3C/svg%3E">',
  masked: '<div class="masked">Masked real content</div>',
  composited: '<div class="card"><div class="composited"></div><div class="label">Native label</div></div>',
  compositedPseudoContent: '<div class="composited-pseudo-content"></div>',
  clippedStripeBackdrop: '<div class="clipped-stripe-clip"><div class="clipped-stripe-backdrop"></div></div><div class="clipped-stripe-target"></div>',
  skipped: '<div class="display-none"><div class="hidden-layer"></div></div><div class="visibility-hidden"><div class="hidden-layer"></div></div><div class="zero-sized"></div><div class="off-slide"></div>',
  backdropFiltered: '<div class="filtered-backdrop"></div><div class="backdrop-filtered"></div>',
  backgroundBlendPseudo: '<div class="background-blend-pseudo"></div>',
  materializedBackgroundBlend: '<div class="materialized-background-blend"></div>',
  materializedOpaquePseudo: '<div class="materialized-opaque-pseudo"></div>',
  alignment: '<div class="alignment-layer"><div class="alignment-native">Alignment native</div></div>',
  realBlend: '<div class="real-blend-backdrop"></div><div class="real-blend-target">MM</div>',
  textClipStandard: '<div class="text-clip-standard">Standard gradient title</div>',
  textClipWebkit: '<div class="text-clip-webkit">WebKit gradient title</div>',
  selfFilteredPseudo: '<div class="self-filtered-pseudo"></div>',
  selfClipForeground: '<div class="self-clip-foreground">Self clipped foreground</div>',
  slideFilterForeground: '<div class="slide-filter-layer"></div><div class="slide-filter-label">Slide filtered label</div><div class="slide-filter-shape"></div>',
};
const styles = \`
  html, body { margin: 0; }
  .slide { position: relative; width: 320px; height: 180px; overflow: hidden; background: #0d1117; }
  .slide::before {
    content: 'Root layered pseudo content';
    position: absolute;
    inset: 0;
    z-index: 0;
    color: white;
    background-image: radial-gradient(circle at 20% 20%, rgba(88,166,255,.5), transparent 30%), radial-gradient(circle at 80% 80%, rgba(163,113,247,.5), transparent 30%);
  }
  [data-od-probe="alignment"] {
    width: 96px;
    height: 54px;
    margin-left: 36px;
    margin-top: 24px;
  }
  .alignment-layer {
    position: absolute;
    left: 10px;
    top: 12px;
    width: 76px;
    height: 34px;
    background-image: linear-gradient(rgb(44, 82, 130), rgb(44, 82, 130)), linear-gradient(transparent, transparent);
  }
  .alignment-native {
    position: absolute;
    inset: 0;
    color: white;
  }
  .card { position: absolute; left: 170px; top: 90px; width: 140px; height: 80px; background: #24506f; }
  .supported, .pseudo, .masked, .composited { position: absolute; width: 120px; height: 60px; }
  .label { position: absolute; right: 8px; bottom: 8px; color: white; }
  .supported {
    left: 16px;
    top: 12px;
    background-image: linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .pseudo { left: 176px; top: 12px; }
  .pseudo::after {
    content: 'Layered pseudo content';
    position: absolute;
    inset: 0;
    z-index: 5;
    border: 2px solid rgb(17, 34, 51);
    color: white;
    background-color: rgb(250, 0, 200);
    background-image: linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .pseudo-shadow {
    position: absolute;
    left: 206px;
    top: 112px;
    width: 96px;
    height: 44px;
  }
  .pseudo-shadow::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(0, 0, 255), rgb(0, 0, 255)), linear-gradient(transparent, transparent);
    box-shadow: inset 0 0 0 12px rgb(255, 0, 0);
  }
  .blended-backdrop {
    position: absolute;
    left: 120px;
    top: 64px;
    width: 84px;
    height: 44px;
  }
  .blended-backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(128, 192, 128), rgb(128, 192, 128)), linear-gradient(transparent, transparent);
  }
  .blended {
    position: absolute;
    left: 122px;
    top: 66px;
    width: 80px;
    height: 40px;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .nested-blended-backdrop,
  .nested-blended {
    position: absolute;
    left: 36px;
    top: 68px;
    width: 72px;
    height: 36px;
  }
  .nested-blended-backdrop { background: rgb(20, 40, 60); }
  .nested-blended-texture {
    position: absolute;
    inset: 0;
    background: rgb(128, 192, 128);
  }
  .nested-blended {
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .nested-opacity {
    position: absolute;
    left: 126px;
    top: 70px;
    width: 68px;
    height: 38px;
    opacity: .5;
    background-image: linear-gradient(rgb(100, 0, 0), rgb(100, 0, 0)), linear-gradient(transparent, transparent);
  }
  .nested-opacity-child {
    position: absolute;
    inset: 8px 10px;
    background-image: linear-gradient(rgba(0, 0, 200, .5), rgba(0, 0, 200, .5)), linear-gradient(transparent, transparent);
  }
  .nested-opacity-label {
    position: absolute;
    left: 1px;
    top: 1px;
    color: white;
    font: 1px/1px sans-serif;
  }
  .nested-opacity-shape {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 20px;
    height: 20px;
    background: rgb(0, 255, 0);
  }
  .nested-opacity-slide,
  .slide-root-mask {
    background: transparent;
  }
  .nested-opacity-slide::before,
  .slide-root-mask::before {
    content: none;
    display: none;
  }
  .slide-root-mask {
    background-image: linear-gradient(rgb(42, 84, 126), rgb(42, 84, 126)), linear-gradient(transparent, transparent);
    -webkit-mask-image: linear-gradient(to right, black 60%, transparent 100%);
    mask-image: linear-gradient(to right, black 60%, transparent 100%);
  }
  .slide-root-mask-content {
    position: absolute;
    left: 96px;
    top: 60px;
    width: 128px;
    height: 60px;
    box-sizing: border-box;
    border: 4px solid white;
    color: white;
    font: 700 18px/52px sans-serif;
    text-align: center;
  }
  .nested-compositor {
    position: absolute;
    left: 18px;
    top: 112px;
    width: 88px;
    height: 44px;
    opacity: .5;
  }
  .nested-compositor-intermediate {
    position: absolute;
    inset: 0;
    background: rgb(0, 200, 0);
    filter: brightness(.5);
  }
  .nested-compositor-child {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(200, 0, 0, .5), rgba(200, 0, 0, .5)), linear-gradient(transparent, transparent);
  }
  .painted-wrapper-root {
    position: absolute;
    left: 112px;
    top: 118px;
    width: 92px;
    height: 44px;
    opacity: .5;
  }
  .painted-wrapper-panel {
    width: 100%;
    height: 100%;
    background: rgb(0, 200, 0);
  }
  .painted-wrapper-child {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(200, 0, 0, .5), rgba(200, 0, 0, .5)), linear-gradient(transparent, transparent);
  }
  .painted-wrapper-label {
    position: absolute;
    inset: 0;
    color: white;
    font: 1px/1px sans-serif;
  }
  .solid-compositor {
    position: absolute;
    left: 116px;
    top: 68px;
    width: 74px;
    height: 42px;
    opacity: .5;
    background: rgb(201, 41, 42);
  }
  .solid-compositor-child {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(0, 0, 200, .5), rgba(0, 0, 200, .5)), linear-gradient(transparent, transparent);
  }
  .solid-compositor-label {
    position: absolute;
    inset: 0;
    color: white;
    font: 1px/1px sans-serif;
  }
  .ancestor-blend-backdrop,
  .ancestor-blend-context {
    position: absolute;
    left: 24px;
    top: 72px;
    width: 70px;
    height: 34px;
  }
  .ancestor-blend-backdrop { background: rgb(128, 192, 128); }
  .ancestor-blend-context { mix-blend-mode: multiply; }
  .ancestor-blend-child {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
  }
  .ancestor-filter-context {
    position: absolute;
    left: 72px;
    top: 54px;
    width: 176px;
    height: 72px;
    filter: brightness(.45);
  }
  .ancestor-filter-layer {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(40, 120, 220), rgb(40, 120, 220)), linear-gradient(transparent, transparent);
  }
  .ancestor-filter-label {
    position: absolute;
    left: 14px;
    top: 18px;
    z-index: 1;
    color: white;
    font: 700 16px/24px sans-serif;
  }
  .ancestor-filter-shape {
    position: absolute;
    right: 12px;
    bottom: 10px;
    z-index: 1;
    width: 26px;
    height: 26px;
    background: rgb(255, 80, 40);
  }
  .self-clip-foreground,
  .ancestor-clip-foreground,
  .ancestor-mask-foreground {
    position: absolute;
    left: 66px;
    top: 52px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font: 700 14px/20px sans-serif;
  }
  .self-clip-foreground {
    width: 178px;
    height: 72px;
    border: 5px solid rgb(10, 220, 240);
    background-image: linear-gradient(rgb(44, 92, 188), rgb(44, 92, 188)), linear-gradient(transparent, transparent);
    clip-path: polygon(0 0, 100% 0, 62% 100%, 0 100%);
  }
  .ancestor-clip-foreground {
    width: 184px;
    height: 78px;
    border: 5px solid rgb(255, 123, 45);
    clip-path: polygon(0 0, 100% 0, 68% 100%, 0 100%);
  }
  .ancestor-mask-foreground {
    width: 190px;
    height: 84px;
    border: 5px solid rgb(111, 240, 79);
    -webkit-mask-image: linear-gradient(to right, black 58%, transparent 58%);
  }
  .ancestor-clip-layer,
  .ancestor-mask-layer {
    position: absolute;
    inset: -5px;
    background-image: linear-gradient(rgb(154, 54, 188), rgb(154, 54, 188)), linear-gradient(transparent, transparent);
  }
  .ancestor-clip-label,
  .ancestor-mask-label {
    position: relative;
    z-index: 1;
  }
  .slide-filter-context {
    filter: brightness(.45);
    background: rgb(18, 42, 70);
  }
  .slide-filter-context::before {
    content: none;
    display: none;
  }
  .slide-filter-layer {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(40, 120, 220), rgb(40, 120, 220)), linear-gradient(transparent, transparent);
  }
  .slide-filter-label {
    position: absolute;
    left: 24px;
    top: 48px;
    z-index: 1;
    color: white;
    font: 700 22px/30px sans-serif;
  }
  .slide-filter-shape {
    position: absolute;
    right: 28px;
    bottom: 24px;
    z-index: 1;
    width: 42px;
    height: 42px;
    background: rgb(255, 80, 40);
  }
  .paint-above,
  .paint-target,
  .paint-below {
    position: absolute;
    left: 218px;
    top: 112px;
    width: 78px;
    height: 38px;
  }
  .paint-above { z-index: 2; background: rgb(255, 64, 64); }
  .paint-target {
    z-index: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .paint-below { z-index: -1; background: rgb(128, 192, 128); }
  .normal-masked-pseudo {
    position: absolute;
    left: 8px;
    top: 138px;
    width: 62px;
    height: 34px;
  }
  .normal-masked-pseudo::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255)), linear-gradient(transparent, transparent);
    -webkit-mask-image: linear-gradient(black, black);
    mask-image: linear-gradient(black, black);
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: 50% 50%;
    mask-size: 50% 50%;
  }
  .composited-masked-pseudo {
    position: absolute;
    left: 76px;
    top: 136px;
    width: 64px;
    height: 36px;
  }
  .composited-masked-pseudo::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(rgb(128, 192, 128), rgb(128, 192, 128));
    background-blend-mode: multiply;
    -webkit-mask-image: linear-gradient(black, black);
    mask-image: linear-gradient(black, black);
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: 50% 50%;
    mask-size: 50% 50%;
  }
  .masked-pseudo-content {
    position: absolute;
    left: 222px;
    top: 18px;
    width: 86px;
    height: 46px;
  }
  .masked-pseudo-content::before {
    content: 'Masked pseudo content';
    position: absolute;
    inset: 0;
    z-index: 0;
    box-sizing: border-box;
    border: 4px solid white;
    color: white;
    font: 10px sans-serif;
    background-image: linear-gradient(rgba(255, 255, 255, .25), rgba(255, 255, 255, .25)), linear-gradient(transparent, transparent);
    -webkit-mask-image: linear-gradient(to right, black 50%, transparent 50%);
    mask-image: linear-gradient(to right, black 50%, transparent 50%);
  }
  .masked-pseudo-sibling {
    position: absolute;
    left: 222px;
    top: 18px;
    z-index: 1;
    color: white;
  }
  .filtered-backdrop,
  .backdrop-filtered {
    position: absolute;
    left: 240px;
    top: 76px;
    width: 66px;
    height: 32px;
  }
  .filtered-backdrop { background: rgb(200, 40, 40); }
  .backdrop-filtered {
    background-image: linear-gradient(rgba(255, 255, 255, .2), rgba(255, 255, 255, .2)), linear-gradient(transparent, transparent);
    -webkit-backdrop-filter: invert(1);
    backdrop-filter: invert(1);
  }
  .background-blend-pseudo,
  .materialized-background-blend,
  .materialized-opaque-pseudo {
    position: absolute;
    top: 140px;
    background: white;
  }
  .background-blend-pseudo { left: 122px; width: 54px; height: 28px; }
  .materialized-background-blend { left: 180px; width: 58px; height: 30px; }
  .materialized-opaque-pseudo { left: 242px; width: 60px; height: 30px; }
  .background-blend-pseudo::after,
  .materialized-background-blend::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(rgb(128, 192, 128), rgb(128, 192, 128));
    background-blend-mode: multiply;
  }
  .materialized-background-blend::after { mix-blend-mode: multiply; }
  .materialized-opaque-pseudo::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgb(242, 50, 160);
    background-image: linear-gradient(rgba(128, 128, 128, .5), rgba(128, 128, 128, .5)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .composited-pseudo-content {
    position: absolute;
    left: 138px;
    top: 16px;
    width: 36px;
    height: 32px;
    background: rgb(128, 192, 128);
  }
  .composited-pseudo-content::after {
    content: 'BlendX';
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgb(240, 240, 240);
    color: white;
    font: 700 9px sans-serif;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(rgb(128, 192, 128), rgb(128, 192, 128));
    background-blend-mode: multiply;
    mix-blend-mode: multiply;
  }
  .real-blend-backdrop,
  .real-blend-target {
    position: absolute;
    left: 8px;
    top: 6px;
    width: 96px;
    height: 48px;
  }
  .real-blend-backdrop {
    z-index: 19;
    background: rgb(64, 192, 96);
  }
  .real-blend-target {
    z-index: 20;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 4px solid white;
    color: white;
    font: 700 30px/1 sans-serif;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .clipped-stripe-clip,
  .clipped-stripe-target {
    position: absolute;
    left: 112px;
    top: 66px;
    width: 96px;
    height: 48px;
  }
  .clipped-stripe-clip {
    -webkit-clip-path: polygon(18% 0, 22% 0, 22% 100%, 18% 100%);
  }
  .clipped-stripe-backdrop {
    position: absolute;
    inset: 0;
    background: rgb(128, 192, 128);
  }
  .clipped-stripe-target {
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .isolated-probe-slide {
    background: transparent;
  }
  .isolated-probe-slide::before {
    content: none;
    display: none;
  }
  .text-clip-standard,
  .text-clip-webkit {
    position: absolute;
    left: 40px;
    top: 58px;
    width: 240px;
    height: 64px;
    color: transparent;
    font: 700 28px/64px sans-serif;
    text-align: center;
    background-image: linear-gradient(90deg, rgb(255, 48, 96), rgb(32, 160, 255)), linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255));
  }
  .text-clip-standard {
    background-clip: text;
  }
  .text-clip-webkit {
    -webkit-background-clip: text;
  }
  .self-filtered-pseudo {
    position: absolute;
    left: 72px;
    top: 56px;
    width: 176px;
    height: 68px;
  }
  .self-filtered-pseudo::after {
    content: 'Filtered pseudo label';
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 5px solid rgb(255, 220, 80);
    color: white;
    font: 700 15px/20px sans-serif;
    background-image: linear-gradient(rgb(160, 48, 200), rgb(160, 48, 200)), linear-gradient(transparent, transparent);
    filter: brightness(.45);
  }
  .replaced {
    position: absolute;
    left: 160px;
    top: 102px;
    width: 150px;
    height: 60px;
    background-image: linear-gradient(90deg, rgba(52,199,89,.6), transparent), radial-gradient(circle, rgba(10,132,255,.5), transparent 65%);
  }
  .masked {
    left: 16px;
    top: 102px;
    width: 100px;
    height: 50px;
    background-image: linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px);
    background-size: 24px 24px;
    box-sizing: border-box;
    border: 4px solid white;
    color: white;
    font: 10px sans-serif;
    -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
    mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
  }
  .composited {
    inset: 10px;
    background-image: linear-gradient(#ff3b30, #ff3b30), linear-gradient(#ff3b30, #ff3b30);
    clip-path: polygon(0 0, 100% 0, 0 100%);
    filter: drop-shadow(0 10px 12px rgba(0, 0, 0, .45));
    opacity: .5;
    transform: translate(-12px, 0) rotate(8deg) scale(.9);
  }
  .hidden-layer, .zero-sized, .off-slide {
    position: absolute;
    width: 40px;
    height: 40px;
    background-image: linear-gradient(red, blue), radial-gradient(circle, white, black);
  }
  .display-none { display: none; }
  .visibility-hidden { visibility: hidden; }
  .zero-sized { width: 0; height: 0; }
  .off-slide { left: 400px; top: 20px; }
  .stacking-slide {
    background-color: rgb(20, 40, 60);
    background-image: linear-gradient(rgb(128, 192, 128), rgb(128, 192, 128));
  }
  .stacking-slide::before {
    content: '';
    position: absolute;
    left: 60px;
    top: 40px;
    width: 82px;
    height: 42px;
    z-index: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
  .grouped-backdrop-slide::before { content: none; display: none; }
  .grouped-backdrop,
  .grouped-context {
    position: absolute;
    left: 80px;
    top: 60px;
    width: 96px;
    height: 48px;
  }
  .grouped-backdrop { background: rgb(128, 192, 128); }
  .grouped-context { opacity: .5; }
  .grouped-blended-child {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(128, 128, 128), rgb(128, 128, 128)), linear-gradient(transparent, transparent);
    mix-blend-mode: multiply;
  }
\`;

function zipEntries(pptxBase64) {
  const archive = Buffer.from(pptxBase64, 'base64');
  let eocd = archive.length - 22;
  while (eocd >= 0 && archive.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('PPTX central directory was not found');
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid PPTX central directory entry');
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (data) entries.push({ data, name });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inspectMedia(pptxBase64) {
  return zipEntries(pptxBase64)
    .filter(({ name }) => /^ppt\\/media\\/.+\\.(?:gif|jpe?g|png|svg)$/.test(name))
    .map(({ data, name }) => ({ data, name, png: name.endsWith('.png') ? inspectPng(data, name) : null }));
}

function inspectPng(data, name) {
  const image = nativeImage.createFromBuffer(data);
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  let minAlpha = 255;
  let maxAlpha = 0;
  let opaquePixels = 0;
  let translucentPixels = 0;
  let transparentPixels = 0;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    const alpha = bitmap[offset];
    minAlpha = Math.min(minAlpha, alpha);
    maxAlpha = Math.max(maxAlpha, alpha);
    if (alpha < 16) transparentPixels += 1;
    else if (alpha < 240) translucentPixels += 1;
    else opaquePixels += 1;
  }
  const centerOffset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  const centerRgb = [bitmap[centerOffset + 2], bitmap[centerOffset + 1], bitmap[centerOffset]];
  const topLeftOffset = (Math.min(height - 1, 8) * width + Math.min(width - 1, 8)) * 4;
  const topLeftRgb = [bitmap[topLeftOffset + 2], bitmap[topLeftOffset + 1], bitmap[topLeftOffset]];
  return { centerRgb, height, maxAlpha, minAlpha, name, opaquePixels, topLeftRgb, translucentPixels, transparentPixels, width };
}

function comparePng(referenceData, exportedData) {
  const reference = nativeImage.createFromBuffer(referenceData);
  const exported = nativeImage.createFromBuffer(exportedData);
  const referenceSize = reference.getSize();
  const exportedSize = exported.getSize();
  if (referenceSize.width !== exportedSize.width || referenceSize.height !== exportedSize.height) {
    throw new Error('Cannot compare PNGs with different dimensions: ' + JSON.stringify({ referenceSize, exportedSize }));
  }
  const referenceBitmap = reference.toBitmap();
  const exportedBitmap = exported.toBitmap();
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;
  for (let offset = 0; offset < referenceBitmap.length; offset += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(referenceBitmap[offset + channel] - exportedBitmap[offset + channel]);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      totalChannelDelta += delta;
    }
  }
  const pixels = referenceSize.width * referenceSize.height;
  return {
    maxChannelDelta,
    meanChannelDelta: totalChannelDelta / (pixels * 4),
  };
}

function inspectPseudoLayerOrder(entries, mediaName) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide1.xml.rels')
    ?.data.toString('utf8') || '';
  const targetName = mediaName.split('/').pop() || '';
  const relationship = relationships
    .match(/<Relationship\\b[^>]*>/g)
    ?.find((entry) => entry.includes(targetName)) || '';
  const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
  return {
    background: relationshipId ? slideXml.indexOf('r:embed="' + relationshipId + '"') : -1,
    content: slideXml.indexOf('Layered pseudo content'),
  };
}

function inspectMaskedPseudoContentOrder(entries, mediaName) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide1.xml.rels')
    ?.data.toString('utf8') || '';
  const targetName = mediaName.split('/').pop() || '';
  const relationship = relationships
    .match(/<Relationship\\b[^>]*>/g)
    ?.find((entry) => entry.includes(targetName)) || '';
  const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
  return {
    image: relationshipId ? slideXml.indexOf('r:embed="' + relationshipId + '"') : -1,
    nativeContent: slideXml.indexOf('Masked pseudo content'),
    sibling: slideXml.indexOf('Native after mask'),
  };
}

function inspectNativeContent(entries, content) {
  return entries
    .filter(({ name }) => /^ppt\\/slides\\/slide\\d+\\.xml$/.test(name))
    .map(({ data }) => data.toString('utf8'))
    .join('')
    .indexOf(content);
}

function inspectPseudoNativeStyle(entries) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const shape = slideXml
    .match(/<p:sp>[\\s\\S]*?<\\/p:sp>/g)
    ?.find((entry) => entry.includes('Layered pseudo content')) || '';
  return {
    border: shape.indexOf('val="112233"'),
    content: shape.indexOf('Layered pseudo content'),
    fallbackFill: shape.indexOf('val="FA00C8"'),
  };
}

function inspectRootPseudoLayerOrder(entries, mediaName) {
  const order = inspectPseudoLayerOrder(entries, mediaName);
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  return {
    ...order,
    content: slideXml.indexOf('Root layered pseudo content'),
    // The slide's native fill and the explicit child shim can both carry this
    // color. The last occurrence is the topmost opaque background shape.
    slideBackground: slideXml.lastIndexOf('val="0D1117"'),
  };
}

function inspectSolidCompositorOrder(entries, mediaName) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide1.xml.rels')
    ?.data.toString('utf8') || '';
  const targetName = mediaName.split('/').pop() || '';
  const relationship = relationships
    .match(/<Relationship\\b[^>]*>/g)
    ?.find((entry) => entry.includes(targetName)) || '';
  const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
  return {
    image: relationshipId ? slideXml.indexOf('r:embed="' + relationshipId + '"') : -1,
    nativeContent: slideXml.indexOf('Solid compositor label'),
    nativeFill: slideXml.indexOf('val="C9292A"'),
  };
}

function inspectPaintedWrapperOrder(entries, mediaName) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide1.xml.rels')
    ?.data.toString('utf8') || '';
  const targetName = mediaName.split('/').pop() || '';
  const relationship = relationships
    .match(/<Relationship\\b[^>]*>/g)
    ?.find((entry) => entry.includes(targetName)) || '';
  const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
  return {
    image: relationshipId ? slideXml.indexOf('r:embed="' + relationshipId + '"') : -1,
    nativeContent: slideXml.indexOf('Painted wrapper label'),
    nativeFill: slideXml.indexOf('val="00C800"'),
  };
}

function inspectAlignmentGeometry(entries, mediaName) {
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide1.xml')?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide1.xml.rels')
    ?.data.toString('utf8') || '';
  const targetName = mediaName.split('/').pop() || '';
  const relationship = relationships
    .match(/<Relationship\\b[^>]*>/g)
    ?.find((entry) => entry.includes(targetName)) || '';
  const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
  const picture = relationshipId
    ? slideXml.match(/<p:pic>[\\s\\S]*?<\\/p:pic>/g)?.find((entry) => entry.includes('r:embed="' + relationshipId + '"')) || ''
    : '';
  const content = slideXml.match(/<p:sp>[\\s\\S]*?<\\/p:sp>/g)?.find((entry) => entry.includes('Alignment native')) || '';
  const geometry = (xml) => {
    const offset = xml.match(/<a:off x="(\\d+)" y="(\\d+)"\\/>/);
    const extent = xml.match(/<a:ext cx="(\\d+)" cy="(\\d+)"\\/>/);
    return offset && extent
      ? { height: Number(extent[2]), width: Number(extent[1]), x: Number(offset[1]), y: Number(offset[2]) }
      : null;
  };
  return { background: geometry(picture), content: geometry(content) };
}

function inspectPictureGeometry(entries, mediaName) {
  const targetName = mediaName.split('/').pop() || '';
  if (!targetName) return null;
  for (const relationshipEntry of entries.filter(({ name }) => /^ppt\\/slides\\/_rels\\/slide\\d+\\.xml\\.rels$/.test(name))) {
    const relationships = relationshipEntry.data.toString('utf8');
    const relationship = relationships
      .match(/<Relationship\\b[^>]*>/g)
      ?.find((entry) => entry.includes(targetName)) || '';
    const relationshipId = relationship.match(/\\bId="([^"]+)"/)?.[1] || '';
    if (!relationshipId) continue;
    const slideName = relationshipEntry.name
      .replace('ppt/slides/_rels/', 'ppt/slides/')
      .replace('.xml.rels', '.xml');
    const slideXml = entries.find(({ name }) => name === slideName)?.data.toString('utf8') || '';
    const picture = slideXml
      .match(/<p:pic>[\\s\\S]*?<\\/p:pic>/g)
      ?.find((entry) => entry.includes('r:embed="' + relationshipId + '"')) || '';
    const offset = picture.match(/<a:off x="(\\d+)" y="(\\d+)"\\/>/);
    const extent = picture.match(/<a:ext cx="(\\d+)" cy="(\\d+)"\\/>/);
    if (offset && extent) {
      return { height: Number(extent[2]), width: Number(extent[1]), x: Number(offset[1]), y: Number(offset[2]) };
    }
  }
  return null;
}

function capturedMediaNames(entries, capture) {
  const slideNumber = capture.slideIndex + 1;
  const slideXml = entries.find(({ name }) => name === 'ppt/slides/slide' + slideNumber + '.xml')
    ?.data.toString('utf8') || '';
  const relationships = entries
    .find(({ name }) => name === 'ppt/slides/_rels/slide' + slideNumber + '.xml.rels')
    ?.data.toString('utf8') || '';
  const emuPerPixel = (10 * 914400) / 320;
  const expected = {
    height: Math.round(capture.height * emuPerPixel),
    width: Math.round(capture.width * emuPerPixel),
    x: Math.round(capture.left * emuPerPixel),
    y: Math.round(capture.top * emuPerPixel),
  };
  return (slideXml.match(/<p:pic>[\\s\\S]*?<\\/p:pic>/g) || []).flatMap((picture) => {
    const offset = picture.match(/<a:off x="(\\d+)" y="(\\d+)"\\/>/);
    const extent = picture.match(/<a:ext cx="(\\d+)" cy="(\\d+)"\\/>/);
    if (!offset || !extent) return [];
    const actual = {
      height: Number(extent[2]),
      width: Number(extent[1]),
      x: Number(offset[1]),
      y: Number(offset[2]),
    };
    if (Object.keys(expected).some((key) => Math.abs(actual[key] - expected[key]) > 1)) return [];
    const relationshipId = picture.match(/r:embed="([^"]+)"/)?.[1] || '';
    const relationship = (relationships.match(/<Relationship\\b[^>]*>/g) || [])
      .find((entry) => entry.includes('Id="' + relationshipId + '"')) || '';
    const target = relationship.match(/Target="[^"]*\\/([^/"]+)"/)?.[1] || '';
    return target ? ['ppt/media/' + target] : [];
  });
}

let probeStage = 'startup';
app.whenReady().then(async () => {
  const bundle = gunzipSync(await readFile(process.env.OD_PPTX_LAYER_BUNDLE)).toString('utf8');
  const window = new BrowserWindow({
    height: 900,
    show: false,
    useContentSize: true,
    width: 800,
    webPreferences: { contextIsolation: false, nodeIntegration: false, sandbox: true },
  });
  let probeResult;
  try {
    const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + styles + '</style></head><body></body></html>';
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Match the production render-window lifecycle so Chromium paints frames
    // under Linux/Xvfb instead of suspending rAF for a hidden window.
    window.setOpacity(0);
    window.showInactive();
    async function waitForPaintedFrames() {
      await window.webContents.executeJavaScript(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );
    }
    await window.webContents.executeJavaScript(bundle, true);
    const dbg = window.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Page.enable');
    await dbg.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    // Keep one slide and one real exporter invocation: serial slide conversion
    // made this probe hit its Linux workspace-test timeout under concurrent load.
    const isolatedFixtureNames = new Set([
      'ancestorClipForeground',
      'ancestorFilterForeground',
      'ancestorMaskForeground',
      'clippedStripeBackdrop',
      'nestedOpacity',
      'selfFilteredPseudo',
      'selfClipForeground',
      'slideFilterForeground',
      'textClipStandard',
      'textClipWebkit',
    ]);
    const fixtureEntries = Object.entries(fixtures).filter(([name]) => !isolatedFixtureNames.has(name));
    const fixtureMarkup = fixtureEntries
      .map(([name, markup]) => '<div data-od-probe="' + name + '">' + markup + '</div>')
      .join('');
    const paintClipForegroundSlides = [
      'selfClipForeground',
      'ancestorClipForeground',
      'ancestorMaskForeground',
    ].map((name) => '<section class="slide isolated-probe-slide"><div data-od-probe="' + name + '">'
      + fixtures[name]
      + '</div></section>')
      .join('');
    const slide = '<section class="slide">' + fixtureMarkup + '</section>'
      + '<section class="slide isolated-probe-slide"><div data-od-probe="clippedStripeBackdrop">'
      + fixtures.clippedStripeBackdrop
      + '</div></section>'
      + '<section class="slide stacking-slide" data-od-probe="stackingSlide"></section>'
      + '<section class="slide grouped-backdrop-slide" data-od-probe="groupedBackdrop">'
      + '<div class="grouped-backdrop"></div><div class="grouped-context"><div class="grouped-blended-child"></div></div>'
      + '</section>'
      + '<section class="slide nested-opacity-slide"><div data-od-probe="nestedOpacity">'
      + fixtures.nestedOpacity
      + '</div></section>'
      + '<section class="slide isolated-probe-slide"><div data-od-probe="textClipStandard">'
      + fixtures.textClipStandard
      + '</div></section>'
      + '<section class="slide isolated-probe-slide"><div data-od-probe="textClipWebkit">'
      + fixtures.textClipWebkit
      + '</div></section>'
      + '<section class="slide isolated-probe-slide"><div data-od-probe="ancestorFilterForeground">'
      + fixtures.ancestorFilterForeground
      + '</div></section>'
      + '<section class="slide isolated-probe-slide"><div data-od-probe="selfFilteredPseudo">'
      + fixtures.selfFilteredPseudo
      + '</div></section>'
      + '<section class="slide slide-filter-context" data-od-probe="slideFilterForeground">'
      + fixtures.slideFilterForeground
      + '</section>'
      + '<section class="slide slide-root-mask" data-od-probe="slideRootMask">'
      + '<div class="slide-root-mask-content">Slide root paint</div></section>'
      + paintClipForegroundSlides;
    await window.webContents.executeJavaScript('document.body.innerHTML = ' + JSON.stringify(slide), true);
    await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
    probeStage = 'normalize export DOM';
    const prepared = await window.webContents.executeJavaScript(${JSON.stringify(prepareSource)}, true);
    if (!prepared?.prepared || prepared.error) throw new Error(prepared?.error || 'PPTX DOM normalization failed');
    await waitForPaintedFrames();
    async function captureChromiumReference(selector, name, padding = 0) {
      return captureUntilPainted(async () => {
        const capture = await window.webContents.executeJavaScript(
          '(() => { const element = document.querySelector(' + JSON.stringify(selector) + '); const rect = element.getBoundingClientRect(); const slideRect = element.closest(".slide").getBoundingClientRect(); const left = Math.max(slideRect.left, rect.left - ' + padding + '); const top = Math.max(slideRect.top, rect.top - ' + padding + '); const right = Math.min(slideRect.right, rect.right + ' + padding + '); const bottom = Math.min(slideRect.bottom, rect.bottom + ' + padding + '); return { geometry: { height: bottom - top, width: right - left, x: left + window.scrollX, y: top + window.scrollY }, pixelRatio: window.devicePixelRatio }; })()',
          true,
        );
        await waitForPaintedFrames();
        const screenshot = await dbg.sendCommand('Page.captureScreenshot', {
          captureBeyondViewport: true,
          clip: { ...capture.geometry, scale: 2 / capture.pixelRatio },
          format: 'png',
          fromSurface: true,
        });
        const data = Buffer.from(screenshot.data, 'base64');
        return { data, png: inspectPng(data, name) };
      }, (result) => pngInspectionHasPaint(result.png), { label: name, onRetry: waitForPaintedFrames });
    }
    const compositedPseudoContent = await captureChromiumReference(
      '.composited-pseudo-content',
      'chromium-composited-pseudo-content.png',
    );
    const compositedPseudoContentChromiumData = compositedPseudoContent.data;
    const compositedPseudoContentChromium = compositedPseudoContent.png;
    const realBlend = await captureChromiumReference('.real-blend-target', 'chromium-real-blend.png');
    const realBlendChromiumData = realBlend.data;
    const realBlendChromium = realBlend.png;
    const nestedOpacity = await captureChromiumReference('.nested-opacity', 'chromium-nested-opacity.png');
    const nestedOpacityChromiumData = nestedOpacity.data;
    const nestedOpacityChromium = nestedOpacity.png;
    const textClipStandardChromium = await captureChromiumReference(
      '.text-clip-standard',
      'chromium-text-clip-standard.png',
    );
    const textClipWebkitChromium = await captureChromiumReference(
      '.text-clip-webkit',
      'chromium-text-clip-webkit.png',
    );
    const ancestorFilterForegroundChromium = await captureChromiumReference(
      '.ancestor-filter-context',
      'chromium-ancestor-filter-foreground.png',
      64,
    );
    const selfClipForegroundChromium = await captureChromiumReference(
      '.self-clip-foreground',
      'chromium-self-clip-foreground.png',
    );
    const ancestorClipForegroundChromium = await captureChromiumReference(
      '.ancestor-clip-foreground',
      'chromium-ancestor-clip-foreground.png',
    );
    const ancestorMaskForegroundChromium = await captureChromiumReference(
      '.ancestor-mask-foreground',
      'chromium-ancestor-mask-foreground.png',
    );
    const clippedStripeBackdropChromium = await captureChromiumReference(
      '.clipped-stripe-target',
      'chromium-clipped-stripe-backdrop.png',
    );
    const selfFilteredPseudoChromium = await captureChromiumReference(
      '.self-filtered-pseudo',
      'chromium-self-filtered-pseudo.png',
      64,
    );
    const slideFilterForegroundChromium = await captureChromiumReference(
      '.slide-filter-context',
      'chromium-slide-filter-foreground.png',
    );
    const targets = await window.webContents.executeJavaScript(${JSON.stringify(collectSource)}, true);
    const captures = {};
    const targetCounts = await window.webContents.executeJavaScript(
      'Object.fromEntries(Array.from(document.querySelectorAll("[data-od-probe]"), (probe) => [probe.getAttribute("data-od-probe"), probe.querySelectorAll("[data-od-pptx-layer-capture-id]").length]))',
      true,
    );
    const probeByTarget = await window.webContents.executeJavaScript(
      'Object.fromEntries(Array.from(document.querySelectorAll("[data-od-pptx-layer-capture-id]"), (target) => [target.getAttribute("data-od-pptx-layer-capture-id"), target.closest("[data-od-probe]").getAttribute("data-od-probe")]))',
      true,
    );
    const devicePixelRatio = await window.webContents.executeJavaScript('window.devicePixelRatio || 1', true);
    for (const target of targets) {
      probeStage = 'isolate target ' + target.id;
      const geometry = await window.webContents.executeJavaScript(${JSON.stringify(isolateSource)} + '(' + JSON.stringify(target.id) + ')', true);
      await waitForPaintedFrames();
      const screenshotData = await captureUntilPainted(
        async () => {
          const screenshot = await dbg.sendCommand('Page.captureScreenshot', {
            captureBeyondViewport: true,
            clip: {
              x: geometry.pageX,
              y: geometry.pageY,
              width: geometry.width,
              height: geometry.height,
              scale: Math.min(2, 2 / devicePixelRatio),
            },
            format: 'png',
            fromSurface: true,
          });
          if (!screenshot.data) throw new Error('Chromium returned no capture for ' + target.id);
          return screenshot.data;
        },
        (data) => pngBufferHasPaint(Buffer.from(data, 'base64')),
        { label: target.id, onRetry: waitForPaintedFrames },
      );
      captures[target.id] = { ...geometry, dataUrl: 'data:image/png;base64,' + screenshotData };
      await window.webContents.executeJavaScript(${JSON.stringify(restoreSource)}, true);
    }
    probeStage = 'export deck';
    const exported = await window.webContents.executeJavaScript(${JSON.stringify(invocationSource)} + '(' + JSON.stringify(captures) + ')', true);
    if (!exported || exported.error || !exported.b64) throw new Error(exported?.error || 'PPTX export returned no bytes');
    const captureCounts = await window.webContents.executeJavaScript(
      'Object.fromEntries(Array.from(document.querySelectorAll("[data-od-probe]"), (probe) => [probe.getAttribute("data-od-probe"), probe.querySelectorAll("[data-od-pptx-layered-bg]").length]))',
      true,
    );
    const rootPseudoCaptureCount = await window.webContents.executeJavaScript(
      'Array.from(document.querySelector(".slide").children).filter((child) => child.getAttribute("data-od-pptx-pseudo") === "::before").length',
      true,
    );
    const entries = zipEntries(exported.b64);
    const media = inspectMedia(exported.b64);
    const usedMedia = new Set();
    const result = {};
    for (const [targetId, capture] of Object.entries(captures)) {
      const candidates = capturedMediaNames(entries, capture).filter((name) => !usedMedia.has(name));
      const capturedPng = Buffer.from(capture.dataUrl.slice(capture.dataUrl.indexOf(',') + 1), 'base64');
      const rankedCandidates = candidates.flatMap((name) => {
        const image = media.find(({ name: mediaName, png }) => mediaName === name && png);
        if (!image?.png) return [];
        const reference = nativeImage.createFromBuffer(capturedPng).resize({
          height: image.png.height,
          quality: 'best',
          width: image.png.width,
        }).toPNG();
        return [{ image, score: comparePng(reference, image.data).meanChannelDelta }];
      }).sort((left, right) => left.score - right.score);
      const exportedImage = rankedCandidates[0]?.image;
      if (!exportedImage) {
        throw new Error('PPTX did not contain geometry-matched capture media for ' + targetId + ': ' + JSON.stringify({
          candidates,
          capture: { height: capture.height, width: capture.width },
          media: media.map(({ name, png }) => ({ name, height: png?.height, width: png?.width })),
          probe: probeByTarget[targetId],
        }));
      }
      const name = probeByTarget[targetId];
      usedMedia.add(exportedImage.name);
      result[name] = {
        captures: captureCounts[name],
        media: [exportedImage.name],
        pngs: exportedImage.png ? [exportedImage.png] : [],
      };
    }
    if (!result.normalMaskedPseudo) {
      result.normalMaskedPseudo = {
        captures: captureCounts.normalMaskedPseudo,
        media: [],
        pngs: [],
      };
    }
    if (!result.blended) {
      const blendedMedia = media.find(({ name, png }) =>
        !usedMedia.has(name)
        && (png?.width === 80 || png?.width === 160)
        && (png?.height === 40 || png?.height === 80));
      if (blendedMedia) usedMedia.add(blendedMedia.name);
      result.blended = {
        captures: captureCounts.blended,
        media: blendedMedia ? [blendedMedia.name] : [],
        pngs: blendedMedia?.png ? [blendedMedia.png] : [],
      };
    }
    const replacedCapture = Object.entries(captures)
      .find(([targetId]) => probeByTarget[targetId] === 'replaced')?.[1];
    const replacedForegroundMedia = replacedCapture ? media.filter(({ name, png }) =>
      !usedMedia.has(name)
      && Math.abs((png?.width ?? 0) - replacedCapture.width * 2) <= 1
      && Math.abs((png?.height ?? 0) - replacedCapture.height * 2) <= 1
      && png.opaquePixels === png.width * png.height) : [];
    replacedForegroundMedia.forEach(({ name }) => usedMedia.add(name));
    result.replacedForegroundMedia = replacedForegroundMedia.map(({ name }) => name);
    const maskedPseudoContentCapture = Object.entries(captures)
      .find(([targetId]) => probeByTarget[targetId] === 'maskedPseudoContent')?.[1];
    result.maskedPseudoContentMediaCount = maskedPseudoContentCapture
      ? media.filter(({ png }) => png
        && [maskedPseudoContentCapture.width, maskedPseudoContentCapture.width * 2]
          .some((width) => Math.abs(png.width - width) <= 1)
        && [maskedPseudoContentCapture.height, maskedPseudoContentCapture.height * 2]
          .some((height) => Math.abs(png.height - height) <= 1)).length
      : 0;
    if (!result.backgroundBlendPseudo) {
      const backgroundBlendPseudoMedia = media.find(({ name, png }) =>
        !usedMedia.has(name) && png?.width === 54 && png?.height === 28);
      if (backgroundBlendPseudoMedia) usedMedia.add(backgroundBlendPseudoMedia.name);
      result.backgroundBlendPseudo = {
        captures: captureCounts.backgroundBlendPseudo,
        media: backgroundBlendPseudoMedia ? [backgroundBlendPseudoMedia.name] : [],
        pngs: backgroundBlendPseudoMedia?.png ? [backgroundBlendPseudoMedia.png] : [],
      };
    }
    const pseudoShadowMedia = media.find(({ name, png }) =>
      !usedMedia.has(name)
      && png?.topLeftRgb?.every((channel, index) => channel === [255, 0, 0][index])
      && png?.centerRgb?.every((channel, index) => channel === [0, 0, 255][index]));
    if (pseudoShadowMedia) usedMedia.add(pseudoShadowMedia.name);
    result.pseudoShadow = {
      captures: captureCounts.pseudoShadow,
      media: pseudoShadowMedia ? [pseudoShadowMedia.name] : [],
      pngs: pseudoShadowMedia?.png ? [pseudoShadowMedia.png] : [],
    };
    const pseudoMedia = media.filter(
      ({ name, png }) => !usedMedia.has(name) && (png?.width ?? 0) > 100 && (png?.height ?? 0) > 40
        && (png?.width ?? 0) < 300 && (png?.height ?? 0) < 170,
    );
    result.pseudo = {
      captures: captureCounts.pseudo,
      media: pseudoMedia.map(({ name }) => name).sort(),
      pngs: pseudoMedia.flatMap(({ png }) => png ? [png] : []),
    };
    result.pseudoLayerOrder = inspectPseudoLayerOrder(entries, pseudoMedia[0]?.name || '');
    result.pseudoNativeStyle = inspectPseudoNativeStyle(entries);
    result.maskedPseudoContentOrder = inspectMaskedPseudoContentOrder(
      entries,
      result.maskedPseudoContent?.media?.[0] || '',
    );
    result.nestedOpacityChromium = nestedOpacityChromium;
    const nestedOpacityMedia = media.find(({ name }) => name === result.nestedOpacity?.media?.[0]);
    if (!nestedOpacityMedia) throw new Error('Missing exported nested opacity media');
    result.nestedOpacityChromiumComparison = comparePng(nestedOpacityChromiumData, nestedOpacityMedia.data);
    result.nestedOpacityNativeContent = inspectNativeContent(entries, 'Native nested opacity label');
    result.nestedOpacityNativeShape = inspectNativeContent(entries, 'val="00FF00"');
    result.nestedCompositorNativeFill = inspectNativeContent(entries, 'val="00C800"');
    result.paintedWrapperOrder = inspectPaintedWrapperOrder(
      entries,
      result.paintedWrapper?.media?.[0] || '',
    );
    result.maskedNativeContent = inspectNativeContent(entries, 'Masked real content');
    result.compositedPseudoContentChromium = compositedPseudoContentChromium;
    const compositedPseudoContentMedia = media.find(
      ({ name }) => name === result.compositedPseudoContent?.media?.[0],
    );
    if (!compositedPseudoContentMedia) throw new Error('Missing exported composited pseudo media');
    result.compositedPseudoContentChromiumComparison = comparePng(
      compositedPseudoContentChromiumData,
      compositedPseudoContentMedia.data,
    );
    result.compositedPseudoContentNativeContent = inspectNativeContent(entries, 'BlendX');
    result.realBlendChromium = realBlendChromium;
    const realBlendMedia = media.find(({ name }) => name === result.realBlend?.media?.[0]);
    if (!realBlendMedia) throw new Error('Missing exported real blend media');
    result.realBlendChromiumComparison = comparePng(realBlendChromiumData, realBlendMedia.data);
    result.realBlendNativeContent = inspectNativeContent(entries, 'MM');
    result.textClipStandardChromium = textClipStandardChromium.png;
    const textClipStandardMedia = media.find(({ name }) => name === result.textClipStandard?.media?.[0]);
    if (!textClipStandardMedia) throw new Error('Missing exported standard text-clip media');
    result.textClipStandardChromiumComparison = comparePng(
      textClipStandardChromium.data,
      textClipStandardMedia.data,
    );
    result.textClipStandardNativeContent = inspectNativeContent(entries, 'Standard gradient title');
    result.textClipWebkitChromium = textClipWebkitChromium.png;
    const textClipWebkitMedia = media.find(({ name }) => name === result.textClipWebkit?.media?.[0]);
    if (!textClipWebkitMedia) throw new Error('Missing exported WebKit text-clip media');
    result.textClipWebkitChromiumComparison = comparePng(
      textClipWebkitChromium.data,
      textClipWebkitMedia.data,
    );
    result.textClipWebkitNativeContent = inspectNativeContent(entries, 'WebKit gradient title');
    result.ancestorFilterForegroundChromium = ancestorFilterForegroundChromium.png;
    const ancestorFilterForegroundMedia = media.find(
      ({ name }) => name === result.ancestorFilterForeground?.media?.[0],
    );
    if (!ancestorFilterForegroundMedia) throw new Error('Missing exported ancestor-filter media');
    result.ancestorFilterForegroundChromiumComparison = comparePng(
      ancestorFilterForegroundChromium.data,
      ancestorFilterForegroundMedia.data,
    );
    result.ancestorFilterForegroundNativeContent = inspectNativeContent(entries, 'Filtered ancestor label');
    function paintClipForegroundResult(name, chromium, content, borderColor) {
      const exported = result[name];
      const exportedMedia = media.find(({ name: mediaName }) => mediaName === exported?.media?.[0]);
      if (!exportedMedia) throw new Error('Missing exported ' + name + ' media');
      return {
        chromium: chromium.png,
        comparison: comparePng(chromium.data, exportedMedia.data),
        exported,
        nativeBorder: inspectNativeContent(entries, 'val="' + borderColor + '"'),
        nativeContent: inspectNativeContent(entries, content),
      };
    }
    result.selfClipForeground = paintClipForegroundResult(
      'selfClipForeground',
      selfClipForegroundChromium,
      'Self clipped foreground',
      '0ADCF0',
    );
    result.ancestorClipForeground = paintClipForegroundResult(
      'ancestorClipForeground',
      ancestorClipForegroundChromium,
      'Ancestor clipped foreground',
      'FF7B2D',
    );
    result.ancestorMaskForeground = paintClipForegroundResult(
      'ancestorMaskForeground',
      ancestorMaskForegroundChromium,
      'Ancestor masked foreground',
      '6FF04F',
    );
    result.clippedStripeBackdropChromium = clippedStripeBackdropChromium.png;
    const clippedStripeBackdropMedia = media.find(
      ({ name }) => name === result.clippedStripeBackdrop?.media?.[0],
    );
    if (!clippedStripeBackdropMedia) throw new Error('Missing exported clipped-stripe media');
    result.clippedStripeBackdropChromiumComparison = comparePng(
      clippedStripeBackdropChromium.data,
      clippedStripeBackdropMedia.data,
    );
    result.selfFilteredPseudoChromium = selfFilteredPseudoChromium.png;
    const selfFilteredPseudoMedia = media.find(({ name }) => name === result.selfFilteredPseudo?.media?.[0]);
    if (!selfFilteredPseudoMedia) throw new Error('Missing exported self-filtered pseudo media');
    result.selfFilteredPseudoChromiumComparison = comparePng(
      selfFilteredPseudoChromium.data,
      selfFilteredPseudoMedia.data,
    );
    result.selfFilteredPseudoNativeContent = inspectNativeContent(entries, 'Filtered pseudo label');
    result.slideFilterForegroundChromium = slideFilterForegroundChromium.png;
    const slideFilterForegroundMedia = media.find(
      ({ name }) => name === result.slideFilterForeground?.media?.[0],
    );
    if (!slideFilterForegroundMedia) throw new Error('Missing exported slide-filter media');
    result.slideFilterForegroundChromiumComparison = comparePng(
      slideFilterForegroundChromium.data,
      slideFilterForegroundMedia.data,
    );
    result.slideFilterForegroundNativeContent = inspectNativeContent(entries, 'Slide filtered label');
    result.materializedOpaquePseudoNativeFill = inspectNativeContent(entries, 'val="F232A0"');
    const rootPseudoMedia = media.filter(
      ({ name, png }) => !usedMedia.has(name) && (png?.width ?? 0) >= 300 && (png?.height ?? 0) >= 170,
    ).filter(
      ({ name }) => inspectPseudoLayerOrder(entries, name).background >= 0,
    );
    result.rootPseudo = {
      captures: rootPseudoCaptureCount,
      media: rootPseudoMedia.map(({ name }) => name).sort(),
      pngs: rootPseudoMedia.flatMap(({ png }) => png ? [png] : []),
    };
    result.rootPseudoLayerOrder = inspectRootPseudoLayerOrder(entries, rootPseudoMedia[0]?.name || '');
    result.solidCompositorOrder = inspectSolidCompositorOrder(
      entries,
      result.solidCompositor?.media?.[0] || '',
    );
    result.alignmentGeometry = inspectAlignmentGeometry(entries, result.alignment?.media?.[0] || '');
    result.slideRootMaskGeometry = inspectPictureGeometry(entries, result.slideRootMask?.media?.[0] || '');
    result.slideRootMaskNativeContent = inspectNativeContent(entries, 'Slide root paint');
    result.skippedTargets = targetCounts.skipped;
    probeResult = result;
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
    window.destroy();
  }
  await new Promise((resolve, reject) => {
    process.stdout.write('OD_PPTX_LAYER_PROBE:' + JSON.stringify(probeResult) + '\\n', (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  // dom-to-pptx can leave renderer work queued after the result is complete.
  // Exit the disposable probe explicitly instead of waiting for Electron's
  // graceful shutdown to drain those test-only handles under Linux CI load.
  app.exit(0);
}).catch((error) => {
  process.stderr.write(probeStage + ': ' + String(error && error.stack ? error.stack : error) + '\\n');
  app.exit(1);
});
`,
  );

  try {
    const electronRelativePath = (await readFile(
      join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
      'utf8',
    )).trim();
    const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
    const electronArgs = [probeDir, '--no-sandbox', '--disable-gpu'];
    const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
    const args = process.platform === 'linux' ? ['-a', electronPath, ...electronArgs] : electronArgs;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OD_PPTX_LAYER_BUNDLE: join(desktopRoot, 'vendor', 'dom-to-pptx', 'dom-to-pptx.bundle.js.gz'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    let stderr: string;
    let stdout: string;
    try {
      ({ stderr, stdout } = await execFileP(command, args, { env, timeout: 20_000 }));
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(
        [
          failure.message,
          failure.stdout ? `stdout:\n${failure.stdout}` : '',
          failure.stderr ? `stderr:\n${failure.stderr}` : '',
        ].filter(Boolean).join('\n'),
      );
    }
    const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('OD_PPTX_LAYER_PROBE:'));
    if (!marker) throw new Error(`Electron renderer probe returned no result: ${stdout || stderr}`);
    return parseLayeredBackgroundProbe(JSON.parse(marker.slice('OD_PPTX_LAYER_PROBE:'.length)));
  } finally {
    await rm(probeDir, { force: true, recursive: true });
  }
}

function parseLayeredBackgroundProbe(value: unknown): LayeredBackgroundProbe {
  if (
    typeof value !== 'object'
    || value === null
    || !('ancestorBlend' in value)
    || !('ancestorClipForeground' in value)
    || !('ancestorFilterForeground' in value)
    || !('ancestorFilterForegroundChromium' in value)
    || typeof value.ancestorFilterForegroundChromium !== 'object'
    || value.ancestorFilterForegroundChromium === null
    || !('ancestorFilterForegroundChromiumComparison' in value)
    || typeof value.ancestorFilterForegroundChromiumComparison !== 'object'
    || value.ancestorFilterForegroundChromiumComparison === null
    || !('ancestorFilterForegroundNativeContent' in value)
    || typeof value.ancestorFilterForegroundNativeContent !== 'number'
    || !('ancestorMaskForeground' in value)
    || !('blended' in value)
    || !('backdropFiltered' in value)
    || !('backgroundBlendPseudo' in value)
    || !('materializedBackgroundBlend' in value)
    || !('materializedOpaquePseudo' in value)
    || !('materializedOpaquePseudoNativeFill' in value)
    || typeof value.materializedOpaquePseudoNativeFill !== 'number'
    || !('nestedBlended' in value)
    || !('nestedCompositor' in value)
    || !('nestedCompositorNativeFill' in value)
    || typeof value.nestedCompositorNativeFill !== 'number'
    || !('nestedOpacity' in value)
    || !('nestedOpacityChromium' in value)
    || typeof value.nestedOpacityChromium !== 'object'
    || value.nestedOpacityChromium === null
    || !('nestedOpacityChromiumComparison' in value)
    || typeof value.nestedOpacityChromiumComparison !== 'object'
    || value.nestedOpacityChromiumComparison === null
    || !('nestedOpacityNativeContent' in value)
    || typeof value.nestedOpacityNativeContent !== 'number'
    || !('nestedOpacityNativeShape' in value)
    || typeof value.nestedOpacityNativeShape !== 'number'
    || !('normalMaskedPseudo' in value)
    || !('paintOrderedBackdrop' in value)
    || !('paintedWrapper' in value)
    || !('paintedWrapperOrder' in value)
    || typeof value.paintedWrapperOrder !== 'object'
    || value.paintedWrapperOrder === null
    || !('image' in value.paintedWrapperOrder)
    || typeof value.paintedWrapperOrder.image !== 'number'
    || !('nativeContent' in value.paintedWrapperOrder)
    || typeof value.paintedWrapperOrder.nativeContent !== 'number'
    || !('nativeFill' in value.paintedWrapperOrder)
    || typeof value.paintedWrapperOrder.nativeFill !== 'number'
    || !('alignmentGeometry' in value)
    || typeof value.alignmentGeometry !== 'object'
    || value.alignmentGeometry === null
    || !('supported' in value)
    || !('pseudo' in value)
    || !('replaced' in value)
    || !('replacedForegroundMedia' in value)
    || !Array.isArray(value.replacedForegroundMedia)
    || !value.replacedForegroundMedia.every((item) => typeof item === 'string')
    || !('masked' in value)
    || !('maskedNativeContent' in value)
    || typeof value.maskedNativeContent !== 'number'
    || !('maskedPseudoContent' in value)
    || !('maskedPseudoContentMediaCount' in value)
    || typeof value.maskedPseudoContentMediaCount !== 'number'
    || !('maskedPseudoContentOrder' in value)
    || typeof value.maskedPseudoContentOrder !== 'object'
    || value.maskedPseudoContentOrder === null
    || !('image' in value.maskedPseudoContentOrder)
    || typeof value.maskedPseudoContentOrder.image !== 'number'
    || !('nativeContent' in value.maskedPseudoContentOrder)
    || typeof value.maskedPseudoContentOrder.nativeContent !== 'number'
    || !('sibling' in value.maskedPseudoContentOrder)
    || typeof value.maskedPseudoContentOrder.sibling !== 'number'
    || !('composited' in value)
    || !('compositedMaskedPseudo' in value)
    || !('compositedPseudoContent' in value)
    || !('compositedPseudoContentChromium' in value)
    || typeof value.compositedPseudoContentChromium !== 'object'
    || value.compositedPseudoContentChromium === null
    || !('compositedPseudoContentChromiumComparison' in value)
    || typeof value.compositedPseudoContentChromiumComparison !== 'object'
    || value.compositedPseudoContentChromiumComparison === null
    || !('compositedPseudoContentNativeContent' in value)
    || typeof value.compositedPseudoContentNativeContent !== 'number'
    || !('clippedStripeBackdrop' in value)
    || !('clippedStripeBackdropChromium' in value)
    || typeof value.clippedStripeBackdropChromium !== 'object'
    || value.clippedStripeBackdropChromium === null
    || !('clippedStripeBackdropChromiumComparison' in value)
    || typeof value.clippedStripeBackdropChromiumComparison !== 'object'
    || value.clippedStripeBackdropChromiumComparison === null
    || !('groupedBackdrop' in value)
    || !('pseudoLayerOrder' in value)
    || typeof value.pseudoLayerOrder !== 'object'
    || value.pseudoLayerOrder === null
    || !('background' in value.pseudoLayerOrder)
    || typeof value.pseudoLayerOrder.background !== 'number'
    || !('content' in value.pseudoLayerOrder)
    || typeof value.pseudoLayerOrder.content !== 'number'
    || !('pseudoNativeStyle' in value)
    || typeof value.pseudoNativeStyle !== 'object'
    || value.pseudoNativeStyle === null
    || !('border' in value.pseudoNativeStyle)
    || typeof value.pseudoNativeStyle.border !== 'number'
    || !('content' in value.pseudoNativeStyle)
    || typeof value.pseudoNativeStyle.content !== 'number'
    || !('fallbackFill' in value.pseudoNativeStyle)
    || typeof value.pseudoNativeStyle.fallbackFill !== 'number'
    || !('pseudoShadow' in value)
    || !('realBlend' in value)
    || !('realBlendChromium' in value)
    || typeof value.realBlendChromium !== 'object'
    || value.realBlendChromium === null
    || !('realBlendChromiumComparison' in value)
    || typeof value.realBlendChromiumComparison !== 'object'
    || value.realBlendChromiumComparison === null
    || !('realBlendNativeContent' in value)
    || typeof value.realBlendNativeContent !== 'number'
    || !('rootPseudo' in value)
    || !('rootPseudoLayerOrder' in value)
    || typeof value.rootPseudoLayerOrder !== 'object'
    || value.rootPseudoLayerOrder === null
    || !('background' in value.rootPseudoLayerOrder)
    || typeof value.rootPseudoLayerOrder.background !== 'number'
    || !('content' in value.rootPseudoLayerOrder)
    || typeof value.rootPseudoLayerOrder.content !== 'number'
    || !('slideBackground' in value.rootPseudoLayerOrder)
    || typeof value.rootPseudoLayerOrder.slideBackground !== 'number'
    || !('skippedTargets' in value)
    || typeof value.skippedTargets !== 'number'
    || !('slideRootMask' in value)
    || !('slideRootMaskGeometry' in value)
    || typeof value.slideRootMaskGeometry !== 'object'
    || value.slideRootMaskGeometry === null
    || !('slideRootMaskNativeContent' in value)
    || typeof value.slideRootMaskNativeContent !== 'number'
    || !('selfFilteredPseudo' in value)
    || !('selfFilteredPseudoChromium' in value)
    || typeof value.selfFilteredPseudoChromium !== 'object'
    || value.selfFilteredPseudoChromium === null
    || !('selfFilteredPseudoChromiumComparison' in value)
    || typeof value.selfFilteredPseudoChromiumComparison !== 'object'
    || value.selfFilteredPseudoChromiumComparison === null
    || !('selfFilteredPseudoNativeContent' in value)
    || typeof value.selfFilteredPseudoNativeContent !== 'number'
    || !('selfClipForeground' in value)
    || !('slideFilterForeground' in value)
    || !('slideFilterForegroundChromium' in value)
    || typeof value.slideFilterForegroundChromium !== 'object'
    || value.slideFilterForegroundChromium === null
    || !('slideFilterForegroundChromiumComparison' in value)
    || typeof value.slideFilterForegroundChromiumComparison !== 'object'
    || value.slideFilterForegroundChromiumComparison === null
    || !('slideFilterForegroundNativeContent' in value)
    || typeof value.slideFilterForegroundNativeContent !== 'number'
    || !('solidCompositor' in value)
    || !('solidCompositorOrder' in value)
    || typeof value.solidCompositorOrder !== 'object'
    || value.solidCompositorOrder === null
    || !('image' in value.solidCompositorOrder)
    || typeof value.solidCompositorOrder.image !== 'number'
    || !('nativeContent' in value.solidCompositorOrder)
    || typeof value.solidCompositorOrder.nativeContent !== 'number'
    || !('nativeFill' in value.solidCompositorOrder)
    || typeof value.solidCompositorOrder.nativeFill !== 'number'
    || !('stackingSlide' in value)
    || !('textClipStandard' in value)
    || !('textClipStandardChromium' in value)
    || typeof value.textClipStandardChromium !== 'object'
    || value.textClipStandardChromium === null
    || !('textClipStandardChromiumComparison' in value)
    || typeof value.textClipStandardChromiumComparison !== 'object'
    || value.textClipStandardChromiumComparison === null
    || !('textClipStandardNativeContent' in value)
    || typeof value.textClipStandardNativeContent !== 'number'
    || !('textClipWebkit' in value)
    || !('textClipWebkitChromium' in value)
    || typeof value.textClipWebkitChromium !== 'object'
    || value.textClipWebkitChromium === null
    || !('textClipWebkitChromiumComparison' in value)
    || typeof value.textClipWebkitChromiumComparison !== 'object'
    || value.textClipWebkitChromiumComparison === null
    || !('textClipWebkitNativeContent' in value)
    || typeof value.textClipWebkitNativeContent !== 'number'
  ) {
    throw new Error(`Electron renderer probe returned an invalid result: ${JSON.stringify(value)}`);
  }
  return {
    alignmentGeometry: value.alignmentGeometry as LayeredBackgroundProbe['alignmentGeometry'],
    ancestorBlend: parseLayeredBackgroundExport(value.ancestorBlend),
    ancestorClipForeground: parsePaintClipForegroundProbe(value.ancestorClipForeground),
    ancestorFilterForeground: parseLayeredBackgroundExport(value.ancestorFilterForeground),
    ancestorFilterForegroundChromium: value.ancestorFilterForegroundChromium as PngProbe,
    ancestorFilterForegroundChromiumComparison:
      value.ancestorFilterForegroundChromiumComparison as PngComparison,
    ancestorFilterForegroundNativeContent: value.ancestorFilterForegroundNativeContent,
    ancestorMaskForeground: parsePaintClipForegroundProbe(value.ancestorMaskForeground),
    backdropFiltered: parseLayeredBackgroundExport(value.backdropFiltered),
    backgroundBlendPseudo: parseLayeredBackgroundExport(value.backgroundBlendPseudo),
    blended: parseLayeredBackgroundExport(value.blended),
    composited: parseLayeredBackgroundExport(value.composited),
    compositedMaskedPseudo: parseLayeredBackgroundExport(value.compositedMaskedPseudo),
    compositedPseudoContent: parseLayeredBackgroundExport(value.compositedPseudoContent),
    compositedPseudoContentChromium: value.compositedPseudoContentChromium as PngProbe,
    compositedPseudoContentChromiumComparison:
      value.compositedPseudoContentChromiumComparison as PngComparison,
    compositedPseudoContentNativeContent: value.compositedPseudoContentNativeContent,
    clippedStripeBackdrop: parseLayeredBackgroundExport(value.clippedStripeBackdrop),
    clippedStripeBackdropChromium: value.clippedStripeBackdropChromium as PngProbe,
    clippedStripeBackdropChromiumComparison:
      value.clippedStripeBackdropChromiumComparison as PngComparison,
    groupedBackdrop: parseLayeredBackgroundExport(value.groupedBackdrop),
    masked: parseLayeredBackgroundExport(value.masked),
    maskedNativeContent: value.maskedNativeContent,
    maskedPseudoContent: parseLayeredBackgroundExport(value.maskedPseudoContent),
    maskedPseudoContentMediaCount: value.maskedPseudoContentMediaCount,
    maskedPseudoContentOrder: value.maskedPseudoContentOrder as LayeredBackgroundProbe['maskedPseudoContentOrder'],
    materializedBackgroundBlend: parseLayeredBackgroundExport(value.materializedBackgroundBlend),
    materializedOpaquePseudo: parseLayeredBackgroundExport(value.materializedOpaquePseudo),
    materializedOpaquePseudoNativeFill: value.materializedOpaquePseudoNativeFill,
    nestedBlended: parseLayeredBackgroundExport(value.nestedBlended),
    nestedCompositor: parseLayeredBackgroundExport(value.nestedCompositor),
    nestedCompositorNativeFill: value.nestedCompositorNativeFill,
    nestedOpacity: parseLayeredBackgroundExport(value.nestedOpacity),
    nestedOpacityChromium: value.nestedOpacityChromium as PngProbe,
    nestedOpacityChromiumComparison: value.nestedOpacityChromiumComparison as PngComparison,
    nestedOpacityNativeContent: value.nestedOpacityNativeContent,
    nestedOpacityNativeShape: value.nestedOpacityNativeShape,
    normalMaskedPseudo: parseLayeredBackgroundExport(value.normalMaskedPseudo),
    paintOrderedBackdrop: parseLayeredBackgroundExport(value.paintOrderedBackdrop),
    paintedWrapper: parseLayeredBackgroundExport(value.paintedWrapper),
    paintedWrapperOrder: value.paintedWrapperOrder as LayeredBackgroundProbe['paintedWrapperOrder'],
    pseudo: parseLayeredBackgroundExport(value.pseudo),
    pseudoLayerOrder: {
      background: value.pseudoLayerOrder.background,
      content: value.pseudoLayerOrder.content,
    },
    pseudoNativeStyle: value.pseudoNativeStyle as LayeredBackgroundProbe['pseudoNativeStyle'],
    pseudoShadow: parseLayeredBackgroundExport(value.pseudoShadow),
    realBlend: parseLayeredBackgroundExport(value.realBlend),
    realBlendChromium: value.realBlendChromium as PngProbe,
    realBlendChromiumComparison: value.realBlendChromiumComparison as PngComparison,
    realBlendNativeContent: value.realBlendNativeContent,
    replaced: parseLayeredBackgroundExport(value.replaced),
    replacedForegroundMedia: value.replacedForegroundMedia,
    rootPseudo: parseLayeredBackgroundExport(value.rootPseudo),
    rootPseudoLayerOrder: {
      background: value.rootPseudoLayerOrder.background,
      content: value.rootPseudoLayerOrder.content,
      slideBackground: value.rootPseudoLayerOrder.slideBackground,
    },
    skippedTargets: value.skippedTargets,
    selfFilteredPseudo: parseLayeredBackgroundExport(value.selfFilteredPseudo),
    selfFilteredPseudoChromium: value.selfFilteredPseudoChromium as PngProbe,
    selfFilteredPseudoChromiumComparison: value.selfFilteredPseudoChromiumComparison as PngComparison,
    selfFilteredPseudoNativeContent: value.selfFilteredPseudoNativeContent,
    selfClipForeground: parsePaintClipForegroundProbe(value.selfClipForeground),
    slideFilterForeground: parseLayeredBackgroundExport(value.slideFilterForeground),
    slideFilterForegroundChromium: value.slideFilterForegroundChromium as PngProbe,
    slideFilterForegroundChromiumComparison:
      value.slideFilterForegroundChromiumComparison as PngComparison,
    slideFilterForegroundNativeContent: value.slideFilterForegroundNativeContent,
    slideRootMask: parseLayeredBackgroundExport(value.slideRootMask),
    slideRootMaskGeometry: value.slideRootMaskGeometry as PptxGeometry,
    slideRootMaskNativeContent: value.slideRootMaskNativeContent,
    solidCompositor: parseLayeredBackgroundExport(value.solidCompositor),
    solidCompositorOrder: value.solidCompositorOrder as LayeredBackgroundProbe['solidCompositorOrder'],
    stackingSlide: parseLayeredBackgroundExport(value.stackingSlide),
    supported: parseLayeredBackgroundExport(value.supported),
    textClipStandard: parseLayeredBackgroundExport(value.textClipStandard),
    textClipStandardChromium: value.textClipStandardChromium as PngProbe,
    textClipStandardChromiumComparison: value.textClipStandardChromiumComparison as PngComparison,
    textClipStandardNativeContent: value.textClipStandardNativeContent,
    textClipWebkit: parseLayeredBackgroundExport(value.textClipWebkit),
    textClipWebkitChromium: value.textClipWebkitChromium as PngProbe,
    textClipWebkitChromiumComparison: value.textClipWebkitChromiumComparison as PngComparison,
    textClipWebkitNativeContent: value.textClipWebkitNativeContent,
  };
}

function parsePaintClipForegroundProbe(value: unknown): PaintClipForegroundProbe {
  if (
    typeof value !== 'object'
    || value === null
    || !('chromium' in value)
    || typeof value.chromium !== 'object'
    || value.chromium === null
    || !('comparison' in value)
    || typeof value.comparison !== 'object'
    || value.comparison === null
    || !('exported' in value)
    || !('nativeBorder' in value)
    || typeof value.nativeBorder !== 'number'
    || !('nativeContent' in value)
    || typeof value.nativeContent !== 'number'
  ) {
    throw new Error('Electron renderer probe returned an invalid paint-clip foreground result');
  }
  return {
    chromium: value.chromium as PngProbe,
    comparison: value.comparison as PngComparison,
    exported: parseLayeredBackgroundExport(value.exported),
    nativeBorder: value.nativeBorder,
    nativeContent: value.nativeContent,
  };
}

function parseLayeredBackgroundExport(value: unknown): LayeredBackgroundExport {
  if (
    typeof value !== 'object'
    || value === null
    || !('captures' in value)
    || typeof value.captures !== 'number'
    || !('media' in value)
    || !Array.isArray(value.media)
    || !value.media.every((item) => typeof item === 'string')
    || !('pngs' in value)
    || !Array.isArray(value.pngs)
  ) {
    throw new Error('Electron renderer probe returned an invalid export');
  }
  return {
    captures: value.captures,
    media: value.media,
    pngs: value.pngs as PngProbe[],
  };
}
