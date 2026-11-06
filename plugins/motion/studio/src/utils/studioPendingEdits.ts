import { StudioFileConflictError, type StudioSaveDrainResult } from "./studioSaveDiagnostics";
import { isTypingTarget } from "./typingTarget";

const STUDIO_FLUSH_PENDING_EDITS_EVENT = "hf-studio-flush-pending-edits";

interface StudioFlushPendingEditsDetail {
  promises: Array<Promise<unknown>>;
}

export type StudioPendingEditsDrainResult = StudioSaveDrainResult;

export type StudioEditRevert = () => () => void;

interface PendingEdit {
  revert: StudioEditRevert | null;
  landed: () => Promise<boolean>;
  redraws: Array<() => void>;
  showAgain: (() => void) | null;
  claimsAtBegin: number;
}

export interface StudioEditInFlight {
  reverted: () => boolean;
  within: <T>(run: () => T) => T;
  drawUnlessUndone: (draw: () => void) => void;
  drawKeepingUndone: <T>(draw: () => T) => T;
  markSaved: () => void;
}

const pendingEdits = new Map<Promise<unknown>, PendingEdit>();
let historyClaims: () => number = () => 0;

export function setStudioPendingEditClaimClock(read: (() => number) | null): void {
  historyClaims = read ?? (() => 0);
}
const NOT_SAVED = () => Promise.resolve(false);
let cancelWaitingPress: (() => boolean) | null = null;

export function setStudioWaitingPressCancel(cancel: (() => boolean) | null): void {
  cancelWaitingPress = cancel;
}

export function cancelNewestStudioWaitingPress(): boolean {
  return cancelWaitingPress?.() ?? false;
}
let adopting: StudioEditInFlight | null = null;

export function adoptingStudioPendingEdit(): StudioEditInFlight | null {
  return adopting;
}

function waitForPostBlurEffects(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function inspectDrainFailures(results: PromiseSettledResult<unknown>[]): {
  conflict?: StudioFileConflictError;
  firstFailure?: PromiseRejectedResult;
} {
  let firstFailure: PromiseRejectedResult | undefined;
  for (const result of results) {
    if (result.status !== "rejected") continue;
    if (result.reason instanceof StudioFileConflictError) return { conflict: result.reason };
    firstFailure ??= result;
  }
  return { firstFailure };
}

function focusedField(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && isTypingTarget(active) ? active : null;
}

export function hasStudioPendingEdits(): boolean {
  return pendingEdits.size > 0 || focusedField() !== null;
}

const shownRestores = new Set<Promise<void>>();

export function beginStudioShownRestore(): () => void {
  let end = () => {};
  const landed = new Promise<void>((resolve) => (end = resolve));
  shownRestores.add(landed);
  void landed.then(() => shownRestores.delete(landed));
  return end;
}

export function isStudioEditSaving(): boolean {
  return pendingEdits.size > 0 || shownRestores.size > 0;
}

export function afterStudioPendingEdits(run: () => void): () => void {
  let waiting = true;
  const check = () => {
    if (!waiting) return;
    if (isStudioEditSaving()) {
      void Promise.allSettled([...pendingEdits.keys(), ...shownRestores]).then(check);
      return;
    }
    waiting = false;
    run();
  };
  check();
  return () => {
    waiting = false;
  };
}

export function trackStudioPendingEdit(
  result: Promise<unknown> | unknown,
): Promise<unknown> | undefined {
  if (!result) return undefined;
  const promise = Promise.resolve(result);
  if (adopting) return promise;
  pendingEdits.set(promise, {
    revert: null,
    landed: NOT_SAVED,
    redraws: [],
    showAgain: null,
    claimsAtBegin: historyClaims(),
  });
  promise.then(
    () => pendingEdits.delete(promise),
    () => pendingEdits.delete(promise),
  );
  return promise;
}

let flushedSavesStillWriting: Promise<unknown> | null = null;

function commitOlderDebouncedEdits(): void {
  if (typeof window === "undefined" || adopting) return;
  const detail: StudioFlushPendingEditsDetail = { promises: [] };
  window.dispatchEvent(
    new CustomEvent<StudioFlushPendingEditsDetail>(STUDIO_FLUSH_PENDING_EDITS_EVENT, { detail }),
  );
  if (!detail.promises.length) return;
  const saves = Promise.allSettled([flushedSavesStillWriting, ...detail.promises]);
  flushedSavesStillWriting = saves;
  void saves.then(() => {
    if (flushedSavesStillWriting === saves) flushedSavesStillWriting = null;
  });
}

function afterOlderSaves<T>(run: () => T): Promise<T> | null {
  return flushedSavesStillWriting && flushedSavesStillWriting.then(run);
}

export function trackedStudioEdit<Args extends unknown[], R>(
  edit: (...args: Args) => R,
  { afterOlderSaves: waits = false } = {},
): (...args: Args) => R {
  return (...args) => {
    commitOlderDebouncedEdits();
    const deferred = waits && !adopting ? afterOlderSaves(() => edit(...args)) : null;
    if (deferred) return trackStudioPendingEdit(deferred) as R;
    const result = edit(...args);
    if (result instanceof Promise) trackStudioPendingEdit(result);
    return result;
  };
}

export function beginStudioPendingEdit(revert: StudioEditRevert | null) {
  commitOlderDebouncedEdits();
  let settle!: (saved?: Promise<unknown>) => void;
  const promise = trackStudioPendingEdit(new Promise<unknown>((resolve) => (settle = resolve)))!;
  const entry = pendingEdits.get(promise)!;
  entry.revert = revert;
  let landed = Promise.resolve(false);
  let saved = false;
  entry.landed = () => landed;
  const inFlight: StudioEditInFlight = {
    reverted: () => entry.revert === null && revert !== null,
    within(run) {
      const outer = adopting;
      adopting = inFlight;
      try {
        return run();
      } finally {
        adopting = outer;
      }
    },
    drawUnlessUndone(draw) {
      if (inFlight.reverted()) entry.redraws.push(draw);
      else draw();
    },
    drawKeepingUndone(draw) {
      if (!inFlight.reverted()) return draw();
      entry.showAgain?.();
      try {
        return draw();
      } finally {
        entry.showAgain = revert!();
      }
    },
    markSaved: () => void (saved = true),
  };
  return {
    settle,
    reverted: inFlight.reverted,
    // Only what `start` registers synchronously is adopted; a later write joins only through `within`.
    adopt<T>(start: () => T): T {
      try {
        const deferred = afterOlderSaves(() => inFlight.within(start));
        const committed = (deferred ?? inFlight.within(start)) as T;
        landed = Promise.resolve(committed).then(
          () => true,
          () => saved,
        );
        return committed;
      } catch (error) {
        settle();
        throw error;
      }
    },
  };
}

export function paintBackNewestStudioPendingEdit(): {
  showAgain: () => void;
  landed: () => Promise<boolean>;
  claimsAtBegin: number;
} | null {
  const newest = [...pendingEdits.values()].at(-1);
  const revert = newest?.revert;
  if (!newest || !revert) return null;
  newest.revert = null;
  newest.showAgain = revert();
  return {
    showAgain: () => {
      newest.showAgain?.();
      for (const redraw of newest.redraws.splice(0)) redraw();
    },
    landed: newest.landed,
    claimsAtBegin: newest.claimsAtBegin,
  };
}

export function revertNewestStudioPendingEdit(): (() => void) | null {
  return paintBackNewestStudioPendingEdit()?.showAgain ?? null;
}

export async function flushStudioPendingEdits({
  onlyCurrent = false,
} = {}): Promise<StudioPendingEditsDrainResult> {
  const active = focusedField();
  if (active) {
    active.blur();
    // ponytail: keep blur commits, then cross one task so effects the blur runs can add their listener.
    await Promise.resolve();
    await waitForPostBlurEffects();
  }
  const detail: StudioFlushPendingEditsDetail = { promises: [] };
  window.dispatchEvent(
    new CustomEvent<StudioFlushPendingEditsDetail>(STUDIO_FLUSH_PENDING_EDITS_EVENT, { detail }),
  );
  const current = onlyCurrent ? new Set(pendingEdits.keys()) : null;
  const waiting = () => [...pendingEdits.keys()].filter((edit) => !current || current.has(edit));
  let conflict: StudioFileConflictError | undefined;
  let firstFailure: PromiseRejectedResult | undefined;
  while (detail.promises.length > 0 || waiting().length > 0) {
    const promises = [...detail.promises, ...waiting()];
    detail.promises = [];
    const batchFailures = inspectDrainFailures(await Promise.allSettled(promises));
    conflict ??= batchFailures.conflict;
    firstFailure ??= batchFailures.firstFailure;
  }
  if (conflict) return { status: "conflict", error: conflict };
  return firstFailure ? { status: "failed", error: firstFailure.reason } : { status: "clean" };
}

export function addStudioPendingEditFlushListener(
  handler: () => Promise<unknown> | unknown,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<StudioFlushPendingEditsDetail>).detail;
    if (!detail?.promises) return;
    const promise = trackStudioPendingEdit(handler());
    if (promise) detail.promises.push(promise);
  };
  window.addEventListener(STUDIO_FLUSH_PENDING_EDITS_EVENT, listener);
  return () => window.removeEventListener(STUDIO_FLUSH_PENDING_EDITS_EVENT, listener);
}
