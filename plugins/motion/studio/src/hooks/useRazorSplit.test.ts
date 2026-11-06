// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { useRazorSplit } from "./useRazorSplit";
import type { RecordEditInput } from "./timelineEditingHelpers";
import { createSplitFetchMock, mountProbe } from "./useRazorSplit.testHelpers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT_FILE = "index.html";
const SUBCOMP_FILE = "scenes/intro.html";

// A root-level clip lives in index.html and is authored in local time already.
const rootElement: TimelineElement = {
  id: "root-clip",
  tag: "div",
  start: 0,
  duration: 10,
  track: 0,
  domId: "root-clip",
  sourceFile: ROOT_FILE,
};

// An expanded sub-comp child: `start` is in MASTER coordinates (offset by the
// host's master start), `sourceFile` is the sub-comp, and `parentCompositionStart`
// is that host master start. Its authored time in the file is start - basis.
const expandedChild: TimelineElement = {
  id: "child-clip",
  tag: "div",
  start: 2,
  duration: 6,
  track: 1,
  domId: "child-clip",
  sourceFile: SUBCOMP_FILE,
  parentCompositionStart: 2,
};

interface SplitRequest {
  path: string;
  splitTime: number;
  elementStart: number;
  elementDuration: number;
}

type SingleSplit = (element: TimelineElement, splitTime: number) => Promise<void>;
type SplitAll = (splitTime: number) => Promise<void>;

interface Harness {
  splitRequests: SplitRequest[];
  singleRef: { current: SingleSplit | undefined };
  allRef: { current: SplitAll | undefined };
  root: ReturnType<typeof mountProbe>;
}

function mountRazorSplit(): Harness {
  const disk: Record<string, string> = {
    [ROOT_FILE]: `<div class="clip" id="root-clip" data-start="0" data-duration="10"></div>`,
    [SUBCOMP_FILE]: `<div class="clip" id="child-clip" data-start="0" data-duration="6"></div>`,
  };
  const splitRequests: SplitRequest[] = [];

  const fetchMock = createSplitFetchMock(disk, (path, body) => {
    splitRequests.push({
      path,
      splitTime: body.splitTime,
      elementStart: body.elementStart,
      elementDuration: body.elementDuration,
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const singleRef: { current: SingleSplit | undefined } = { current: undefined };
  const allRef: { current: SplitAll | undefined } = { current: undefined };

  function Component() {
    const { handleRazorSplit, handleRazorSplitAll } = useRazorSplit({
      projectId: "p1",
      activeCompPath: ROOT_FILE,
      showToast: () => {},
      writeProjectFile: async (path, content) => {
        disk[path] = content;
      },
      recordEdit: async () => {},
      reloadPreview: () => {},
    });
    singleRef.current = handleRazorSplit;
    allRef.current = handleRazorSplitAll;
    return null;
  }

  const root = mountProbe(Component);
  return { splitRequests, singleRef, allRef, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({ elements: [] });
  vi.unstubAllGlobals();
});

describe("useRazorSplit — sub-comp coordinate rebasing", () => {
  let harness: Harness;
  beforeEach(() => {
    harness = mountRazorSplit();
  });
  afterEach(() => {
    act(() => harness.root.unmount());
  });

  it("rebases an expanded sub-comp child split into the sub-comp's local time", async () => {
    // Master split time T = 5; host starts at 2, so local time is 3.
    await act(async () => {
      await harness.singleRef.current!(expandedChild, 5);
    });

    expect(harness.splitRequests).toHaveLength(1);
    const req = harness.splitRequests[0];
    expect(req.path).toBe(SUBCOMP_FILE);
    expect(req.splitTime).toBe(3); // 5 - parentCompositionStart(2), NOT 5
    expect(req.elementStart).toBe(0); // 2 - 2, NOT the master start 2
    expect(req.elementDuration).toBe(6);
  });

  it("leaves a root-level clip's coordinates unchanged", async () => {
    // Master split time T = 4; no parentCompositionStart, so nothing is rebased.
    await act(async () => {
      await harness.singleRef.current!(rootElement, 4);
    });

    expect(harness.splitRequests).toHaveLength(1);
    const req = harness.splitRequests[0];
    expect(req.path).toBe(ROOT_FILE);
    expect(req.splitTime).toBe(4);
    expect(req.elementStart).toBe(0);
    expect(req.elementDuration).toBe(10);
  });

  it("rebases each element individually in a mixed razor-split-all gesture", async () => {
    usePlayerStore.setState({ elements: [rootElement, expandedChild] });

    // Master split time T = 3 lies inside both clips.
    await act(async () => {
      await harness.allRef.current!(3);
    });

    expect(harness.splitRequests).toHaveLength(2);
    const rootReq = harness.splitRequests.find((r) => r.path === ROOT_FILE)!;
    const childReq = harness.splitRequests.find((r) => r.path === SUBCOMP_FILE)!;

    // Root clip: already local — master coordinates pass through untouched.
    expect(rootReq.splitTime).toBe(3);
    expect(rootReq.elementStart).toBe(0);

    // Expanded child: rebased by its OWN parentCompositionStart, not the root's.
    expect(childReq.splitTime).toBe(1); // 3 - 2
    expect(childReq.elementStart).toBe(0); // 2 - 2
  });
});

// ── Bug 1: split must resync the SDK session so undo isn't refused ────────────

interface UndoHarness {
  singleRef: { current: SingleSplit | undefined };
  disk: Record<string, string>;
  // What the split recorded, so the server (projectHistory.ts) could fold and
  // later undo it — recording, folding and undo mismatch guards are the
  // server's own tested behaviour (projectHistory.test.ts,
  // usePersistentEditHistory.test.ts), not re-proven here via a reducer.
  records: RecordEditInput[];
  forceReloadSdkSession: ReturnType<typeof vi.fn>;
  root: ReturnType<typeof mountProbe>;
}

function mountRazorSplitWithHistory(): UndoHarness {
  const disk: Record<string, string> = {
    [ROOT_FILE]: `<div class="clip" id="root-clip" data-start="0" data-duration="10"></div>`,
  };
  const records: RecordEditInput[] = [];
  const forceReloadSdkSession = vi.fn();

  const fetchMock = createSplitFetchMock(disk);
  vi.stubGlobal("fetch", fetchMock);

  const singleRef: { current: SingleSplit | undefined } = { current: undefined };
  function Component() {
    const { handleRazorSplit } = useRazorSplit({
      projectId: "p1",
      activeCompPath: ROOT_FILE,
      showToast: () => {},
      writeProjectFile: async (path, content) => {
        disk[path] = content;
      },
      recordEdit: async (input) => {
        records.push(input);
      },
      reloadPreview: () => {},
      forceReloadSdkSession,
    });
    singleRef.current = handleRazorSplit;
    return null;
  }
  const root = mountProbe(Component);
  return { singleRef, disk, records, forceReloadSdkSession, root };
}

describe("useRazorSplit — undo integrity after split (Bug 1)", () => {
  let h: UndoHarness;
  beforeEach(() => {
    h = mountRazorSplitWithHistory();
  });
  afterEach(() => {
    act(() => h.root.unmount());
  });

  it("resyncs the SDK session after a split (matches every other server-write path)", async () => {
    await act(async () => {
      await h.singleRef.current!(rootElement, 4);
    });
    expect(h.forceReloadSdkSession).toHaveBeenCalledTimes(1);
  });

  it("records the split as one entry whose file carries the exact pre/post-split bytes a real undo restores", async () => {
    const before = h.disk[ROOT_FILE];
    await act(async () => {
      await h.singleRef.current!(rootElement, 4);
    });
    expect(h.disk[ROOT_FILE]).toContain("<!--split-->");
    expect(h.records).toHaveLength(1);
    expect(h.records[0]).toMatchObject({ label: "Split timeline clip" });
    expect(h.records[0]!.files[ROOT_FILE]).toEqual({ before, after: h.disk[ROOT_FILE] });
  });
});
