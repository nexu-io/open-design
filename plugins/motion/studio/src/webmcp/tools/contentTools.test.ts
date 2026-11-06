// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  studioSetStyle,
  studioSetText,
  type ContentToolDeps,
  type StudioSetStyleResult,
  type StudioSetTextResult,
} from "./contentTools";
import {
  expectFailure,
  expectOk,
  previewElement,
  selectionFor,
  sourceHandle,
  targetedWriteDeps,
} from "../webmcpTestUtils";

const textInput = (input: Record<string, unknown>) => ({
  handle: sourceHandle("headline"),
  ...input,
});

const styleInput = (styles: unknown) => ({ handle: sourceHandle("headline"), styles });

function contentDeps(overrides: Partial<ContentToolDeps> = {}): ContentToolDeps {
  const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
  const selection = selectionFor(element);
  return {
    ...targetedWriteDeps(selection),
    setText: async () => ({ ok: true }),
    setStyle: async () => ({ ok: true }),
    ...overrides,
  };
}

function childTextSelection() {
  const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
  const selection = selectionFor(element);
  selection.textFields = [{ ...selection.textFields[0]!, key: "child:0:h1" }];
  return selection;
}

describe("studioSetText", () => {
  it("writes the text and reports what it now is", async () => {
    const setText = vi.fn(async (selection) => {
      selection.element.textContent = "Ship it faster";
      return { ok: true } as const;
    });

    const result = await studioSetText(
      contentDeps({ setText }),
      textInput({ text: "Ship it faster" }),
    );

    const ok = expectOk<StudioSetTextResult>(result);
    expect(ok.text).toBe("Ship it faster");
    expect(ok.changed).toBe(true);
    // The single field is resolved and named, rather than left undefined.
    expect(setText).toHaveBeenCalledWith(expect.anything(), "Ship it faster", "self");
  });

  it("reports changed:false when the text already said that", async () => {
    const result = await studioSetText(contentDeps(), textInput({ text: "Ship it" }));

    expect(expectOk<StudioSetTextResult>(result).changed).toBe(false);
  });

  it("refuses to write while a conflict is waiting for the user", async () => {
    // The paused-save and conflict states are banners with no lock behind them.
    // Nothing else stops a programmatic write landing on top of a decision the
    // user has been asked to make.
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(
        contentDeps({
          getWriteBlockedReason: () => "an external change to this file is waiting to be resolved",
          setText,
        }),
        textInput({ text: "Ship it faster" }),
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/external change/);
    expect(setText).not.toHaveBeenCalled();
  });

  it("does not report success when the commit declined", async () => {
    // The whole reason the handlers now return an outcome: they resolve on
    // failure, so awaiting them proves nothing.
    const result = expectFailure(
      await studioSetText(
        contentDeps({ setText: async () => ({ ok: false, reason: "persist-failed" }) }),
        textInput({ text: "Ship it faster" }),
      ),
    );

    expect(result.kind).toBe("failed");
    expect(result.reason).toMatch(/persist-failed/);
  });

  it("turns a decline reason into a hint naming what to do instead", async () => {
    const result = expectFailure(
      await studioSetText(
        contentDeps({ setText: async () => ({ ok: false, reason: "not-text-editable" }) }),
        textInput({ text: "x" }),
      ),
    );

    expect(result.kind).toBe("failed");
    expect(result.hint).toMatch(/studio_inspect/);
  });

  it("rejects a non-string text without dispatching", async () => {
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(contentDeps({ setText }), textInput({ text: 42 })),
    );

    expect(result.kind).toBe("invalid");
    expect(setText).not.toHaveBeenCalled();
  });

  it("reports an unsupported target when Studio cannot build its selection", async () => {
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(
        contentDeps({ buildSelection: async () => null, setText }),
        textInput({ text: "x" }),
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("the target resolved to an element Studio cannot edit");
    expect(result.hint).toMatch(/parent or child/);
    expect(setText).not.toHaveBeenCalled();
  });

  it("targets the element's ACTUAL text field, not a field called self", async () => {
    // Found end to end, not by these tests. An element's text usually lives in a
    // child field keyed like `child:0:h1`. Passing no key planned zero
    // operations, and the server rejected the empty patch with
    // "target and operations required" -- a persist failure that looked like a
    // server problem and was not.
    const selection = childTextSelection();
    const setText = vi.fn(async () => ({ ok: true }) as const);

    await studioSetText(
      contentDeps({ ...targetedWriteDeps(selection), setText }),
      textInput({ text: "Shipped it" }),
    );

    expect(setText).toHaveBeenCalledWith(selection, "Shipped it", "child:0:h1");
  });

  it("rejects a field the element does not have, rather than writing nowhere", async () => {
    const selection = childTextSelection();
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(
        contentDeps({ ...targetedWriteDeps(selection), setText }),
        textInput({ text: "x", field: "self" }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(result.hint).toContain("child:0:h1");
    expect(setText).not.toHaveBeenCalled();
  });

  it("asks which field when the element has several", async () => {
    const element = previewElement('<div id="card">a</div>', "card");
    const selection = selectionFor(element);
    const base = selection.textFields[0]!;
    selection.textFields = [
      { ...base, key: "child:0:h2" },
      { ...base, key: "child:1:p" },
    ];
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(contentDeps({ ...targetedWriteDeps(selection), setText }), {
        handle: sourceHandle("card"),
        text: "x",
      }),
    );

    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/2 text fields/);
    expect(setText).not.toHaveBeenCalled();
  });

  it("reports an element with no text field as blocked", async () => {
    const element = previewElement('<div id="box"></div>', "box");
    const selection = selectionFor(element);
    selection.textFields = [];
    const setText = vi.fn();

    const result = expectFailure(
      await studioSetText(contentDeps({ ...targetedWriteDeps(selection), setText }), {
        handle: sourceHandle("box"),
        text: "x",
      }),
    );

    expect(result.kind).toBe("blocked");
    expect(setText).not.toHaveBeenCalled();
  });
});

describe("studioSetStyle", () => {
  it("applies every property and reports them", async () => {
    const setStyle = vi.fn(async () => ({ ok: true }) as const);

    const result = await studioSetStyle(contentDeps({ setStyle }), {
      ...styleInput({ color: "red", "font-size": "48px" }),
    });

    const ok = expectOk<StudioSetStyleResult>(result);
    expect(ok.applied).toEqual({ color: "red", "font-size": "48px" });
    expect(ok.rejected).toEqual({});
    expect(setStyle).toHaveBeenCalledTimes(2);
  });

  it("keeps an earlier changed property when the latest saved property is a no-op", async () => {
    const setStyle = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        persistence: { sourceFile: "index.html", version: "v1", changed: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        persistence: { sourceFile: "index.html", version: "v2", changed: false },
      });

    const result = expectOk<StudioSetStyleResult>(
      await studioSetStyle(
        contentDeps({ setStyle }),
        styleInput({ color: "red", "font-size": "48px" }),
      ),
    );

    expect(result).toMatchObject({
      stage: "saved",
      changed: true,
      evidence: { kind: "content-version", sourceFile: "index.html", version: "v2" },
      propertyReceipts: {
        color: { stage: "saved", changed: true },
        "font-size": { stage: "saved", changed: false },
      },
    });
  });

  it("commits sequentially, never concurrently", async () => {
    // Two commits racing through Studio's client-side read-modify-write can
    // record undo entries that both claim the same starting content.
    let inFlight = 0;
    let maxInFlight = 0;
    const setStyle = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { ok: true } as const;
    });

    await studioSetStyle(contentDeps({ setStyle }), {
      ...styleInput({ color: "red", "font-size": "48px", opacity: "0.5" }),
    });

    expect(maxInFlight).toBe(1);
  });

  it("reports a partial success as partial, not whole", async () => {
    const setStyle = vi.fn(async (_selection, property: string) =>
      property === "left"
        ? ({ ok: false, reason: "geometry-property" } as const)
        : ({ ok: true } as const),
    );

    const result = await studioSetStyle(contentDeps({ setStyle }), {
      ...styleInput({ color: "red", left: "10px" }),
    });

    const ok = expectOk<StudioSetStyleResult>(result);
    expect(ok.applied).toEqual({ color: "red" });
    expect(ok.rejected).toEqual({ left: "geometry-property" });
  });

  it("fails when every property was refused", async () => {
    const result = expectFailure(
      await studioSetStyle(
        contentDeps({ setStyle: async () => ({ ok: false, reason: "styles-not-editable" }) }),
        styleInput({ color: "red" }),
      ),
    );

    expect(result.kind).toBe("failed");
    expect(result.reason).toMatch(/styles-not-editable/);
  });

  it("rejects an empty styles object rather than committing nothing", async () => {
    const setStyle = vi.fn();

    const result = expectFailure(await studioSetStyle(contentDeps({ setStyle }), styleInput({})));

    expect(result.kind).toBe("invalid");
    expect(setStyle).not.toHaveBeenCalled();
  });

  it("rejects a non-object styles value", async () => {
    for (const styles of ["color: red", 42, null, ["color"]]) {
      const result = expectFailure(await studioSetStyle(contentDeps(), styleInput(styles)));
      expect(result.kind).toBe("invalid");
    }
  });

  it("refuses to write while a conflict is waiting for the user", async () => {
    const setStyle = vi.fn();

    const result = expectFailure(
      await studioSetStyle(
        contentDeps({ getWriteBlockedReason: () => "Auto-save is paused", setStyle }),
        styleInput({ color: "red" }),
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(setStyle).not.toHaveBeenCalled();
  });
});
