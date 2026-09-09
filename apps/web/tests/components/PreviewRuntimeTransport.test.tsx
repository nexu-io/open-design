// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  type PreviewRuntimeCapability,
} from '@open-design/contracts/runtime/preview-runtime';
import { IframeKeepAliveProvider } from '../../src/components/IframeKeepAlivePool';
import { PreviewRuntimeTransport } from '../../src/components/PreviewRuntimeTransport';
import type { PreviewBridgeModeState } from '../../src/runtime/replay-preview-bridge-modes';
import type { PreviewRuntimeViewerState } from '../../src/runtime/preview-runtime-capabilities';
import type { PreviewSessionNavigation } from '../../src/runtime/preview-session-navigation';

afterEach(cleanup);

const navigation: PreviewSessionNavigation = {
  sessionId: 'scope-0001',
  documentVersion: 'v1',
  url: 'http://n-scope-0001.localhost:17456/index.html?v=v1',
  runtimeProtocol: 'universal',
  sandboxProfile: 'normal',
  deck: false,
};

const defaultViewerState: PreviewRuntimeViewerState = {
  deck: false,
  comment: true,
  inspect: false,
  draw: false,
  edit: false,
};

function bridgeModeState(overrides: Partial<PreviewBridgeModeState> = {}): PreviewBridgeModeState {
  return {
    active: true,
    workspaceActive: true,
    commentEnabled: true,
    commentMode: 'inspect',
    editEnabled: false,
    selectedEditTargetId: null,
    editLiveStyles: [],
    inspectEnabled: false,
    ...overrides,
  };
}

function view(options: {
  viewerState?: PreviewRuntimeViewerState;
  modeState?: PreviewBridgeModeState;
  active?: boolean;
} = {}) {
  return (
    <IframeKeepAliveProvider>
      <PreviewRuntimeTransport
        projectId="project-1"
        fileName="index.html"
        navigation={navigation}
        viewerState={options.viewerState ?? defaultViewerState}
        bridgeModeState={options.modeState ?? bridgeModeState()}
        active={options.active ?? true}
      />
    </IframeKeepAliveProvider>
  );
}

function signal(
  frame: HTMLIFrameElement,
  type: 'od:preview:hello' | 'od:preview:capabilities-applied' | 'od:preview:presentation-state-applied' | 'od:preview:ready',
  capabilities: readonly PreviewRuntimeCapability[],
  revision = 1,
) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type,
        protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
        sessionId: navigation.sessionId,
        documentVersion: navigation.documentVersion,
        ...(type === 'od:preview:hello' ? { availableCapabilities: capabilities } : {}),
        ...(type === 'od:preview:capabilities-applied'
          ? { enabledCapabilities: capabilities }
          : {}),
        ...(type === 'od:preview:presentation-state-applied' ? { revision } : {}),
      },
    }));
  });
}

describe('PreviewRuntimeTransport', () => {
  it('replays mode state only after the exact capability acknowledgement', () => {
    render(view());
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const available: PreviewRuntimeCapability[] = ['observability', 'comment'];

    signal(frame, 'od:preview:hello', available);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: available,
    }), '*');
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:comment-mode',
    }), '*');

    signal(frame, 'od:preview:capabilities-applied', available);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:comment-mode',
      enabled: true,
      mode: 'inspect',
    }, '*');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:presentation-state-barrier',
      revision: 1,
    }), '*');
  });

  it('changes comment mode on the retained frame without changing its URL', () => {
    const firstMode = bridgeModeState();
    const { rerender } = render(view({ modeState: firstMode }));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const available: PreviewRuntimeCapability[] = ['observability', 'comment'];
    signal(frame, 'od:preview:hello', available);
    signal(frame, 'od:preview:capabilities-applied', available);
    signal(frame, 'od:preview:ready', available);
    signal(frame, 'od:preview:presentation-state-applied', available);
    const src = frame.getAttribute('src');

    postMessage.mockClear();
    rerender(view({ modeState: bridgeModeState({ commentMode: 'picker' }) }));

    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    expect(frame.getAttribute('src')).toBe(src);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:comment-mode',
      enabled: true,
      mode: 'picker',
    }, '*');
  });

  it('does not replay semantically unchanged host state from fresh object identities', () => {
    const viewerState = { ...defaultViewerState, deck: true, edit: true };
    const currentModeState = () => bridgeModeState({
      commentActiveTarget: { elementId: 'hero', selector: '#hero' },
      deckSlideIndex: 2,
      editEnabled: true,
      selectedEditTargetId: 'hero',
      editLiveStyles: [{ id: 'hero', styles: { color: 'red' }, version: 4 }],
    });
    const { rerender } = render(view({ viewerState, modeState: currentModeState() }));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const capabilities: PreviewRuntimeCapability[] = [
      'observability',
      'comment',
      'edit',
      'deck',
    ];
    signal(frame, 'od:preview:hello', capabilities);
    signal(frame, 'od:preview:capabilities-applied', capabilities);
    signal(frame, 'od:preview:ready', capabilities);
    signal(frame, 'od:preview:presentation-state-applied', capabilities);

    postMessage.mockClear();
    rerender(view({ viewerState, modeState: currentModeState() }));

    expect(postMessage).not.toHaveBeenCalled();

    rerender(view({
      viewerState,
      modeState: bridgeModeState({
        commentActiveTarget: { elementId: 'hero', selector: '#hero' },
        deckSlideIndex: 2,
        editEnabled: true,
        selectedEditTargetId: 'hero',
        editLiveStyles: [{ id: 'hero', styles: { color: 'blue' }, version: 5 }],
      }),
    }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-preview-style',
      id: 'hero',
      styles: { color: 'blue' },
      version: 5,
    }, '*');
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od:preview-observability-host-state' }),
      '*',
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od:comment-mode' }),
      '*',
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od:slide' }),
      '*',
    );
  });

  it('replays live edit state after enabling edit without replacing the frame', () => {
    const { rerender } = render(view({
      viewerState: { ...defaultViewerState, comment: false },
      modeState: bridgeModeState({ commentEnabled: false }),
    }));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    signal(frame, 'od:preview:hello', ['observability', 'edit']);
    signal(frame, 'od:preview:capabilities-applied', ['observability']);
    signal(frame, 'od:preview:ready', ['observability']);
    signal(frame, 'od:preview:presentation-state-applied', ['observability']);
    const src = frame.getAttribute('src');

    postMessage.mockClear();
    rerender(view({
      viewerState: { ...defaultViewerState, comment: false, edit: true },
      modeState: bridgeModeState({
        commentEnabled: false,
        editEnabled: true,
        selectedEditTargetId: 'hero',
        editLiveStyles: [{ id: 'hero', styles: { color: 'red' }, version: 4 }],
      }),
    }));
    expect(frame.getAttribute('src')).toBe(src);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['observability', 'edit'],
    }), '*');
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'od-edit-preview-style' }),
      '*',
    );

    signal(frame, 'od:preview:capabilities-applied', ['observability', 'edit']);
    signal(frame, 'od:preview:presentation-state-applied', ['observability', 'edit'], 2);
    expect(frame.getAttribute('src')).toBe(src);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od-edit-preview-style',
      id: 'hero',
      styles: { color: 'red' },
      version: 4,
    }, '*');
  });

  it('suspends by visibility and reports inactive observability without navigation', () => {
    const { rerender } = render(view());
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    signal(frame, 'od:preview:hello', ['observability', 'comment']);
    signal(frame, 'od:preview:capabilities-applied', ['observability', 'comment']);
    signal(frame, 'od:preview:ready', ['observability', 'comment']);
    signal(frame, 'od:preview:presentation-state-applied', ['observability', 'comment']);
    const src = frame.getAttribute('src');

    postMessage.mockClear();
    rerender(view({
      active: false,
      modeState: bridgeModeState({ active: false, workspaceActive: false }),
    }));

    expect(frame.getAttribute('src')).toBe(src);
    expect(frame).toHaveAttribute('data-od-active', 'false');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:preview-observability-host-state',
      active: false,
    }, '*');

    postMessage.mockClear();
    rerender(view({ active: true, modeState: bridgeModeState() }));

    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    expect(frame.getAttribute('src')).toBe(src);
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: unknown } | null)?.type === 'od:preview-observability-host-state'
    ))).toHaveLength(1);
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: unknown } | null)?.type === 'od:comment-mode'
    ))).toHaveLength(1);
  });

  it('restores host-owned document state before promoting a replacement frame', () => {
    render(view({
      viewerState: {
        ...defaultViewerState,
        deck: true,
        inspect: true,
      },
      modeState: bridgeModeState({
        commentActiveTarget: { elementId: 'hero', selector: '#hero' },
        inspectEnabled: true,
        inspectOverrides: { hero: { color: 'red' } },
        deckSlideIndex: 6,
      }),
    }));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const capabilities: PreviewRuntimeCapability[] = [
      'observability',
      'comment',
      'inspect',
      'deck',
    ];

    signal(frame, 'od:preview:hello', capabilities);
    signal(frame, 'od:preview:capabilities-applied', capabilities);

    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:comment-active-target',
      elementId: 'hero',
      selector: '#hero',
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:inspect-replay',
      overrides: { hero: { color: 'red' } },
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:slide',
      action: 'go',
      index: 6,
    }, '*');

    postMessage.mockClear();
    signal(frame, 'od:preview:ready', capabilities);
    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    signal(frame, 'od:preview:presentation-state-applied', capabilities);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    // Promotion asks the now-active Deck for its current state. This is a
    // read-only reconciliation probe; host-owned state restoration above must
    // still finish before the frame becomes current.
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:slide-state-probe',
    }, '*');
  });
});
