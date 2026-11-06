// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mintElementHandle } from "../handles";
import { previewDoc, selectionFor } from "../webmcpTestUtils";
import {
  studioAddAnimation,
  studioAddKeyframe,
  studioDeleteAnimation,
  studioUpdateAnimation,
  type AnimationToolDeps,
} from "./animationTools";
import { studioTransform, type ElementBox, type TransformToolDeps } from "./transformTools";

function target() {
  const doc = previewDoc('<div id="agent">Agent</div>');
  const element = doc.getElementById("agent") as HTMLElement;
  const handle = mintElementHandle({
    projectId: "demo",
    domId: "agent",
    sourceFile: "index.html",
    activeCompositionPath: "index.html",
  });
  if (!handle) throw new Error("expected handle");
  const common = {
    getPreviewDocument: () => doc,
    getCompositionPath: () => "index.html",
    getProjectId: () => "demo",
    getWriteBlockedReason: () => null,
    buildSelection: async (targetElement: HTMLElement) => selectionFor(targetElement),
    applySelection: () => undefined,
  };
  return { common, element, handle };
}

function transformDeps(
  common: ReturnType<typeof target>["common"],
  box: ElementBox,
  overrides: Partial<TransformToolDeps> = {},
): TransformToolDeps {
  return {
    ...common,
    readBox: () => ({ ...box }),
    moveTo: async () => undefined,
    resizeTo: async () => undefined,
    rotateTo: async () => undefined,
    ...overrides,
  };
}

function animationDeps(
  common: ReturnType<typeof target>["common"],
  overrides: Partial<AnimationToolDeps> = {},
): AnimationToolDeps {
  return {
    ...common,
    getAnimationsForSelection: async () => [{ id: "anim-1" }],
    readPlayhead: () => ({ currentTime: 2, duration: 10, isPlaying: false }),
    addAnimation: async () => true,
    updateAnimation: async () => true,
    addKeyframe: async () => undefined,
    deleteAnimation: async () => true,
    ...overrides,
  };
}

describe("targeted write actor families", () => {
  it("passes the live handle selection to transform and every animation actor", async () => {
    const { common, element, handle } = target();
    const box = { x: 0, y: 0, width: 100, height: 50 };
    const moveTo = vi.fn(async (_selection, next: { x: number; y: number }) => {
      Object.assign(box, next);
    });
    const addAnimation = vi.fn();
    const updateAnimation = vi.fn(async () => true);
    const addKeyframe = vi.fn(async () => undefined);
    const deleteAnimation = vi.fn();

    await studioTransform(transformDeps(common, box, { moveTo }), { handle, x: 20, y: 30 });
    const animations = animationDeps(common, {
      addAnimation,
      updateAnimation,
      addKeyframe,
      deleteAnimation,
    });
    await studioAddAnimation(animations, { handle, method: "to" });
    await studioUpdateAnimation(animations, { handle, animationId: "anim-1", duration: 2 });
    await studioAddKeyframe(animations, {
      handle,
      animationId: "anim-1",
      percent: 50,
      properties: { opacity: 0 },
    });
    await studioDeleteAnimation(animations, { handle, animationId: "anim-1" });

    for (const actor of [moveTo, addAnimation, updateAnimation, addKeyframe, deleteAnimation]) {
      expect(actor.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ element }));
    }
  });

  it("keeps mixed durable and void transform operations at dispatched", async () => {
    const { common, handle } = target();
    const box = { x: 0, y: 0, width: 100, height: 50 };
    const result = await studioTransform(
      transformDeps(common, box, {
        resizeTo: async (_selection, next) => {
          Object.assign(box, next);
          return {
            ok: true,
            persistence: {
              sourceFile: "index.html",
              version: '"sha256:size"',
              changed: true,
            },
          };
        },
        moveTo: async (_selection, next) => {
          Object.assign(box, next);
        },
      }),
      { handle, width: 200, height: 80, x: 20, y: 30 },
    );

    expect(result).toMatchObject({ ok: true, stage: "dispatched" });
  });
});
