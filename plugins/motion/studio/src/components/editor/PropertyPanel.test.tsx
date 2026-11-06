// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropertyPanelProps } from "./propertyPanelHelpers";
import type { TimelineEditCallbacks } from "../../player/components/timelineCallbacks";
import { PropertyPanel } from "./PropertyPanel";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import { usePlayerStore } from "../../player/store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// PropertyPanel calls useStudioShellContext() unconditionally; supply the one
// field it reads (showToast) so the component can mount without the full shell.
vi.mock("../../contexts/StudioContext", async () => {
  const actual = await vi.importActual<typeof import("../../contexts/StudioContext")>(
    "../../contexts/StudioContext",
  );
  return { ...actual, useStudioShellContext: () => ({ showToast: vi.fn() }) };
});

// The panel is imported once: re-importing it per test made the first test pay a cold transform.
const panel = vi.hoisted(() => ({
  flat: false,
  actions: null as null | {
    refreshDomEditSelectionFromPreview: unknown;
    domEditSelectionRef: unknown;
  },
}));
vi.mock("./manualEditingAvailability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./manualEditingAvailability")>()),
  get STUDIO_FLAT_INSPECTOR_ENABLED() {
    return panel.flat;
  },
}));
vi.mock("../../contexts/DomEditContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../contexts/DomEditContext")>();
  return {
    ...actual,
    useDomEditActionsContextOptional: () =>
      panel.actions ?? actual.useDomEditActionsContextOptional(),
  };
});

const initialPlayerState = usePlayerStore.getState();

afterEach(() => {
  document.body.innerHTML = "";
  panel.actions = null;
  usePlayerStore.setState(initialPlayerState, true);
});

function baseElement(): NonNullable<PropertyPanelProps["element"]> {
  return {
    element: document.createElement("div"),
    id: "mono-label",
    selector: ".mono-label",
    label: "Mono Label",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: -24, width: 257, height: 29 },
    textContent: "PACKETS / FRAME",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [
      {
        key: "field-0",
        label: "Text",
        value: "PACKETS / FRAME",
        tagName: "div",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "self",
      },
    ],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

// Bug 1 fixture: no text fields at all, so isTextEditableSelection(element) is
// false — the Text FlatGroup must not render (not even empty/collapsed).
function nonTextElement() {
  return {
    ...baseElement(),
    id: "image-clip",
    selector: "#image-clip",
    label: "Image Clip",
    tagName: "img",
    textContent: "",
    textFields: [],
  };
}

// Bug 2 fixture: 2+ text fields, which routes FlatTextSection to its own
// flat multi-field layer list (FlatTextLayerList + FlatTextFieldEditor) —
// must not double-render the "Text" heading (FlatGroup's own heading; this
// component never renders one of its own).
function multiFieldTextElement(): NonNullable<PropertyPanelProps["element"]> {
  const base = baseElement();
  return {
    ...base,
    textFields: [
      base.textFields[0],
      {
        key: "field-1",
        label: "Text",
        value: "SECOND FIELD",
        tagName: "div",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "self",
      },
    ],
  };
}

// Style-only fixture: no text fields (Text group must not render), but
// canEditStyles stays true (inherited from baseElement()) so the Style group
// is gated in.
function styleOnlyElement() {
  return {
    ...baseElement(),
    id: "stat-card",
    selector: ".stat-card",
    label: "Stat Card",
    textFields: [],
    inlineStyles: { "background-color": "#0D0C09" },
  };
}

// Flex fixture (Plan 3a Task 5): display:flex drives BOTH the legacy
// StyleSections Flex `Section` AND the new flat Layout group's
// LayoutFlexBlock. Used to prove Flex renders exactly once on the flat path.
// styles are read from computedStyles (PropertyPanel line ~113), so set it
// there.
function flexElement() {
  return {
    ...baseElement(),
    id: "flex-row",
    selector: ".flex-row",
    label: "Flex Row",
    textFields: [],
    computedStyles: { display: "flex" },
  };
}

// Motion fixture (Plan 3b Task 4): an authored clip range (data-start present)
// makes resolveEditingSections turn on `sections.timing`, so the Motion group
// renders via its Timing gate even with no GSAP edit handlers wired.
function animatedElement() {
  return {
    ...baseElement(),
    id: "anim-clip",
    selector: ".anim-clip",
    label: "Anim Clip",
    dataAttributes: { start: "0", duration: "4" },
  };
}

// Inferred-timing fixture (whole-plan coherence fix): NO explicit data-start
// or data-duration — sections.timing must turn on via animationCount (fed
// from gsapAnimations.length), not an authored attribute, so both the Motion
// Timing row and the Layout keyframe gutter are forced to infer the range
// from the element's own GSAP tween instead of reading it off an attribute.
function inferredMotionElement() {
  return {
    ...baseElement(),
    id: "inferred-anim",
    selector: "#inferred-anim",
    label: "Inferred Anim",
  };
}

// A single "to" tween running from t=2 to t=5 (position 2, duration 3), with
// keyframes on "x" at 0/50/100% — enough to drive both FlatTimingRow's
// inference and the Layout "x" row's keyframe-seek gutter.
// Six-group fixture (fixed-headers + scrollable-open-section worked example):
// tagName "img" turns on both Media and Grade (resolveEditingSections), on top
// of baseElement()'s text-editable + style-editable + timing-eligible
// (data-start) defaults — yielding all six groups in a known order:
// [text, style, layout, motion, grade, media].
function sixGroupElement() {
  return {
    ...baseElement(),
    id: "six-group",
    selector: "#six-group",
    label: "Six Group",
    tagName: "img",
    dataAttributes: { start: "0", duration: "4" },
  };
}

/** An `<audio>` clip: placed on the timeline, but nothing a tween could move. */
function audioClipElement() {
  const element = document.createElement("audio");
  return {
    ...baseElement(),
    element,
    id: "vo-1",
    selector: "#vo-1",
    label: "Vo 1",
    tagName: "audio",
    textFields: [],
    dataAttributes: { start: "1", duration: "3" },
  };
}

/**
 * A mixer bus: no clip range at all, and no box either.
 *
 * Carries a `data-start` on purpose. A real bus has none — its automation clock
 * is composition time — but the timing gate has to refuse the TAG rather than
 * merely fall out of a missing attribute, or something writing one would put
 * Start/Duration back on a thing that has no range.
 */
function audioBusElement() {
  const element = document.createElement("hf-audio-group");
  return {
    ...baseElement(),
    element,
    id: "voiceover",
    selector: "#voiceover",
    label: "Voiceover",
    tagName: "hf-audio-group",
    textFields: [],
    dataAttributes: { start: "0", duration: "8" },
  };
}

const INFERRED_TIMING_ANIMATION = {
  id: "a1",
  targetSelector: "#inferred-anim",
  method: "to",
  position: 2,
  duration: 3,
  properties: { x: 100 },
  keyframes: {
    format: "percentage",
    keyframes: [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 50, properties: { x: 50 } },
      { percentage: 100, properties: { x: 100 } },
    ],
  },
} as never;

async function renderPanel(
  flatEnabled: boolean,
  elementOverride: NonNullable<PropertyPanelProps["element"]> = baseElement(),
  propsOverride: Partial<PropertyPanelProps> = {},
  options: {
    currentTime?: number;
    selectedElementId?: string;
    timelineEdit?: TimelineEditCallbacks;
    refreshSelection?: (selection: unknown) => void;
    selectionRef?: { current: unknown };
  } = {},
) {
  panel.flat = flatEnabled;
  const { refreshSelection: refresh, selectionRef } = options;
  panel.actions =
    refresh && selectionRef
      ? { refreshDomEditSelectionFromPreview: refresh, domEditSelectionRef: selectionRef }
      : null;
  if (options.currentTime !== undefined) {
    usePlayerStore.getState().setCurrentTime(options.currentTime);
  }
  if (options.selectedElementId)
    usePlayerStore.setState({ selectedElementId: options.selectedElementId });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (element: NonNullable<PropertyPanelProps["element"]>) => {
    // Only the props the render path touches are supplied; the rest are unused at
    // mount (handlers fire on interaction), so cast a minimal object to the full
    // props shape rather than stubbing all ~15 required fields.
    const props = {
      element,
      assets: [],
      onSetStyle: vi.fn(),
      onSetText: vi.fn(),
      onSetAttributeLive: vi.fn(),
      ...propsOverride,
    } as unknown as PropertyPanelProps;
    act(() => {
      root.render(
        <TimelineEditProvider value={options.timelineEdit ?? {}}>
          <PropertyPanel {...props} />
        </TimelineEditProvider>,
      );
    });
  };
  render(elementOverride);
  return { host, root, render };
}

// Find the collapsed accordion row whose title matches and click it open.
function openFlatGroup(host: HTMLElement, title: string) {
  const row = Array.from(host.querySelectorAll('[data-flat-group-collapsed="true"]')).find((el) =>
    el.textContent?.includes(title),
  );
  if (!row) throw new Error(`expected a collapsed ${title} row`);
  act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const openGroupText = (host: HTMLElement) =>
  host.querySelector('[data-flat-group-open="true"]')?.textContent ?? "";

describe("PropertyPanel — STUDIO_FLAT_INSPECTOR_ENABLED off", () => {
  it("renders the legacy header, not the flat header", async () => {
    const { host, root } = await renderPanel(false);
    expect(host.querySelector('[data-flat-header-icon="true"]')).toBeNull();
    expect(host.textContent).toContain("Mono Label");
    act(() => root.unmount());
  });
});

describe("PropertyPanel — STUDIO_FLAT_INSPECTOR_ENABLED on", () => {
  it("renders the flat header, the Text group open by default, and the flat footer", async () => {
    const { host, root } = await renderPanel(true);
    expect(host.querySelector('[data-flat-header-icon="true"]')).not.toBeNull();
    expect(host.querySelector('[data-flat-group-open="true"]')).not.toBeNull();
    expect(host.textContent).toContain("Ask agent about this element");
    act(() => root.unmount());
  });

  it("collapses the Text group on caret click and can reopen it", async () => {
    const { host, root } = await renderPanel(true);
    const collapseButton = host.querySelector<HTMLButtonElement>(
      '[data-flat-group-open="true"] button[title="Collapse"]',
    );
    act(() => collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector('[data-flat-group-open="true"]')).toBeNull();
    const collapsedRow = host.querySelector<HTMLButtonElement>(
      '[data-flat-group-collapsed="true"]',
    );
    expect(collapsedRow).not.toBeNull();
    act(() => collapsedRow?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector('[data-flat-group-open="true"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("renders no Text group at all for a non-text element (bug 1)", async () => {
    // nonTextElement() inherits canEditStyles: true from baseElement(), so
    // the Style group (Task 10) renders and opens by default here — the
    // invariant under test is narrower than "no flat group at all": no
    // group titled "Text" may appear, open or collapsed.
    const { host, root } = await renderPanel(true, nonTextElement());
    const openTitle = host.querySelector(
      '[data-flat-group-open="true"] .text-panel-text-0',
    )?.textContent;
    const collapsedTitles = Array.from(
      host.querySelectorAll('[data-flat-group-collapsed="true"] .text-panel-text-2'),
    ).map((el) => el.textContent);
    expect(openTitle).not.toBe("Text");
    expect(collapsedTitles).not.toContain("Text");
    act(() => root.unmount());
  });

  it("renders exactly one Text heading for a multi-field text element (bug 2)", async () => {
    const { host, root } = await renderPanel(true, multiFieldTextElement());
    // The FlatGroup's own "Text" heading is the only one that should exist —
    // the legacy TextSection's internal Section heading (data-panel-section
    // ="text") must never appear, since the flat multi-field path no longer
    // delegates to that component at all.
    expect(host.querySelector('[data-flat-group-open="true"]')).not.toBeNull();
    expect(host.querySelector('[data-panel-section="text"]')).toBeNull();
    // Content from the flat multi-field layer list must render.
    expect(host.textContent).toContain("Text layers");
    act(() => root.unmount());
  });
});

describe("PropertyPanel — Style group (flag on)", () => {
  it("renders the Style group for a style-editable, non-text element", async () => {
    const { host, root } = await renderPanel(true, styleOnlyElement());
    expect(host.textContent).toContain("Style");
    expect(host.textContent).toContain("Fill");
    act(() => root.unmount());
  });

  it("one-open accordion: opening Style closes Text", async () => {
    // baseElement() is text-editable and has capabilities.canEditStyles:
    // true, so both the Text and Style groups render for it.
    const { host, root } = await renderPanel(true);
    const textGroup = () => host.querySelector('[data-flat-group-open="true"]');
    expect(textGroup()?.textContent).toContain("Text");
    const styleCollapsedRow = Array.from(
      host.querySelectorAll('[data-flat-group-collapsed="true"]'),
    ).find((el) => el.textContent?.includes("Style"));
    if (!styleCollapsedRow) throw new Error("expected a collapsed Style row");
    act(() => styleCollapsedRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(textGroup()?.textContent).not.toContain("Text");
    expect(host.querySelector('[data-flat-group-open="true"]')?.textContent).toContain("Style");
    act(() => root.unmount());
  });
});

describe("PropertyPanel — Layout group (Plan 3a)", () => {
  it("always renders the Layout group, and opening it closes whichever other group was open", async () => {
    const { host, root } = await renderPanel(true);
    // Text group is open by default for the base text-editable fixture.
    expect(host.querySelector('[data-flat-group-open="true"]')?.textContent).toContain("Text");

    const layoutCollapsedRow = Array.from(
      host.querySelectorAll('[data-flat-group-collapsed="true"]'),
    ).find((el) => el.textContent?.includes("Layout"));
    if (!layoutCollapsedRow) throw new Error("expected a collapsed Layout row");
    act(() => layoutCollapsedRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const openGroup = host.querySelector('[data-flat-group-open="true"]');
    expect(openGroup?.textContent).toContain("Layout");
    expect(openGroup?.textContent).toContain("X");
    expect(openGroup?.textContent).not.toContain("Ask agent"); // sanity: not matching the footer
    act(() => root.unmount());
  });

  it("renders Flex exactly once on the flat path (flat Layout only, legacy suppressed)", async () => {
    const { host, root } = await renderPanel(true, flexElement());
    const layoutCollapsedRow = Array.from(
      host.querySelectorAll('[data-flat-group-collapsed="true"]'),
    ).find((el) => el.textContent?.includes("Layout"));
    if (!layoutCollapsedRow) throw new Error("expected a collapsed Layout row");
    act(() => layoutCollapsedRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // The legacy StyleSections Flex `Section` (data-panel-section="flex") must
    // NOT render on the flat path — the only two Flex renderers are the legacy
    // Section and the flat LayoutFlexBlock, so its absence + the flat block's
    // presence proves Flex renders exactly once (not twice, not zero).
    expect(host.querySelector('[data-panel-section="flex"]')).toBeNull();
    const openGroup = host.querySelector('[data-flat-group-open="true"]');
    expect(openGroup?.textContent).toContain("Layout");
    expect(openGroup?.textContent).toContain("Flex");
    act(() => root.unmount());
  });
});

describe("PropertyPanel — Motion group (Plan 3b)", () => {
  it("renders the Motion group with Timing, and opening it closes the previously open group (4-way exclusivity)", async () => {
    const { host, root } = await renderPanel(true, animatedElement());
    // Text is open by default for the text-editable fixture.
    expect(openGroupText(host)).toContain("Text");

    openFlatGroup(host, "Motion");
    const openGroup = openGroupText(host);
    expect(openGroup).toContain("Motion");
    // FlatTimingRow (Start/End/Duration) renders inside the Motion group.
    expect(openGroup).toContain("Start");
    expect(openGroup).toContain("Duration");
    // One-open accordion: opening Motion closed the Text group.
    expect(openGroup).not.toContain("Text");

    // Reverse direction: opening Layout closes Motion.
    openFlatGroup(host, "Layout");
    const openAfter = openGroupText(host);
    expect(openAfter).toContain("Layout");
    expect(openAfter).not.toContain("Motion");
    act(() => root.unmount());
  });

  it("hides the effect list (showEffects off) when the GSAP edit handlers are absent", async () => {
    // None of the five required edit handlers are supplied here, so the
    // effect list stays closed — only the Timing row shows.
    const { host, root } = await renderPanel(true, animatedElement());
    openFlatGroup(host, "Motion");
    const openGroup = openGroupText(host);
    expect(openGroup).toContain("Motion");
    expect(openGroup).toContain("Duration"); // Timing still shows
    expect(openGroup).not.toContain("Add effect"); // effects gated off
    act(() => root.unmount());
  });

  it("shows the effect list (showEffects on) when the flag and all five handlers are present", async () => {
    const { host, root } = await renderPanel(true, animatedElement(), {
      onUpdateGsapProperty: vi.fn(),
      onUpdateGsapMeta: vi.fn(),
      onDeleteGsapAnimation: vi.fn(),
      onAddGsapProperty: vi.fn(),
      onAddGsapAnimation: vi.fn(),
    });
    openFlatGroup(host, "Motion");
    expect(openGroupText(host)).toContain("Add effect");
    act(() => root.unmount());
  });
});

// Whole-plan coherence fix: Layout's keyframe-seek basis and Motion's Timing
// row basis must agree on the same start/duration for an element that has
// animations but no explicit data-duration — before the fix, Layout fell back
// to a naive `duration ?? 1` while Motion correctly inferred the range from
// the tween (position 2, duration 3 -> start 2 / duration 3 / end 5).
describe("PropertyPanel — flat Layout/Motion timing agreement (whole-plan coherence fix)", () => {
  it("Motion's Timing row shows the inferred start/end/duration for an element with animations but no explicit duration", async () => {
    const { host, root } = await renderPanel(true, inferredMotionElement(), {
      gsapAnimations: [INFERRED_TIMING_ANIMATION],
    });
    openFlatGroup(host, "Motion");
    const motionGroup = host.querySelector('[data-flat-group-open="true"]');
    if (!motionGroup) throw new Error("expected the Motion group to be open");
    expect(motionGroup.textContent).toContain("Inferred");
    const inputs = motionGroup.querySelectorAll<HTMLInputElement>("input");
    // FlatTimingRow renders Start, End, Duration in that order.
    expect(inputs[0]?.value).toBe("2.00s");
    expect(inputs[1]?.value).toBe("5.00s");
    expect(inputs[2]?.value).toBe("3.00s");
    act(() => root.unmount());
  });

  it("Layout's X-row keyframe gutter seeks to the SAME absolute time Motion's Timing row shows as the midpoint (50% of an inferred 2s-5s range = 3.5s)", async () => {
    const onSeekToTime = vi.fn();
    // The playhead sits at the clip's start (t=2, the 0% keyframe): the store's t=0 default
    // resolves to -66.7%, outside that keyframe's window.
    const { host, root } = await renderPanel(
      true,
      inferredMotionElement(),
      { gsapAnimations: [INFERRED_TIMING_ANIMATION], onSeekToTime },
      { currentTime: 2 },
    );
    openFlatGroup(host, "Layout");
    const layoutGroup = host.querySelector('[data-flat-group-open="true"]');
    if (!layoutGroup) throw new Error("expected the Layout group to be open");

    const xRow = Array.from(layoutGroup.querySelectorAll<HTMLElement>(".group")).find(
      (el) => el.querySelector("span")?.textContent === "X",
    );
    if (!xRow) throw new Error("expected an X row");
    const gutter = xRow.querySelector('[data-flat-kf-gutter="true"]');
    if (!gutter) throw new Error("expected a keyframe gutter on the X row");
    // At currentPct=0 (playhead on the 0% keyframe) the prev arrow is
    // disabled (no earlier keyframe) and the next arrow seeks to the 50%
    // keyframe — exactly the case the coherence bug affected.
    const nextArrow = Array.from(gutter.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.title === "Next keyframe" && !b.disabled,
    );
    if (!nextArrow) throw new Error("expected an enabled next-keyframe arrow button");
    act(() => nextArrow.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // Same basis as the Timing row: start 2 + 50% * duration 3 = 3.5.
    expect(onSeekToTime).toHaveBeenCalledWith(3.5);
    act(() => root.unmount());
  });
});

// Follow-up fix (review of 684ec4e87): the seek-basis fix above corrected
// WHERE a keyframe click seeks to, but `currentPct` — the value that drives
// KeyframeNavigation's diamond active/inactive state and prev/next arrow
// targeting — still used the OLD naive basis. For an inferred-duration
// element, seeking to a keyframe's actual absolute time no longer lit that
// keyframe's diamond as active. Prove the round-trip here: seek to the exact
// absolute time of the 50% keyframe (2 + 0.5*3 = 3.5) and confirm its diamond
// renders "active" (title="Remove x keyframe"), not "inactive"/"ghost".
describe("PropertyPanel — flat Layout currentPct basis (currentPct follow-up fix)", () => {
  it("lights the X-row keyframe diamond as active when the playhead is seeked to that keyframe's real absolute time (inferred 2s-5s range, 50% keyframe = 3.5s)", async () => {
    const { host, root } = await renderPanel(
      true,
      inferredMotionElement(),
      { gsapAnimations: [INFERRED_TIMING_ANIMATION] },
      { currentTime: 3.5 },
    );
    openFlatGroup(host, "Layout");
    const layoutGroup = host.querySelector('[data-flat-group-open="true"]');
    if (!layoutGroup) throw new Error("expected the Layout group to be open");

    const xRow = Array.from(layoutGroup.querySelectorAll<HTMLElement>(".group")).find(
      (el) => el.querySelector("span")?.textContent === "X",
    );
    if (!xRow) throw new Error("expected an X row");
    const gutter = xRow.querySelector('[data-flat-kf-gutter="true"]');
    if (!gutter) throw new Error("expected a keyframe gutter on the X row");
    // The diamond is the only gutter button that reports a pressed state;
    // the prev/next arrows carry titles too, so `button[title]` is ambiguous.
    const diamond = gutter.querySelector<HTMLButtonElement>("button[aria-pressed]");
    if (!diamond) throw new Error("expected a keyframe diamond button");
    // "Remove" means active: on the naive 0..1 basis t=3.5 read as 350% and the diamond stayed
    // "Add" although the playhead sat on that keyframe.
    expect(diamond.title).toBe("Remove x keyframe");
    act(() => root.unmount());
  });

  it("prev/next arrows re-center on the current keyframe once currentPct agrees with the corrected seek basis", async () => {
    const onSeekToTime = vi.fn();
    const { host, root } = await renderPanel(
      true,
      inferredMotionElement(),
      { gsapAnimations: [INFERRED_TIMING_ANIMATION], onSeekToTime },
      { currentTime: 3.5 },
    );
    openFlatGroup(host, "Layout");
    const layoutGroup = host.querySelector('[data-flat-group-open="true"]');
    if (!layoutGroup) throw new Error("expected the Layout group to be open");

    const xRow = Array.from(layoutGroup.querySelectorAll<HTMLElement>(".group")).find(
      (el) => el.querySelector("span")?.textContent === "X",
    );
    if (!xRow) throw new Error("expected an X row");
    const gutter = xRow.querySelector('[data-flat-kf-gutter="true"]');
    if (!gutter) throw new Error("expected a keyframe gutter on the X row");
    const buttons = Array.from(gutter.querySelectorAll<HTMLButtonElement>("button"));
    const [prevArrow, , nextArrow] = buttons;
    if (!prevArrow || !nextArrow) throw new Error("expected prev/next arrow buttons");
    // At the 50% keyframe (t=3.5), prev should target the 0% keyframe
    // (absolute t=2) and next should target the 100% keyframe (absolute
    // t=5) — both only resolvable once currentPct agrees with elStart=2/
    // elDuration=3, the same basis the seek fix already uses.
    expect(prevArrow.disabled).toBe(false);
    act(() => prevArrow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSeekToTime).toHaveBeenLastCalledWith(2);

    expect(nextArrow.disabled).toBe(false);
    act(() => nextArrow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSeekToTime).toHaveBeenLastCalledWith(5);
    act(() => root.unmount());
  });
});

// Media fixtures (Plan 4 Task 7): the three tag values resolveEditingSections
// turns `media` on for (video/audio/img). Each carries no text fields (so the
// Text group never renders) and sets `element` to a real media node so the
// FlatMediaSection reads a live media element. `as never` casts around the
// element-type mismatch with baseElement()'s HTMLDivElement.
function videoElement() {
  return {
    ...baseElement(),
    id: "s1-bg",
    selector: "#s1-bg",
    label: "S1 Background",
    tagName: "video",
    textFields: [],
    element: document.createElement("video"),
  };
}

function imageElement() {
  return {
    ...baseElement(),
    id: "s1-img",
    selector: "#s1-img",
    label: "S1 Image",
    tagName: "img",
    textFields: [],
    element: document.createElement("img"),
  };
}

function audioElement() {
  return {
    ...baseElement(),
    id: "s1-audio",
    selector: "#s1-audio",
    label: "S1 Audio",
    tagName: "audio",
    textFields: [],
    element: document.createElement("audio"),
  };
}

// All FlatGroup titles currently mounted (open row + every collapsed row).
function flatGroupTitles(host: HTMLElement): string[] {
  const open = Array.from(
    host.querySelectorAll('[data-flat-group-open="true"] .text-panel-text-0'),
  ).map((el) => el.textContent ?? "");
  const collapsed = Array.from(
    host.querySelectorAll('[data-flat-group-collapsed="true"] .text-panel-text-2'),
  ).map((el) => el.textContent ?? "");
  return [...open, ...collapsed];
}

describe("PropertyPanel — Grade group (flag on)", () => {
  it("renders the Grade group with its accessory for a grade-editable (video) element", async () => {
    const { host, root } = await renderPanel(true, {
      ...baseElement(),
      tagName: "video",
      textFields: [],
    });
    const gradeCollapsedOrOpen =
      host.querySelector('[data-flat-group-collapsed="true"]') ||
      host.querySelector('[data-flat-group-open="true"]');
    expect(host.textContent).toContain("Grade");
    expect(gradeCollapsedOrOpen).not.toBeNull();
    act(() => root.unmount());
  });

  it("does not render the legacy Style/Grade Section duplicates for a style-and-grade-editable element", async () => {
    // A <video> with no text fields is both style- and grade-editable: the shape that also
    // mounted the legacy ColorGradingSection and StyleSections below the flat groups.
    const { host, root } = await renderPanel(true, {
      ...baseElement(),
      tagName: "video",
      textFields: [],
    });
    expect(host.textContent).toContain("Style");
    expect(host.textContent).toContain("Grade");
    // Each legacy Section renders `<section data-panel-section="<slug>">`; text alone cannot tell
    // it from a flat row of the same name ("Fill" is both), so match that shape.
    for (const slug of [
      "radius",
      "stroke",
      "effects",
      "clip",
      "transparency",
      "fill",
      "color-grading",
    ]) {
      expect(host.querySelector(`[data-panel-section="${slug}"]`)).toBeNull();
    }
    act(() => root.unmount());
  });
});

describe("PropertyPanel — Media group (Plan 4)", () => {
  it("renders the flat Media group and not the legacy MediaSection, for a video element", async () => {
    const { host, root } = await renderPanel(true, videoElement() as never);
    // A Media FlatGroup exists (open or collapsed).
    expect(flatGroupTitles(host)).toContain("Media");
    // The legacy MediaSection renders its rows inside a `Section` whose
    // data-panel-section slug is the media title ("video"/"image"/"audio").
    // On the flat path it's fully replaced, so none of those may appear.
    expect(host.querySelector('[data-panel-section="video"]')).toBeNull();
    expect(host.querySelector('[data-panel-section="image"]')).toBeNull();
    expect(host.querySelector('[data-panel-section="audio"]')).toBeNull();
    act(() => root.unmount());
  });

  it("one-open accordion: opening Media closes whichever other group was open, and vice versa (5-way exclusivity)", async () => {
    // videoElement() has canEditStyles: true and no text fields, so Style is
    // the default-open group; Layout and Media render collapsed alongside it.
    const { host, root } = await renderPanel(true, videoElement() as never);
    expect(openGroupText(host)).toContain("Style");

    // Opening Media closes Style.
    openFlatGroup(host, "Media");
    const afterMedia = openGroupText(host);
    expect(afterMedia).toContain("Media");
    expect(afterMedia).not.toContain("Style");

    // Reverse direction: opening Layout closes Media — same shared openGroupId.
    openFlatGroup(host, "Layout");
    const afterLayout = openGroupText(host);
    expect(afterLayout).toContain("Layout");
    expect(afterLayout).not.toContain("Media");
    act(() => root.unmount());
  });

  it("gates the Media group exactly like the legacy MediaSection: present for video/img/audio, absent for a plain div/text element", async () => {
    for (const fixture of [videoElement, imageElement, audioElement]) {
      const { host, root } = await renderPanel(true, fixture() as never);
      expect(flatGroupTitles(host)).toContain("Media");
      act(() => root.unmount());
    }

    // baseElement() is a plain <div> with text — sections.media is false, so
    // no Media group (flat or legacy) may render.
    const { host, root } = await renderPanel(true);
    expect(flatGroupTitles(host)).not.toContain("Media");
    expect(host.querySelector('[data-panel-section="video"]')).toBeNull();
    expect(host.querySelector('[data-panel-section="image"]')).toBeNull();
    expect(host.querySelector('[data-panel-section="audio"]')).toBeNull();
    act(() => root.unmount());
  });
});

// design_handoff scrollable-open-section: collapsed headers before/after the
// open group render in normal document flow and never move (no sticky, no
// stacking offsets) — only the open group's own body content scrolls, in a
// dedicated region between the two fixed header stacks. Worked example: 7
// groups [text, style, layout, motion, grade, effects, media], motion open (index 3)
// -> text/style/layout render as fixed collapsed headers before it, motion
// renders as an open header + scrollable body, grade/effects/media render as fixed
// collapsed headers after it — in exactly that DOM order, nothing sticky.
describe("PropertyPanel — fixed headers + scrollable open section (Plan 11)", () => {
  it("renders before-open headers, the open group (header + scrollable body), then after-open headers, in that exact order, with nothing sticky", async () => {
    const { host, root } = await renderPanel(true, sixGroupElement());
    // sixGroupElement() opens Text by default; open Motion (index 3) to
    // match the worked example.
    openFlatGroup(host, "Motion");
    expect(openGroupText(host)).toContain("Motion");

    const body = host.querySelector('[data-flat-panel-body="true"]');
    if (!body) throw new Error("expected the flat panel body container");

    // Titles in DOM order: each child is either a collapsed header button
    // (before/after the open group) or the open-group wrapper div.
    const titles = Array.from(body.children).map((child) => {
      if (child.matches('[data-flat-group-collapsed="true"]')) return child.textContent ?? "";
      if (child.matches('[data-flat-group-open="true"]')) return child.textContent ?? "";
      return null;
    });
    // Filter to just the group entries (drop any non-group nulls).
    const groupTitles = titles.filter((t): t is string => t !== null);
    expect(groupTitles).toHaveLength(7);
    expect(groupTitles[0]).toContain("Text");
    expect(groupTitles[1]).toContain("Style");
    expect(groupTitles[2]).toContain("Layout");
    expect(groupTitles[3]).toContain("Motion");
    expect(groupTitles[4]).toContain("Grade");
    expect(groupTitles[5]).toContain("Effects");
    expect(groupTitles[6]).toContain("Media");

    // The open group (Motion, index 3) is the one wrapped in
    // data-flat-group-open, sitting between the before/after collapsed
    // headers — and it must contain a dedicated scrollable body.
    const openWrapper = host.querySelector('[data-flat-group-open="true"]');
    if (!openWrapper) throw new Error("expected the open-group wrapper");
    expect(openWrapper.textContent).toContain("Motion");
    expect(openWrapper.querySelector(".overflow-y-auto")).not.toBeNull();

    // Nothing anywhere in the panel body carries inline sticky positioning
    // — the entire sticky-stacking mechanism is gone.
    const stickyEls = Array.from(body.querySelectorAll<HTMLElement>("[style]")).filter(
      (el) => el.style.position === "sticky",
    );
    expect(stickyEls).toHaveLength(0);
    act(() => root.unmount());
  });

  it("renders every group as a plain collapsed header with no scrollable middle region when nothing is open", async () => {
    const { host, root } = await renderPanel(true, sixGroupElement());
    // Collapse the default-open Text group so openGroupId becomes "".
    const collapseButton = host.querySelector<HTMLButtonElement>(
      '[data-flat-group-open="true"] button[title="Collapse"]',
    );
    act(() => collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector('[data-flat-group-open="true"]')).toBeNull();

    const collapsedRows = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-flat-group-collapsed="true"]'),
    );
    expect(collapsedRows).toHaveLength(7);
    const titlesInOrder = collapsedRows.map((el) => el.textContent ?? "");
    expect(titlesInOrder[0]).toContain("Text");
    expect(titlesInOrder[1]).toContain("Style");
    expect(titlesInOrder[2]).toContain("Layout");
    expect(titlesInOrder[3]).toContain("Motion");
    expect(titlesInOrder[4]).toContain("Grade");
    expect(titlesInOrder[5]).toContain("Effects");
    expect(titlesInOrder[6]).toContain("Media");

    const body = host.querySelector('[data-flat-panel-body="true"]');
    expect(body?.querySelector(".overflow-y-auto")).toBeNull();
    for (const row of collapsedRows) {
      expect(row.style.position).toBe("");
    }
    act(() => root.unmount());
  });
});

describe("PropertyPanel — flat group entrance animation scoping (fix round)", () => {
  it("animates only the opening group and the implicitly-closed group on a non-adjacent toggle, never untouched siblings", async () => {
    const { host, root } = await renderPanel(true, sixGroupElement());
    // Text opens by default; jumping to Motion and back skips Style and Layout both ways, so they
    // shift position in the open slices without being toggled: what justToggledIds guards.
    openFlatGroup(host, "Motion");
    expect(openGroupText(host)).toContain("Motion");
    openFlatGroup(host, "Text");
    expect(openGroupText(host)).toContain("Text");

    const collapsedRowByTitle = (title: string) => {
      const row = Array.from(host.querySelectorAll('[data-flat-group-collapsed="true"]')).find(
        (el) => el.textContent?.includes(title),
      );
      if (!row) throw new Error(`expected a collapsed ${title} row`);
      return row;
    };

    // Untouched, non-adjacent siblings must NOT receive the entrance class,
    // even though they shifted position in the collapsed-header list.
    expect(collapsedRowByTitle("Style").classList.contains("hf-flat-group-enter")).toBe(false);
    expect(collapsedRowByTitle("Layout").classList.contains("hf-flat-group-enter")).toBe(false);
    expect(collapsedRowByTitle("Grade").classList.contains("hf-flat-group-enter")).toBe(false);
    expect(collapsedRowByTitle("Media").classList.contains("hf-flat-group-enter")).toBe(false);

    // Motion — open a moment ago, just implicitly closed by the click on
    // Text — must still play its own collapse-entrance animation (Finding 1).
    expect(collapsedRowByTitle("Motion").classList.contains("hf-flat-group-enter")).toBe(true);

    // Text — the group actually clicked open — must animate too.
    const openWrapper = host.querySelector('[data-flat-group-open="true"]');
    if (!openWrapper) throw new Error("expected the open-group wrapper");
    expect(openWrapper.querySelector(".hf-flat-group-enter")).not.toBeNull();

    act(() => root.unmount());
  });
});

describe("PropertyPanel — Motion is for things that move", () => {
  it.each([
    ["a custom music tag", () => document.createElement("music")],
    [
      "an element with an audio source",
      () => {
        const element = document.createElement("div");
        element.setAttribute("src", "voiceover.mp3");
        return element;
      },
    ],
  ])("recognizes %s through the shared audio predicate", async (_label, makeElement) => {
    const fixture = {
      ...audioClipElement(),
      element: makeElement(),
      tagName: "div",
    };
    const { host, root } = await renderPanel(true, fixture);
    const titles = Array.from(
      host.querySelectorAll<HTMLElement>("[data-flat-group-collapsed], [data-flat-group-open]"),
    ).map((node) => node.textContent ?? "");
    expect(titles.some((title) => title.includes("Motion"))).toBe(false);
    expect(titles.some((title) => title.includes("Timing"))).toBe(true);
    act(() => root.unmount());
  });

  it("calls the section Timing on an audio clip, and offers no tween editor", async () => {
    const { host, root } = await renderPanel(true, audioClipElement());
    const titles = Array.from(
      host.querySelectorAll<HTMLElement>("[data-flat-group-collapsed], [data-flat-group-open]"),
    ).map((el) => el.textContent ?? "");
    // The clip's placement survives — it is still a clip on a track.
    expect(titles.some((t) => t.includes("Timing"))).toBe(true);
    // "Motion" named the tween editor, which an <audio> element has no
    // transform, opacity or box for. Showing it was the panel gating on
    // handler presence rather than on the element.
    expect(titles.some((t) => t.includes("Motion"))).toBe(false);
    act(() => root.unmount());
  });

  it("offers a mute on an audible audio clip and toggles it through the timeline", async () => {
    const onToggleElementHidden = vi.fn();
    const { host, root } = await renderPanel(
      true,
      audioClipElement(),
      { onToggleElementHidden },
      { selectedElementId: "vo-1" },
    );
    act(() => host.querySelector<HTMLElement>('button[aria-label="Mute element"]')!.click());
    expect(onToggleElementHidden).toHaveBeenCalledWith("vo-1", true);
    act(() => root.unmount());
  });

  // A bus has no timeline row, so the panel is its only mute; it must go both ways.
  it("mutes, unmutes and mutes an audio group from the panel header", async () => {
    const bus = (hidden: boolean) => {
      const element = audioBusElement();
      return {
        ...element,
        dataAttributes: { ...element.dataAttributes, ...(hidden ? { hidden: "" } : {}) },
      };
    };
    let hidden = true;
    const onSetAudioGroupAttributeQuiet = vi.fn(
      async (_id: string, _attr: string, value: string | null, _label: string) => {
        hidden = value !== null;
      },
    );
    // The panel re-reads its selection after the write; nothing else re-renders it here.
    const { host, root, render } = await renderPanel(
      true,
      bus(true),
      {},
      {
        timelineEdit: { onSetAudioGroupAttributeQuiet },
        selectionRef: { current: bus(true) },
        refreshSelection: () => render(bus(hidden)),
      },
    );
    const press = async (label: string) => {
      const button = host.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
      if (!button) throw new Error(`Expected a "${label}" button`);
      await act(async () => button.click());
    };
    await press("Unmute element");
    await press("Mute element");
    await press("Unmute element");
    expect(onSetAudioGroupAttributeQuiet.mock.calls).toEqual([
      ["voiceover", "data-hidden", null, "Unmute element"],
      ["voiceover", "data-hidden", "", "Mute element"],
      ["voiceover", "data-hidden", null, "Unmute element"],
    ]);
    act(() => root.unmount());
  });

  it("re-reads the current selection, not the muted bus, once the write lands", async () => {
    let land = () => {};
    const onSetAudioGroupAttributeQuiet = vi.fn(
      () => new Promise<void>((resolve) => (land = resolve)),
    );
    const selectionRef: { current: unknown } = { current: audioBusElement() };
    const refreshSelection = vi.fn();
    const { host, root } = await renderPanel(
      true,
      audioBusElement(),
      {},
      {
        timelineEdit: { onSetAudioGroupAttributeQuiet },
        selectionRef,
        refreshSelection,
      },
    );
    act(() => host.querySelector<HTMLElement>('button[aria-label="Mute element"]')!.click());
    const next = audioClipElement();
    selectionRef.current = next;
    await act(async () => land());
    expect(refreshSelection.mock.calls).toEqual([[next]]);
    act(() => root.unmount());
  });

  it("offers a bus neither — it has no clip range to edit", async () => {
    const { host, root } = await renderPanel(true, audioBusElement());
    const titles = Array.from(
      host.querySelectorAll<HTMLElement>("[data-flat-group-collapsed], [data-flat-group-open]"),
    ).map((el) => el.textContent ?? "");
    expect(titles.some((t) => t.includes("Motion"))).toBe(false);
    expect(titles.some((t) => t.includes("Timing"))).toBe(false);
    // It is still a mixer bus: the reason to select one at all.
    expect(titles.some((t) => t.includes("Audio FX"))).toBe(true);
    act(() => root.unmount());
  });
});
