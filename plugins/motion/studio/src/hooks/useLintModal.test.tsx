// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLintModal } from "./useLintModal";
import { usePlayerStore } from "../player/store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let latest: ReturnType<typeof useLintModal> | null = null;

function Probe() {
  latest = useLintModal("demo");
  return null;
}

beforeEach(() => {
  usePlayerStore.setState({ timelineProjectId: "demo", previewBooted: true });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  latest = null;
  vi.unstubAllGlobals();
});

async function mountWithLint(response: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(response));
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(<Probe />));
  await act(async () => {
    await latest?.handleLint();
  });
}

const lintResponse = (findings: Array<{ severity: string; message: string }>) => async () => ({
  json: async () => ({ findings }),
});

describe("useLintModal hasLintError", () => {
  it("is true when a finding is an error and false for warnings only", async () => {
    await mountWithLint(lintResponse([{ severity: "error", message: "nested" }]));
    expect(latest?.hasLintError).toBe(true);
    act(() => root?.unmount());
    root = null;
    await mountWithLint(lintResponse([{ severity: "warning", message: "soft" }]));
    expect(latest?.hasLintError).toBe(false);
  });

  it("is true for a mixed error and warning list", async () => {
    await mountWithLint(
      lintResponse([
        { severity: "warning", message: "soft" },
        { severity: "error", message: "nested" },
      ]),
    );
    expect(latest?.hasLintError).toBe(true);
  });

  it("is true when the manual lint itself fails, matching the badge count", async () => {
    await mountWithLint(async () => {
      throw new Error("offline");
    });
    expect(latest?.lintModal).toHaveLength(1);
    expect(latest?.hasLintError).toBe(true);
  });
});

describe("useLintModal lintFindingCount", () => {
  it("counts findings, not files, with the result open and after it closes", async () => {
    const findings = ["a", "b", "c"].map((message) => ({
      severity: "warning",
      message,
      file: "index.html",
    }));
    await mountWithLint(async () => ({ json: async () => ({ findings }) }));
    expect(latest?.lintFindingCount).toBe(3);
    act(() => latest?.closeLintModal());
    expect(latest?.findingsByFile.size).toBe(1);
    expect(latest?.lintFindingCount).toBe(3);
  });
});

describe("useLintModal background lint", () => {
  it("waits for the live preview to boot before asking the server to lint", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const fetchStub = vi.fn(lintResponse([]));
    vi.stubGlobal("fetch", fetchStub);
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));
    expect(fetchStub).not.toHaveBeenCalled();

    await act(async () => usePlayerStore.getState().markPreviewBooted());
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("never lints a project the user left before its preview booted", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const fetchStub = vi.fn(lintResponse([]));
    vi.stubGlobal("fetch", fetchStub);
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));

    await act(async () => {
      usePlayerStore.getState().beginTimelineSession("another-project");
      usePlayerStore.getState().markPreviewBooted();
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
