// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mintElementHandle } from "./handles";
import { previewDoc, selectionFor } from "./webmcpTestUtils";
import {
  dispatched,
  runTargetedWrite,
  saved,
  studioEditLifecycle,
  type TargetedWriteDeps,
} from "./writeCoordinator";

function fixture() {
  const doc = previewDoc('<div id="target">Target</div>');
  const element = doc.getElementById("target") as HTMLElement;
  const handle = mintElementHandle({
    projectId: "project-a",
    domId: "target",
    sourceFile: "index.html",
    activeCompositionPath: "index.html",
  });
  if (!handle) throw new Error("expected handle");
  const deps: TargetedWriteDeps = {
    getPreviewDocument: () => doc,
    getProjectId: () => "project-a",
    getWriteBlockedReason: () => null,
    buildSelection: async (target) => selectionFor(target),
    applySelection: () => undefined,
  };
  return { deps, element, handle };
}

afterEach(() => {
  studioEditLifecycle.reset();
  document.body.replaceChildren();
});

describe("studio write coordinator", () => {
  it("refuses legacy and stale-project handles before resolving or calling the actor", async () => {
    const { deps } = fixture();
    const actor = vi.fn();
    const buildSelection = vi.fn(deps.buildSelection);
    const legacy = mintElementHandle({
      domId: "target",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });
    const staleProject = mintElementHandle({
      projectId: "project-b",
      domId: "target",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });

    const legacyResult = await runTargetedWrite(
      { ...deps, buildSelection },
      {
        handle: legacy,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );
    const staleResult = await runTargetedWrite(
      { ...deps, buildSelection },
      {
        handle: staleProject,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );

    expect(legacyResult).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(staleResult).toMatchObject({
      ok: false,
      stage: "refused",
      kind: "invalid",
      reason: "the handle belongs to a different project",
    });
    expect(buildSelection).not.toHaveBeenCalled();
    expect(actor).not.toHaveBeenCalled();
  });

  it("refuses an unavailable preview with its exact reason before calling the actor", async () => {
    const { deps, handle } = fixture();
    const actor = vi.fn();

    const result = await runTargetedWrite(
      { ...deps, getPreviewDocument: () => null },
      {
        handle,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );

    expect(result).toEqual({
      ok: false,
      kind: "blocked",
      reason: "the composition preview is not ready",
      stage: "refused",
      operation: "set-text",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("refuses a missing handle with its exact reason before calling the actor", async () => {
    const { deps } = fixture();
    const actor = vi.fn();

    const result = await runTargetedWrite(deps, {
      handle: mintElementHandle({
        projectId: "project-a",
        domId: "missing",
        sourceFile: "index.html",
        activeCompositionPath: "index.html",
      }),
      operation: "set-text",
      signal: new AbortController().signal,
      write: actor,
    });

    expect(result).toEqual({
      ok: false,
      kind: "invalid",
      reason: "the target handle is stale",
      hint: "Call studio_look and retry.",
      stage: "refused",
      operation: "set-text",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("refuses an unsupported element with its exact reason before calling the actor", async () => {
    const { deps, handle } = fixture();
    const actor = vi.fn();

    const result = await runTargetedWrite(
      { ...deps, buildSelection: async () => null },
      {
        handle,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );

    expect(result).toEqual({
      ok: false,
      kind: "blocked",
      reason: "the target resolved to an element Studio cannot edit",
      hint: "Try a parent or child element from studio_look.",
      stage: "refused",
      operation: "set-text",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("refuses a twice-replaced preview with its exact reason before calling the actor", async () => {
    const firstDoc = previewDoc('<div id="target">First</div>');
    const secondDoc = previewDoc('<div id="target">Second</div>');
    const thirdDoc = previewDoc('<div id="target">Third</div>');
    const handle = mintElementHandle({
      projectId: "project-a",
      domId: "target",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });
    let currentDoc = firstDoc;
    const actor = vi.fn();
    const result = await runTargetedWrite(
      {
        getPreviewDocument: () => currentDoc,
        getProjectId: () => "project-a",
        getWriteBlockedReason: () => null,
        buildSelection: async (element) => {
          currentDoc = currentDoc === firstDoc ? secondDoc : thirdDoc;
          return selectionFor(element);
        },
        applySelection: () => undefined,
      },
      {
        handle,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );

    expect(result).toEqual({
      ok: false,
      kind: "invalid",
      reason: "the target changed while it was resolving",
      hint: "Call studio_look again.",
      stage: "refused",
      operation: "set-text",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("returns a structured refusal when async preflight fails before dispatch", async () => {
    const { deps, handle } = fixture();
    const actor = vi.fn();

    const result = await runTargetedWrite(deps, {
      handle,
      operation: "update-animation",
      signal: new AbortController().signal,
      preflight: async () => {
        throw new Error("animation ownership is unavailable");
      },
      write: actor,
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "refused",
      kind: "failed",
      reason: "animation ownership is unavailable",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("refuses when the active project changes during target resolution", async () => {
    const { deps, handle } = fixture();
    const actor = vi.fn();
    let projectId = "project-a";

    const result = await runTargetedWrite(
      {
        ...deps,
        getProjectId: () => projectId,
        buildSelection: async (element) => {
          projectId = "project-b";
          return selectionFor(element);
        },
      },
      {
        handle,
        operation: "set-text",
        signal: new AbortController().signal,
        write: actor,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      stage: "refused",
      kind: "blocked",
      reason: "the active project changed while the target was resolving",
    });
    expect(actor).not.toHaveBeenCalled();
  });

  it("publishes nothing when cancellation refuses the write before dispatch", async () => {
    const { deps, handle } = fixture();
    const actor = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const result = await runTargetedWrite(deps, {
      handle,
      operation: "set-text",
      signal: controller.signal,
      write: actor,
    });

    expect(result).toMatchObject({ ok: false, stage: "refused", cancelRequested: true });
    expect(actor).not.toHaveBeenCalled();
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("marks repeat targets only after a terminal receipt and resets on project switch", async () => {
    const { deps, handle } = fixture();
    await runTargetedWrite(deps, {
      handle,
      operation: "set-text",
      signal: new AbortController().signal,
      write: async () => {
        expect(studioEditLifecycle.getSnapshot()).toMatchObject({ targetChanged: true });
        return saved(
          { text: "first", changed: true },
          { sourceFile: "index.html", version: "v1", changed: true },
        );
      },
    });

    await runTargetedWrite(deps, {
      handle,
      operation: "set-text",
      signal: new AbortController().signal,
      write: async () => {
        expect(studioEditLifecycle.getSnapshot()).toMatchObject({ targetChanged: false });
        return dispatched({ text: "second", changed: true }, true);
      },
    });

    studioEditLifecycle.activateProject("project-b");
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("does not let an older completion overwrite the newer invocation", () => {
    const target = { handle: "dom:target", sourceFile: "index.html" };
    const older = studioEditLifecycle.begin("project-a", target, "set-text");
    const newer = studioEditLifecycle.begin("project-a", target, "set-style");

    studioEditLifecycle.finish(older, {
      ok: true,
      stage: "saved",
      target,
      operation: "set-text",
      changed: true,
      evidence: { kind: "content-version", sourceFile: "index.html", version: "v1" },
    });

    expect(studioEditLifecycle.getSnapshot()).toMatchObject({
      callId: newer,
      operation: "set-style",
      phase: "dispatching",
    });
  });

  it("does not let an older dismissal clear the newer invocation", () => {
    const target = { handle: "dom:target", sourceFile: "index.html" };
    const older = studioEditLifecycle.begin("project-a", target, "set-text");
    const newer = studioEditLifecycle.begin("project-a", target, "set-style");

    studioEditLifecycle.dismiss(older);

    expect(studioEditLifecycle.getSnapshot()).toMatchObject({
      callId: newer,
      operation: "set-style",
      phase: "dispatching",
    });
  });

  it("dismisses its terminal call without forgetting repeated-target identity", () => {
    const target = { handle: "dom:target", sourceFile: "index.html" };
    const first = studioEditLifecycle.begin("project-a", target, "set-text");
    studioEditLifecycle.finish(first, {
      ok: true,
      stage: "saved",
      target,
      operation: "set-text",
      changed: true,
      evidence: { kind: "content-version", sourceFile: "index.html", version: "v1" },
    });

    studioEditLifecycle.dismiss(first);
    const repeated = studioEditLifecycle.begin("project-a", target, "set-style");

    expect(studioEditLifecycle.getSnapshot()).toMatchObject({
      callId: repeated,
      targetChanged: false,
    });
  });

  it("finishes the owning lifecycle as failed when an actor throws", async () => {
    const { deps, handle } = fixture();

    const result = await runTargetedWrite(deps, {
      handle,
      operation: "set-text",
      signal: new AbortController().signal,
      write: async () => {
        throw new Error("network down");
      },
    });

    expect(result).toMatchObject({ ok: false, stage: "failed", reason: "network down" });
    expect(studioEditLifecycle.getSnapshot()).toMatchObject({ phase: "failed", receipt: result });
  });
});
