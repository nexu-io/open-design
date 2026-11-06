// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  studioSeek,
  studioSelect,
  type SelectionToolDeps,
  type StudioSeekResult,
  type StudioSelectResult,
} from "./selectionTools";
import {
  expectFailure,
  expectOk,
  previewDoc,
  selectionFor,
  selectionToolDeps,
  sourceHandle,
} from "../webmcpTestUtils";

function selectionDeps(overrides: Partial<SelectionToolDeps> = {}): SelectionToolDeps {
  return selectionToolDeps(overrides);
}

describe("studioSelect", () => {
  it("refuses a scoped handle from another project before selecting", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const applySelection = vi.fn();

    const result = await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      sourceHandle("headline", "project-b"),
    );

    expect(result).toMatchObject({
      ok: false,
      kind: "invalid",
      reason: "the handle belongs to a different project",
    });
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("applies the selection a click would produce and reports it back", async () => {
    const doc = previewDoc('<h1 id="headline" data-hf-id="abc">Ship it</h1>');
    const applySelection = vi.fn();

    const result = await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      "hf:abc",
    );

    const ok = expectOk<StudioSelectResult>(result);
    expect(ok.handle).toBe("hf:abc");
    expect(ok.label).toBe("Headline");
    expect(ok.box.width).toBe(880);
    // Reveals the inspector, which is what makes the human see what the agent did.
    expect(applySelection).toHaveBeenCalledTimes(1);
  });

  it("returns the exact source-safe handle it resolved", async () => {
    const doc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"><h1 id="headline">Ship it</h1></main>',
    );
    const handle = "dom:v1:index.html:index.html:headline";

    const ok = expectOk<StudioSelectResult>(
      await studioSelect(selectionDeps({ getPreviewDocument: () => doc }), handle),
    );

    expect(ok.handle).toBe(handle);
  });

  it("reacquires once when the preview document reloads during selection resolution", async () => {
    const firstDoc = previewDoc('<h1 data-hf-id="abc">Old preview</h1>');
    const nextDoc = previewDoc('<h1 data-hf-id="abc">Current preview</h1>');
    let currentDoc = firstDoc;
    const buildSelection = vi.fn(async (element: HTMLElement) => {
      if (element.ownerDocument === firstDoc) {
        currentDoc = nextDoc;
        return selectionFor(element, { boundingBox: { x: 0, y: 0, width: 0, height: 0 } });
      }
      return selectionFor(element, {
        boundingBox: { x: 98, y: 206, width: 304, height: 50 },
      });
    });
    const applySelection = vi.fn();

    const ok = expectOk<StudioSelectResult>(
      await studioSelect(
        selectionDeps({
          getPreviewDocument: () => currentDoc,
          buildSelection,
          applySelection,
        }),
        "hf:abc",
      ),
    );

    expect(ok.box).toEqual({ x: 98, y: 206, width: 304, height: 50 });
    expect(buildSelection).toHaveBeenCalledTimes(2);
    expect(applySelection).toHaveBeenCalledWith(
      expect.objectContaining({ element: nextDoc.querySelector("h1") }),
    );
  });

  it("refuses when the preview changes again during the bounded reacquire", async () => {
    const documents = [
      previewDoc('<h1 data-hf-id="abc">First preview</h1>'),
      previewDoc('<h1 data-hf-id="abc">Second preview</h1>'),
      previewDoc('<h1 data-hf-id="abc">Third preview</h1>'),
    ];
    let currentIndex = 0;
    const buildSelection = vi.fn(async (element: HTMLElement) => {
      currentIndex += 1;
      return selectionFor(element);
    });
    const applySelection = vi.fn();

    const failure = expectFailure(
      await studioSelect(
        selectionDeps({
          getPreviewDocument: () => documents[currentIndex] ?? documents.at(-1)!,
          buildSelection,
          applySelection,
        }),
        "hf:abc",
      ),
    );

    expect(failure).toMatchObject({
      kind: "invalid",
      reason: "the target changed while it was resolving",
      hint: "Call studio_look again.",
    });
    expect(buildSelection).toHaveBeenCalledTimes(2);
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("distinguishes a preview that is not mounted from a handle that does not match", async () => {
    const notMounted = expectFailure(await studioSelect(selectionDeps(), "dom:headline"));
    expect(notMounted.kind).toBe("blocked");
    expect(notMounted.reason).toMatch(/not mounted/);

    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const noMatch = expectFailure(
      await studioSelect(selectionDeps({ getPreviewDocument: () => doc }), "dom:missing"),
    );
    expect(noMatch.kind).toBe("invalid");
    expect(noMatch.reason).toMatch(/no element matches/);
    // The two must not be the same message: waiting and re-reading are different fixes.
    expect(noMatch.reason).not.toBe(notMounted.reason);
  });

  it("reports an element Studio cannot build a selection for, as a third case", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');

    const result = expectFailure(
      await studioSelect(
        selectionDeps({ getPreviewDocument: () => doc, buildSelection: async () => null }),
        "dom:headline",
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/cannot select/);
  });

  it("rejects a missing handle without touching the preview", async () => {
    const getPreviewDocument = vi.fn(() => null);

    const result = expectFailure(await studioSelect(selectionDeps({ getPreviewDocument }), "  "));

    expect(result.kind).toBe("invalid");
    expect(getPreviewDocument).not.toHaveBeenCalled();
  });

  it("leaves the existing selection alone when it fails", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const applySelection = vi.fn();

    await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      "dom:missing",
    );

    expect(applySelection).not.toHaveBeenCalled();
  });
});

describe("studioSeek", () => {
  it("reports where the playhead landed, not what was requested", () => {
    // The player clamps against the ADAPTER's duration, which the wrapper
    // deliberately does not second-guess.
    let currentTime = 0;
    const result = studioSeek(
      selectionDeps({
        requestSeek: () => {
          currentTime = 10;
        },
        readPlayhead: () => ({ currentTime, duration: 10, isPlaying: false }),
      }),
      999,
    );

    const ok = expectOk<StudioSeekResult>(result);
    expect(ok.playhead).toBe(10);
    expect(ok.moved).toBe(true);
  });

  it("reports that playback stopped", () => {
    let isPlaying = true;
    let currentTime = 0;
    const result = studioSeek(
      selectionDeps({
        requestSeek: () => {
          currentTime = 2;
          isPlaying = false;
        },
        readPlayhead: () => ({ currentTime, duration: 10, isPlaying }),
      }),
      2,
    );

    expect(expectOk<StudioSeekResult>(result).isPlaying).toBe(false);
  });

  it("fails rather than claiming a seek the player never received", () => {
    // `requestSeek` is fire-and-forget: with no adapter mounted it silently does
    // nothing, and reporting ok would be a lie the agent builds on.
    const result = expectFailure(
      studioSeek(
        selectionDeps({ readPlayhead: () => ({ currentTime: 0, duration: 10, isPlaying: false }) }),
        5,
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/did not move/);
  });

  it("succeeds when asked to seek to where the playhead already is", () => {
    const result = studioSeek(
      selectionDeps({ readPlayhead: () => ({ currentTime: 3, duration: 10, isPlaying: false }) }),
      3,
    );

    // Nothing moved, but nothing failed either, and `moved` says which.
    const ok = expectOk<StudioSeekResult>(result);
    expect(ok.moved).toBe(false);
    expect(ok.playhead).toBe(3);
  });

  it("rejects a non-finite time without calling the player", () => {
    const requestSeek = vi.fn();

    for (const time of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = expectFailure(studioSeek(selectionDeps({ requestSeek }), time));
      expect(result.kind).toBe("invalid");
    }
    expect(requestSeek).not.toHaveBeenCalled();
  });
});
