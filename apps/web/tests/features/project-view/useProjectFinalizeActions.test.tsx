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
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => null),
    patchConversation: vi.fn(async () => null),
    deleteConversation: vi.fn(async () => true),
