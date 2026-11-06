/**
 * T4 — Op contract stubs.
 *
 * These tests define the expected shape of the Studio editor operation (op) dispatch boundary
 * that will be introduced during R5 (op-shape refactor) and R6 (runtime bridge).
 * All are .todo until the dispatch boundary is exposed.
 */
import { describe, it } from "vitest";

describe("T4 — op contract: move", () => {
  it.todo("move op has { type: 'move', id, x, y } shape");
  it.todo("move op applied to element produces updated left/top style values");
  it.todo("move op is recorded in edit history with label 'Move layer'");
  it.todo("move op coalesces when dragging (same id, within coalesce window)");
});

describe("T4 — op contract: resize", () => {
  it.todo("resize op has { type: 'resize', id, width, height } shape");
  it.todo("resize op applied updates width/height style values");
  it.todo("resize op is recorded in edit history with label 'Resize layer'");
});

describe("T4 — op contract: retime", () => {
  it.todo("retime op has { type: 'retime', id, startTime, duration } shape");
  it.todo("retime op updates data-start/data-end attributes on the element");
  it.todo("retime op is recorded in edit history with label 'Retime layer'");
});

describe("T4 — op contract: style", () => {
  it.todo("style op has { type: 'style', id, prop, value } shape");
  it.todo("style op applied updates the correct inline style property");
  it.todo("style op coalesces same id+prop edits within window");
});

describe("T4 — op contract: dispatch boundary", () => {
  it.todo("dispatch emits origin:'studio' on every op for SDK origin guard");
  it.todo("applyPatches with origin:'applyPatches' does not push to undo stack");
  it.todo("dispatching an unknown op type throws at the boundary, not silently fails");
});
