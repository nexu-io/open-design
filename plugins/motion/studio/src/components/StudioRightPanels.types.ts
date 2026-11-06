/**
 * Props for StudioRightPanels.
 *
 * Kept beside the component rather than inside it: the panel is at the file-size
 * cap, and this block is the part that changes least, so moving it keeps the
 * component's own diffs small and readable.
 */

import type { StudioEditPersistenceProps } from "./panels/VariablesPanel";
import type { BlockParam } from "@hyperframes/core/registry";
import type { Composition } from "@hyperframes/sdk";
import type { UseSlideshowPersistParams } from "../hooks/useSlideshowPersist";
import type { AddMediaOverlayHandler } from "./editor/propertyPanelTypes";
import type { ToggleHiddenHandler } from "../utils/studioHelpers";

export interface StudioRightPanelsProps extends StudioEditPersistenceProps {
  activeBlockParams?: {
    blockName: string;
    blockTitle: string;
    params: BlockParam[];
    compositionPath: string;
  } | null;
  onCloseBlockParams?: () => void;
  /** Drops the block-params view without touching the dock (selection or leaving Design). */
  onDismissBlockParams: () => void;
  recordingState?: "idle" | "recording" | "preview";
  recordingDuration?: number;
  onToggleRecording?: () => void;
  /** Dependencies for the Slideshow persist callback, threaded from App.tsx. */
  sdkSession: Composition | null;
  publishSdkSession: NonNullable<UseSlideshowPersistParams["publishSdkSession"]>;
  /**
   * Forces THIS `sdkSession` to re-open from disk. DesignPanelPromoteProvider
   * opens its own separate SDK session scoped to the selected element's own
   * file (needed so promoting inside a sub-composition binds a variable there,
   * not on the host) — for a top-level selection that's the SAME file this
   * session already has open, so a write through that other session leaves
   * this one holding stale in-memory content. The self-write-echo registry
   * that normally suppresses redundant reloads is keyed by file path only, not
   * by session instance, so it wrongly treats the sibling session's write as
   * "our own echo" and never reloads on its own — this must be called
   * explicitly after such a write.
   */
  forceReloadSdkSession?: () => void;
  reloadPreview: () => void;
  recordEdit: (entry: {
    label: string;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
  onToggleElementHidden?: ToggleHiddenHandler;
  onAutoGroupCarveSources?: (clipIds: readonly string[], groupId: string) => Promise<void>;
  onAddMediaOverlay?: AddMediaOverlayHandler;
}
