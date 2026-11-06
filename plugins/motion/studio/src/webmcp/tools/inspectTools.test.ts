// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { studioInspect, type InspectToolDeps, type StudioInspectResult } from "./inspectTools";
import {
  expectFailure,
  expectOk,
  previewDoc,
  previewElement,
  selectionFor,
  selectionToolDeps,
  sourceHandle,
} from "../webmcpTestUtils";

function animation(overrides: Partial<GsapAnimation> = {}): GsapAnimation {
  return {
    id: "anim-1",
    targetSelector: "#headline",
    method: "from",
    position: 0,
    properties: { y: -50, opacity: 0 },
    duration: 1,
    ease: "power2.out",
    ...overrides,
  } as GsapAnimation;
}

function inspectDeps(overrides: Partial<InspectToolDeps> = {}): InspectToolDeps {
  return {
    ...selectionToolDeps(),
    getProjectId: () => "project-a",
    getCurrentSelection: () => null,
    getGsapDiagnostics: () => ({
      animations: [],
      multipleTimelines: false,
      unsupportedTimelinePattern: false,
    }),
    ...overrides,
  };
}

describe("studioInspect", () => {
  it("refuses a scoped handle from another project before inspecting", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');

    const result = await studioInspect(inspectDeps({ getPreviewDocument: () => doc }), {
      handle: sourceHandle("headline", "project-b"),
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "invalid",
      reason: "the handle belongs to a different project",
    });
  });

  it("returns the resolved styles, not the authored ones", async () => {
    const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
    const selection = selectionFor(element);

    const result = await studioInspect(inspectDeps({ getCurrentSelection: () => selection }));

    const ok = expectOk<StudioInspectResult>(result);
    // The authored value is a clamp(); the resolved one is what actually renders.
    expect(ok.styles["font-size"]).toBe("42.7px");
    expect(ok.inlineStyles.color).toBe("red");
    expect(ok.box.width).toBe(880);
  });

  it("reports capabilities and the disabled reason verbatim", async () => {
    const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
    const locked = selectionFor(element, {
      capabilities: {
        canSelect: true,
        canEditStyles: false,
        canCrop: false,
        canMove: false,
        canResize: false,
        canApplyManualOffset: false,
        canApplyManualSize: false,
        canApplyManualRotation: false,
        reasonIfDisabled: "Element is inside a locked composition",
      },
    });

    const result = await studioInspect(inspectDeps({ getCurrentSelection: () => locked }));

    const ok = expectOk<StudioInspectResult>(result);
    expect(ok.can.editStyles).toBe(false);
    expect(ok.can.move).toBe(false);
    expect(ok.can.reasonIfDisabled).toBe("Element is inside a locked composition");
  });

  it("lists the animations on the current selection", async () => {
    const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");

    const result = await studioInspect(
      inspectDeps({
        getCurrentSelection: () => selectionFor(element),
        getGsapDiagnostics: () => ({
          animations: [animation()],
          multipleTimelines: false,
          unsupportedTimelinePattern: false,
        }),
      }),
    );

    const ok = expectOk<StudioInspectResult>(result);
    expect(ok.animations).toHaveLength(1);
    expect(ok.animations[0]?.animationId).toBe("anim-1");
    expect(ok.animations[0]?.ease).toBe("power2.out");
    expect(ok.animationEditingBlocked).toBeNull();
  });

  it("says WHY animation editing is unavailable, so a write is not attempted", async () => {
    const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
    const base = {
      getCurrentSelection: () => selectionFor(element),
    };

    const multiple = await studioInspect(
      inspectDeps({
        ...base,
        getGsapDiagnostics: () => ({
          animations: [],
          multipleTimelines: true,
          unsupportedTimelinePattern: false,
        }),
      }),
    );
    const unsupported = await studioInspect(
      inspectDeps({
        ...base,
        getGsapDiagnostics: () => ({
          animations: [],
          multipleTimelines: false,
          unsupportedTimelinePattern: true,
        }),
      }),
    );

    expect(expectOk<StudioInspectResult>(multiple).animationEditingBlocked).toMatch(
      /multiple GSAP timelines/,
    );
    expect(expectOk<StudioInspectResult>(unsupported).animationEditingBlocked).toMatch(
      /not editable/,
    );
  });

  it("does not attribute the selection's animations to a different element", async () => {
    // Studio only parses animations for the CURRENT selection. Reporting them
    // against another element would report the wrong element's motion.
    const headline = previewElement('<h1 id="headline">A</h1><p id="body">B</p>', "headline");
    const doc = headline.ownerDocument;

    const result = await studioInspect(
      inspectDeps({
        getPreviewDocument: () => doc,
        getCurrentSelection: () => selectionFor(headline),
        getGsapDiagnostics: () => ({
          animations: [animation()],
          multipleTimelines: false,
          unsupportedTimelinePattern: false,
        }),
      }),
      { handle: "dom:body" },
    );

    const ok = expectOk<StudioInspectResult>(result);
    expect(ok.isCurrentSelection).toBe(false);
    expect(ok.animations).toEqual([]);
    expect(ok.animationEditingBlocked).toMatch(/only readable for the current selection/);
  });

  it("inspects a handle without changing what is selected", async () => {
    const doc = previewDoc('<h1 id="headline">A</h1>');
    const applySelection = vi.fn();

    const result = await studioInspect(
      inspectDeps({ getPreviewDocument: () => doc, applySelection }),
      { handle: "dom:headline" },
    );

    expect(result.ok).toBe(true);
    // Inspecting is a read. It must not steal the human's selection.
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("keeps a resolved source-safe handle instead of weakening it", async () => {
    const doc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"><h1 id="headline">A</h1></main>',
    );
    const handle = "dom:v1:index.html:index.html:headline";

    const ok = expectOk<StudioInspectResult>(
      await studioInspect(inspectDeps({ getPreviewDocument: () => doc }), { handle }),
    );

    expect(ok.handle).toBe(handle);
  });

  it("mints a source-safe handle for the current selection", async () => {
    const element = previewElement('<h1 id="headline">A</h1>', "headline");
    const current = selectionFor(element, { sourceFile: "compositions/hero.html" });

    const ok = expectOk<StudioInspectResult>(
      await studioInspect(
        inspectDeps({
          getCompositionPath: () => "index.html",
          getCurrentSelection: () => current,
        }),
      ),
    );

    expect(ok.handle).toBe("dom:v2:project-a:index.html:compositions%2Fhero.html:headline");
  });

  it("fails rather than returning an empty result when nothing is selected", async () => {
    const result = expectFailure(await studioInspect(inspectDeps()));

    // An empty result would assert "this element has nothing", a different and
    // false claim from "you did not say which element".
    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/nothing is selected/);
    expect(result.hint).toMatch(/studio_select/);
  });

  it("reports an unknown handle distinctly from an unmounted preview", async () => {
    const notMounted = expectFailure(await studioInspect(inspectDeps(), { handle: "dom:x" }));
    expect(notMounted.kind).toBe("blocked");

    const doc = previewDoc('<h1 id="headline">A</h1>');
    const unknown = expectFailure(
      await studioInspect(inspectDeps({ getPreviewDocument: () => doc }), { handle: "dom:x" }),
    );
    expect(unknown.kind).toBe("invalid");
    expect(unknown.reason).not.toBe(notMounted.reason);
  });
});
