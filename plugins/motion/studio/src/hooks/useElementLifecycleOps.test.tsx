// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../player";
import {
  LAYER_REVEAL_PRIOR_POSITION_ATTR,
  LAYER_REVEAL_PRIOR_Z_ATTR,
} from "../player/lib/timelineElementHelpers";
import {
  LAYER_REVEAL_LIFT_Z,
  LAYER_REVEAL_PENDING_COMMIT_ATTR,
  liftElementToTop,
  restoreLiftedElement,
  useLayerRevealOverride,
} from "../components/editor/useLayerRevealOverride";
import type { DomEditPatchBatch, DomEditPatchBatchesResult } from "./domEditCommitTypes";
import { useElementLifecycleOps } from "./useElementLifecycleOps";
import { makeLifecycleOpsParams } from "./elementLifecycleOpsTestUtils";
import { mountReactHarness } from "./domSelectionTestHarness";
import { runZLaneGesture } from "../components/nle/zLaneGesture";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().setElements([]);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface BatchOptions {
  label: string;
  coalesceKey: string;
  coalesceMs?: number;
  skipReload?: boolean;
}

interface CapturedBatchCall {
  batches: DomEditPatchBatch[];
  options: BatchOptions;
}

type ReorderCommit = (
  entries: Array<{
    element: HTMLElement;
    zIndex: number;
    id?: string;
    selector?: string;
    selectorIndex?: number;
    sourceFile: string;
    key?: string;
  }>,
  coalesceKeyOverride?: string,
  actionKind?: string,
) => Promise<DomEditPatchBatchesResult | undefined | void>;

function renderReorderHook(
  capturedCalls: CapturedBatchCall[],
  onReady: (commit: ReorderCommit) => void,
) {
  function Harness() {
    const { handleDomZIndexReorderCommit } = useElementLifecycleOps(
      makeLifecycleOpsParams({
        commitDomEditPatchBatches: async (batches, options) => {
          capturedCalls.push({ batches, options });
          return { durable: true, allMatched: true, changed: true };
        },
      }),
    );
    onReady(handleDomZIndexReorderCommit);
    return null;
  }
  return mountReactHarness(<Harness />);
}

/** Append the element, mount the reorder hook, and run one commit through act. */
async function runReorderCommit(el: HTMLElement, entries: Parameters<ReorderCommit>[0]) {
  document.body.appendChild(el);

  const captured: CapturedBatchCall[] = [];
  let commit: ReorderCommit | undefined;
  const root = renderReorderHook(captured, (fn) => (commit = fn));

  await act(async () => {
    commit!(entries);
  });

  return { captured, root };
}

describe("useElementLifecycleOps — z-index reorder payload", () => {
  // Regression: an id-less canvas element (e.g. a caption `.sub` div, which
  // carries only data-hf-id + class) once had its absent id coerced to `null`
  // (`entry.id ?? null`). The DOM-patch guard rejects a null `body.target.id`,
  // so "move to back" toasted "unsafe values" and nothing persisted. The target
  // id must be `undefined` (dropped on the wire), letting hfId / selector match.
  it("never sends a null target id for an id-less element", async () => {
    const el = document.createElement("div");
    el.className = "sub clip";
    el.setAttribute("data-hf-id", "hf-card");

    const { captured, root } = await runReorderCommit(el, [
      {
        element: el,
        zIndex: 0,
        // id intentionally absent — the id-less element case.
        selector: ".sub.clip",
        selectorIndex: 3,
        sourceFile: "index.html",
      },
    ]);

    const target = captured[0]?.batches[0]?.patches[0]?.target;
    expect(captured).toHaveLength(1);
    expect(target?.id).toBeUndefined();
    expect(target?.id).not.toBeNull();
    // The element stays addressable via hfId (and selector) instead.
    expect(target?.hfId).toBe("hf-card");

    act(() => root.unmount());
  });

  it("requests skipReload on every z-reorder persist (live DOM already final)", async () => {
    // The commit applies the z-index (and any injected position) to the live
    // iframe DOM and the store synchronously, so the persisted style-only patch
    // adds nothing the preview doesn't already show — the batch commit is asked
    // to skip the iframe remount. commitDomEditPatchBatches still falls back to
    // reloading when the server can't confirm every patch target matched.
    const el = document.createElement("div");
    el.id = "clip-z";

    const { captured, root } = await runReorderCommit(el, [
      { element: el, zIndex: 4, id: "clip-z", sourceFile: "index.html" },
    ]);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.options.skipReload).toBe(true);

    act(() => root.unmount());
  });

  it("preserves a real id when the element has one", async () => {
    const el = document.createElement("video");
    el.id = "v-hero";
    el.setAttribute("data-hf-id", "hf-ezl2");

    const { captured, root } = await runReorderCommit(el, [
      { element: el, zIndex: 2, id: "v-hero", selector: "#v-hero", sourceFile: "index.html" },
    ]);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.batches[0]?.patches[0]?.target.id).toBe("v-hero");

    act(() => root.unmount());
  });

  it("threads the lane gesture key into z-index persistence", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    document.body.appendChild(el);
    const captured: CapturedBatchCall[] = [];
    let commit: ReorderCommit | undefined;
    const root = renderReorderHook(captured, (fn) => (commit = fn));

    await act(async () => {
      await commit!(
        [{ element: el, zIndex: 4, id: "clip-a", sourceFile: "index.html" }],
        "clip-lane-move:7",
      );
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.options.coalesceKey).toBe("clip-lane-move:7");
    act(() => root.unmount());
  });

  it("creates one batch per source file in a multi-file reorder", async () => {
    const elements = ["clip-a", "clip-b", "clip-c"].map((id) => {
      const element = document.createElement("div");
      element.id = id;
      document.body.appendChild(element);
      return element;
    });
    const captured: CapturedBatchCall[] = [];
    let commit: ReorderCommit | undefined;
    const root = renderReorderHook(captured, (fn) => (commit = fn));

    await act(async () => {
      await commit!(
        elements.map((element, index) => ({
          element,
          zIndex: index + 1,
          id: element.id,
          sourceFile: index < 2 ? "index.html" : "compositions/scene.html",
        })),
      );
    });

    expect(captured).toHaveLength(1);
    expect(
      captured[0]?.batches.map(({ sourceFile, patches }) => [sourceFile, patches.length]),
    ).toEqual([
      ["index.html", 2],
      ["compositions/scene.html", 1],
    ]);
    act(() => root.unmount());
  });

  it("keeps distinct actions in distinct default coalesce keys", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    document.body.appendChild(el);
    const captured: CapturedBatchCall[] = [];
    let commit: ReorderCommit | undefined;
    const root = renderReorderHook(captured, (fn) => (commit = fn));

    await act(async () => {
      await commit!(
        [{ element: el, zIndex: 1, id: "clip-a", sourceFile: "index.html" }],
        undefined,
        "bring-forward",
      );
      await commit!(
        [{ element: el, zIndex: 0, id: "clip-a", sourceFile: "index.html" }],
        undefined,
        "send-backward",
      );
    });

    // Same element set, different actions — the keys must differ so the two
    // edits never coalesce into one undo step. Each key also carries a fresh
    // gesture sequence, which is what makes the commit's unbounded per-gesture
    // coalesce window safe (see zReorderCoalesceKey).
    expect(captured).toHaveLength(2);
    expect(captured[0]?.options.coalesceKey).toMatch(/^z-reorder:bring-forward:clip-a:g\d+$/);
    expect(captured[1]?.options.coalesceKey).toMatch(/^z-reorder:send-backward:clip-a:g\d+$/);
    expect(captured[0]?.options.coalesceKey).not.toBe(captured[1]?.options.coalesceKey);
    // The two-phase gesture fold rides an unbounded window on both records.
    expect(captured[0]?.options.coalesceMs).toBe(Number.POSITIVE_INFINITY);
    act(() => root.unmount());
  });

  it("updates the store zIndex synchronously for entries that carry a store key", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    document.body.appendChild(el);
    usePlayerStore.getState().setElements([
      {
        id: "clip-a",
        key: "index.html#clip-a",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        zIndex: 0,
        hasExplicitZIndex: false,
      },
    ]);

    let commit: ReorderCommit | undefined;
    let resolveBatch: (() => void) | undefined;
    const batchResult = { durable: true, allMatched: true, changed: true };
    function Harness() {
      const { handleDomZIndexReorderCommit } = useElementLifecycleOps(
        makeLifecycleOpsParams({
          // Persist stays pending so the assertion below can only be satisfied
          // by the SYNCHRONOUS store update (the lane-sync path's requirement).
          commitDomEditPatchBatches: () =>
            new Promise((resolve) => (resolveBatch = () => resolve(batchResult))),
        }),
      );
      commit = handleDomZIndexReorderCommit;
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = commit!([
        {
          element: el,
          zIndex: 5,
          id: "clip-a",
          sourceFile: "index.html",
          key: "index.html#clip-a",
        },
      ]);
    });

    expect(usePlayerStore.getState().elements[0]).toMatchObject({
      zIndex: 5,
      hasExplicitZIndex: true,
    });

    resolveBatch?.();
    await act(async () => pending);
    act(() => root.unmount());
  });

  // The canvas context-menu path: the menu no longer pre-applies styles, so the
  // hook sees the PRISTINE element — prior styles are captured before any
  // mutation and a failed persist restores them exactly (previously the menu's
  // optimistic write made the "rollback" restore the already-mutated values,
  // and the never-persisted position patch silently reverted on reload).
  it("rolls back a static, inline-style-free element to pristine styles on failure", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    el.style.position = "static"; // happy-dom computes "" for unset position
    document.body.appendChild(el);
    const failure = new Error("persist failed");

    let commit: ReorderCommit | undefined;
    function Harness() {
      const { handleDomZIndexReorderCommit } = useElementLifecycleOps(
        makeLifecycleOpsParams({
          commitDomEditPatchBatches: vi.fn(async () => {
            // The live styles were applied by the hook before persist ran.
            expect(el.style.zIndex).toBe("2");
            expect(el.style.position).toBe("relative");
            throw failure;
          }),
        }),
      );
      commit = handleDomZIndexReorderCommit;
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let rejection: unknown;
    await act(async () => {
      try {
        await commit!(
          [{ element: el, zIndex: 2, id: "clip-a", sourceFile: "index.html" }],
          undefined,
          "bring-forward",
        );
      } catch (error) {
        rejection = error;
      }
    });

    expect(rejection).toBe(failure);
    expect(el.style.zIndex).toBe("");
    expect(el.style.position).toBe("static");
    act(() => root.unmount());
  });

  it("returns an active reveal lift and its original styles to their owner on failure", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    el.style.zIndex = "4";
    el.style.position = "static";
    document.body.appendChild(el);
    const lift = liftElementToTop(el)!;
    const failure = new Error("persist failed");

    expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);
    expect(el.style.position).toBe("relative");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe("4");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR)).toBe("static");
    expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(false);

    let commit: ReorderCommit | undefined;
    function Harness() {
      const { handleDomZIndexReorderCommit } = useElementLifecycleOps(
        makeLifecycleOpsParams({
          commitDomEditPatchBatches: vi.fn(async () => {
            expect(el.style.zIndex).toBe("8");
            expect(el.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);
            expect(el.hasAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR)).toBe(false);
            throw failure;
          }),
        }),
      );
      commit = handleDomZIndexReorderCommit;
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let rejection: unknown;
    await act(async () => {
      try {
        await commit!([{ element: el, zIndex: 8, id: "clip-a", sourceFile: "index.html" }]);
      } catch (error) {
        rejection = error;
      }
    });
    expect(rejection).toBe(failure);

    // The failed optimistic commit must put the still-active lift back exactly
    // as it found it, including the metadata that lets reveal cleanup restore
    // the authored z/position rather than abandoning the temporary lift.
    expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);
    expect(el.style.position).toBe("relative");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe("4");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR)).toBe("static");
    expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(false);

    restoreLiftedElement(el, lift);
    expect(el.style.zIndex).toBe("4");
    expect(el.style.position).toBe("static");
    act(() => root.unmount());
  });

  it("reconciles live, store, and reveal state when no patch target matched", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    el.style.zIndex = "4";
    el.style.position = "static";
    document.body.appendChild(el);
    usePlayerStore.getState().setElements([
      {
        id: "clip-a",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        zIndex: 4,
        hasExplicitZIndex: true,
      },
    ]);
    const lift = liftElementToTop(el)!;
    const unmatched = { durable: false, allMatched: false, changed: false };
    let commit: ReorderCommit | undefined;

    function Harness() {
      ({ handleDomZIndexReorderCommit: commit } = useElementLifecycleOps(
        makeLifecycleOpsParams({
          commitDomEditPatchBatches: vi.fn(async () => unmatched),
        }),
      ));
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let result: unknown;
    await act(async () => {
      result = await commit!([
        {
          element: el,
          zIndex: 8,
          id: "clip-a",
          sourceFile: "index.html",
          key: "clip-a",
        },
      ]);
    });

    expect(result).toEqual(unmatched);
    expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);
    expect(el.style.position).toBe("relative");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe("4");
    expect(el.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR)).toBe("static");
    expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(false);
    expect(usePlayerStore.getState().elements[0]).toMatchObject({
      zIndex: 4,
      hasExplicitZIndex: true,
    });

    restoreLiftedElement(el, lift);
    expect(el.style.zIndex).toBe("4");
    expect(el.style.position).toBe("static");
    act(() => root.unmount());
  });

  it.each(["rejection", "unmatched"] as const)(
    "defers a delayed reveal until a pending z commit finishes with %s",
    async (outcome) => {
      vi.useFakeTimers();
      const el = document.createElement("div");
      el.id = "clip-a";
      el.style.zIndex = "4";
      el.style.position = "absolute";
      document.body.appendChild(el);
      usePlayerStore.getState().setElements([
        {
          id: "clip-a",
          tag: "div",
          start: 0,
          duration: 1,
          track: 0,
          zIndex: 4,
          hasExplicitZIndex: true,
        },
      ]);
      let resolvePersist: ((result: DomEditPatchBatchesResult) => void) | undefined;
      let rejectPersist: ((error: Error) => void) | undefined;
      const persist = vi.fn(
        () =>
          new Promise<DomEditPatchBatchesResult>((resolve, reject) => {
            resolvePersist = resolve;
            rejectPersist = reject;
          }),
      );
      let commit: ReorderCommit | undefined;
      let scheduleReveal: ((element: HTMLElement, delayMs: number) => void) | undefined;

      function Harness() {
        ({ scheduleReveal } = useLayerRevealOverride({
          isPlaying: false,
          selectedElement: el,
        }));
        ({ handleDomZIndexReorderCommit: commit } = useElementLifecycleOps(
          makeLifecycleOpsParams({ commitDomEditPatchBatches: persist }),
        ));
        return null;
      }
      const root = mountReactHarness(<Harness />);

      let pending: Promise<unknown> | undefined;
      act(() => {
        scheduleReveal!(el, 10);
        pending = commit!([
          { element: el, zIndex: 8, id: "clip-a", sourceFile: "index.html", key: "clip-a" },
        ]);
        vi.advanceTimersByTime(10);
      });

      // The timer elapsed, but it must not capture optimistic z=8 as authored.
      expect(el.style.zIndex).toBe("8");
      expect(el.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);

      let rejection: unknown;
      await act(async () => {
        if (outcome === "rejection") rejectPersist!(new Error("save failed"));
        else resolvePersist!({ durable: false, allMatched: false, changed: false });
        try {
          await pending;
        } catch (error) {
          rejection = error;
        }
      });
      if (outcome === "rejection") expect(rejection).toBeInstanceOf(Error);

      act(() => vi.advanceTimersByTime(16));
      expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);
      expect(el.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe("4");
      expect(usePlayerStore.getState().elements[0]?.zIndex).toBe(4);
      act(() => root.unmount());
    },
  );

  it("serializes overlapping commits through the shared gesture owner", async () => {
    const el = document.createElement("div");
    el.id = "clip-a";
    el.style.zIndex = "1";
    document.body.appendChild(el);
    usePlayerStore.getState().setElements([
      {
        id: "clip-a",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        zIndex: 1,
        hasExplicitZIndex: true,
      },
    ]);
    const firstFailure = new Error("first persist failed");
    let rejectFirst: ((error: Error) => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = () => resolve({ durable: true, allMatched: true, changed: true });
          }),
      );
    let commit: ReorderCommit | undefined;

    function Harness() {
      ({ handleDomZIndexReorderCommit: commit } = useElementLifecycleOps(
        makeLifecycleOpsParams({ commitDomEditPatchBatches: persist }),
      ));
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let firstPending: Promise<unknown> | undefined;
    let secondPending: Promise<unknown> | undefined;
    act(() => {
      firstPending = runZLaneGesture({
        commitZ: () =>
          commit!([
            { element: el, zIndex: 2, id: "clip-a", sourceFile: "index.html", key: "clip-a" },
          ]),
        mirror: async () => true,
      });
      secondPending = runZLaneGesture({
        commitZ: () =>
          commit!([
            { element: el, zIndex: 3, id: "clip-a", sourceFile: "index.html", key: "clip-a" },
          ]),
        mirror: async () => true,
      });
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(el.style.zIndex).toBe("2");
    expect(usePlayerStore.getState().elements[0]?.zIndex).toBe(2);

    let rejection: unknown;
    await act(async () => {
      rejectFirst!(firstFailure);
      try {
        await firstPending;
      } catch (error) {
        rejection = error;
      }
      await Promise.resolve();
    });

    expect(rejection).toBe(firstFailure);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(el.style.zIndex).toBe("3");
    expect(usePlayerStore.getState().elements[0]?.zIndex).toBe(3);

    await act(async () => {
      resolveSecond!();
      await secondPending;
    });
    expect(el.style.zIndex).toBe("3");
    expect(usePlayerStore.getState().elements[0]?.zIndex).toBe(3);
    act(() => root.unmount());
  });

  it.each(["deselection", "playback"] as const)(
    "does not resurrect a reveal released by %s while persistence is pending",
    async (releaseBy) => {
      vi.useFakeTimers();
      const el = document.createElement("div");
      el.id = "clip-a";
      el.style.zIndex = "4";
      el.style.position = "static";
      const other = document.createElement("div");
      document.body.append(el, other);
      const failure = new Error("persist failed");
      let rejectPersist: ((error: Error) => void) | undefined;
      const persist = vi.fn(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectPersist = reject;
          }),
      );
      let commit: ReorderCommit | undefined;
      let scheduleReveal: ((element: HTMLElement, delayMs: number) => void) | undefined;

      function Harness({
        selectedElement,
        isPlaying,
      }: {
        selectedElement: HTMLElement | null;
        isPlaying: boolean;
      }) {
        ({ scheduleReveal } = useLayerRevealOverride({ isPlaying, selectedElement }));
        ({ handleDomZIndexReorderCommit: commit } = useElementLifecycleOps(
          makeLifecycleOpsParams({ commitDomEditPatchBatches: persist }),
        ));
        return null;
      }

      const root = mountReactHarness(<Harness selectedElement={el} isPlaying={false} />);
      act(() => {
        scheduleReveal!(el, 0);
        vi.advanceTimersByTime(0);
      });
      expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);

      let pending: Promise<unknown> | undefined;
      act(() => {
        pending = commit!([{ element: el, zIndex: 8, id: el.id, sourceFile: "index.html" }]);
      });
      expect(el.style.zIndex).toBe("8");
      expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(true);

      act(() => {
        root.render(
          <Harness
            selectedElement={releaseBy === "deselection" ? other : el}
            isPlaying={releaseBy === "playback"}
          />,
        );
      });

      let rejection: unknown;
      await act(async () => {
        rejectPersist!(failure);
        try {
          await pending;
        } catch (error) {
          rejection = error;
        }
      });

      expect(rejection).toBe(failure);
      expect(el.style.zIndex).toBe("4");
      expect(el.style.position).toBe("static");
      expect(el.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);
      expect(el.hasAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR)).toBe(false);
      expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(false);
      act(() => root.unmount());
    },
  );

  it("rolls back only live and store state after an atomic reorder failure", async () => {
    const writeProjectFile = vi.fn(async () => {});
    const recordEdit = vi.fn(async () => {});
    const forceReloadSdkSession = vi.fn();
    const originalError = new Error("second patch failed");
    const elements = ["clip-a", "clip-b", "clip-c"].map((id, index) => {
      const element = document.createElement("div");
      element.id = id;
      element.style.zIndex = String(index + 10);
      document.body.appendChild(element);
      return element;
    });
    usePlayerStore.getState().setElements(
      elements.map((element, index) => ({
        id: element.id,
        tag: "div",
        start: 0,
        duration: 1,
        track: index,
        zIndex: index + 10,
        hasExplicitZIndex: false,
      })),
    );

    let commit: ReorderCommit | undefined;
    function Harness() {
      const { handleDomZIndexReorderCommit } = useElementLifecycleOps(
        makeLifecycleOpsParams({
          writeProjectFile,
          editHistory: { recordEdit },
          projectIdRef: { current: "demo" },
          forceReloadSdkSession,
          commitDomEditPatchBatches: vi.fn(async () => {
            throw originalError;
          }),
        }),
      );
      commit = handleDomZIndexReorderCommit;
      return null;
    }
    const root = mountReactHarness(<Harness />);

    let rejection: unknown;
    await act(async () => {
      try {
        await commit!(
          elements.map((element, index) => ({
            element,
            zIndex: 3 - index,
            id: element.id,
            sourceFile: "index.html",
            key: element.id,
          })),
          "clip-lane-move:failure",
        );
      } catch (error) {
        rejection = error;
      }
    });

    expect(rejection).toBe(originalError);
    expect(elements.map((element) => element.style.zIndex)).toEqual(["10", "11", "12"]);
    expect(
      usePlayerStore
        .getState()
        .elements.map(({ zIndex, hasExplicitZIndex }) => ({ zIndex, hasExplicitZIndex })),
    ).toEqual([
      { zIndex: 10, hasExplicitZIndex: false },
      { zIndex: 11, hasExplicitZIndex: false },
      { zIndex: 12, hasExplicitZIndex: false },
    ]);
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(forceReloadSdkSession).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
