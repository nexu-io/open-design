// @vitest-environment jsdom
//
// The Continue-in-CLI / Finalize toolbar hook against a fake
// `ProjectViewTransportPort` and hand-rolled `finalize`/`designMdState`/
// `terminalLauncher` controllers (the app-level hooks that own those pieces
// aren't part of this slice — the hook takes their results as params).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';

import { useProjectFinalizeActions } from '../../../src/features/project-view/hooks/useProjectFinalizeActions.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';
import { isMacPlatform } from '../../../src/utils/platform';

/** The hook resolves the primary modifier via `isMacPlatform()` at fire time,
 *  so the test event must set the modifier that platform actually expects. */
function continueInCliKeyDownInit(): KeyboardEventInit {
  return isMacPlatform()
    ? { key: 'k', metaKey: true, shiftKey: true }
    : { key: 'k', ctrlKey: true, shiftKey: true };
}

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
  return {
    readProjectRawText: vi.fn(async () => null),
    extractMemory: vi.fn(async () => {}),
    loadQueuedChatSends: vi.fn(() => []),
    saveQueuedChatSends: vi.fn(),
    readSavedChatPanelWidth: vi.fn(() => 460),
    saveChatPanelWidth: vi.fn(),
    readAutoSendAttachments: vi.fn(() => []),
    readAutoSendContext: vi.fn(() => null),
    clearAutoSendSession: vi.fn(),
    markDesignSystemAuditAutoRepairEligible: vi.fn(),
    consumeDesignSystemAuditAutoRepair: vi.fn(() => false),
    clearDesignSystemAuditAutoRepair: vi.fn(),
    subscribeSplitResize: vi.fn(() => () => {}),
    getSplitIsRtl: vi.fn(() => false),
    subscribeChatPanelPointerDrag: vi.fn(() => () => {}),
    checkGithubConnected: vi.fn(async () => false),
    subscribeGithubConnectRefreshTriggers: vi.fn(() => () => {}),
    fetchAppliedPluginSnapshot: vi.fn(async () => null),
    listPlugins: vi.fn(async () => []),
    duplicatePluginAsProject: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    copyTextToClipboard: vi.fn(async () => true),
    subscribeCapturedKeyDown: vi.fn(() => () => {}),
    patchProjectMetadata: vi.fn(async () => {}),
    ...overrides,
  };
}

const config = {
  mode: 'byok',
  apiProtocol: 'anthropic',
  apiKey: 'sk-test',
  model: 'claude-3',
} as unknown as AppConfig;

function makeDesignMdState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    generatedAt: null,
    transcriptMessageCount: null,
    designSystemId: null,
    currentArtifact: null,
    exists: true,
    refresh: vi.fn(async () => {}),
    ...overrides,
  } as never;
}

describe('useProjectFinalizeActions', () => {
  it('handleFinalize surfaces the credentials-missing toast when the request cannot be built', () => {
    const port = makePort();
    const onToast = vi.fn();
    const finalize = { trigger: vi.fn(), cancel: vi.fn(), error: null };
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        port,
        { mode: 'daemon' } as unknown as AppConfig,
        finalize,
        makeDesignMdState(),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        onToast,
      ),
    );
    act(() => result.current.handleFinalize());
    expect(finalize.trigger).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledOnce();
  });

  it('handleFinalize triggers the request and refreshes design.md on success', async () => {
    const port = makePort();
    const onToast = vi.fn();
    const refresh = vi.fn(async () => {});
    const finalize = { trigger: vi.fn(async () => ({ ok: true }) as never), cancel: vi.fn(), error: null };
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        finalize,
        makeDesignMdState({ refresh }),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        onToast,
      ),
    );
    await act(async () => {
      result.current.handleFinalize();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finalize.trigger).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('handleCancelFinalize delegates to finalize.cancel', () => {
    const finalize = { trigger: vi.fn(), cancel: vi.fn(), error: null };
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        makePort(),
        config,
        finalize,
        makeDesignMdState(),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        vi.fn(),
      ),
    );
    act(() => result.current.handleCancelFinalize());
    expect(finalize.cancel).toHaveBeenCalledOnce();
  });

  it('handleContinueInCli toasts when the working directory is unavailable', async () => {
    const onToast = vi.fn();
    const port = makePort();
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        { trigger: vi.fn(), cancel: vi.fn(), error: null },
        makeDesignMdState(),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        null,
        onToast,
      ),
    );
    await act(async () => {
      await result.current.handleContinueInCli();
    });
    expect(port.copyTextToClipboard).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Working directory unavailable') }),
    );
  });

  it('handleContinueInCli copies the prompt and opens the terminal on success', async () => {
    const open = vi.fn(async () => ({ kind: 'host' as const, ok: true }));
    const port = makePort({ copyTextToClipboard: vi.fn(async () => true) });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        { trigger: vi.fn(), cancel: vi.fn(), error: null },
        makeDesignMdState(),
        { open },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        onToast,
      ),
    );
    await act(async () => {
      await result.current.handleContinueInCli();
    });
    expect(port.copyTextToClipboard).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith('p1');
    expect(onToast).toHaveBeenCalledOnce();
  });

  it('handleContinueInCli surfaces the manual-copy toast when the clipboard write fails', async () => {
    const port = makePort({ copyTextToClipboard: vi.fn(async () => false) });
    const open = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        { trigger: vi.fn(), cancel: vi.fn(), error: null },
        makeDesignMdState(),
        { open },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        onToast,
      ),
    );
    await act(async () => {
      await result.current.handleContinueInCli();
    });
    expect(open).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Clipboard unavailable') }),
    );
  });

  it('lifts a finalize error into the toast', () => {
    const onToast = vi.fn();
    const finalize = {
      trigger: vi.fn(),
      cancel: vi.fn(),
      error: { code: 'NETWORK_ERROR' as const, message: 'boom', details: 'detail' },
    };
    renderHook(() =>
      useProjectFinalizeActions(
        makePort(),
        config,
        finalize,
        makeDesignMdState(),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        onToast,
      ),
    );
    expect(onToast).toHaveBeenCalledWith({ message: 'boom', details: 'detail' });
  });

  it('wires the keyboard shortcut through the port and fires Continue in CLI', async () => {
    let capturedHandler: ((event: KeyboardEvent) => void) | null = null;
    const port = makePort({
      subscribeCapturedKeyDown: vi.fn((onKeyDown) => {
        capturedHandler = onKeyDown;
        return () => {};
      }),
      copyTextToClipboard: vi.fn(async () => true),
    });
    const open = vi.fn(async () => ({ kind: 'host' as const, ok: true }));
    renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        { trigger: vi.fn(), cancel: vi.fn(), error: null },
        makeDesignMdState({ exists: true }),
        { open },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        vi.fn(),
      ),
    );
    expect(capturedHandler).not.toBeNull();
    const event = new KeyboardEvent('keydown', continueInCliKeyDownInit());
    const preventDefault = vi.spyOn(event, 'preventDefault');
    await act(async () => {
      capturedHandler?.(event);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(port.copyTextToClipboard).toHaveBeenCalledOnce();
  });

  it('does not fire Continue in CLI from the shortcut when design.md does not exist yet', () => {
    let capturedHandler: ((event: KeyboardEvent) => void) | null = null;
    const port = makePort({
      subscribeCapturedKeyDown: vi.fn((onKeyDown) => {
        capturedHandler = onKeyDown;
        return () => {};
      }),
    });
    renderHook(() =>
      useProjectFinalizeActions(
        port,
        config,
        { trigger: vi.fn(), cancel: vi.fn(), error: null },
        makeDesignMdState({ exists: false }),
        { open: vi.fn() },
        { id: 'p1', name: 'Project One' },
        '/tmp/p1',
        vi.fn(),
      ),
    );
    const event = new KeyboardEvent('keydown', continueInCliKeyDownInit());
    const preventDefault = vi.spyOn(event, 'preventDefault');
    act(() => capturedHandler?.(event));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(port.copyTextToClipboard).not.toHaveBeenCalled();
  });
});
