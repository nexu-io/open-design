// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { splitElementInHtml } from "@hyperframes/studio-server/source-mutation";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { useRazorSplit } from "./useRazorSplit";
import type { RecordEditInput } from "./timelineEditingHelpers";
import { createSplitFetchMock, mountProbe } from "./useRazorSplit.testHelpers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL = `<div class="clip" id="clip1" data-start="0" data-duration="4" data-hf-id="hf-clip">hi</div>`;
const SPLIT = splitElementInHtml(ORIGINAL, { id: "clip1" }, 2, "clip1-split").html;

const element: TimelineElement = {
  id: "clip1",
  tag: "div",
  start: 0,
  duration: 4,
  track: 0,
  domId: "clip1",
  sourceFile: "index.html",
};

type Split = (element: TimelineElement, splitTime: number) => Promise<void>;
type SplitAll = (splitTime: number) => Promise<void>;

interface Harness {
  disk: Record<string, string>;
  // What the split recorded — folding, undo and undo mismatch guards are the
  // server's own tested behaviour (projectHistory.ts / projectHistory.test.ts,
  // usePersistentEditHistory.test.ts), not re-proven here via a reducer.
  records: RecordEditInput[];
  splitRef: { current: Split | undefined };
  root: ReturnType<typeof mountProbe>;
  expected: string;
  previewWrites: string[];
}

const SPLIT_GSAP = SPLIT.replace(
  "</div>",
  "</div><script>window.__timelines={};const tl=gsap.timeline({paused:true});" +
    'tl.set("#clip1-split",{x:0},2);window.__timelines["c"]=tl;</script>',
);

function mountRazorSplit(opts: { gsap?: boolean; previewStamp?: boolean } = {}): Harness {
  const disk: Record<string, string> = { "index.html": ORIGINAL };
  const finalContent = opts.gsap ? SPLIT_GSAP : SPLIT;
  const previewWrites: string[] = [];
  const records: RecordEditInput[] = [];

  // Faithful stand-in for the atomic server cut: one forward file write and one
  // response carrying the canonical history snapshots.
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/file-mutations/split-batch")) {
      const before = disk["index.html"];
      disk["index.html"] = finalContent;
      const version = `"test-cut-${finalContent.length}"`;
      return new Response(
        JSON.stringify({
          ok: true,
          outcome: "committed",
          files: [
            {
              path: "index.html",
              before,
              after: finalContent,
              version,
              writeToken: "test-cut",
              splitCount: 1,
              skippedSelectors: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/files/")) {
      const content = disk["index.html"];
      return new Response(JSON.stringify({ content, version: `"test-${content.length}"` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    void init;
    throw new Error(`unexpected fetch: ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  const splitRef: { current: Split | undefined } = { current: undefined };

  function Component() {
    const { handleRazorSplit } = useRazorSplit({
      projectId: "p1",
      activeCompPath: "index.html",
      showToast: () => {},
      writeProjectFile: async (path, content) => {
        disk[path] = content;
      },
      recordEdit: async (input) => {
        records.push(input);
      },
      reloadPreview: () => {
        if (!opts.previewStamp) return;
        const stamped = ensureHfIds(disk["index.html"]);
        const idsBefore = (disk["index.html"].match(/\bdata-hf-id=/g) ?? []).length;
        const idsAfter = (stamped.match(/\bdata-hf-id=/g) ?? []).length;
        if (idsAfter > idsBefore) {
          disk["index.html"] = stamped;
          previewWrites.push(stamped);
        }
      },
      forceReloadSdkSession: () => {},
    });
    splitRef.current = handleRazorSplit;
    return null;
  }

  const root = mountProbe(Component);

  return { disk, records, splitRef, root, expected: finalContent, previewWrites };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("useRazorSplit — split is undoable via edit history", () => {
  it("keeps history aligned when preview reload checks hf-id persistence", async () => {
    const harness = mountRazorSplit({ previewStamp: true });

    await act(async () => {
      await harness.splitRef.current!(element, 2);
    });

    // The preview reload found every id already stamped, so it never made a
    // second, unrecorded write that would leave the recorded entry stale...
    expect(harness.previewWrites).toHaveLength(0);
    // ...meaning the split's own recorded "after" IS the disk's final content,
    // and undoing it (server-side) would restore exactly the pre-split bytes.
    expect(harness.records).toHaveLength(1);
    expect(harness.records[0]!.files["index.html"]).toEqual({
      before: ORIGINAL,
      after: harness.disk["index.html"],
    });

    act(() => harness.root.unmount());
  });

  for (const gsap of [false, true]) {
    describe(gsap ? "with GSAP rewrite" : "plain HTML split", () => {
      let harness: Harness;
      beforeEach(() => {
        harness = mountRazorSplit({ gsap });
      });
      afterEach(() => {
        act(() => harness.root.unmount());
      });

      it("records a single 'Split timeline clip' entry with the exact bytes undo restores", async () => {
        await act(async () => {
          await harness.splitRef.current!(element, 2);
        });

        // The split reached disk.
        expect(harness.disk["index.html"]).toBe(harness.expected);

        // Exactly one entry, correctly labeled, carrying the pre/post-split bytes —
        // what a real undo (server-side, projectHistory.ts) restores from.
        expect(harness.records).toHaveLength(1);
        expect(harness.records[0]).toMatchObject({
          label: "Split timeline clip",
        });
        expect(harness.records[0]!.files["index.html"]).toEqual({
          before: ORIGINAL,
          after: harness.expected,
        });
      });
    });
  }
});

const BATCH_ORIGINALS = {
  "index.html": `<div class="clip" id="clip1" data-start="0" data-duration="4">one</div>`,
  "scenes/two.html": `<div class="clip" id="clip2" data-start="0" data-duration="4">two</div>`,
};

const batchElements: TimelineElement[] = [
  element,
  {
    ...element,
    id: "clip2",
    domId: "clip2",
    sourceFile: "scenes/two.html",
    track: 1,
  },
];

interface SplitAllHarness {
  disk: Record<string, string>;
  records: RecordEditInput[];
  splitAllRef: { current: SplitAll | undefined };
  root: ReturnType<typeof mountProbe>;
}

function mountRazorSplitAll(failOnSplit?: number): SplitAllHarness {
  const disk: Record<string, string> = { ...BATCH_ORIGINALS };
  const records: RecordEditInput[] = [];
  let splitCount = 0;

  vi.stubGlobal(
    "fetch",
    createSplitFetchMock(disk, () => {
      splitCount++;
      if (splitCount === failOnSplit) throw new Error("simulated split failure");
    }),
  );

  const splitAllRef: { current: SplitAll | undefined } = { current: undefined };
  function Component() {
    const { handleRazorSplitAll } = useRazorSplit({
      projectId: "p1",
      activeCompPath: "index.html",
      showToast: () => {},
      writeProjectFile: async (path, content) => {
        disk[path] = content;
      },
      recordEdit: async (input) => {
        records.push(input);
      },
      reloadPreview: () => {},
    });
    splitAllRef.current = handleRazorSplitAll;
    return null;
  }

  const root = mountProbe(Component);
  usePlayerStore.setState({ elements: batchElements });
  return { disk, records, splitAllRef, root };
}

describe("useRazorSplit — split-all batch history", () => {
  afterEach(() => {
    usePlayerStore.setState({ elements: [] });
  });

  async function runSplitAll(failOnSplit?: number) {
    const harness = mountRazorSplitAll(failOnSplit);
    await act(async () => {
      await harness.splitAllRef.current!(2);
    });
    return harness;
  }

  it("records one entry whose files cover every split file (one undo restores all of them)", async () => {
    const harness = await runSplitAll();

    expect(harness.records).toHaveLength(1);
    const files = harness.records[0]!.files;
    expect(Object.keys(files).sort()).toEqual(Object.keys(BATCH_ORIGINALS).sort());
    for (const path of Object.keys(BATCH_ORIGINALS) as (keyof typeof BATCH_ORIGINALS)[]) {
      expect(files[path]?.before).toBe(BATCH_ORIGINALS[path]);
      expect(files[path]?.after).toBe(harness.disk[path]);
    }
    act(() => harness.root.unmount());
  });

  it("restores completed writes and records no entry when a later split fails", async () => {
    const harness = await runSplitAll(2);

    expect(harness.disk).toEqual(BATCH_ORIGINALS);
    expect(harness.records).toHaveLength(0);
    act(() => harness.root.unmount());
  });
});
