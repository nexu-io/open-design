// @vitest-environment happy-dom
/**
 * Resizing `#card` in the shipped playground fails with "animation not found".
 *
 * The element carries five tweens, all at position 0 and all duration 0, and
 * one of them mixes `scale` with `width`/`height`. That spans two property
 * groups, so the parser gives it no group at all and the bare id `#card-to-0` —
 * which means the resize finds neither a scale tween nor a size tween and has
 * to split the mixed one apart before it can commit.
 *
 * This drives the real intercept against that exact set, with a server stand-in
 * that answers the way the real one does: an id it cannot find is a 404. Any id
 * the intercept sends that is not in the list it was last handed reproduces the
 * failure.
 */
import { afterEach, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { tryGsapResizeIntercept } from "./gsapResizeIntercept";

afterEach(() => {
  vi.restoreAllMocks();
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });
  document.body.innerHTML = "";
});

function hold(
  id: string,
  group: string | undefined,
  properties: Record<string, number>,
): GsapAnimation {
  return {
    id,
    targetSelector: "#card",
    propertyGroup: group,
    method: "to",
    properties,
    position: 0,
    resolvedStart: 0,
    duration: 0,
    extras: { immediateRender: "__raw:true" },
  } as unknown as GsapAnimation;
}

/** `#card` as the playground actually holds it. */
function cardAnimations(): GsapAnimation[] {
  return [
    hold("#card-to-0-other", "other", { rotationY: -540, rotationX: 720, _auto: 0 }),
    hold("#card-to-0-rotation", "rotation", { rotation: 720 }),
    hold("#card-to-0", undefined, { scale: 1.2, width: 326, height: 213 }),
    hold("#card-to-0-position", "position", { x: -1180, y: 128 }),
    hold("#card-to-0-other-2", "other", { z: 50 }),
  ];
}

it("never sends an animation id the server does not have", async () => {
  const el = document.createElement("div");
  el.id = "card";
  el.setAttribute("data-hf-studio-original-box-width", "326");
  el.setAttribute("data-hf-studio-original-box-height", "213");
  document.body.append(el);

  // The server's view of the file, and its 404.
  let current = cardAnimations();
  const rejected: string[] = [];
  const sent: string[] = [];
  const commitMutation = vi.fn(async (_selection: unknown, mutation: Record<string, unknown>) => {
    const animationId = mutation.animationId as string | undefined;
    if (animationId) {
      sent.push(`${String(mutation.type)}:${animationId}`);
      if (!current.some((a) => a.id === animationId)) {
        rejected.push(animationId);
        throw new Error("animation not found");
      }
    }
    // Splitting the mixed tween is what the real server does with it.
    if (mutation.type === "split-into-property-groups") {
      current = [
        hold("#card-to-0-other", "other", { rotationY: -540, rotationX: 720, _auto: 0 }),
        hold("#card-to-0-rotation", "rotation", { rotation: 720 }),
        hold("#card-to-0-position", "position", { x: -1180, y: 128 }),
        hold("#card-to-0-other-2", "other", { z: 50 }),
        hold("#card-to-0-scale", "scale", { scale: 1.2 }),
        hold("#card-to-0-size", "size", { width: 326, height: 213 }),
      ];
    }
  });

  const selection = { id: "card", selector: "#card", element: el } as DomEditSelection;
  await tryGsapResizeIntercept(
    selection,
    { width: 500, height: 320 },
    cardAnimations(),
    null,
    commitMutation as never,
    async () => current,
  );

  expect(rejected).toEqual([]);
  expect(sent).not.toHaveLength(0);
});

/**
 * How `#card` got into that state: a resize wrote `width`/`height` into the
 * tween that carried `scale`.
 *
 * One tween spanning two property groups is classified as neither, so it loses
 * its group suffix and its id with it — and every later edit of the element
 * looks for a scale tween and a size tween, finds no group at all, and fails.
 */
it("does not write size into the tween that carries scale", async () => {
  const el = document.createElement("div");
  el.id = "card";
  el.setAttribute("data-hf-studio-original-box-width", "630");
  el.setAttribute("data-hf-studio-original-box-height", "408");
  document.body.append(el);

  // The element before the damage: one instant scale hold, nothing else.
  const scaleHold = hold("#card-to-0-scale", "scale", { scale: 1.2 });
  const commitMutation = vi.fn();

  await tryGsapResizeIntercept(
    { id: "card", selector: "#card", element: el } as DomEditSelection,
    { width: 326, height: 213 },
    [scaleHold],
    null,
    commitMutation as never,
    async () => [scaleHold],
  );

  const intoScaleHold = commitMutation.mock.calls
    .map((call) => call[1] as { animationId?: string; properties?: Record<string, number> })
    .filter((mutation) => mutation.animationId === "#card-to-0-scale")
    .flatMap((mutation) => Object.keys(mutation.properties ?? {}));

  expect(intoScaleHold).not.toContain("width");
  expect(intoScaleHold).not.toContain("height");
});

/**
 * Whether the caller must persist the drag offset is the resize's answer to
 * give, not something to infer from the element's tweens.
 *
 * An element whose scale is an instant hold HAS a scale-group tween and still
 * commits width/height. Guessing from the tweens withheld an offset nobody had
 * written, and the element snapped back to its authored position on every drag.
 */
it("leaves the drag offset to the caller when it commits size, not scale", async () => {
  const el = document.createElement("div");
  el.id = "card";
  el.setAttribute("data-hf-studio-original-box-width", "630");
  el.setAttribute("data-hf-studio-original-box-height", "408");
  document.body.append(el);

  const scaleHold = hold("#card-to-0-scale", "scale", { scale: 1.2 });
  const outcome = await tryGsapResizeIntercept(
    { id: "card", selector: "#card", element: el } as DomEditSelection,
    { width: 326, height: 213 },
    [scaleHold],
    null,
    vi.fn() as never,
    async () => [scaleHold],
  );

  expect(outcome.status).toBe("element-size");
});
