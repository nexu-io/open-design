// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Tell React this is an act-capable environment so act(...) flushes effects.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { KeyframeCacheEntry } from "../player/store/playerStore";
import { usePlayerStore } from "../player/store/playerStore";
import { useGsapKeyframeOps } from "./useGsapKeyframeOps";

type HookApi = ReturnType<typeof useGsapKeyframeOps>;
type CommitResult = { ok: boolean; changed: boolean };
type CommitOptions = { onResult?: (result: CommitResult) => void };
type CommitCall = [selection: unknown, mutation: unknown, options: CommitOptions];

function readCommitOptions(args: unknown[]): CommitOptions {
  // The hook accepts the production writer type; these test doubles expose only
  // the third tuple member they exercise.
  return (args as unknown as CommitCall)[2];
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const selection: DomEditSelection = { id: "box", selector: "#box" } as DomEditSelection;

function successfulCommitMutation() {
  return vi.fn<(...args: unknown[]) => Promise<unknown>>(async (...args) => {
    const options = readCommitOptions(args);
    options.onResult?.({ ok: true, changed: true });
  });
}

function renderKeyframeOps(over: {
  commitMutation: (...args: unknown[]) => Promise<unknown>;
  commitMutationSafely?: (...args: unknown[]) => Promise<void>;
  trackGsapSaveFailure: (...args: unknown[]) => void;
}) {
  const captured: { api: HookApi | null } = { api: null };
  // This hook harness intentionally mirrors the separate script-commit harness.
  function Probe() {
    // fallow-ignore-next-line code-duplication
    captured.api = useGsapKeyframeOps({
      activeCompPath: "index.html",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test doubles
      commitMutation: over.commitMutation as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test doubles
      commitMutationSafely: (over.commitMutationSafely ?? (async () => {})) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test doubles
      trackGsapSaveFailure: over.trackGsapSaveFailure as any,
      sdkSession: null,
      sdkDeps: null,
    });
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  cleanup = () => act(() => root.unmount());
  if (!captured.api) throw new Error("hook did not initialize");
  return captured.api;
}

async function moveKeyframeWith(
  commitMutation: (...args: unknown[]) => Promise<unknown>,
): Promise<{ committed: boolean; trackGsapSaveFailure: ReturnType<typeof vi.fn> }> {
  const trackGsapSaveFailure = vi.fn();
  const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure });
  let committed = true;
  await act(async () => {
    committed = await api.moveKeyframe(selection, "box-to-0-position", 50, 75);
  });
  return { committed, trackGsapSaveFailure };
}

describe("useGsapKeyframeOps — resizeKeyframedTween", () => {
  it("issues a resize-keyframed-tween mutation with the remap + window", async () => {
    const commitMutation = successfulCommitMutation();
    const trackGsapSaveFailure = vi.fn<(...args: unknown[]) => void>();
    const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure });

    const pctRemap = [
      { from: 0, to: 0 },
      { from: 100, to: 100 },
    ];
    let committed = false;
    await act(async () => {
      committed = await api.resizeKeyframedTween(selection, "box-to-0-opacity", 0.2, 2, pctRemap);
    });

    expect(commitMutation).toHaveBeenCalledTimes(1);
    const [sel, mutation] = commitMutation.mock.calls[0]!;
    expect(sel).toBe(selection);
    expect(mutation).toEqual({
      type: "resize-keyframed-tween",
      animationId: "box-to-0-opacity",
      position: 0.2,
      duration: 2,
      pctRemap,
    });
    expect(trackGsapSaveFailure).not.toHaveBeenCalled();
    expect(committed).toBe(true);
  });

  it("routes a rejected commit to trackGsapSaveFailure (no unhandled rejection)", async () => {
    const error = new Error("network down");
    const commitMutation = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {
      throw error;
    });
    const trackGsapSaveFailure = vi.fn<(...args: unknown[]) => void>();
    const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure });

    let committed = true;
    await act(async () => {
      committed = await api.resizeKeyframedTween(selection, "box-to-0-opacity", 0.2, 2, [
        { from: 100, to: 100 },
      ]);
    });

    expect(trackGsapSaveFailure).toHaveBeenCalledTimes(1);
    const [errArg, selArg, mutationArg, labelArg] = trackGsapSaveFailure.mock.calls[0]!;
    expect(errArg).toBe(error);
    expect(selArg).toBe(selection);
    expect((mutationArg as { type: string }).type).toBe("resize-keyframed-tween");
    expect(labelArg).toBe("Retime keyframe (resize tween)");
    expect(committed).toBe(false);
  });
});

describe("useGsapKeyframeOps — moveKeyframe settlement", () => {
  it("returns false when the commit settles without a durable writer result", async () => {
    const { committed, trackGsapSaveFailure } = await moveKeyframeWith(vi.fn(async () => {}));

    expect(committed).toBe(false);
    expect(trackGsapSaveFailure).not.toHaveBeenCalled();
  });

  it("returns false when the writer accepts but does not change the keyframe", async () => {
    const commitMutation = vi.fn(async (...args: unknown[]) => {
      const options = readCommitOptions(args);
      options.onResult?.({ ok: true, changed: false });
    });
    const { committed, trackGsapSaveFailure } = await moveKeyframeWith(commitMutation);

    expect(committed).toBe(false);
    expect(trackGsapSaveFailure).not.toHaveBeenCalled();
  });

  it("returns false and tracks a rejected move", async () => {
    const error = new Error("write failed");
    const commitMutation = vi.fn().mockRejectedValue(error);
    const { committed, trackGsapSaveFailure } = await moveKeyframeWith(commitMutation);

    expect(committed).toBe(false);
    expect(trackGsapSaveFailure).toHaveBeenCalledExactlyOnceWith(
      error,
      selection,
      {
        type: "move-keyframe",
        animationId: "box-to-0-position",
        fromPercentage: 50,
        toPercentage: 75,
      },
      "Move keyframe to 75%",
    );
  });
});

describe("useGsapKeyframeOps — keyframe transaction options", () => {
  it("routes a flat-lane add through the add-keyframe writer mutation", async () => {
    const commitMutation = successfulCommitMutation();
    const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure: vi.fn() });

    await act(async () => {
      await api.addKeyframeBatch(selection, "box-to-0-position", 50, { x: 210 });
    });

    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      {
        type: "add-keyframe",
        animationId: "box-to-0-position",
        percentage: 50,
        properties: { x: 210 },
      },
      { label: "Add keyframe at 50%", softReload: true },
    );
  });

  it("soft-reloads a standalone convert when the SDK path is unavailable", async () => {
    const commitMutation = successfulCommitMutation();
    const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure: vi.fn() });

    await act(async () => {
      await api.convertToKeyframes(selection, "box-to-0-opacity");
    });

    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({
        type: "convert-to-keyframes",
        animationId: "box-to-0-opacity",
      }),
      { label: "Convert to keyframes", softReload: true },
    );
  });

  it("clears delete-all cache only when persistence confirms the change", async () => {
    let finishCommit: (() => void) | undefined;
    const commitMutationSafely = vi.fn(
      (...args: unknown[]) =>
        new Promise<void>((resolve) => {
          const options = readCommitOptions(args);
          finishCommit = () => {
            options.onResult?.({ ok: true, changed: true });
            resolve();
          };
        }),
    );
    const api = renderKeyframeOps({
      commitMutation: successfulCommitMutation(),
      commitMutationSafely,
      trackGsapSaveFailure: vi.fn(),
    });
    const cached: KeyframeCacheEntry = {
      format: "percentage",
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: 200 } },
      ],
    };
    usePlayerStore.setState({ keyframeCache: new Map([["index.html#box", cached]]) });

    const pending = api.removeAllKeyframes(selection, "box-to-0-position");
    expect(commitMutationSafely).toHaveBeenCalledWith(
      selection,
      { type: "remove-all-keyframes", animationId: "box-to-0-position" },
      expect.objectContaining({ label: "Remove all keyframes", softReload: true }),
    );
    expect(usePlayerStore.getState().keyframeCache.get("index.html#box")).toBe(cached);

    finishCommit?.();
    await pending;
    expect(usePlayerStore.getState().keyframeCache.has("index.html#box")).toBe(false);
  });

  it("clears the live DOM identity for a selector-only selection", async () => {
    const element = document.createElement("div");
    element.id = "box";
    const selectorOnlySelection: DomEditSelection = {
      ...selection,
      id: undefined,
      selector: ".box",
      element,
    };
    const commitMutationSafely = vi.fn(async (...args: unknown[]) => {
      const options = readCommitOptions(args);
      options.onResult?.({ ok: true, changed: true });
    });
    const api = renderKeyframeOps({
      commitMutation: successfulCommitMutation(),
      commitMutationSafely,
      trackGsapSaveFailure: vi.fn(),
    });
    const cached: KeyframeCacheEntry = {
      format: "percentage",
      keyframes: [{ percentage: 0, properties: { x: 0 } }],
    };
    usePlayerStore.setState({ keyframeCache: new Map([["index.html#box", cached]]) });

    await api.removeAllKeyframes(selectorOnlySelection, "box-to-0-position");

    expect(usePlayerStore.getState().keyframeCache.has("index.html#box")).toBe(false);
  });

  it("threads one coalesce key through skipped convert reload and terminal batch edit", async () => {
    const commitMutation = successfulCommitMutation();
    const api = renderKeyframeOps({ commitMutation, trackGsapSaveFailure: vi.fn() });
    const coalesceKey = "enable-keyframes:box-to-0-opacity:1";

    await act(async () => {
      await api.convertToKeyframes(selection, "box-to-0-opacity", undefined, undefined, {
        skipReload: true,
        coalesceKey,
        coalesceMs: Infinity,
      });
      await api.addKeyframeBatch(
        selection,
        "box-to-0-opacity",
        50,
        { opacity: 0.5 },
        {
          coalesceKey,
        },
      );
    });

    expect(commitMutation.mock.calls[0]?.[2]).toEqual({
      label: "Convert to keyframes",
      skipReload: true,
      coalesceKey,
      coalesceMs: Infinity,
    });
    expect(commitMutation.mock.calls[1]?.[2]).toEqual({
      label: "Add keyframe at 50%",
      softReload: true,
      coalesceKey,
    });
  });
});
