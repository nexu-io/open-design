// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import type { TimelineElement } from "../../player/store/timelineElement";
import {
  buildStudioLook,
  collectStudioLookScene,
  STUDIO_LOOK_INPUT_SCHEMA,
  type StudioLookSnapshot,
} from "./lookTools";

function element(overrides: Partial<TimelineElement>): TimelineElement {
  return { id: "synthetic", tag: "div", start: 0, duration: 1, track: 0, ...overrides };
}

function snapshot(overrides: Partial<StudioLookSnapshot> = {}): StudioLookSnapshot {
  return {
    projectId: "demo",
    compositionPath: "index.html",
    currentTime: 1.5,
    duration: 10,
    isPlaying: false,
    elements: [],
    scene: { status: "ready", items: [], drillInItem: null },
    selection: null,
    selectionAnimationCount: 0,
    history: { canUndo: true, canRedo: false, undoLabel: "Move layer", redoLabel: null },
    ...overrides,
  };
}

function selection(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    id: "headline",
    hfId: "abc123",
    element: document.createElement("div"),
    label: "Headline",
    tagName: "h1",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 40, y: 12, width: 880, height: 96 },
    textContent: "Ship it",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
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
    ...overrides,
  };
}

function expectOk<T>(result: { ok: boolean } & Record<string, unknown>): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result as unknown as T;
}

describe("buildStudioLook", () => {
  it("reports the playhead, duration and undo label an agent needs to checkpoint", () => {
    const look = expectOk<{
      playhead: number;
      duration: number;
      history: { undoLabel: string | null };
    }>(
      buildStudioLook(
        snapshot({
          currentTime: 2.4,
          duration: 30,
          history: { canUndo: true, canRedo: false, undoLabel: "Edit text", redoLabel: null },
        }),
      ),
    );

    expect(look.playhead).toBe(2.4);
    expect(look.duration).toBe(30);
    expect(look.history.undoLabel).toBe("Edit text");
  });

  it("gives every addressable element a handle a write tool can consume", () => {
    const look = expectOk<{ elements: { handle: string | null; label: string | null }[] }>(
      buildStudioLook(
        snapshot({
          scene: {
            status: "ready",
            items: [
              layer("Headline", { hfId: "abc" }),
              layer("Button", { id: "cta" }),
              layer("Card", { selector: ".card", selectorIndex: 2 }),
            ],
            drillInItem: null,
          },
        }),
      ),
    );

    expect(look.elements.map((e) => e.handle)).toEqual([
      "hf:v2:demo:index.html:index.html:abc",
      "dom:v2:demo:index.html:index.html:cta",
      "sel:v2:demo:index.html:index.html:.card#2",
    ]);
  });

  it("distinguishes an empty ready scene from a preview that is still loading", () => {
    const ready = expectOk<{ sceneStatus: string; elements: unknown[]; elementCount: number }>(
      buildStudioLook(snapshot()),
    );
    const loading = expectOk<{ sceneStatus: string; elements: unknown[]; elementCount: number }>(
      buildStudioLook(snapshot({ scene: { status: "loading" } })),
    );

    expect(ready).toMatchObject({ sceneStatus: "ready", elements: [], elementCount: 0 });
    expect(loading).toMatchObject({ sceneStatus: "loading", elements: [], elementCount: 0 });
  });

  it("treats an about-blank iframe as loading and a mounted empty composition as ready", () => {
    const blank = document.implementation.createHTMLDocument();
    const mounted = document.implementation.createHTMLDocument();
    mounted.body.innerHTML =
      '<main data-composition-id="root" data-composition-file="index.html"></main>';

    expect(collectStudioLookScene(blank, "index.html", null)).toEqual({ status: "loading" });
    expect(collectStudioLookScene(mounted, "index.html", null)).toEqual({
      status: "ready",
      items: [],
      drillInItem: null,
    });
  });

  it("filters on label, tag and handle, case-insensitively", () => {
    const items = [
      layer("Headline", { hfId: "abc", tagName: "h1" }),
      layer("Button", { id: "cta", tagName: "button" }),
    ];

    const byLabel = expectOk<{ elements: { handle: string | null }[] }>(
      buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } }), {
        filter: "HEADLINE",
      }),
    );
    const byTag = expectOk<{ elements: { handle: string | null }[] }>(
      buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } }), {
        filter: "button",
      }),
    );
    const byHandle = expectOk<{ elements: { handle: string | null }[] }>(
      buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } }), {
        filter: "hf:v2:demo:index.html:index.html:abc",
      }),
    );

    expect(byLabel.elements.map((e) => e.handle)).toEqual(["hf:v2:demo:index.html:index.html:abc"]);
    expect(byTag.elements.map((e) => e.handle)).toEqual(["dom:v2:demo:index.html:index.html:cta"]);
    expect(byHandle.elements.map((e) => e.handle)).toEqual([
      "hf:v2:demo:index.html:index.html:abc",
    ]);
  });

  it("bounds a filter before normalizing it", () => {
    const boundedFilter = "x".repeat(128);
    const look = expectOk<{ elements: { handle: string | null }[] }>(
      buildStudioLook(
        snapshot({
          scene: {
            status: "ready",
            items: [layer(boundedFilter, { id: "bounded" })],
            drillInItem: null,
          },
        }),
        { filter: `${boundedFilter}${"y".repeat(10_000)}` },
      ),
    );

    expect(look.elements.map((entry) => entry.handle)).toEqual([
      "dom:v2:demo:index.html:index.html:bounded",
    ]);
    expect(STUDIO_LOOK_INPUT_SCHEMA.properties.filter.maxLength).toBe(128);
  });

  it("keeps the true match count when the list is truncated", () => {
    const items = Array.from({ length: 5 }, (_, index) => layer("Card", { id: `el-${index}` }));

    const look = expectOk<{ elements: unknown[]; elementCount: number; truncated: boolean }>(
      buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } }), {
        filter: "card",
        limit: 2,
      }),
    );

    // A truncated list must not read as "that is all there is".
    expect(look.elements).toHaveLength(2);
    expect(look.elementCount).toBe(5);
    expect(look.truncated).toBe(true);
  });

  it("preserves the 200-item default and maximum response bound", () => {
    const items = Array.from({ length: 205 }, (_, index) =>
      layer(`Layer ${index}`, { id: `el-${index}` }),
    );

    const look = expectOk<{ elements: unknown[]; elementCount: number; truncated: boolean }>(
      buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } })),
    );

    expect(look.elements).toHaveLength(200);
    expect(look.elementCount).toBe(205);
    expect(look.truncated).toBe(true);
  });

  it("clamps a nonsense limit instead of failing the call", () => {
    const items = [layer("A", { id: "a" }), layer("B", { id: "b" })];

    for (const limit of [0, -3, 1.5, Number.NaN]) {
      const look = expectOk<{ elements: unknown[] }>(
        buildStudioLook(snapshot({ scene: { status: "ready", items, drillInItem: null } }), {
          limit,
        }),
      );
      expect(look.elements).toHaveLength(2);
    }
  });

  it("surfaces the selection with its capabilities and a usable handle", () => {
    const look = expectOk<{
      selection: { handle: string | null; box: { width: number }; can: { editStyles: boolean } };
    }>(buildStudioLook(snapshot({ selection: selection() })));

    expect(look.selection?.handle).toBe("hf:v2:demo:index.html:index.html:abc123");
    expect(look.selection?.box.width).toBe(880);
    expect(look.selection?.can.editStyles).toBe(true);
  });

  it("reports the live animation count supplied outside the DOM selection", () => {
    const look = expectOk<{ selection: { animationCount: number } | null }>(
      buildStudioLook(snapshot({ selection: selection(), selectionAnimationCount: 3 })),
    );

    expect(look.selection?.animationCount).toBe(3);
  });

  it("passes the disabled reason through so the agent learns it from a read", () => {
    const locked = selection({
      capabilities: {
        ...selection().capabilities,
        canEditStyles: false,
        canMove: false,
        canApplyManualOffset: false,
        reasonIfDisabled: "Element is inside a locked composition",
      },
    });

    const look = expectOk<{
      selection: { can: { editStyles: boolean; move: boolean; reasonIfDisabled: string | null } };
    }>(buildStudioLook(snapshot({ selection: locked })));

    expect(look.selection?.can.editStyles).toBe(false);
    expect(look.selection?.can.move).toBe(false);
    expect(look.selection?.can.reasonIfDisabled).toBe("Element is inside a locked composition");
  });

  it("reports null selection rather than an empty one when nothing is selected", () => {
    const look = expectOk<{ selection: unknown }>(buildStudioLook(snapshot({ selection: null })));
    expect(look.selection).toBeNull();
  });

  it("does not advertise write readiness before the real write gate exists", () => {
    const look = expectOk<Record<string, unknown>>(buildStudioLook(snapshot()));

    expect(look).not.toHaveProperty("canWrite");
    expect(look).not.toHaveProperty("writeBlockedReason");
  });

  it("returns DOM preorder with source-safe parents, DOM-only descendants, and optional timeline timing", () => {
    const doc = sceneDoc();
    const scene = collectStudioLookScene(doc, "index.html", null);
    const look = expectOk<{
      elements: Array<{
        handle: string;
        parentHandle: string | null;
        depth: number;
        sourceFile: string;
        timeline: { start: number } | null;
      }>;
    }>(
      buildStudioLook(
        snapshot({
          scene,
          elements: [
            element({ domId: "shell", sourceFile: "index.html", start: 2 }),
            element({ domId: "duplicate", sourceFile: "compositions/nested.html", start: 4 }),
          ],
        }),
      ),
    );

    expect(look.elements.map(({ sourceFile, depth }) => [sourceFile, depth])).toEqual([
      ["index.html", 0],
      ["index.html", 1],
      ["index.html", 1],
      ["compositions/nested.html", 1],
      ["compositions/nested.html", 2],
    ]);
    expect(look.elements[1]?.parentHandle).toBe(look.elements[0]?.handle);
    expect(look.elements[4]?.parentHandle).toBe(look.elements[3]?.handle);
    expect(look.elements[2]?.timeline).toBeNull();
    expect(look.elements[4]?.timeline?.start).toBe(4);
    expect(look.elements[1]?.handle).not.toBe(look.elements[4]?.handle);
  });

  it("reports the current drill-in group separately without narrowing the whole scene", () => {
    const doc = sceneDoc();
    const group = doc.getElementById("nested-parent") as HTMLElement;
    const look = expectOk<{
      drillIn: { handle: string; label: string } | null;
      elements: unknown[];
    }>(buildStudioLook(snapshot({ scene: collectStudioLookScene(doc, "index.html", group) })));

    expect(look.elements).toHaveLength(5);
    expect(look.drillIn?.handle).toContain("nested-parent");
  });
});

function layer(
  label: string,
  overrides: Partial<{
    id: string;
    hfId: string;
    selector: string;
    selectorIndex: number;
    sourceFile: string;
    tagName: string;
    depth: number;
    childCount: number;
  }> = {},
) {
  const element = document.createElement(overrides.tagName ?? "div");
  return {
    key: label,
    element,
    label,
    tagName: overrides.tagName ?? "div",
    depth: overrides.depth ?? 0,
    childCount: overrides.childCount ?? 0,
    sourceFile: overrides.sourceFile ?? "index.html",
    ...overrides,
  };
}

function sceneDoc(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<main data-composition-id="root" data-composition-file="index.html">
    <section id="shell">
      <span id="duplicate">root duplicate</span>
      <em class="dom-only">no timeline</em>
      <div data-composition-id="nested" data-composition-file="compositions/nested.html">
        <section id="nested-parent" data-hf-group>
          <span id="duplicate">nested duplicate</span>
        </section>
      </div>
    </section>
  </main>`;
  return doc;
}

describe("buildStudioLook clips", () => {
  const clip = (overrides: Partial<TimelineElement>) =>
    element({ tag: "audio", kind: "audio", domId: "sfx", start: 2, duration: 0.5, ...overrides });

  it("returns timeline clips that are not scene layers, audio included", () => {
    const result = buildStudioLook(
      snapshot({
        elements: [clip({ domId: "late", start: 9 }), clip({ domId: "early", volume: 0.85 })],
      }),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.clipCount).toBe(2);
    expect(result.clips.map((c) => c.id)).toEqual(["early", "late"]);
    expect(result.clips[0]).toMatchObject({ kind: "audio", start: 2, volume: 0.85 });
    expect(result.elements).toEqual([]);
  });

  it("filters clips by id, kind or src", () => {
    const result = buildStudioLook(
      snapshot({
        elements: [
          clip({ domId: "click", src: "click.mp3" }),
          clip({ domId: "vo", src: "voice.mp3" }),
        ],
      }),
      { filter: "voice" },
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.clips.map((c) => c.id)).toEqual(["vo"]);
  });

  it("caps clips at the limit and reports the full count and truncation", () => {
    const elements = Array.from({ length: 5 }, (_, i) => clip({ domId: `c${i}`, start: i }));
    const result = buildStudioLook(snapshot({ elements }), { limit: 2 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.clips.map((c) => c.id)).toEqual(["c0", "c1"]);
    expect([result.clipCount, result.clipsTruncated]).toEqual([5, true]);
  });
});
