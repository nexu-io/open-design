import type { ComponentProps } from "react";
import { DomEditOverlay } from "./DomEditOverlay";
import {
  useDomEditActionsContext,
  useDomEditSelectionContext,
} from "../../contexts/DomEditContext";
import { useDomEditZOrder } from "./useDomEditZOrder";

type HostInputProps = Pick<
  ComponentProps<typeof DomEditOverlay>,
  "canvasInput" | "onSelectionBoxClick" | "allowBodyDrag"
>;

export interface ConnectedDomEditOverlayProps extends HostInputProps {
  activeCompositionPath: string | null;
  showHoverSelection: boolean;
  shouldShowSelectedDomBounds: boolean;
  isGestureRecording?: boolean;
  /** True when an in-place text edit opens its caret, false when it ends or unmounts. */
  onTextEditingChange?: (editing: boolean) => void;
}

// Studio's DomEditOverlay wired to the session in DomEditProvider, so a host
// outside EditorShell mounts the same canvas editing without its own callbacks.
export function ConnectedDomEditOverlay({
  activeCompositionPath,
  showHoverSelection,
  shouldShowSelectedDomBounds,
  isGestureRecording,
  canvasInput,
  allowBodyDrag,
  onTextEditingChange,
  onSelectionBoxClick,
}: ConnectedDomEditOverlayProps) {
  const { domEditHoverSelection, domEditSelection, domEditGroupSelections } =
    useDomEditSelectionContext();
  const {
    previewIframeRef,
    handlePreviewCanvasMouseDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerLeave,
    applyDomSelection,
    handleBlockedDomMove,
    handleDomManualDragStart,
    handleDomPathOffsetCommit,
    handleDomGroupPathOffsetCommit,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    handleDomStyleCommit,
    applyMarqueeSelection,
    handleDomEditElementDelete,
  } = useDomEditActionsContext();
  const zOrder = useDomEditZOrder();

  return (
    <DomEditOverlay
      iframeRef={previewIframeRef}
      activeCompositionPath={activeCompositionPath}
      hoverSelection={showHoverSelection ? domEditHoverSelection : null}
      selection={shouldShowSelectedDomBounds ? domEditSelection : null}
      groupSelections={shouldShowSelectedDomBounds ? domEditGroupSelections : []}
      allowCanvasMovement={!isGestureRecording}
      canvasInput={canvasInput}
      allowBodyDrag={allowBodyDrag}
      onTextEditingChange={onTextEditingChange}
      onSelectionBoxClick={onSelectionBoxClick}
      onCanvasMouseDown={handlePreviewCanvasMouseDown}
      onCanvasPointerMove={handlePreviewCanvasPointerMove}
      onCanvasPointerLeave={handlePreviewCanvasPointerLeave}
      onSelectionChange={applyDomSelection}
      onBlockedMove={handleBlockedDomMove}
      onManualDragStart={handleDomManualDragStart}
      onPathOffsetCommit={handleDomPathOffsetCommit}
      onGroupPathOffsetCommit={handleDomGroupPathOffsetCommit}
      onBoxSizeCommit={handleDomBoxSizeCommit}
      onRotationCommit={handleDomRotationCommit}
      onStyleCommit={handleDomStyleCommit}
      onDeleteSelection={handleDomEditElementDelete}
      onApplyZIndex={zOrder.commit}
      onMarqueeSelect={applyMarqueeSelection}
    />
  );
}
