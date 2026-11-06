import type { ParsedGsap } from "@hyperframes/core/gsap-parser";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { PublishSdkSession } from "../utils/sdkCutover";
import type { StudioEditInFlight } from "../utils/studioPendingEdits";
import type { RuntimeTweenChange } from "./gsapRuntimePatch";
import type { KeyframeUsageAction } from "../utils/keyframeUsage";

/** The file a selection's GSAP write goes to. */
export function gsapWriteFile(
  selection: Pick<DomEditSelection, "sourceFile">,
  activeCompPath: string | null | undefined,
): string {
  return selection.sourceFile || activeCompPath || "index.html";
}

export interface MutationResult {
  ok: boolean;
  changed?: boolean;
  mutationChanges?: boolean[];
  parsed?: ParsedGsap;
  before?: string;
  after?: string;
  scriptText?: string;
}

export interface CommitMutationOptions {
  label: string;
  keyframeTelemetry?: boolean;
  keyframeAction?: KeyframeUsageAction;
  keyframeProperty?: string;
  /** Observe the durable writer result without duplicating the request path. */
  onResult?: (result: MutationResult) => void;
  coalesceKey?: string;
  coalesceMs?: number;
  softReload?: boolean;
  skipReload?: boolean;
  /**
   * Write the source but leave the preview alone; the caller renders once when it
   * is done. For a multi-write action like a group drag, rendering after each
   * write shows a source where the members not yet written still hold their old
   * values, so they snap back until their own write lands. This also defers the
   * in-place runtime patch's seek, which re-renders the whole timeline and repaints
   * the queued members the same way. Unlike `skipReload` this changes nothing about
   * error handling — a failed write still throws.
   */
  deferPreviewSync?: boolean;
  /** Carries a deferred write not yet on screen (no patch, or a missed one) to the final render. */
  previewFallbackLatch?: { pending: boolean };
  beforeReload?: () => void;
  pendingEdit?: StudioEditInFlight;
  /**
   * Serialize this commit against others sharing the same key. Used to chain
   * per-animationId GSAP meta updates. Every commit independently takes the
   * project/file mutation lock, so this key only adds ordering and can never
   * bypass whole-file serialization.
   */
  serializeKey?: string;
  /**
   * Value-only edit fast path. When present, `runCommit` first tries to patch the
   * one changed tween in the preview's runtime timeline in place
   * (`patchRuntimeTweenInPlace`) — instant, no composition re-run, no iframe
   * remount. On a successful patch the reload is skipped entirely (panels still
   * refresh); when the patch can't be confidently applied it falls back to the
   * existing soft/full reload path. Structural edits omit this and reload as before.
   */
  instantPatch?: { selector: string; change: RuntimeTweenChange };
  /**
   * The same fast path for a batched commit: one patch per element the batch
   * wrote, applied in order. All of them must land for the reload to be skipped
   * — one that can't be applied leaves the preview half-patched, so the whole
   * batch falls back to the reload. Only the last patch re-renders (see
   * `deferSeek`), so a ten-element batch repaints once.
   */
  instantPatches?: Array<{ selector: string; change: RuntimeTweenChange }>;
}

export interface CommitMutationCall {
  selection: DomEditSelection;
  mutation: Record<string, unknown>;
  options: CommitMutationOptions;
}

export interface CommitMutation {
  (
    selection: DomEditSelection,
    mutation: Record<string, unknown>,
    options: CommitMutationOptions,
  ): Promise<void>;
  batch?: (calls: CommitMutationCall[], options: CommitMutationOptions) => Promise<void>;
}

export type SafeGsapCommitMutation = (
  selection: DomEditSelection,
  mutation: Record<string, unknown>,
  options: CommitMutationOptions,
) => Promise<void>;

export type TrackGsapSaveFailure = (
  error: unknown,
  selection: DomEditSelection,
  mutation: Record<string, unknown>,
  label?: string,
) => void;

export interface GsapScriptCommitsParams {
  projectIdRef: React.MutableRefObject<string | null>;
  activeCompPath: string | null;
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
  editHistory: {
    recordEdit: (entry: {
      label: string;
      coalesceKey?: string;
      coalesceMs?: number;
      files: Record<string, { before: string; after: string }>;
    }) => Promise<void>;
  };
  reloadPreview: () => void;
  onCacheInvalidate: () => void;
  onFileContentChanged?: (path: string, content: string) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  /** Stage 7 §3.5: SDK session for routing GSAP tween ops through addGsapTween/setGsapTween/removeGsapTween. */
  sdkSession?: Composition | null;
  /** Publish a fully persisted candidate SDK session. */
  publishSdkSession?: PublishSdkSession;
  writeProjectFile?: (path: string, content: string) => Promise<void>;
  /** Resync the in-memory SDK session after a server-authoritative write. */
  forceReloadSdkSession?: () => void;
}
