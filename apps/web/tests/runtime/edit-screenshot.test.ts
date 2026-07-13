// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHostElementSvg,
  computeWorkspaceCompositeLayout,
  requestManualEditGuidesRestore,
  resolveOpaqueBackground,
  type RectLike,
} from '../../src/runtime/edit-screenshot';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, width, height };
}

describe('computeWorkspaceCompositeLayout', () => {
  it('offsets every layer by the workspace origin and scales the canvas by dpr', () => {
    const layout = computeWorkspaceCompositeLayout({
      workspaceRect: rect(100, 50, 900, 600),
      iframeRect: rect(120, 60, 640, 480),
      overlays: [{ rect: rect(700, 80, 320, 380) }, { rect: rect(140, 70, 26, 26) }],
      dpr: 2,
    });
    expect(layout.canvasWidth).toBe(1800);
    expect(layout.canvasHeight).toBe(1200);
    expect(layout.iframeDest).toEqual(rect(20, 10, 640, 480));
    expect(layout.overlayDests).toEqual([rect(600, 30, 320, 380), rect(40, 20, 26, 26)]);
  });

  it('keeps destinations in CSS px when a scaled preview shrinks the iframe rect', () => {
    // Device viewport at 0.5 preview scale: the iframe's on-screen rect is
    // half its internal size; destinations mirror the on-screen geometry.
    const layout = computeWorkspaceCompositeLayout({
      workspaceRect: rect(0, 0, 800, 700),
      iframeRect: rect(200, 20, 375 * 0.5, 812 * 0.5),
      overlays: [],
      dpr: 1,
    });
    expect(layout.iframeDest).toEqual(rect(200, 20, 187.5, 406));
  });

  it('tolerates overlays poking outside the workspace (negative offsets)', () => {
    const layout = computeWorkspaceCompositeLayout({
      workspaceRect: rect(100, 100, 500, 400),
      iframeRect: rect(100, 100, 500, 400),
      overlays: [{ rect: rect(60, 80, 200, 100) }],
      dpr: 1,
    });
    expect(layout.overlayDests[0]).toEqual(rect(-40, -20, 200, 100));
  });

  it('falls back to dpr 1 on non-finite input and never emits a zero canvas', () => {
    const layout = computeWorkspaceCompositeLayout({
      workspaceRect: rect(0, 0, 0.2, 0.2),
      iframeRect: rect(0, 0, 0.2, 0.2),
      overlays: [],
      dpr: Number.NaN,
    });
    expect(layout.canvasWidth).toBe(1);
    expect(layout.canvasHeight).toBe(1);
  });
});

describe('requestManualEditGuidesRestore', () => {
  const notRestored = { restored: false, live: false };

  it('resolves not-restored without an iframe window', async () => {
    await expect(requestManualEditGuidesRestore(null)).resolves.toEqual(notRestored);
    await expect(
      requestManualEditGuidesRestore({ contentWindow: null } as unknown as HTMLIFrameElement),
    ).resolves.toEqual(notRestored);
  });

  it('resolves not-restored when posting to the iframe throws', async () => {
    const iframe = {
      contentWindow: {
        postMessage: () => {
          throw new Error('detached');
        },
      },
    } as unknown as HTMLIFrameElement;
    await expect(requestManualEditGuidesRestore(iframe)).resolves.toEqual(notRestored);
  });

  it('resolves not-restored on timeout', async () => {
    const iframe = {
      contentWindow: { postMessage: vi.fn() },
    } as unknown as HTMLIFrameElement;
    await expect(requestManualEditGuidesRestore(iframe, { timeoutMs: 20 })).resolves.toEqual(
      notRestored,
    );
  });

  it('resolves the bridge reply matched by request id and source', async () => {
    const posted: Array<{ type?: string; id?: string; maxAgeMs?: number }> = [];
    const postSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(((message: unknown) => {
        posted.push(message as { type?: string; id?: string; maxAgeMs?: number });
      }) as typeof window.postMessage);
    const iframe = { contentWindow: window } as unknown as HTMLIFrameElement;

    const promise = requestManualEditGuidesRestore(iframe, { maxAgeMs: 4000, timeoutMs: 3000 });
    expect(postSpy).toHaveBeenCalled();
    const request = posted.find((message) => message.type === 'od-edit-guides-restore');
    expect(request?.maxAgeMs).toBe(4000);

    // A reply for a different request id must be ignored…
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'od-edit-guides-restore:result', id: 'other', restored: true, live: false },
        source: window,
      }),
    );
    // …the matching reply resolves the promise.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'od-edit-guides-restore:result', id: request?.id, restored: true, live: true },
        source: window,
      }),
    );
    await expect(promise).resolves.toEqual({ restored: true, live: true });
  });
});

describe('buildHostElementSvg', () => {
  function stubRect(el: HTMLElement, value: RectLike): void {
    el.getBoundingClientRect = () =>
      ({
        x: value.left,
        y: value.top,
        left: value.left,
        top: value.top,
        width: value.width,
        height: value.height,
        right: value.left + value.width,
        bottom: value.top + value.height,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it('returns null for zero-size elements', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(buildHostElementSvg(el)).toBeNull();
  });

  it('syncs live form state, strips scripts, and neutralizes the root position', () => {
    const el = document.createElement('aside');
    el.style.position = 'absolute';
    el.innerHTML =
      '<input type="text"><textarea></textarea><script>window.__x = 1;</script>' +
      '<style>@font-face { font-family: X; src: url(x.woff2); } .a { color: red; }</style>';
    document.body.appendChild(el);
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'oklch(0.18 0.012 250)';
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '精准、克制';
    stubRect(el, rect(500, 80, 320, 380));

    const built = buildHostElementSvg(el);
    expect(built).not.toBeNull();
    expect(built!.width).toBe(320);
    expect(built!.height).toBe(380);
    expect(built!.svg).toContain('value="oklch(0.18 0.012 250)"');
    expect(built!.svg).toContain('精准、克制');
    expect(built!.svg).not.toContain('<script');
    expect(built!.svg).not.toContain('@font-face');
    expect(built!.svg).toContain('.a { color: red; }');
    expect(built!.svg).toContain('position:static;inset:auto;margin:0;transform:none;');
    expect(built!.svg).toContain('<foreignObject x="0" y="0" width="320" height="380">');
  });

  it('resolves the nearest opaque ancestor background', () => {
    const parent = document.createElement('div');
    parent.style.backgroundColor = 'rgb(250, 250, 250)';
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(resolveOpaqueBackground(child)).toBe('rgb(250, 250, 250)');
    expect(resolveOpaqueBackground(document.createElement('div'))).toBe('#ffffff');
  });
});
