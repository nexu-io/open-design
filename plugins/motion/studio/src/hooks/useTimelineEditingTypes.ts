import type { MutableRefObject, RefObject } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { TimelineElement } from "../player";
import type { TimelineStackingReorderIntent } from "../player/components/timelineEditing";
import type { PublishSdkSession } from "../utils/sdkCutover";
import type { CanEditTimelineElement } from "./timelineEditPermission";

interface RecordEditInput {
  label: string;
  coalesceKey?: string;
  files: Record<string, { before: string; after: string }>;
}

// Resolves once the z-index patches are persisted, so a caller that also writes
// the same file (e.g. a timing move) can order its write after this one.
export type TimelineZIndexReorderCommit = (
  entries: Array<{
    element: HTMLElement;
    zIndex: number;
    id?: string;
    selector?: string;
    selectorIndex?: number;
    sourceFile: string;
    key?: string;
  }>,
  coalesceKey?: string,
) => Promise<import("./domEditCommitTypes").DomEditPatchBatchesResult | undefined | void>;

export interface UseTimelineEditingOptions {
  projectId: string | null;
  activeCompPath: string | null;
  timelineElements: TimelineElement[];
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  observeProjectFileVersion?: (path: string, version: string | null) => void;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  previewIframeRef: RefObject<HTMLIFrameElement | null>;
  pendingTimelineEditPathRef: MutableRefObject<Set<string>>;
  uploadProjectFiles: (files: Iterable<File>, dir?: string) => Promise<string[]>;
  isRecordingRef?: RefObject<boolean>;
  /** Stage 7 §3.2: SDK session for routing timing ops through setTiming. */
  sdkSession?: Composition | null;
  /** Publish a fully persisted candidate SDK session. */
  publishSdkSession?: PublishSdkSession;
  /** Resync the SDK session after a server-authoritative timeline write. */
  forceReloadSdkSession?: () => void;
  /** Reparse authored animations after a timing rewrite changes their positions. */
  invalidateGsapCache?: () => void;
  handleDomZIndexReorderCommitRef?: MutableRefObject<TimelineZIndexReorderCommit | null>;
  /** Refuses a hand edit at the persist boundary when set; absent = Studio unchanged. */
  canEdit?: CanEditTimelineElement;
}

export type TimelineFileDropHandler = (
  files: File[],
  placement?: { start: number; track: number },
) => Promise<void>;

/** What a timeline move commits: the new start and track, plus the z-index
 *  reorder a vertical drag resolves to (absent for a pure horizontal move). */
export type TimelineMoveUpdates = Pick<TimelineElement, "start" | "track"> & {
  stackingReorder?: TimelineStackingReorderIntent | null;
};
