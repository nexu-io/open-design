// @vitest-environment happy-dom
/**
 * Every shape of animated element a composition can hand the resize, swept.
 *
 * Both faults this branch fixes were found one composition at a time, which is
 * a bad way to find the third. So this drives the real intercept across the
 * cross-product of what an element's tweens can look like and holds every run
 * to the two rules that were broken:
 *
 *   1. Never address an animation the source does not have. Sending a stale id
 *      is what "animation not found" is, and it leaves the element unsavable.
 *   2. Never leave a tween spanning two property groups. The parser classifies
 *      such a tween as neither, so it loses its group suffix and its id along
 *      with it, and every later edit has nothing to address.
 *
 * The server stand-in answers the way the real one does — an id it cannot find
 * is a rejection — and applies what it is told, so a run that corrupts the
 * animation list is caught by the next mutation in the same run rather than by
 * a person noticing weeks later.
 */
import { afterEach, expect, it, vi } from "vitest";
import { classifyTweenPropertyGroup } from "@hyperframes/core/gsap-parser";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { elTween, resetGsapEditState } from "./gsapParsedTween.test-helpers";
import { tryGsapResizeIntercept } from "./gsapResizeIntercept";

afterEach(resetGsapEditState);

type Props = Record<string, number>;

/** The dimensions an element's animations actually vary across. */
const SCALE = {
  none: null,
  "instant hold": () => elTween("#el-scale", { scale: 1.2 }, 0),
  tween: () => elTween("#el-scale", { scale: 1.2 }, 2),
  longhands: () => elTween("#el-scale", { scaleX: 1.2, scaleY: 1.1 }, 2),
} as const;
const SIZE = {
  none: null,
  "instant hold": () => elTween("#el-size", { width: 300, height: 200 }, 0),
  tween: () => elTween("#el-size", { width: 300, height: 200 }, 2),
} as const;
const POSITION = {
  none: null,
  "static hold": () => elTween("#el-position", { x: 40, y: 60 }, 0),
  tween: () => elTween("#el-position", { x: 40, y: 60 }, 2),
} as const;
const EXTRA = {
  none: null,
  // What a 3D card carries, and the shape that produced two same-group ids.
  "3d and rotation": () => [
    elTween("#el-other", { rotationY: -540, rotationX: 720, _auto: 0 }, 0),
    elTween("#el-rotation", { rotation: 720 }, 0),
    elTween("#el-other-2", { z: 50 }, 0),
  ],
  // A tween that already spans two groups, which the resize has to split.
  "a mixed tween": () => [elTween("#el-mixed", { scale: 1.2, width: 300, height: 200 }, 0)],
} as const;

interface Recorded {
  rejected: string[];
  corrupted: string[];
}

/**
 * The source, as the server sees it: a list of animations, a rejection for an
 * id that is not in it, and the effect of each mutation applied.
 */
function fakeSource(initial: GsapAnimation[]) {
  let current = initial;
  const recorded: Recorded = { rejected: [], corrupted: [] };

  const mergeInto = (id: string, properties: Props) => {
    current = current.map((animation) => {
      if (animation.id !== id) return animation;
      const before = classifyTweenPropertyGroup(animation.properties ?? {});
      const merged = { ...(animation.properties ?? {}), ...properties };
      const after = classifyTweenPropertyGroup(merged);
      // Mixing is only a fault when the resize CAUSED it. A tween that already
      // spanned two groups is an input, and splitting it is the point.
      if (before !== undefined && after === undefined) recorded.corrupted.push(id);
      return { ...animation, properties: merged, propertyGroup: after } as GsapAnimation;
    });
  };

  const split = (id: string) => {
    const target = current.find((animation) => animation.id === id);
    if (!target) return;
    const byGroup = new Map<string, Props>();
    for (const [key, value] of Object.entries(target.properties ?? {})) {
      const group = classifyTweenPropertyGroup({ [key]: value as number }) ?? "other";
      byGroup.set(group, { ...(byGroup.get(group) ?? {}), [key]: value as number });
    }
    current = [
      ...current.filter((animation) => animation.id !== id),
      ...[...byGroup].map(([group, properties]) =>
        elTween(`#el-split-${group}`, properties, target.duration ?? 0),
      ),
    ];
  };

  const apply = (mutation: Record<string, unknown>, id: string | undefined) => {
    const properties = (mutation.properties ?? {}) as Props;
    if (mutation.type === "split-into-property-groups") return id && split(id);
    if (!id) {
      if (mutation.type === "add")
        current = [...current, elTween(`#el-added-${current.length}`, properties, 0)];
      return;
    }
    mergeInto(id, properties);
    const framed = (mutation.keyframes as Array<{ properties: Props }> | undefined) ?? [];
    for (const frame of framed) mergeInto(id, frame.properties);
  };

  const commitMutation = vi.fn(async (_selection: unknown, mutation: Record<string, unknown>) => {
    const id = mutation.animationId as string | undefined;
    if (id && !current.some((animation) => animation.id === id)) {
      recorded.rejected.push(`${String(mutation.type)}:${id}`);
      throw new Error("animation not found");
    }
    apply(mutation, id);
  });

  return { commitMutation, recorded, animations: () => current };
}

type Dimension = Array<[string, () => GsapAnimation[]]>;

function dimension(
  entries: Record<string, null | (() => GsapAnimation | GsapAnimation[])>,
): Dimension {
  return Object.entries(entries).map(([name, make]) => [
    name,
    () => {
      if (!make) return [];
      const made = make();
      return Array.isArray(made) ? made : [made];
    },
  ]);
}

function buildCases() {
  const dimensions = [dimension(SCALE), dimension(SIZE), dimension(POSITION), dimension(EXTRA)];
  let combos: Array<Array<[string, () => GsapAnimation[]]>> = [[]];
  for (const next of dimensions) {
    combos = combos.flatMap((combo) => next.map((entry) => [...combo, entry]));
  }
  const labels = ["scale", "size", "position", "extra"];
  return combos.map((combo) => ({
    name: combo.map(([name], index) => `${labels[index]} ${name}`).join(" / "),
    animations: combo.flatMap(([, make]) => make()),
  }));
}

const CASES = buildCases();

it(`sweeps ${CASES.length} animated shapes without a stale id or a mixed tween`, async () => {
  const failures: string[] = [];

  for (const testCase of CASES) {
    document.body.innerHTML = "";
    const el = document.createElement("div");
    el.id = "el";
    el.setAttribute("data-hf-studio-original-box-width", "630");
    el.setAttribute("data-hf-studio-original-box-height", "408");
    document.body.append(el);
    usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });

    const source = fakeSource(testCase.animations);
    try {
      await tryGsapResizeIntercept(
        { id: "el", selector: "#el", element: el } as DomEditSelection,
        { width: 326, height: 213 },
        testCase.animations,
        null,
        source.commitMutation as never,
        async () => source.animations(),
      );
    } catch (error) {
      // A rejection is recorded below; anything else is worth reporting as-is.
      if (!(error instanceof Error) || error.message !== "animation not found") {
        failures.push(`${testCase.name} — threw ${String(error)}`);
      }
    }

    if (source.recorded.rejected.length > 0) {
      failures.push(`${testCase.name} — stale id: ${source.recorded.rejected.join(", ")}`);
    }
    if (source.recorded.corrupted.length > 0) {
      failures.push(`${testCase.name} — mixed tween: ${source.recorded.corrupted.join(", ")}`);
    }
  }

  expect(failures).toEqual([]);
});

/**
 * Which tween a resize edits when the element has several in the same group.
 *
 * A composition animates the same property more than once — a scale-in early
 * and a scale-out late — and the one the user means is the one under the
 * playhead. Editing the wrong one changes a moment they are not looking at and
 * leaves the moment they ARE looking at unchanged, which reads as "the resize
 * did nothing".
 */
function scaleAt(id: string, position: number): GsapAnimation {
  return {
    ...elTween(id, { scale: 1 }, 2),
    position,
    resolvedStart: position,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { scale: 1 } },
        { percentage: 100, properties: { scale: 1.4 } },
      ],
    },
  } as unknown as GsapAnimation;
}

const PLAYHEADS: Array<[number, string]> = [
  [0.5, "#el-early"],
  [1.9, "#el-early"],
  [3, "#el-early"],
  [3.1, "#el-late"],
  [4.5, "#el-late"],
  [9, "#el-late"],
];

it.each(PLAYHEADS)("at t=%s edits the tween under the playhead (%s)", async (time, expected) => {
  document.body.innerHTML = "";
  const el = document.createElement("div");
  el.id = "el";
  el.setAttribute("data-hf-studio-original-box-width", "630");
  el.setAttribute("data-hf-studio-original-box-height", "408");
  document.body.append(el);
  usePlayerStore.setState({ currentTime: time, activeKeyframePct: null });

  const animations = [scaleAt("#el-early", 0), scaleAt("#el-late", 4)];
  const commitMutation = vi.fn();
  await tryGsapResizeIntercept(
    { id: "el", selector: "#el", element: el } as DomEditSelection,
    { width: 326, height: 213 },
    animations,
    null,
    commitMutation as never,
    async () => animations,
  );

  const touched = new Set(
    commitMutation.mock.calls
      .map((call) => (call[1] as { animationId?: string }).animationId)
      .filter((id): id is string => id != null),
  );
  expect([...touched]).toEqual([expected]);
});
