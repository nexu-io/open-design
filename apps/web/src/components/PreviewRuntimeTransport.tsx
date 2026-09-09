import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { PreviewRuntimeCapability } from '@open-design/contracts/runtime/preview-runtime';
import {
  previewRuntimeCapabilitiesForViewer,
  type PreviewRuntimeViewerState,
} from '../runtime/preview-runtime-capabilities';
import {
  replayPreviewBridgeModes,
  type PreviewBridgeModeState,
} from '../runtime/replay-preview-bridge-modes';
import {
  PreviewSessionFrames,
  type PreviewSessionFramesProps,
} from './PreviewSessionFrames';

export interface PreviewRuntimeTransportProps extends Omit<
  PreviewSessionFramesProps,
  'enabledCapabilities' | 'onCapabilitiesApplied'
> {
  viewerState: PreviewRuntimeViewerState;
  bridgeModeState: PreviewBridgeModeState;
  onCapabilitiesApplied?: (
    frame: HTMLIFrameElement,
    capabilities: readonly PreviewRuntimeCapability[],
  ) => void;
}

interface PreviewBridgeSemanticState {
  active: boolean;
  workspaceActive: boolean;
  commentEnabled: boolean;
  commentMode: string;
  commentTargetElementId: string | null;
  commentTargetSelector: string | null;
  deckSlideIndex: number | null;
  editEnabled: boolean;
  editLiveStylesRevision: string;
  inspectEnabled: boolean;
  inspectOverrides: unknown;
  selectedEditTargetId: string | null;
}

/**
 * Compose the retained real-URL frame lifecycle with host-owned interaction
 * state. Capability acknowledgements are fenced to one exact document before
 * any matching mode payload is replayed; later mode changes only post messages
 * to the retained current frame and never mutate its URL.
 *
 * FileViewer consumes this boundary for every settled HTML file. The loaded
 * document remains the same real-URL browsing context while UI modes change.
 */
export function PreviewRuntimeTransport({
  viewerState,
  bridgeModeState,
  active,
  onCurrentFrameChange,
  onCapabilitiesApplied,
  ...frameProps
}: PreviewRuntimeTransportProps) {
  const enabledCapabilities = useMemo(() => previewRuntimeCapabilitiesForViewer(viewerState), [
    viewerState.comment,
    viewerState.deck,
    viewerState.draw,
    viewerState.edit,
    viewerState.inspect,
  ]);
  const currentFrameRef = useRef<HTMLIFrameElement | null>(null);
  const retainedCurrentFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previousSemanticStateRef = useRef<PreviewBridgeSemanticState | null>(null);
  const appliedCapabilitiesRef = useRef(
    new WeakMap<HTMLIFrameElement, readonly PreviewRuntimeCapability[]>(),
  );
  const modeStateRef = useRef(bridgeModeState);
  const callbacksRef = useRef({ onCurrentFrameChange, onCapabilitiesApplied });
  const commentTargetElementId = bridgeModeState.commentActiveTarget?.elementId ?? null;
  const commentTargetSelector = bridgeModeState.commentActiveTarget?.selector ?? null;
  const editLiveStylesRevision = JSON.stringify(
    bridgeModeState.editLiveStyles.map(({ id, version }) => [id, version]),
  );
  const semanticState: PreviewBridgeSemanticState = {
    active: bridgeModeState.active,
    workspaceActive: bridgeModeState.workspaceActive,
    commentEnabled: bridgeModeState.commentEnabled,
    commentMode: bridgeModeState.commentMode,
    commentTargetElementId,
    commentTargetSelector,
    deckSlideIndex: bridgeModeState.deckSlideIndex ?? null,
    editEnabled: bridgeModeState.editEnabled,
    editLiveStylesRevision,
    inspectEnabled: bridgeModeState.inspectEnabled,
    inspectOverrides: bridgeModeState.inspectOverrides,
    selectedEditTargetId: bridgeModeState.selectedEditTargetId,
  };
  modeStateRef.current = bridgeModeState;
  callbacksRef.current = { onCurrentFrameChange, onCapabilitiesApplied };

  const replayToFrame = useCallback((
    frame: HTMLIFrameElement,
    capabilities: readonly PreviewRuntimeCapability[],
  ) => {
    replayPreviewBridgeModes(frame.contentWindow, modeStateRef.current, capabilities);
  }, []);

  const handleCapabilitiesApplied = useCallback((
    frame: HTMLIFrameElement,
    capabilities: readonly PreviewRuntimeCapability[],
  ) => {
    appliedCapabilitiesRef.current.set(frame, capabilities);
    replayToFrame(frame, capabilities);
    callbacksRef.current.onCapabilitiesApplied?.(frame, capabilities);
  }, [replayToFrame]);

  const handleCurrentFrameChange = useCallback((frame: HTMLIFrameElement | null) => {
    currentFrameRef.current = frame;
    if (frame) {
      retainedCurrentFrameRef.current = frame;
      // Capability acknowledgement restores the complete host state before a
      // standby is allowed to become current. Do not replay navigation or
      // edit/comment work here: that could double-drive authored runtimes.
    } else if (active) {
      retainedCurrentFrameRef.current = null;
    }
    callbacksRef.current.onCurrentFrameChange?.(frame);
    if (frame && appliedCapabilitiesRef.current.get(frame)?.includes('deck')) {
      // The Deck module reports synchronously while applying the pre-promotion
      // host-owned slide. Active-frame filters correctly ignore that standby
      // report, so query state once the exact frame has become current. This
      // message never navigates and is safe on Preview/Code reactivation.
      frame.contentWindow?.postMessage({ type: 'od:slide-state-probe' }, '*');
    }
  }, [active]);

  useEffect(() => {
    const previous = previousSemanticStateRef.current;
    previousSemanticStateRef.current = semanticState;
    if (!previous) return;
    const frame = currentFrameRef.current ?? retainedCurrentFrameRef.current;
    if (!frame) return;
    const appliedCapabilities = appliedCapabilitiesRef.current.get(frame);
    if (!appliedCapabilities) return;

    const changedCapabilities = new Set<PreviewRuntimeCapability>();
    if (previous.workspaceActive !== semanticState.workspaceActive) {
      if (semanticState.workspaceActive) {
        for (const capability of appliedCapabilities) changedCapabilities.add(capability);
      } else {
        changedCapabilities.add('observability');
      }
    } else {
      if (previous.active !== semanticState.active) changedCapabilities.add('observability');
      if (
        previous.commentEnabled !== semanticState.commentEnabled
        || previous.commentMode !== semanticState.commentMode
        || previous.commentTargetElementId !== semanticState.commentTargetElementId
        || previous.commentTargetSelector !== semanticState.commentTargetSelector
      ) {
        changedCapabilities.add('comment');
      }
      if (
        previous.editEnabled !== semanticState.editEnabled
        || previous.selectedEditTargetId !== semanticState.selectedEditTargetId
        || previous.editLiveStylesRevision !== semanticState.editLiveStylesRevision
      ) {
        changedCapabilities.add('edit');
      }
      if (
        previous.inspectEnabled !== semanticState.inspectEnabled
        || previous.inspectOverrides !== semanticState.inspectOverrides
      ) {
        changedCapabilities.add('inspect');
      }
      if (previous.deckSlideIndex !== semanticState.deckSlideIndex) {
        changedCapabilities.add('deck');
      }
    }
    if (changedCapabilities.size === 0) return;
    const capabilitiesToReplay = appliedCapabilities.filter((capability) => (
      changedCapabilities.has(capability)
    ));
    if (capabilitiesToReplay.length > 0) replayToFrame(frame, capabilitiesToReplay);
  }, [
    semanticState.active,
    semanticState.commentEnabled,
    semanticState.commentMode,
    commentTargetElementId,
    commentTargetSelector,
    semanticState.deckSlideIndex,
    semanticState.editEnabled,
    editLiveStylesRevision,
    semanticState.inspectEnabled,
    semanticState.inspectOverrides,
    semanticState.selectedEditTargetId,
    semanticState.workspaceActive,
    replayToFrame,
  ]);

  return (
    <PreviewSessionFrames
      {...frameProps}
      active={active}
      enabledCapabilities={enabledCapabilities}
      onCurrentFrameChange={handleCurrentFrameChange}
      onCapabilitiesApplied={handleCapabilitiesApplied}
    />
  );
}
