import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import {
  buildLazySrcdocTransport,
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

interface RunShellResult {
  parentMessages: unknown[];
  triggerActivate: (html: string) => void;
}

function runShellInSandbox(shellHtml: string): RunShellResult {
  const script = extractShellScript(shellHtml);
  const parentMessages: unknown[] = [];
  const messageListeners: Array<(ev: { data: unknown }) => void> = [];
  const parentMock = {
    postMessage: (data: unknown) => {
      parentMessages.push(data);
    },
  };
  const documentMock = {
    open: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
  };
  const win = {
    parent: parentMock,
    addEventListener(_type: string, listener: (ev: { data: unknown }) => void) {
      messageListeners.push(listener);
    },
  };
  const sandbox: Record<string, unknown> = {
    document: documentMock,
    window: win,
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return {
    parentMessages,
    triggerActivate: (html: string) => {
      for (const listener of messageListeners) {
        listener({ data: { type: 'od:srcdoc-transport-activate', html } });
      }
    },
  };
}

describe('buildLazySrcdocTransport (#2253)', () => {
  it('posts od:srcdoc-transport-ready to parent on load', () => {
    const shell = buildLazySrcdocTransport();
    const { parentMessages } = runShellInSandbox(shell);
    expect(parentMessages).toContainEqual({ type: 'od:srcdoc-transport-ready' });
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
    listener({ data: { type: 'od:srcdoc-transport-activate', html: '<p>hi</p>' } });
    expect(writes).toEqual(['<p>hi</p>']);
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
