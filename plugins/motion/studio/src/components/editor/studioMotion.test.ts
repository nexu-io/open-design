import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import type { DomEditSelection } from "./domEditing";
import {
  STUDIO_MOTION_TIMELINE_ID,
  applyStudioMotionManifest,
  buildStudioGsapPresetMotion,
  clampStudioCustomEasePoints,
  controlPointsForGsapEase,
  emptyStudioMotionManifest,
  getStudioMotionForSelection,
  isStudioMotionManifestPath,
  parseStudioCustomEaseData,
  parseStudioMotionManifest,
  removeStudioMotionForSelection,
  serializeStudioCustomEaseData,
  serializeStudioMotionManifest,
  upsertStudioGsapMotion,
} from "./studioMotion";

function createSelection(): DomEditSelection {
  return {
    element: {} as HTMLElement,
    id: "card",
    selector: "#card",
    selectorIndex: undefined,
    sourceFile: "index.html",
    compositionPath: "index.html",
    compositionSrc: undefined,
    isCompositionHost: false,
    label: "Card",
    tagName: "div",
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: null,
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canMove: false,
      canResize: false,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

function createDocument(markup: string): Document {
  const window = new Window();
  window.document.body.innerHTML = markup;
  return window.document;
}

function installFakeGsap(window: Window): {
  fromToCalls: Array<{
    target: HTMLElement;
    from: Record<string, unknown>;
    to: Record<string, unknown>;
    at: number;
  }>;
  timeCalls: number[];
  customEaseCalls: Array<{ id: string; data: string }>;
  killCalls: number;
} {
  const state = {
    fromToCalls: [] as Array<{
      target: HTMLElement;
      from: Record<string, unknown>;
      to: Record<string, unknown>;
      at: number;
    }>,
    timeCalls: [] as number[],
    customEaseCalls: [] as Array<{ id: string; data: string }>,
    killCalls: 0,
  };
  const timeline = {
    fromTo(
      target: HTMLElement,
      from: Record<string, unknown>,
      to: Record<string, unknown>,
      at: number,
    ) {
      state.fromToCalls.push({ target, from, to, at });
      return timeline;
    },
    time(value: number) {
      state.timeCalls.push(value);
      return timeline;
    },
    pause() {
      return timeline;
    },
    kill() {
      state.killCalls += 1;
    },
    duration() {
      return 3;
    },
  };
  (
    window as unknown as {
      gsap: {
        timeline: () => typeof timeline;
        set: (target: HTMLElement, vars: Record<string, unknown>) => void;
      };
      CustomEase: { create: (id: string, data: string) => void };
      __timelines?: Record<string, unknown>;
    }
  ).gsap = {
    timeline: () => timeline,
    set(target, vars) {
      if (vars.clearProps === "transform,opacity,visibility") {
        target.style.removeProperty("transform");
        target.style.removeProperty("opacity");
        target.style.removeProperty("visibility");
      }
    },
  };
  (
    window as unknown as {
      CustomEase: { create: (id: string, data: string) => void };
    }
  ).CustomEase = {
    create(id, data) {
      state.customEaseCalls.push({ id, data });
    },
  };
  return state;
}

describe("studio motion manifest", () => {
  it("round-trips draggable GSAP CustomEase control points", () => {
    const points = parseStudioCustomEaseData("M0,0 C0.18,0.9 0.32,1.2 1,1");

    expect(points).toEqual({ x1: 0.18, y1: 0.9, x2: 0.32, y2: 1.2 });
    expect(serializeStudioCustomEaseData(points!)).toBe("M0,0 C0.18,0.9 0.32,1.2 1,1");
    expect(parseStudioCustomEaseData("cubic-bezier(0.1, 0.2, 0.3, 1)")).toBeNull();
  });

  it("clamps custom ease handles to a safe GSAP range and exposes preset previews", () => {
    expect(
      clampStudioCustomEasePoints({
        x1: -2,
        y1: -2,
        x2: 2,
        y2: 3,
      }),
    ).toEqual({ x1: 0, y1: -0.6, x2: 1, y2: 1.6 });
    expect(controlPointsForGsapEase("power3.out")).toEqual({
      x1: 0.165,
      y1: 0.84,
      x2: 0.44,
      y2: 1,
    });
  });

  it("creates preset GSAP motions with deterministic from/to lanes", () => {
    expect(
      buildStudioGsapPresetMotion("fade-up", {
        start: 0.2,
        duration: 0.9,
        distance: 44,
        ease: "power3.out",
      }),
    ).toMatchObject({
      start: 0.2,
      duration: 0.9,
      ease: "power3.out",
      from: { y: 44, autoAlpha: 0 },
      to: { y: 0, autoAlpha: 1 },
    });
    expect(
      buildStudioGsapPresetMotion("slide", {
        start: 0,
        duration: 0.7,
        distance: 60,
        direction: "right",
        ease: "back.out(1.4)",
      }),
    ).toMatchObject({
      from: { x: -60, autoAlpha: 0 },
      to: { x: 0, autoAlpha: 1 },
    });
    expect(
      buildStudioGsapPresetMotion("pop", {
        start: 0,
        duration: 0.5,
        distance: 30,
        ease: "elastic.out(1, 0.45)",
      }),
    ).toMatchObject({
      from: { scale: 0.88, autoAlpha: 0 },
      to: { scale: 1, autoAlpha: 1 },
    });
  });

  it("upserts and serializes GSAP motion by stable target", () => {
    const selection = createSelection();
    const manifest = upsertStudioGsapMotion(emptyStudioMotionManifest(), selection, {
      start: 0.25,
      duration: 0.8,
      ease: "power3.out",
      from: { x: 0, y: 44, scale: 1, autoAlpha: 0 },
      to: { x: 0, y: 0, scale: 1, autoAlpha: 1 },
    });
    const updated = upsertStudioGsapMotion(manifest, selection, {
      start: 0.5,
      duration: 1.2,
      ease: "back.out(1.7)",
      from: { x: -20, y: 0, scale: 0.92, autoAlpha: 0 },
      to: { x: 0, y: 0, scale: 1, autoAlpha: 1 },
    });

    expect(updated.motions).toHaveLength(1);
    expect(updated.motions[0]).toMatchObject({
      kind: "gsap-motion",
      target: { sourceFile: "index.html", selector: "#card", id: "card" },
      start: 0.5,
      duration: 1.2,
      ease: "back.out(1.7)",
      from: { x: -20, y: 0, scale: 0.92, autoAlpha: 0 },
      to: { x: 0, y: 0, scale: 1, autoAlpha: 1 },
    });
    expect(parseStudioMotionManifest(serializeStudioMotionManifest(updated))).toEqual(updated);
    expect(getStudioMotionForSelection(updated, selection)?.duration).toBe(1.2);
  });

  it("rejects malformed motions without throwing and removes selected motion", () => {
    const parsed = parseStudioMotionManifest(`{
      "motions": [
        { "kind": "gsap-motion", "target": { "sourceFile": "index.html", "id": "card" }, "start": 0, "duration": 0 },
        { "kind": "gsap-motion", "target": { "sourceFile": "index.html", "id": "card" }, "start": 0, "duration": 1, "ease": "power2.out", "from": { "x": 0 }, "to": { "x": 20 } }
      ]
    }`);

    expect(parsed.motions).toHaveLength(1);
    expect(removeStudioMotionForSelection(parsed, createSelection()).motions).toEqual([]);
    expect(isStudioMotionManifestPath(".hyperframes/studio-motion.json")).toBe(true);
    expect(isStudioMotionManifestPath("index.html")).toBe(false);
  });

  it("builds a paused GSAP timeline, registers it, and restores Studio-owned props on rebuild", () => {
    const document = createDocument(
      '<div id="card" style="transform: rotate(5deg); opacity: 0.8"></div>',
    );
    const win = document.defaultView;
    if (!win) throw new Error("window fixture missing");
    const gsapState = installFakeGsap(win as Window);
    const card = document.getElementById("card");
    if (!(card instanceof win.HTMLElement)) throw new Error("card fixture missing");
    const manifest = upsertStudioGsapMotion(emptyStudioMotionManifest(), createSelection(), {
      start: 0.25,
      duration: 0.8,
      ease: "power3.out",
      from: { x: 0, y: 44, scale: 1, autoAlpha: 0 },
      to: { x: 0, y: 0, scale: 1, autoAlpha: 1 },
    });

    expect(applyStudioMotionManifest(document, manifest, "index.html", 0.4)).toBe(1);
    expect(gsapState.fromToCalls[0]).toMatchObject({
      target: card,
      from: { x: 0, y: 44, scale: 1, autoAlpha: 0 },
      to: { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.8, ease: "power3.out" },
      at: 0.25,
    });
    expect(gsapState.timeCalls).toContain(0.4);
    expect(
      (win as unknown as { __timelines?: Record<string, unknown> }).__timelines?.[
        STUDIO_MOTION_TIMELINE_ID
      ],
    ).toBeTruthy();

    card.style.setProperty("transform", "matrix(1, 0, 0, 1, 10, 20)");
    card.style.setProperty("opacity", "0.1");
    expect(applyStudioMotionManifest(document, emptyStudioMotionManifest(), "index.html", 0)).toBe(
      0,
    );
    expect(gsapState.killCalls).toBe(1);
    expect(card.style.getPropertyValue("transform")).toBe("rotate(5deg)");
    expect(card.style.getPropertyValue("opacity")).toBe("0.8");
    expect(
      (win as unknown as { __timelines?: Record<string, unknown> }).__timelines?.[
        STUDIO_MOTION_TIMELINE_ID
      ],
    ).toBeUndefined();
  });

  it("rebuilds from the latest in-memory manifest when a second layer is added", () => {
    const document = createDocument('<div id="card"></div><div id="badge"></div>');
    const win = document.defaultView;
    if (!win) throw new Error("window fixture missing");
    const gsapState = installFakeGsap(win as Window);
    const badgeSelection = {
      ...createSelection(),
      id: "badge",
      selector: "#badge",
      label: "Badge",
    };
    const firstManifest = upsertStudioGsapMotion(emptyStudioMotionManifest(), createSelection(), {
      start: 0,
      duration: 0.6,
      ease: "power3.out",
      from: { y: 32, autoAlpha: 0 },
      to: { y: 0, autoAlpha: 1 },
    });
    const nextManifest = upsertStudioGsapMotion(firstManifest, badgeSelection, {
      start: 0,
      duration: 0.6,
      ease: "power3.out",
      customEase: {
        id: "studio-badge-ease",
        data: "M0,0 C0.2,0.9 0.28,1 1,1",
      },
      from: { x: -32, autoAlpha: 0 },
      to: { x: 0, autoAlpha: 1 },
    });

    expect(applyStudioMotionManifest(document, firstManifest, "index.html", 0.3)).toBe(1);
    expect(applyStudioMotionManifest(document, nextManifest, "index.html", 0.3)).toBe(2);
    expect(gsapState.fromToCalls.at(-2)?.target.id).toBe("card");
    expect(gsapState.fromToCalls.at(-1)).toMatchObject({
      target: document.getElementById("badge"),
      from: { x: -32, autoAlpha: 0 },
      to: { x: 0, autoAlpha: 1, duration: 0.6, ease: "studio-badge-ease" },
      at: 0,
    });
  });

  it("registers CustomEase data when the selected GSAP plugin is available", () => {
    const document = createDocument('<div id="card"></div>');
    const win = document.defaultView;
    if (!win) throw new Error("window fixture missing");
    const gsapState = installFakeGsap(win as Window);
    const manifest = upsertStudioGsapMotion(emptyStudioMotionManifest(), createSelection(), {
      start: 0,
      duration: 1,
      ease: "studio-card-bounce",
      customEase: {
        id: "studio-card-bounce",
        data: "M0,0 C0.18,0.9 0.32,1 1,1",
      },
      from: { y: 44 },
      to: { y: 0 },
    });

    expect(applyStudioMotionManifest(document, manifest, "index.html", 0)).toBe(1);
    expect(gsapState.customEaseCalls).toEqual([
      { id: "studio-card-bounce", data: "M0,0 C0.18,0.9 0.32,1 1,1" },
    ]);
    expect(gsapState.fromToCalls[0]?.to.ease).toBe("studio-card-bounce");
  });
});
