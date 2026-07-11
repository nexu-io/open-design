// @vitest-environment jsdom
//
// The chat-panel-resize hook against a fake `ProjectViewTransportPort`. The
// fake captures the injected resize/drag subscriptions so the test can drive
// them directly — no real ResizeObserver, no real pointer capture. A tiny
// harness component mounts the hook so `splitRef` binds to a real DOM node
// (the hook bails out of its DOM-touching calls when the ref is unset).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useChatPanelResize,
  type ChatPanelResizeController,
} from '../../../src/features/project-view/hooks/useChatPanelResize.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';
import type { ChatPanelPointerDragHandlers } from '../../../src/features/project-view/types';
import { MAX_CHAT_PANEL_WIDTH, MIN_CHAT_PANEL_WIDTH } from '../../../src/features/project-view/constants';

afterEach(cleanup);

// jsdom doesn't implement pointer capture; the hook calls it unconditionally
// on pointerdown, so stub it as a no-op for these tests.
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

interface Harness {
  port: ProjectViewTransportPort;
  fireResize: (splitWidth: number) => void;
  drag: ChatPanelPointerDragHandlers | null;
  stopResize: ReturnType<typeof vi.fn>;
  stopDrag: ReturnType<typeof vi.fn>;
}

function makeHarness(savedWidth = 460): Harness {
  let onResize: ((splitWidth: number) => void) | null = null;
  const stopResize = vi.fn();
  const stopDrag = vi.fn();
  const harness: Harness = {
    drag: null,
    stopResize,
    stopDrag,
    fireResize: (splitWidth) => onResize?.(splitWidth),
    port: {
      readProjectRawText: vi.fn(async () => null),
      extractMemory: vi.fn(async () => {}),
      loadQueuedChatSends: vi.fn(() => []),
      saveQueuedChatSends: vi.fn(),
      readSavedChatPanelWidth: vi.fn(() => savedWidth),
      saveChatPanelWidth: vi.fn(),
      readAutoSendAttachments: vi.fn(() => []),
      readAutoSendContext: vi.fn(() => null),
      clearAutoSendSession: vi.fn(),
      markDesignSystemAuditAutoRepairEligible: vi.fn(),
      consumeDesignSystemAuditAutoRepair: vi.fn(() => false),
      clearDesignSystemAuditAutoRepair: vi.fn(),
      subscribeSplitResize: vi.fn((_split, onResizeCb) => {
        onResize = onResizeCb;
        return stopResize;
      }),
      getSplitIsRtl: vi.fn(() => false),
      subscribeChatPanelPointerDrag: vi.fn((handlers) => {
        harness.drag = handlers;
        return stopDrag;
      }),
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
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => null),
    patchConversation: vi.fn(async () => null),
    deleteConversation: vi.fn(async () => true),
    fetchRunStatus: vi.fn(async () => null),
    subscribeBufferedTextFlushTriggers: vi.fn(() => () => {}),
    },
  };
  return harness;
}

function Harness({
  port,
  onController,
}: {
  port: ProjectViewTransportPort;
  onController: (c: ChatPanelResizeController) => void;
}) {
  const controller = useChatPanelResize(port);
  onController(controller);
  return (
    <div
      ref={controller.splitRef}
      data-testid="split"
      tabIndex={0}
      onPointerDown={controller.handleChatResizePointerDown}
      onKeyDown={controller.handleChatResizeKeyDown}
      onBlur={controller.handleChatResizeBlur}
    >
      <span data-testid="width">{controller.chatPanelWidth}</span>
      <span data-testid="max-width">{controller.chatPanelMaxWidth}</span>
      <span data-testid="resizing">{String(controller.resizingChatPanel)}</span>
    </div>
  );
}

function pointerDown(target: Element, clientX: number): void {
  fireEvent(
    target,
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX, pointerId: 1 }),
  );
}

describe('useChatPanelResize', () => {
  it('initializes width from the port and reacts to a split resize', () => {
    const h = makeHarness(500);
    let latest: ChatPanelResizeController | null = null;
    render(<Harness port={h.port} onController={(c) => (latest = c)} />);

    expect(screen.getByTestId('width').textContent).toBe('500');
    expect(screen.getByTestId('max-width').textContent).toBe(String(MAX_CHAT_PANEL_WIDTH));
    expect(h.port.subscribeSplitResize).toHaveBeenCalled();

    // A generous split leaves the max at its ceiling; the saved width (500)
    // already fits, so it survives the re-render unchanged.
    act(() => h.fireResize(2000));
    expect(screen.getByTestId('max-width').textContent).toBe(String(MAX_CHAT_PANEL_WIDTH));
    expect(screen.getByTestId('width').textContent).toBe('500');

    // A cramped split shrinks the max below the current width, clamping it down.
    act(() => h.fireResize(500));
    expect(screen.getByTestId('max-width').textContent).toBe('492');
    expect(screen.getByTestId('width').textContent).toBe('492');
    expect(latest).not.toBeNull();
  });

  it('a pointer drag applies the moved width without committing state, then commits + saves on end', () => {
    const h = makeHarness(460);
    render(<Harness port={h.port} onController={() => {}} />);
    const split = screen.getByTestId('split');

    pointerDown(split, 100);
    expect(h.port.getSplitIsRtl).toHaveBeenCalled();
    expect(screen.getByTestId('resizing').textContent).toBe('true');
    expect(h.port.subscribeChatPanelPointerDrag).toHaveBeenCalled();

    act(() => h.drag?.onMove(140)); // +40px
    // commitState:false during the drag — the committed width state is unchanged.
    expect(screen.getByTestId('width').textContent).toBe('460');

    act(() => h.drag?.onEnd());
    expect(screen.getByTestId('width').textContent).toBe('500');
    expect(screen.getByTestId('resizing').textContent).toBe('false');
    expect(h.port.saveChatPanelWidth).toHaveBeenCalledWith(500);
    expect(h.stopDrag).toHaveBeenCalled();
  });

  it('a cancelled drag restores the preferred width without saving', () => {
    const h = makeHarness(460);
    render(<Harness port={h.port} onController={() => {}} />);
    const split = screen.getByTestId('split');

    pointerDown(split, 100);
    act(() => h.drag?.onMove(160)); // +60px, not yet committed to state
    act(() => h.drag?.onCancel());

    expect(screen.getByTestId('width').textContent).toBe('460');
    expect(h.port.saveChatPanelWidth).not.toHaveBeenCalled();
  });

  it('ArrowRight/ArrowLeft/Home/End step, clamp, and persist the width', () => {
    const h = makeHarness(460);
    render(<Harness port={h.port} onController={() => {}} />);
    const split = screen.getByTestId('split');

    fireEvent.keyDown(split, { key: 'ArrowRight' });
    expect(screen.getByTestId('width').textContent).toBe('476');
    expect(h.port.saveChatPanelWidth).toHaveBeenLastCalledWith(476);

    fireEvent.keyDown(split, { key: 'ArrowLeft' });
    expect(screen.getByTestId('width').textContent).toBe('460');

    fireEvent.keyDown(split, { key: 'Home' });
    expect(screen.getByTestId('width').textContent).toBe(String(MIN_CHAT_PANEL_WIDTH));

    fireEvent.keyDown(split, { key: 'End' });
    expect(screen.getByTestId('width').textContent).toBe(String(MAX_CHAT_PANEL_WIDTH));

    fireEvent.keyDown(split, { key: 'Tab' });
    // An unhandled key is a no-op — no extra save beyond the four above.
    expect((h.port.saveChatPanelWidth as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it('a blur mid-drag restores the preferred width and tears the drag down', () => {
    const h = makeHarness(460);
    render(<Harness port={h.port} onController={() => {}} />);
    const split = screen.getByTestId('split');

    pointerDown(split, 100);
    act(() => h.drag?.onMove(140));
    fireEvent.blur(split);

    expect(screen.getByTestId('width').textContent).toBe('460');
    expect(h.stopDrag).toHaveBeenCalled();
    expect(h.port.saveChatPanelWidth).not.toHaveBeenCalled();
  });

  it('unmount tears down the split-resize subscription without saving', () => {
    const h = makeHarness(460);
    const { unmount } = render(<Harness port={h.port} onController={() => {}} />);
    unmount();
    expect(h.stopResize).toHaveBeenCalled();
    expect(h.port.saveChatPanelWidth).not.toHaveBeenCalled();
  });
});
