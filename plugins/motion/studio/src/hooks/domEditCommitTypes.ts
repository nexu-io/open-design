import type { DomEditSelection } from "../components/editor/domEditing";
import type { ImportedFontAsset } from "../components/editor/fontAssets";
import type { PatchOperation, PatchTarget } from "../utils/sourcePatcher";

export interface DomEditPatchBatch {
  sourceFile: string;
  patches: Array<{ target: PatchTarget; operations: PatchOperation[] }>;
}

/** Durable evidence returned by the one Studio DOM persistence actor. */
export interface DomEditPersistOutcome {
  sourceFile: string;
  version: string;
  changed: boolean;
}

export type CommitDomEditPatchBatches = (
  batches: DomEditPatchBatch[],
  options: {
    label: string;
    coalesceKey: string;
    /** Per-entry undo coalesce window override (ms) — see EditHistoryEntry.coalesceMs. */
    coalesceMs?: number;
    /**
     * Request skipping the preview iframe reload after a successful persist.
     * Only honored when the persist is provably in sync with the live DOM:
     * every patch operation is inline-style-only AND the server matched every
     * patch target. Any unmatched target (or a non-style op) falls back to the
     * reload so the preview reconverges with disk. Default: always reload.
     */
    skipReload?: boolean;
  },
) => Promise<DomEditPatchBatchesResult>;

/**
 * Durability report for a patch-batches commit. `durable === false` means the
 * server could not locate at least one patch target on disk — the preview was
 * reloaded to reconverge, and dependent follow-up writes (the z→lane timeline
 * mirror) must be skipped. `allMatched` retains the underlying match detail.
 * `changed === false` means no source file was written: every patch was a
 * byte-identical no-op, or the atomic gesture was refused before any write.
 */
export interface DomEditPatchBatchesResult {
  durable: boolean;
  allMatched: boolean;
  changed: boolean;
}

export type PersistDomEditOperations = (
  selection: DomEditSelection,
  operations: PatchOperation[],
  options?: {
    label?: string;
    coalesceKey?: string;
    coalesceMs?: number;
    skipRefresh?: boolean;
    deferRender?: boolean;
    importedFont?: ImportedFontAsset;
    /** Inspect the freshly read source inside the file queue, before any mutation. Throw to refuse. */
    validateContent?: (html: string) => void;
    prepareContent?: (html: string, sourceFile: string) => string;
    shouldSave?: () => boolean;
  },
) => Promise<DomEditPersistOutcome | undefined>;

/** Several data-* and HTML attribute ops on one element as ONE persist and ONE undo entry. */
export type CommitDomAttributeBatch = (
  selection: DomEditSelection,
  operations: PatchOperation[],
  options: { label: string; prepareContent?: (html: string) => string; validateContent?: (html: string) => void },
) => Promise<boolean>;
