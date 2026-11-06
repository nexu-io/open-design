import type { DomEditPersistOutcome } from "./domEditCommitTypes";

interface DomEditCommitRunnerConfig {
  capture: () => void;
  apply: () => void;
  persist: () => Promise<unknown>;
  shouldRevert: (error: unknown) => boolean;
  revert: () => void;
  onError: (error: unknown) => void;
  shouldResync: () => boolean;
  resync: () => void | Promise<void>;
  /**
   * Reports success/failure without changing this function's own resolve-
   * always contract — `persist` failures are handled here (revert + onError)
   * and never rethrown, so callers awaiting `runDomEditCommit` can't observe
   * failure via rejection. A caller that needs to react to a specific
   * commit's outcome (e.g. reverting its OWN optimistic state) can pass this
   * instead of relying on a rejection that will never come.
   */
  onSettled?: (ok: boolean) => void;
  /** Always runs once after persistence, resync, or an unexpected runner error. */
  onFinally?: () => void;
}

interface CommitVersionRef {
  current: number;
}

export function bumpDomEditCommitVersion(versionRef: CommitVersionRef): () => boolean {
  const commitVersion = versionRef.current + 1;
  versionRef.current = commitVersion;
  return () => versionRef.current === commitVersion;
}

export interface DomEditCommitVersionGuard {
  (): boolean;
  release: () => void;
}

export function bumpDomEditCommitMapVersion<TKey>(
  versionMap: Map<TKey, symbol>,
  versionKey: TKey,
): DomEditCommitVersionGuard {
  const commitVersion = Symbol("dom-edit-commit");
  versionMap.set(versionKey, commitVersion);
  const isLatest = () => versionMap.get(versionKey) === commitVersion;
  return Object.assign(isLatest, {
    release: () => {
      if (isLatest()) versionMap.delete(versionKey);
    },
  });
}

export async function runDomEditCommit(config: DomEditCommitRunnerConfig): Promise<void> {
  try {
    config.capture();
    config.apply();

    try {
      await config.persist();
      config.onSettled?.(true);
    } catch (error) {
      if (config.shouldRevert(error)) {
        config.revert();
      }
      config.onError(error);
      config.onSettled?.(false);
    }

    if (!config.shouldResync()) return;
    await config.resync();
  } finally {
    config.onFinally?.();
  }
}

/**
 * Why a DOM edit commit did not change the file.
 *
 * `runDomEditCommit` resolves on persist failure by design (see its contract
 * above), so a caller cannot learn whether the write landed by awaiting it — a
 * failed persist and a successful one are indistinguishable. Capture and apply
 * bugs still reject. The human path does not need to ask about handled persist
 * failures, because `onError` already put a toast on screen. A programmatic
 * caller has no screen, so it has to be told.
 */
export type DomEditCommitDeclineReason =
  | "no-project"
  | "no-selection"
  | "geometry-property"
  | "styles-not-editable"
  | "not-text-editable"
  | "preview-stale"
  | "persist-failed";

export type DomEditCommitOutcome =
  | { ok: true; persistence?: DomEditPersistOutcome; changed?: boolean }
  | { ok: false; reason: DomEditCommitDeclineReason };

export function domEditCommitDeclined(reason: DomEditCommitDeclineReason): DomEditCommitOutcome {
  return { ok: false, reason };
}

/**
 * `runDomEditCommit`, reporting whether the write actually landed.
 *
 * Owns `onSettled` to do it, and forwards to a caller-supplied one rather than
 * dropping it. `runDomEditCommit` calls `onSettled` exactly once on both the
 * success and the failure path, so the flag is always set by the time it
 * resolves.
 */
export async function runReportedDomEditCommit(
  config: DomEditCommitRunnerConfig,
): Promise<DomEditCommitOutcome> {
  let landed = false;
  let persistence: DomEditPersistOutcome | undefined;
  await runDomEditCommit({
    ...config,
    persist: async () => {
      const result = await config.persist();
      if (isDomEditPersistOutcome(result)) persistence = result;
    },
    onSettled: (ok) => {
      landed = ok;
      config.onSettled?.(ok);
    },
  });
  if (!landed) return domEditCommitDeclined("persist-failed");
  return persistence ? { ok: true, persistence } : { ok: true };
}

function isDomEditPersistOutcome(value: unknown): value is DomEditPersistOutcome {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "sourceFile") === "string" &&
    typeof Reflect.get(value, "version") === "string" &&
    typeof Reflect.get(value, "changed") === "boolean"
  );
}
