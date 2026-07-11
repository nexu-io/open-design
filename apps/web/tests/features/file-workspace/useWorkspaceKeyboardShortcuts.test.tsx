// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceKeyboardShortcuts } from '../../../src/features/file-workspace/hooks/useWorkspaceKeyboardShortcuts.hooks';
import type {
  WorkspaceKeyboardShortcutsParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceKeyboardShortcuts.hooks';
import type { WorkspaceKeyboardShortcutsPort } from '../../../src/features/file-workspace/ports';
import { isMacPlatform } from '../../../src/utils/platform';

function makePort(over: Partial<WorkspaceKeyboardShortcutsPort> = {}): WorkspaceKeyboardShortcutsPort {
  return {
    subscribeCaptureKeyDown: vi.fn(() => () => {}),
    toggleDocumentBodyClass: vi.fn(() => () => {}),
    ...over,
  };
}

function makeParams(over: Partial<WorkspaceKeyboardShortcutsParams> = {}): WorkspaceKeyboardShortcutsParams {
  return {
    workspaceTabIds: ['a.md', 'b.md', 'c.md'],
    openWorkspaceTabLauncher: vi.fn(),
    closeActiveWorkspaceTab: vi.fn(),
    activateWorkspaceTabByOffset: vi.fn(),
    activateWorkspaceTabByIndex: vi.fn(),
    ...over,
  };
}

function keydown(over: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, ...over });
}

describe('useWorkspaceKeyboardShortcuts', () => {
  it('subscribes a capture-phase keydown listener for the tab-shortcut cluster on every render', () => {
    const port = makePort();
    const params = makeParams();
    const { rerender } = renderHook((p: WorkspaceKeyboardShortcutsParams) => useWorkspaceKeyboardShortcuts(port, p), {
      initialProps: params,
    });
    const initialCalls = (port.subscribeCaptureKeyDown as ReturnType<typeof vi.fn>).mock.calls.length;
    rerender(params);
    // No dependency array on the tab-shortcut effect: it re-subscribes every render.
    expect((port.subscribeCaptureKeyDown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('Cmd/Ctrl+T opens the tab launcher', () => {
    const openWorkspaceTabLauncher = vi.fn();
    // Two effects call subscribeCaptureKeyDown (tab-shortcuts, then the
    // quick-switcher toggle); the tab-shortcuts effect registers first.
    let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        onKeyDown ??= handler;
        return () => {};
      }),
    });
    renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams({ openWorkspaceTabLauncher })));
    act(() => onKeyDown!(keydown({ key: 't', ctrlKey: true })));
    expect(openWorkspaceTabLauncher).toHaveBeenCalledTimes(1);
  });

  it('Cmd/Ctrl+W closes the active tab', () => {
    const closeActiveWorkspaceTab = vi.fn();
    // Two effects call subscribeCaptureKeyDown (tab-shortcuts, then the
    // quick-switcher toggle); the tab-shortcuts effect registers first.
    let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        onKeyDown ??= handler;
        return () => {};
      }),
    });
    renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams({ closeActiveWorkspaceTab })));
    act(() => onKeyDown!(keydown({ key: 'w', ctrlKey: true })));
    expect(closeActiveWorkspaceTab).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Tab / Ctrl+Shift+Tab cycle tabs forward and backward', () => {
    const activateWorkspaceTabByOffset = vi.fn();
    // Two effects call subscribeCaptureKeyDown (tab-shortcuts, then the
    // quick-switcher toggle); the tab-shortcuts effect registers first.
    let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        onKeyDown ??= handler;
        return () => {};
      }),
    });
    renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams({ activateWorkspaceTabByOffset })));
    act(() => onKeyDown!(keydown({ key: 'Tab', ctrlKey: true })));
    expect(activateWorkspaceTabByOffset).toHaveBeenLastCalledWith(1);
    act(() => onKeyDown!(keydown({ key: 'Tab', ctrlKey: true, shiftKey: true })));
    expect(activateWorkspaceTabByOffset).toHaveBeenLastCalledWith(-1);
  });

  it('Cmd/Ctrl+9 activates the last tab by index', () => {
    const activateWorkspaceTabByIndex = vi.fn();
    // Two effects call subscribeCaptureKeyDown (tab-shortcuts, then the
    // quick-switcher toggle); the tab-shortcuts effect registers first.
    let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        onKeyDown ??= handler;
        return () => {};
      }),
    });
    renderHook(() =>
      useWorkspaceKeyboardShortcuts(
        port,
        makeParams({ activateWorkspaceTabByIndex, workspaceTabIds: ['a', 'b', 'c', 'd'] }),
      ),
    );
    act(() => onKeyDown!(keydown({ key: '9', ctrlKey: true })));
    expect(activateWorkspaceTabByIndex).toHaveBeenCalledWith(3);
  });

  it('primary+P toggles quickSwitcherOpen', () => {
    const handlers: Array<(e: KeyboardEvent) => void> = [];
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        handlers.push(handler);
        return () => {};
      }),
    });
    const { result } = renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams()));
    expect(result.current.quickSwitcherOpen).toBe(false);
    // handlers[1] is the quick-switcher effect's listener (registered second).
    const quickSwitcherHandler = handlers[1]!;
    const primaryKeyInit: KeyboardEventInit = isMacPlatform()
      ? { metaKey: true, ctrlKey: false }
      : { ctrlKey: true, metaKey: false };
    act(() => quickSwitcherHandler(keydown({ key: 'p', ...primaryKeyInit })));
    expect(result.current.quickSwitcherOpen).toBe(true);
  });

  it('Escape closes the quick switcher when open', () => {
    const handlers: Array<(e: KeyboardEvent) => void> = [];
    const port = makePort({
      subscribeCaptureKeyDown: vi.fn((handler) => {
        handlers.push(handler);
        return () => {};
      }),
    });
    const { result } = renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams()));
    const primaryKeyInit: KeyboardEventInit = isMacPlatform()
      ? { metaKey: true, ctrlKey: false }
      : { ctrlKey: true, metaKey: false };
    act(() => handlers[1]!(keydown({ key: 'p', ...primaryKeyInit })));
    expect(result.current.quickSwitcherOpen).toBe(true);
    act(() => handlers[handlers.length - 1]!(keydown({ key: 'Escape' })));
    expect(result.current.quickSwitcherOpen).toBe(false);
  });

  it('toggles the document-body class through the port whenever quickSwitcherOpen changes', () => {
    const toggleDocumentBodyClass = vi.fn(() => () => {});
    const port = makePort({ toggleDocumentBodyClass });
    renderHook(() => useWorkspaceKeyboardShortcuts(port, makeParams()));
    expect(toggleDocumentBodyClass).toHaveBeenCalledWith('od-quick-switcher-open', false);
  });
});
