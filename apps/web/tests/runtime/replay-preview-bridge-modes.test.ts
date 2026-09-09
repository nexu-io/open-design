import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE } from '@open-design/contracts/runtime/preview-observability';
import { replayPreviewBridgeModes } from '../../src/runtime/replay-preview-bridge-modes';

function state() {
  return {
    active: true,
    workspaceActive: true,
    commentEnabled: true,
    commentMode: 'picker',
    editEnabled: true,
    selectedEditTargetId: 'hero',
    editLiveStyles: [{ id: 'hero', styles: { color: 'red' }, version: 3 }],
    inspectEnabled: true,
  };
}

describe('replayPreviewBridgeModes', () => {
  it('preserves the legacy message order when capabilities are not fenced', () => {
    const target = { postMessage: vi.fn() };

    replayPreviewBridgeModes(target, state());

    expect(target.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE, active: true },
      { type: 'od:comment-mode', enabled: true, mode: 'picker' },
      { type: 'od-edit-mode', enabled: true },
      { type: 'od-edit-selected-target', id: 'hero' },
      { type: 'od-edit-preview-style', id: 'hero', styles: { color: 'red' }, version: 3 },
      { type: 'od:inspect-mode', enabled: true },
    ]);
    expect(target.postMessage.mock.calls.every(([, origin]) => origin === '*')).toBe(true);
  });

  it('reports inactive observability without replaying interaction state', () => {
    const target = { postMessage: vi.fn() };

    replayPreviewBridgeModes(target, {
      ...state(),
      active: false,
      workspaceActive: false,
    });

    expect(target.postMessage).toHaveBeenCalledTimes(1);
    expect(target.postMessage).toHaveBeenCalledWith({
      type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
      active: false,
    }, '*');
  });

  it('only replays modes whose runtime capabilities were exactly applied', () => {
    const target = { postMessage: vi.fn() };

    replayPreviewBridgeModes(target, state(), ['observability', 'edit']);

    expect(target.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE, active: true },
      { type: 'od-edit-mode', enabled: true },
      { type: 'od-edit-selected-target', id: 'hero' },
      { type: 'od-edit-preview-style', id: 'hero', styles: { color: 'red' }, version: 3 },
    ]);
  });

  it('clears the selected edit target and skips live styles when edit is disabled', () => {
    const target = { postMessage: vi.fn() };

    replayPreviewBridgeModes(target, { ...state(), editEnabled: false }, ['edit']);

    expect(target.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'od-edit-mode', enabled: false },
      { type: 'od-edit-selected-target', id: null },
    ]);
  });

  it('restores document-scoped comment, inspect, and Deck state after capability application', () => {
    const target = { postMessage: vi.fn() };

    replayPreviewBridgeModes(target, {
      ...state(),
      commentActiveTarget: { elementId: 'hero', selector: '#hero' },
      inspectOverrides: { hero: { color: 'red' } },
      deckSlideIndex: 4.8,
    }, ['comment', 'inspect', 'deck']);

    expect(target.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'od:comment-mode', enabled: true, mode: 'picker' },
      { type: 'od:comment-active-target', elementId: 'hero', selector: '#hero' },
      { type: 'od:inspect-mode', enabled: true },
      { type: 'od:inspect-replay', overrides: { hero: { color: 'red' } } },
      { type: 'od:slide', action: 'go', index: 4 },
    ]);
  });
});
