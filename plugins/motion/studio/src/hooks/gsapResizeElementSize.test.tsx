// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { applyStudioBoxSizeDraft } from "../components/editor/manualEdits";
import {
  beginStudioPendingEdit,
  paintBackNewestStudioPendingEdit,
} from "../utils/studioPendingEdits";
import { mountReactHarness } from "./domSelectionTestHarness";
import { useDomGeometryCommits } from "./useDomGeometryCommits";
import { useGsapAwareEditing } from "./useGsapAwareEditing";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

// The bench's hold fixture: an off-timeline `gsap.set` positions #target; its size is stylesheet CSS.
const positionHold = {
  id: "#target-set-0-position",
  targetSelector: "#target",
  propertyGroup: "position",
  method: "set",
  properties: { x: 40, y: 20 },
  position: 0,
  resolvedStart: 0,
  duration: 0,
  global: true,
} as unknown as GsapAnimation;

const widthTween = {
  id: "#target-to-0-size",
  targetSelector: "#target",
  propertyGroup: "size",
  method: "to",
  properties: { width: 400, height: 300 },
  position: 0,
  resolvedStart: 0,
  duration: 4,
  ease: "none",
} as unknown as GsapAnimation;

function mount(animations: GsapAnimation[]) {
  const element = Object.assign(document.createElement("div"), {
    id: "target",
    _gsap: { renderTransform: () => {} },
  });
  // GSAP's own inline mask on an element whose transform it renders.
  element.style.setProperty("scale", "none");
  document.body.append(element);
  const gsap = { getProperty: () => 0, set: vi.fn() };
  const iframe = {
    contentWindow: { gsap, __timelines: {} },
    contentDocument: document,
  } as unknown as HTMLIFrameElement;
  const selection = { element, id: "target", selector: "#target" } as unknown as DomEditSelection;
  const commitMutation = vi.fn().mockResolvedValue(undefined);
  const commitPatch = vi.fn().mockResolvedValue(undefined);
  let resize!: ReturnType<typeof useGsapAwareEditing>["handleGsapAwareBoxSizeCommit"];
  function Harness() {
    const { stageElementPositionOffset, handleDomBoxSizeCommit } = useDomGeometryCommits({
      showToast: vi.fn(),
      commitPositionPatchToHtml: commitPatch,
      readOnlyPreview: false,
    });
    resize = useGsapAwareEditing({
      domEditSelection: selection,
      selectedGsapAnimations: animations,
      gsapCommitMutation: commitMutation,
      previewIframeRef: { current: iframe },
      showToast: vi.fn(),
      bumpGsapCache: vi.fn(),
      makeFetchFallback: () => async () => animations,
      trackGsapInteractionFailure: vi.fn(),
      stageElementPositionOffset,
      handleDomBoxSizeCommit,
      handleDomRotationCommit: vi.fn(),
      commitPositionPatchToHtml: commitPatch,
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
    }).handleGsapAwareBoxSizeCommit;
    return null;
  }
  const root = mountReactHarness(<Harness />);
  const size = { width: 340, height: 227 };
  applyStudioBoxSizeDraft(element, size);
  return { selection, size, commitMutation, commitPatch, resize, root };
}

const writesSize = (mutation: { properties?: object; keyframes?: Array<{ properties: object }> }) =>
  [mutation.properties, ...(mutation.keyframes ?? []).map((k) => k.properties)].some(
    (props) => !!props && ("width" in props || "height" in props),
  );

describe("resizing an element GSAP positions", () => {
  it("saves a size the script never writes as the element's CSS width/height, not a tl.set", async () => {
    const h = mount([positionHold]);

    await act(() => h.resize(h.selection, h.size, { x: -50, y: -33.5 }));

    const mutations = h.commitMutation.mock.calls.map((call) => call[1]);
    expect(mutations.filter(writesSize)).toEqual([]);
    // The anchor still moves the GSAP hold, in the same undo step as the CSS size.
    expect(mutations.some((m) => m.animationId === positionHold.id)).toBe(true);
    const [, patches, options] = h.commitPatch.mock.calls.at(-1)!;
    expect(patches).toEqual(
      expect.arrayContaining([
        { type: "inline-style", property: "width", value: "340px" },
        { type: "inline-style", property: "height", value: "227px" },
      ]),
    );
    expect(patches.filter((p: { property: string }) => p.property === "scale")).toEqual([]);
    expect(options.coalesceKey).toBe(h.commitMutation.mock.calls[0]![2].coalesceKey);
    // Saved before the GSAP write and without its own render, so the GSAP reload renders last.
    expect(options.deferRender).toBe(true);
    expect(h.commitPatch.mock.invocationCallOrder.at(-1)).toBeLessThan(
      h.commitMutation.mock.invocationCallOrder[0]!,
    );
    act(() => h.root.unmount());
  });

  it("still saves the size through GSAP when a tween animates it", async () => {
    const h = mount([positionHold, widthTween]);

    await act(() => h.resize(h.selection, h.size, { x: -50, y: -33.5 }));

    const mutations = h.commitMutation.mock.calls.map((call) => call[1]);
    expect(mutations.filter(writesSize).length).toBeGreaterThan(0);
    const cssSize = h.commitPatch.mock.calls
      .flatMap((call) => call[1])
      .filter((p: { property: string }) => p.property === "width" || p.property === "height");
    expect(cssSize).toEqual([]);
    act(() => h.root.unmount());
  });

  it("keeps a resize undo painted back drawn undone while its save lands, and draws it again on show again", async () => {
    const h = mount([positionHold]);
    const element = h.selection.element;
    const edit = beginStudioPendingEdit(() => {
      const shown = element.getAttribute("style");
      element.setAttribute("style", "scale: none");
      return () => element.setAttribute("style", shown ?? "");
    });
    const saved = edit.adopt(() => h.resize(h.selection, h.size, { x: -50, y: -33.5 }));
    edit.settle(saved);
    const shown = paintBackNewestStudioPendingEdit();

    await act(() => saved);
    expect(h.commitPatch.mock.calls.at(-1)![1]).toEqual(
      expect.arrayContaining([{ type: "inline-style", property: "width", value: "340px" }]),
    );
    expect(element.getAttribute("style")).toBe("scale: none");

    shown!.showAgain();
    expect(element.getAttribute("style")).toContain("--hf-studio-width: 340px");
    act(() => h.root.unmount());
  });
});
