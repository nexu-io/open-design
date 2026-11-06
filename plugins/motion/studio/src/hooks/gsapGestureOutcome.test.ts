import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackKeyframeCommit } from "../utils/keyframeUsage";
import { observeGsapGesture } from "./gsapGestureOutcome";
import type { CommitMutation, MutationResult } from "./gsapScriptCommitTypes";
import { trackStudioEvent } from "../utils/studioTelemetry";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const selection = {} as Parameters<CommitMutation>[0];
const mutation = {
  type: "add-keyframe",
  animationId: "private-target",
  properties: { text: "private-content" },
};
function writer(result?: MutationResult): CommitMutation {
  const commit: CommitMutation = async (_selection, _mutation, options) => {
    if (result) options.onResult?.(result);
  };
  commit.batch = async (_calls, options) => {
    if (result) options.onResult?.(result);
  };
  return commit;
}

describe("GSAP gesture usage", () => {
  it("counts a multi-write add gesture once from successful writer results", async () => {
    const observed = observeGsapGesture(
      writer({ ok: true, changed: true, mutationChanges: [true] }),
    );
    const onResult = vi.fn();
    await observed.commit!(
      selection,
      { type: "convert-to-keyframes" },
      { label: "Convert", onResult },
    );
    await observed.commit!(selection, mutation, { label: "Add" });
    expect(trackStudioEvent).not.toHaveBeenCalled();
    expect(observed.finish()).toEqual({ ok: true, changed: true });
    expect(onResult).toHaveBeenCalledWith({ ok: true, changed: true, mutationChanges: [true] });
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action: "add" });
  });

  it("counts a batched insertion once", async () => {
    const observed = observeGsapGesture(
      writer({ ok: true, changed: true, mutationChanges: [true, true] }),
    );
    await observed.commit!.batch!(
      [
        { selection, mutation, options: { label: "Add" } },
        { selection, mutation, options: { label: "Add" } },
      ],
      { label: "Add together" },
    );
    expect(observed.finish().changed).toBe(true);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action: "add" });
  });

  it("retains insertion metadata from an earlier member of a mixed batch", async () => {
    const observed = observeGsapGesture(
      writer({ ok: true, changed: true, mutationChanges: [true, true] }),
    );
    await observed.commit!.batch!(
      [
        {
          selection,
          mutation: { type: "replace-with-keyframes" },
          options: { label: "Extend", keyframeAction: "add" },
        },
        { selection, mutation: { type: "update-keyframe" }, options: { label: "Update" } },
      ],
      { label: "Update" },
    );
    observed.finish();
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action: "add" });
  });

  it("uses semantic insertion metadata for a replacement", async () => {
    const observed = observeGsapGesture(
      writer({ ok: true, changed: true, mutationChanges: [true] }),
    );
    await observed.commit!(
      selection,
      { type: "replace-with-keyframes" },
      { label: "Replace", keyframeAction: "add" },
    );
    observed.finish();
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action: "add" });
  });

  it.each([undefined, { ok: true }, { ok: true, changed: false }, { ok: false, changed: true }])(
    "does not count resolution without a changed successful write (%j)",
    async (result) => {
      const observed = observeGsapGesture(writer(result));
      await observed.commit!(selection, mutation, { label: "Add" });
      expect(observed.finish()).toEqual({ ok: true, changed: false });
      expect(trackStudioEvent).not.toHaveBeenCalled();
    },
  );

  it("does not count missing writers or an unfinished group", async () => {
    expect(observeGsapGesture(null).finish()).toEqual({ ok: true, changed: false });
    const observed = observeGsapGesture(writer());
    await observed.commit!(selection, mutation, { label: "Add" });
    expect(observed.finish(true).changed).toBe(false);
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });

  it("reports a successful plain DOM gesture without inventing keyframes", () => {
    expect(observeGsapGesture(null).finish(true).changed).toBe(true);
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });
});

it.each([
  [[false, true], 0],
  [[true, false], 1],
  [undefined, 0],
] as const)(
  "attributes mixed batches only to changed members (%j)",
  async (mutationChanges, count) => {
    const result = {
      ok: true,
      changed: true,
      mutationChanges: mutationChanges && [...mutationChanges],
    };
    const observed = observeGsapGesture(writer(result));
    const mutations = [mutation, { type: "update-property" }];
    await observed.commit!.batch!(
      mutations.map((mutation) => ({ selection, mutation, options: { label: "Edit" } })),
      { label: "Edit" },
    );
    expect(observed.finish()).toEqual({ ok: true, changed: true });
    expect(trackStudioEvent).toHaveBeenCalledTimes(count);
    if (count) expect(trackStudioEvent).toHaveBeenCalledWith("keyframe", { action: "add" });
    vi.mocked(trackStudioEvent).mockClear();
    trackKeyframeCommit(mutations, result, { label: "Edit" });
    expect(trackStudioEvent).toHaveBeenCalledTimes(count);
  },
);

it("excludes a suppressed preparation from mixed-batch attribution", async () => {
  const result = { ok: true, changed: true, mutationChanges: [true, false] };
  const calls = [
    {
      selection,
      mutation: { type: "convert-to-keyframes" },
      options: { label: "Prepare", keyframeTelemetry: false },
    },
    { selection, mutation, options: { label: "Add" } },
  ];
  const observed = observeGsapGesture(writer(result));
  await observed.commit!.batch!(calls, { label: "Add" });
  expect(observed.finish()).toEqual({ ok: true, changed: true });
  trackKeyframeCommit(
    calls.map((call) => call.mutation),
    result,
    { label: "Add" },
    calls.map((call) => call.options),
  );
  expect(trackStudioEvent).not.toHaveBeenCalled();
});
