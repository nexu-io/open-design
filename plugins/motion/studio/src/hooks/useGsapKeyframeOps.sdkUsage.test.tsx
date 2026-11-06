// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGsapKeyframeOps } from "./useGsapKeyframeOps";
import type { CutoverResult } from "../utils/sdkCutover";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { trackStudioEvent } from "../utils/studioTelemetry";

const sdkWrite = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<CutoverResult>>());
vi.mock("../utils/sdkCutover", async (original) => ({
  ...(await original<typeof import("../utils/sdkCutover")>()),
  sdkGsapKeyframePersist: sdkWrite,
  sdkGsapConvertToKeyframesPersist: sdkWrite,
  sdkGsapRemoveAllKeyframesPersist: sdkWrite,
}));
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
type Params = Parameters<typeof useGsapKeyframeOps>[0];
let root: Root;
function mount() {
  let api: ReturnType<typeof useGsapKeyframeOps> | undefined;
  const legacy = vi.fn(async () => undefined);
  function Probe() {
    api = useGsapKeyframeOps({
      activeCompPath: "index.html",
      commitMutation: legacy,
      commitMutationSafely: legacy,
      trackGsapSaveFailure: vi.fn(),
      sdkSession: {} as NonNullable<Params["sdkSession"]>,
      sdkDeps: {
        editHistory: { recordEdit: vi.fn(async () => undefined) },
        writeProjectFile: vi.fn(async () => undefined),
        reloadPreview: vi.fn(),
      },
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  if (!api) throw new Error("hook did not mount");
  return { api, legacy };
}
const selection = { id: "private-target", sourceFile: "private.html" } as DomEditSelection;
beforeEach(() => {
  vi.clearAllMocks();
  sdkWrite.mockResolvedValue({
    status: "committed",
    version: "v2",
    before: "before",
    after: "after",
  });
});
afterEach(() => act(() => root.unmount()));
describe("SDK keyframe usage", () => {
  it.each(["add", "convert", "remove_all", "reset"] as const)(
    "counts a changed committed %s operation once",
    async (action) => {
      const { api, legacy } = mount();
      await act(async () => {
        if (action === "add")
          await api.addKeyframeBatch(selection, "private-animation", 50, { x: 12, y: 4 });
        else if (action === "convert") await api.convertToKeyframes(selection, "private-animation");
        else await api.removeAllKeyframes(selection, "private-animation", action);
      });
      expect(legacy).not.toHaveBeenCalled();
      expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action });
    },
  );
  it("preserves property metadata on a single-property SDK add", async () => {
    const { api } = mount();
    await act(async () => api.addKeyframe(selection, "private-animation", 50, "x", 12));
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", {
      action: "add",
      property: "x",
    });
  });
  it("does not count unchanged SDK source", async () => {
    sdkWrite.mockResolvedValue({
      status: "committed",
      version: "v2",
      before: "same",
      after: "same",
    });
    const { api } = mount();
    await api.addKeyframeBatch(selection, "private-animation", 50, { x: 12 });
    expect(await api.removeAllKeyframes(selection, "private-animation")).toBe(false);
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });
  it("honors intermediate-write suppression in SDK paths", async () => {
    const { api } = mount();
    await api.convertToKeyframes(selection, "private-animation", undefined, undefined, {
      keyframeTelemetry: false,
    });
    await api.addKeyframeBatch(
      selection,
      "private-animation",
      50,
      { x: 12 },
      { keyframeTelemetry: false },
    );
    await api.removeAllKeyframes(selection, "private-animation", "remove_all", false);
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });
  it("does not fall back or count after a failed SDK write", async () => {
    sdkWrite.mockResolvedValue({ status: "failed", error: new Error("refused") });
    const { api, legacy } = mount();
    await expect(
      api.addKeyframeBatch(selection, "private-animation", 50, { x: 12 }),
    ).rejects.toThrow("refused");
    expect(legacy).not.toHaveBeenCalled();
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });
});
