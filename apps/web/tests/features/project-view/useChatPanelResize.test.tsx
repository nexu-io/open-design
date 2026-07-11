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
