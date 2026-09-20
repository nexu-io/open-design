import { describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_RUNTIME_CAPABILITIES,
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  type PreviewRuntimeCapability,
} from '@open-design/contracts/runtime/preview-runtime';
import {
  previewRuntimeCapabilitiesForViewer,
  type PreviewRuntimeViewerState,
} from '../../src/runtime/preview-runtime-capabilities';
import { PreviewRuntimeController } from '../../src/runtime/preview-runtime-controller';
import {
  replayPreviewBridgeModes,
  type PreviewBridgeModeState,
} from '../../src/runtime/replay-preview-bridge-modes';

/**
 * The scroll bridge must stay up across an Edit-mode exit.
 *
 * Written while diagnosing "leaving Edit loses the HTML preview scroll
 * position", and kept because it pins an invariant and closes a theory.
 *
 * The suspected mechanism was that an Edit exit renegotiates the capability
 * set so that `scroll` is momentarily off in the frame, making the injected
 * scroll module drop `od:preview-scroll-restore` (its handler is guarded by
 * `scrollEnabled`). These cases pin the host half of that theory: the desired
 * capability set carries `scroll` unconditionally, and the single command an
 * Edit exit produces keeps `scroll` enabled. On a RETAINED document the scroll
 * bridge therefore never goes down, and the drop-on-disabled path cannot be
 * the explanation.
 *
 * They also pin what the exit does NOT do: the mode replay that runs on an
 * Edit exit carries no scroll message at all, so re-establishing the position
 * is left entirely to the host's own restore timers / the promotion callback.
 */

const identity = { sessionId: 'session-1', documentVersion: 'version-1' };

function viewerState(edit: boolean): PreviewRuntimeViewerState {
  return { deck: false, comment: false, inspect: false, draw: false, edit };
}

function everyViewerState(): PreviewRuntimeViewerState[] {
  const states: PreviewRuntimeViewerState[] = [];
  for (const deck of [false, true]) {
    for (const comment of [false, true]) {
      for (const inspect of [false, true]) {
        for (const draw of [false, true]) {
          for (const edit of [false, true]) {
            states.push({ deck, comment, inspect, draw, edit });
          }
        }
      }
    }
  }
  return states;
}

describe('preview scroll capability across an Edit-mode exit', () => {
  it('keeps scroll in the desired capability set for every viewer mode combination', () => {
    for (const state of everyViewerState()) {
      expect(
        previewRuntimeCapabilitiesForViewer(state),
        `scroll must survive ${JSON.stringify(state)}`,
      ).toContain('scroll');
    }
  });

  it('never commands a capability set without scroll when Edit closes', () => {
    const target = { postMessage: vi.fn() };
    const controller = new PreviewRuntimeController({
      identity,
      target,
      enabledCapabilities: previewRuntimeCapabilitiesForViewer(viewerState(true)),
    });

    controller.handleMessage({
      source: target,
      data: {
        type: 'od:preview:hello',
        protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
        ...identity,
        availableCapabilities: [...PREVIEW_RUNTIME_CAPABILITIES],
      },
    });
    expect(target.postMessage).toHaveBeenCalledTimes(1);
    expect(target.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: expect.arrayContaining(['scroll', 'edit']),
    });

    // The Edit exit. Exactly one further command, and it must not take the
    // scroll bridge down on the way out.
    controller.setEnabledCapabilities(
      previewRuntimeCapabilitiesForViewer(viewerState(false)),
    );
    expect(target.postMessage).toHaveBeenCalledTimes(2);
    const exitCommand = target.postMessage.mock.calls.at(-1)?.[0] as {
      type: string;
      enabledCapabilities: PreviewRuntimeCapability[];
    };
    expect(exitCommand.type).toBe('od:preview:set-capabilities');
    expect(exitCommand.enabledCapabilities).toContain('scroll');
    expect(exitCommand.enabledCapabilities).not.toContain('edit');

    // Belt and braces: no command in this whole exchange ever omits scroll,
    // so the frame's `scrollEnabled` switch is never driven to false.
    for (const [message] of target.postMessage.mock.calls) {
      const command = message as {
        type: string;
        enabledCapabilities?: PreviewRuntimeCapability[];
      };
      if (command.type !== 'od:preview:set-capabilities') continue;
      expect(command.enabledCapabilities).toContain('scroll');
    }
  });

  it('replays no scroll state when Edit closes', () => {
    const target = { postMessage: vi.fn() };
    const state: PreviewBridgeModeState = {
      active: true,
      workspaceActive: true,
      commentEnabled: false,
      commentMode: 'inspect',
      editEnabled: false,
      selectedEditTargetId: null,
      editLiveStyles: [],
      inspectEnabled: false,
      commentActiveTarget: null,
      inspectOverrides: undefined,
      deckSlideIndex: null,
    };

    replayPreviewBridgeModes(
      target,
      state,
      previewRuntimeCapabilitiesForViewer(viewerState(false)),
    );

    expect(target.postMessage).toHaveBeenCalled();
    for (const [message] of target.postMessage.mock.calls) {
      expect(String((message as { type?: unknown }).type)).not.toMatch(/scroll/u);
    }
  });
});
