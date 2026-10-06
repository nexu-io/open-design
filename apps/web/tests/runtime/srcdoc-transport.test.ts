import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import {
  buildLazySrcdocTransport,
  buildSrcdoc,
  canActivateSrcDocTransport,
  type SrcDocActivationInputs,
} from '../../src/runtime/srcdoc';

function extractShellScript(shellHtml: string): string {
  const match = shellHtml.match(
    /<script\s+data-od-lazy-srcdoc-transport>([\s\S]*?)<\/script>/,
  );
  if (!match || match[1] == null) {
    throw new Error('lazy transport shell script not found');
  }
  return match[1];
}

function extractActivationScript(srcDoc: string): string {
  const match = srcDoc.match(
    /<script\s+data-od-srcdoc-transport-activation>([\s\S]*?)<\/script>/,
  );
  if (!match || match[1] == null) {
    throw new Error('srcDoc transport activation script not found');
  }
  return match[1];
}

interface RunShellResult {
  documentWrites: string[];
  parentMessages: unknown[];
  runScheduledCallbacks: () => void;
  triggerMessage: (data: unknown) => void;
  triggerActivate: (html: string, generation?: string) => void;
}

function runShellInSandbox(shellHtml: string): RunShellResult {
  const script = extractShellScript(shellHtml);
  const parentMessages: unknown[] = [];
  const documentWrites: string[] = [];
  const messageListeners: Array<(ev: { data: unknown }) => void> = [];
  const scheduledCallbacks: Array<() => void> = [];
  const intervalCallbacks = new Map<number, () => void>();
  let nextIntervalId = 1;
  const parentMock = {
    postMessage: (data: unknown) => {
      parentMessages.push(data);
    },
  };
  const documentMock = {
    open: vi.fn(),
    write: vi.fn((chunk: string) => documentWrites.push(chunk)),
    close: vi.fn(),
  };
  const win = {
    parent: parentMock,
    addEventListener(_type: string, listener: (ev: { data: unknown }) => void) {
      messageListeners.push(listener);
    },
    removeEventListener(_type: string, listener: (ev: { data: unknown }) => void) {
      const index = messageListeners.indexOf(listener);
      if (index >= 0) messageListeners.splice(index, 1);
    },
  };
  const sandbox: Record<string, unknown> = {
    document: documentMock,
    setTimeout: (callback: () => void) => {
      scheduledCallbacks.push(callback);
    },
    setInterval: (callback: () => void) => {
      const intervalId = nextIntervalId++;
      intervalCallbacks.set(intervalId, callback);
      return intervalId;
    },
    clearInterval: (intervalId: number) => {
      intervalCallbacks.delete(intervalId);
    },
    window: win,
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return {
    documentWrites,
    parentMessages,
    runScheduledCallbacks: () => {
      for (const callback of scheduledCallbacks.splice(0)) callback();
      for (const callback of intervalCallbacks.values()) callback();
    },
    triggerMessage: (data: unknown) => {
      for (const listener of messageListeners) listener({ data });
    },
    triggerActivate: (html: string, generation = 'generation-1') => {
      for (const listener of messageListeners) {
        listener({ data: { type: 'od:srcdoc-transport-activate', html, generation } });
      }
    },
  };
}

describe('buildLazySrcdocTransport (#2253)', () => {
  it('can bootstrap a doctype-less artifact in quirks mode', () => {
    const shell = buildLazySrcdocTransport({ quirksMode: true });

    expect(shell.trimStart().startsWith('<!doctype')).toBe(false);
    expect(shell.trimStart().startsWith('<html>')).toBe(true);
  });

  it('posts od:srcdoc-transport-ready to parent on load', () => {
    const shell = buildLazySrcdocTransport();
    const { parentMessages } = runShellInSandbox(shell);
    expect(parentMessages).toContainEqual({ type: 'od:srcdoc-transport-ready' });
  });

  it('replies when the host probes after missing the initial ready message', () => {
    const shell = buildLazySrcdocTransport();
    const result = runShellInSandbox(shell);
    result.parentMessages.length = 0;

    result.triggerMessage({ type: 'od:srcdoc-transport-shell-probe' });

    expect(result.parentMessages).toEqual([{ type: 'od:srcdoc-transport-ready' }]);
  });

  it('reannounces ready until a late host activates the cached bootstrap', () => {
    const shell = buildLazySrcdocTransport();
    const result = runShellInSandbox(shell);
    result.parentMessages.length = 0;

    result.runScheduledCallbacks();
    expect(result.parentMessages).toContainEqual({ type: 'od:srcdoc-transport-ready' });

    result.parentMessages.length = 0;
    result.runScheduledCallbacks();
    expect(result.parentMessages).toContainEqual({ type: 'od:srcdoc-transport-ready' });

    result.triggerActivate('<html><body>activated</body></html>');
    result.parentMessages.length = 0;
    result.runScheduledCallbacks();
    expect(result.parentMessages).toEqual([]);
  });

  it('consumes only the first activation so later generations get a fresh realm', () => {
    const result = runShellInSandbox(buildLazySrcdocTransport());

    result.triggerActivate('<html><body>first</body></html>', 'generation-1');
    result.triggerActivate('<html><body>second</body></html>', 'generation-2');

    expect(result.documentWrites).toEqual(['<html><body>first</body></html>']);
  });

  it('skips the ready post when window.parent equals window (top-level load)', () => {
    // When the lazy shell is somehow opened top-level (no parent), the ready
    // message must not throw and must not fan out to itself.
    const script = extractShellScript(buildLazySrcdocTransport());
    const calls: unknown[] = [];
    const win: Record<string, unknown> = {
      addEventListener: () => {},
      postMessage: (data: unknown) => calls.push(data),
    };
    win.parent = win;
    const sandbox: Record<string, unknown> = {
      document: { open: () => {}, write: () => {}, close: () => {} },
      window: win,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    expect(calls).toEqual([]);
  });

  it('still replaces document content when parent posts activate', () => {
    const shell = buildLazySrcdocTransport();
    const result = runShellInSandbox(shell);
    result.triggerActivate('<html><body>activated</body></html>');
    // The shell handler calls document.open/write/close in order.
    // We assert behavior via the document mock the sandbox exposed.
    // (Re-running with our own probe to inspect document mock.)
    const script = extractShellScript(shell);
    const writes: string[] = [];
    const win: Record<string, unknown> = {
      addEventListener(_t: string, listener: (ev: { data: unknown }) => void) {
        (win as { __listener: typeof listener }).__listener = listener;
      },
    };
    win.parent = { postMessage: () => {} };
    const sandbox: Record<string, unknown> = {
      document: {
        open: () => {},
        write: (chunk: string) => writes.push(chunk),
        close: () => {},
      },
      window: win,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    const listener = (win as { __listener: (ev: { data: unknown }) => void }).__listener;
    listener({
      data: {
        type: 'od:srcdoc-transport-activate',
        html: '<p>hi</p>',
        generation: 'generation-1',
      },
    });
    expect(writes).toEqual(['<p>hi</p>']);
  });

  it('requires a generation on activate so the host can reject stale ready acks', () => {
    const shell = buildLazySrcdocTransport();
    const script = extractShellScript(shell);
    const writes: string[] = [];
    const win: Record<string, unknown> = {
      addEventListener(_t: string, listener: (ev: { data: unknown }) => void) {
        (win as { __listener: typeof listener }).__listener = listener;
      },
    };
    win.parent = { postMessage: () => {} };
    const sandbox: Record<string, unknown> = {
      document: {
        open: () => {},
        write: (chunk: string) => writes.push(chunk),
        close: () => {},
      },
      window: win,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    const listener = (win as { __listener: (ev: { data: unknown }) => void }).__listener;
    listener({ data: { type: 'od:srcdoc-transport-activate', html: '<p>stale</p>' } });
    expect(writes).toEqual([]);
  });

  it('ignores activate messages with missing or non-string html', () => {
    const shell = buildLazySrcdocTransport();
    const script = extractShellScript(shell);
    const writes: string[] = [];
    const win: Record<string, unknown> = {
      addEventListener(_t: string, listener: (ev: { data: unknown }) => void) {
        (win as { __listener: typeof listener }).__listener = listener;
      },
    };
    win.parent = { postMessage: () => {} };
    const sandbox: Record<string, unknown> = {
      document: {
        open: () => {},
        write: (chunk: string) => writes.push(chunk),
        close: () => {},
      },
      window: win,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    const listener = (win as { __listener: (ev: { data: unknown }) => void }).__listener;
    listener({ data: { type: 'od:srcdoc-transport-activate' } });
    listener({ data: { type: 'od:srcdoc-transport-activate', html: 123 } });
    listener({ data: null });
    listener({ data: { type: 'unrelated' } });
    expect(writes).toEqual([]);
  });
});

describe('srcDoc transport activation witness', () => {
  it('runs before authored head scripts so slow boot code cannot cause a false recovery', () => {
    const doc = buildSrcdoc(
      '<html><head><script src="slow-app.js"></script></head><body>app</body></html>',
      { transportActivationGeneration: 'generation-1' },
    );

    expect(doc.indexOf('data-od-srcdoc-transport-activation')).toBeGreaterThan(-1);
    expect(doc.indexOf('data-od-srcdoc-transport-activation')).toBeLessThan(
      doc.indexOf('src="slow-app.js"'),
    );
  });

  it('requests a fresh browsing context instead of rewriting an activated document', () => {
    const doc = buildSrcdoc(
      '<html><body><div id="shell">Shell</div><script>const ITEMS = [];</script></body></html>',
      { transportActivationGeneration: 'generation-1' },
    );
    const script = extractActivationScript(doc);
    const parentMessages: unknown[] = [];
    const documentMock = {
      body: { children: [] },
      close: vi.fn(),
      documentElement: null,
      open: vi.fn(),
      readyState: 'complete',
      write: vi.fn(),
    };
    const win: Record<string, unknown> = {
      addEventListener(_type: string, listener: (ev: { data: unknown }) => void) {
        (win as { __listener: typeof listener }).__listener = listener;
      },
    };
    win.parent = { postMessage: (message: unknown) => parentMessages.push(message) };
    const sandbox: Record<string, unknown> = {
      document: documentMock,
      MutationObserver: undefined,
      window: win,
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    parentMessages.length = 0;

    const listener = (win as { __listener: (ev: { data: unknown }) => void }).__listener;
    listener({
      data: {
        type: 'od:srcdoc-transport-activate',
        html: '<html><body><script>const ITEMS = [];</script></body></html>',
        generation: 'generation-2',
      },
    });

    expect(documentMock.open).not.toHaveBeenCalled();
    expect(documentMock.write).not.toHaveBeenCalled();
    expect(documentMock.close).not.toHaveBeenCalled();
    expect(parentMessages).toEqual([{
      type: 'od:srcdoc-transport-reset-required',
      generation: 'generation-2',
    }]);
  });

  it('restores a complete frozen body while retaining manual-edit source annotations', () => {
    const doc = buildSrcdoc(
      '<html><body><main id="app"><p>Source</p></main></body></html>',
      {
        editBridge: true,
        selectionBridge: true,
        transportActivationGeneration: 'generation-1',
      },
    );

    expect(doc).toContain("typeof state.bodyHtml === 'string'");
    expect(doc).toContain('document.body.innerHTML = state.bodyHtml');
    expect(doc).toContain('captureRuntimeStateAnnotations()');
    expect(doc).toContain('restoreRuntimeStateAnnotations(sourceAnnotations)');
    expect(doc).toContain('function runtimeStatePath(el){');
    expect(doc).toContain("type: 'od:preview-runtime-state-restore-ready'");
    expect(doc).toContain('data-od-selection-bridge');
    expect(doc).toContain('var runtimeStateGeneration = "generation-1"');
  });
});

const BASE_STATE: SrcDocActivationInputs = {
  srcDoc: '<html>real</html>',
  useUrlLoadPreview: false,
  useLazySrcDocTransport: true,
  shellReady: true,
  activatedHtml: null,
};

describe('canActivateSrcDocTransport (#2253)', () => {
  it('returns true when shell is ready and we are in srcDoc mode', () => {
    expect(canActivateSrcDocTransport(BASE_STATE)).toBe(true);
  });

  it('returns false when shell is not yet ready (the #2253 race)', () => {
    expect(
      canActivateSrcDocTransport({ ...BASE_STATE, shellReady: false }),
    ).toBe(false);
  });

  it('returns false when host is still URL-loading the preview', () => {
    expect(
      canActivateSrcDocTransport({ ...BASE_STATE, useUrlLoadPreview: true }),
    ).toBe(false);
  });

  it('returns false when the lazy transport is bypassed', () => {
    expect(
      canActivateSrcDocTransport({ ...BASE_STATE, useLazySrcDocTransport: false }),
    ).toBe(false);
  });

  it('returns false when srcDoc is empty (no real artifact yet)', () => {
    expect(canActivateSrcDocTransport({ ...BASE_STATE, srcDoc: '' })).toBe(false);
  });

  it('returns false when the same html was already activated (dedupe)', () => {
    expect(
      canActivateSrcDocTransport({
        ...BASE_STATE,
        activatedHtml: BASE_STATE.srcDoc,
      }),
    ).toBe(false);
  });

  it('returns true when activatedHtml differs from current srcDoc', () => {
    expect(
      canActivateSrcDocTransport({
        ...BASE_STATE,
        activatedHtml: '<html>previous</html>',
      }),
    ).toBe(true);
  });
});
