import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request) => Response | Promise<Response>;
type SessionStub = {
  partition: string;
  handlers: Map<string, Handler>;
  protocol: { handle: (scheme: string, handler: Handler) => void; unhandle: (scheme: string) => void };
  fetch: ReturnType<typeof vi.fn>;
  closeAllConnections: ReturnType<typeof vi.fn>;
  clearStorageData: ReturnType<typeof vi.fn>;
  clearCache: ReturnType<typeof vi.fn>;
  setPermissionCheckHandler: ReturnType<typeof vi.fn>;
  setPermissionRequestHandler: ReturnType<typeof vi.fn>;
  webRequest: { onBeforeRequest: ReturnType<typeof vi.fn> };
};

const harness = vi.hoisted(() => ({
  sessions: [] as SessionStub[],
  windows: [] as Array<{ options: Record<string, any>; destroyed: boolean; destroy(): void }>,
  loads: [] as Array<{ url: string; html: string; image: Uint8Array | null; mime: string | null; status: number | null }>,
  requests: ['../assets/a.png?revision=first#image'],
  failHttpsUnhandle: false,
  stallDocumentLoad: false,
  stallCapture: false,
  documentLoadDelayMs: 0,
  resourceBudgets: [] as number[],
}));

// This seam runs the production exportArtifact entry and its resource handler,
// but does not run Electron, decode pixels or manufacture a successful PNG.
// Actual browser execution/filtering and capturePage acceptance remain separate.
vi.mock('electron', () => ({
  session: {
    fromPartition(partition: string) {
      const handlers = new Map<string, Handler>();
      const instance: SessionStub = {
        partition,
        handlers,
        protocol: {
          handle: (scheme, handler) => { handlers.set(scheme, handler); },
          unhandle: (scheme) => {
            if (scheme === 'https' && harness.failHttpsUnhandle) throw new Error('native protocol shutdown');
            handlers.delete(scheme);
          },
        },
        fetch: vi.fn(async () => new Response('external-network-must-not-supply-local-bytes', { status: 502 })),
        closeAllConnections: vi.fn(async () => undefined),
        clearStorageData: vi.fn(async () => undefined),
        clearCache: vi.fn(async () => undefined),
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn() },
      };
      harness.sessions.push(instance);
      return instance;
    },
  },
  BrowserWindow: class {
    destroyed = false;
    rejectDocumentLoad: ((error: Error) => void) | undefined;
    rejectCapture: ((error: Error) => void) | undefined;
    readonly webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      capturePage: vi.fn(async () => {
        if (harness.stallCapture) {
          await new Promise<void>((_resolve, reject) => { this.rejectCapture = reject; });
        }
        throw new Error('observer stops before PNG capture');
      }),
    };

    constructor(readonly options: Record<string, any>) { harness.windows.push(this); }
    isDestroyed() { return this.destroyed; }
    destroy() {
      this.destroyed = true;
      this.rejectDocumentLoad?.(new Error('renderer window destroyed'));
      this.rejectCapture?.(new Error('renderer window destroyed'));
    }
    setContentSize() {}

    async loadURL(url: string) {
      const session = this.options.webPreferences.session as SessionStub | undefined;
      let html: string;
      if (url.startsWith('data:text/html')) {
        html = decodeURIComponent(url.slice(url.indexOf(',') + 1));
      } else {
        const handler = session?.handlers.get(new URL(url).protocol.slice(0, -1));
        if (!handler) throw new Error('document URL has no registered session handler');
        const response = await handler(new Request(url));
        if (!response.ok) throw new Error(`document load failed: ${response.status}`);
        html = await response.text();
      }
      for (const relativePath of harness.requests) {
        let response: Response | undefined;
        // A data: entry has no hierarchical base. Missing bytes below become a
        // business assertion, not an exception or a missing-module test failure.
        try {
          const resource = new URL(relativePath, url);
          const handler = session?.handlers.get(resource.protocol.slice(0, -1));
          response = await handler?.(new Request(resource));
        } catch { /* original data URL cannot resolve the relative image */ }
        harness.loads.push({
          url,
          html,
          image: response?.ok ? new Uint8Array(await response.arrayBuffer()) : null,
          mime: response?.headers.get('content-type') ?? null,
          status: response?.status ?? null,
        });
      }
      if (harness.stallDocumentLoad) {
        await new Promise<void>((_resolve, reject) => { this.rejectDocumentLoad = reject; });
      }
      if (harness.documentLoadDelayMs) {
        await new Promise<void>((resolve) => { setTimeout(resolve, harness.documentLoadDelayMs); });
      }
    }
  },
}));

vi.mock('../../src/main/pdf-export.js', () => ({
  DECK_PAGE_SIZE: { height: 5.625, width: 10 },
  DECK_PRINT_CSS: '',
  inferPageSize: vi.fn(),
  waitForPrintableContent: vi.fn(async (_window: unknown, options?: { budgetMs?: number }) => {
    if (options?.budgetMs !== undefined) harness.resourceBudgets.push(options.budgetMs);
  }),
}));
vi.mock('../../src/main/static-capture.js', () => ({
  bgraBitmapHasPaint: vi.fn(),
  freezePageForStaticCapture: vi.fn(async () => ({ release: vi.fn() })),
}));

import { exportArtifact, THUMBNAIL_RENDER_BUDGET_MS } from '../../src/main/artifact-export.js';

const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAmUlEQVR4nO3QMREAIBDAsFeCfwGIwBXIyECH7L3OXuf+bHSA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AHaAygMkmj+tn2tAAAAAElFTkSuQmCC', 'base64');
const HTML = '<!doctype html><html><head><title>Frozen cover</title></head><body><svg viewBox="0 0 24 24"><path d="M0 0L4 4"/></svg><input id="filter"><div id="cards"></div><textarea>../assets/a.png</textarea><script>const data={image:"../assets/a.png"};function render(){document.getElementById("cards").innerHTML=`<img src="${data.image}"><span>${data.image}</span>`}document.getElementById("filter").addEventListener("input",render);render();</script></body></html>';

function input() {
  return {
    captureMode: 'first_viewport_thumbnail' as const,
    deck: false,
    format: 'image' as const,
    imageFormat: 'png' as const,
    html: HTML,
    title: 'Frozen cover',
    frozenResources: {
      version: 1 as const,
      entryPath: 'pages/index.html',
      resources: [{
        path: 'assets/a.png',
        mime: 'image/png',
        bytesBase64: PNG_A.toString('base64'),
        sha256: createHash('sha256').update(PNG_A).digest('hex'),
      }],
    },
  };
}

beforeEach(() => {
  harness.sessions.length = 0;
  harness.windows.length = 0;
  harness.loads.length = 0;
  harness.requests = ['../assets/a.png?revision=first#image'];
  harness.failHttpsUnhandle = false;
  harness.stallDocumentLoad = false;
  harness.stallCapture = false;
  harness.documentLoadDelayMs = 0;
  harness.resourceBudgets.length = 0;
});

describe('frozen cover resources at the desktop export entry', () => {
  it('serves the captured image bytes through the document URL without changing script, SVG or ordinary text', async () => {
    const result = await exportArtifact(input());

    expect(result.ok).toBe(false); // explicit observer stop, never fake a PNG
    expect(harness.loads).toHaveLength(1);
    expect(harness.loads[0]!.html).toBe(HTML);
    expect(harness.loads[0]!.image, 'a relative browser request must receive this turn image bytes').toEqual(new Uint8Array(PNG_A));
    expect(harness.loads[0]!.mime).toBe('image/png');
    expect(harness.sessions[0]!.fetch).not.toHaveBeenCalled();
    expect(harness.windows[0]!.destroyed).toBe(true);
  });

  it('keeps the existing data URL path for legacy input without creating a resource session', async () => {
    const { frozenResources: _unused, ...legacy } = input();
    await exportArtifact(legacy);

    expect(harness.loads[0]!.url).toMatch(/^data:text\/html/);
    expect(harness.loads[0]!.html).toBe(HTML);
    expect(harness.sessions).toHaveLength(0);
    expect(harness.windows[0]!.destroyed).toBe(true);
  });

  it('returns a local miss without attempting a live project or network fallback', async () => {
    harness.requests = ['../assets/missing.png'];
    await exportArtifact(input());

    expect(harness.loads[0]!.status).toBe(404);
    expect(harness.loads[0]!.image).toBeNull();
    expect(harness.sessions[0]!.fetch).not.toHaveBeenCalled();
  });

  it('keeps concurrent renders with the same resource path in separate sessions and releases both', async () => {
    const second = input();
    second.frozenResources.resources[0]!.bytesBase64 = PNG_B.toString('base64');
    second.frozenResources.resources[0]!.sha256 = createHash('sha256').update(PNG_B).digest('hex');

    await Promise.all([exportArtifact(input()), exportArtifact(second)]);

    expect(harness.loads.map((load) => load.image)).toEqual([new Uint8Array(PNG_A), new Uint8Array(PNG_B)]);
    expect(new Set(harness.loads.map((load) => new URL(load.url).origin)).size).toBe(2);
    expect(harness.sessions).toHaveLength(2);
    expect(harness.windows[0]!.options.webPreferences.session).not.toBe(harness.windows[1]!.options.webPreferences.session);
    for (const instance of harness.sessions) {
      expect(instance.partition).not.toMatch(/^persist:/);
      expect(instance.handlers.size).toBe(0);
      expect(instance.fetch).not.toHaveBeenCalled();
      expect(instance.closeAllConnections).toHaveBeenCalledOnce();
      expect(instance.clearStorageData).toHaveBeenCalledOnce();
      expect(instance.clearCache).toHaveBeenCalledOnce();
    }
    expect(harness.windows.every((window) => window.destroyed)).toBe(true);
  });

  it('decodes a resource path once, retaining literal percent, query and fragment characters in the filename', async () => {
    const candidate = input();
    candidate.frozenResources.resources[0]!.path = 'assets/图 %2F?#.png';
    harness.requests = [`../assets/${encodeURIComponent('图 %2F?#.png')}?ignored=1#symbol`];
    await exportArtifact(candidate);

    expect(harness.loads[0]!.image).toEqual(new Uint8Array(PNG_A));
    expect(harness.sessions[0]!.fetch).not.toHaveBeenCalled();
  });

  it('rejects a changed resource digest before opening a renderer window', async () => {
    const candidate = input();
    candidate.frozenResources.resources[0]!.sha256 = '0'.repeat(64);

    const result = await exportArtifact(candidate);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('digest');
    expect(harness.windows).toHaveLength(0);
    expect(harness.sessions).toHaveLength(0);
  });

  it('continues disposal after a native unhandle error and leaves retained handlers unable to read bytes', async () => {
    harness.failHttpsUnhandle = true;
    const result = await exportArtifact(input());

    expect(result.error).toBe('observer stops before PNG capture');
    const isolated = harness.sessions[0]!;
    expect(isolated.handlers.has('http')).toBe(false);
    expect(isolated.closeAllConnections).toHaveBeenCalledOnce();
    expect(isolated.clearStorageData).toHaveBeenCalledOnce();
    expect(isolated.clearCache).toHaveBeenCalledOnce();
    const retainedHandler = isolated.handlers.get('https')!;
    const afterDisposal = await retainedHandler(new Request(new URL('../assets/a.png', harness.loads[0]!.url)));
    expect(afterDisposal.status).toBe(410);
    expect(await afterDisposal.text()).toBe('');
  });

  it.each(['document load', 'capture after a slow load'])('cancels a never-finished %s and releases resources at the same thumbnail deadline', async (stage) => {
    vi.useFakeTimers();
    harness.stallDocumentLoad = stage === 'document load';
    harness.stallCapture = stage === 'capture after a slow load';
    harness.documentLoadDelayMs = harness.stallCapture ? 6_000 : 0;
    let settled = false;
    let result: Awaited<ReturnType<typeof exportArtifact>> | undefined;
    const pending = exportArtifact(input()).then((value) => { result = value; settled = true; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.loads[0]!.image).toEqual(new Uint8Array(PNG_A));
      await vi.advanceTimersByTimeAsync(THUMBNAIL_RENDER_BUDGET_MS - 1);
      expect(settled).toBe(false);
      expect(harness.windows[0]!.destroyed).toBe(false);
      expect(harness.sessions[0]!.handlers.size).toBeGreaterThan(0);
      if (harness.stallCapture) expect(harness.resourceBudgets).toEqual([2_000]);

      await vi.advanceTimersByTimeAsync(1);
      expect(settled, 'a stuck load must not retain the new frozen resource map forever').toBe(true);
      expect(result?.ok).toBe(false);
      expect(result?.code).toBe('render_timeout');
      expect(harness.windows[0]!.destroyed).toBe(true);
      expect(harness.sessions[0]!.handlers.size).toBe(0);
      expect(harness.sessions[0]!.closeAllConnections).toHaveBeenCalledOnce();
      expect(harness.sessions[0]!.clearStorageData).toHaveBeenCalledOnce();
    } finally {
      // Also clean up when the pre-fix implementation fails the red assertion.
      for (const window of harness.windows) if (!window.destroyed) window.destroy();
      await pending;
      vi.useRealTimers();
    }
  });
});
