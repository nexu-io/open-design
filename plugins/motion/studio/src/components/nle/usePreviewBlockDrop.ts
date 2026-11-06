import { useCallback, useRef, useState, type RefObject } from "react";
import { TIMELINE_BLOCK_MIME } from "../../utils/timelineAssetDrop";
import { usePreviewReadOnly } from "../editor/previewReadOnlyContext";

interface UsePreviewBlockDropOptions {
  portrait?: boolean;
  /**
   * Authored composition size measured from the live preview. Preferred over
   * the portrait fallback — hard-coding 1080/1920 places drops at the wrong
   * spot for any composition authored at another size (square, 720p, 4K).
   */
  compositionSize?: { width: number; height: number } | null;
  stageRef: RefObject<HTMLDivElement | null>;
  onBlockDrop?: (blockName: string, position: { left: number; top: number }) => void;
}

interface BlockDropPayload {
  name: string;
  dimensions?: { width: number; height: number };
}

function parseBlockPayload(raw: string): BlockDropPayload | null {
  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      dimensions?: { width: number; height: number };
    };
    return parsed.name ? (parsed as BlockDropPayload) : null;
  } catch {
    return null;
  }
}

function resolveCompositionPosition(
  clientX: number,
  clientY: number,
  stageRect: DOMRect,
  compositionSize: { width: number; height: number } | null | undefined,
  portrait: boolean | undefined,
): { left: number; top: number } | null {
  if (stageRect.width === 0 || stageRect.height === 0) return null;

  const normalizedX = (clientX - stageRect.left) / stageRect.width;
  const normalizedY = (clientY - stageRect.top) / stageRect.height;

  const compWidth = compositionSize?.width ?? (portrait ? 1080 : 1920);
  const compHeight = compositionSize?.height ?? (portrait ? 1920 : 1080);

  return {
    left: Math.max(0, Math.min(normalizedX * compWidth, compWidth)),
    top: Math.max(0, Math.min(normalizedY * compHeight, compHeight)),
  };
}

function centerBlockAtPosition(
  pos: { left: number; top: number },
  block: BlockDropPayload,
): { left: number; top: number } {
  const blockW = block.dimensions?.width ?? 0;
  const blockH = block.dimensions?.height ?? 0;
  return {
    left: Math.max(0, pos.left - blockW / 2),
    top: Math.max(0, pos.top - blockH / 2),
  };
}

export function usePreviewBlockDrop({
  portrait,
  compositionSize,
  stageRef,
  onBlockDrop: onBlockDropProp,
}: UsePreviewBlockDropOptions) {
  const onBlockDrop = usePreviewReadOnly() ? undefined : onBlockDropProp;
  const [isDragOver, setIsDragOver] = useState(false);
  // dragenter/dragleave fire for every internal element boundary; a depth
  // counter keeps the drop indicator steady instead of flickering.
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!onBlockDrop) return;
      if (!e.dataTransfer.types.includes(TIMELINE_BLOCK_MIME)) return;
      dragDepthRef.current += 1;
      setIsDragOver(true);
    },
    [onBlockDrop],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onBlockDrop) return;
      if (!e.dataTransfer.types.includes(TIMELINE_BLOCK_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      // dragenter/dragleave own the isDragOver flag (depth-counted).
    },
    [onBlockDrop],
  );

  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  // fallow-ignore-next-line complexity
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      dragDepthRef.current = 0;
      setIsDragOver(false);
      if (!onBlockDrop) return;

      const payload = e.dataTransfer.getData(TIMELINE_BLOCK_MIME);
      if (!payload) return;
      e.preventDefault();

      const block = parseBlockPayload(payload);
      const stage = stageRef.current;
      if (!block || !stage) return;

      const pos = resolveCompositionPosition(
        e.clientX,
        e.clientY,
        stage.getBoundingClientRect(),
        compositionSize,
        portrait,
      );
      if (!pos) return;

      onBlockDrop(block.name, centerBlockAtPosition(pos, block));
    },
    [onBlockDrop, stageRef, compositionSize, portrait],
  );

  return { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
