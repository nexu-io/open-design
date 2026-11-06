import { describe, expect, it, vi } from "vitest";
import { patchRuntimeTweenInPlace } from "./gsapRuntimePatch";

/**
 * The helper patches ONE tween's values in `window.__timelines[compKey]` in place,
 * `invalidate()`s it, and re-seeks via `__player.seek(currentTime)` so a value-only
 * edit is reflected without re-running the composition. It must return `false`
 * (caller falls back to a soft reload) whenever it can't confidently apply.
 *
 * The fixtures below mimic the runtime timeline shape the reader scans:
 * a timeline with `getChildren(deep)`, child tweens with `vars`/`targets`/
 * `duration`/`startTime`/`invalidate`, and an `__player` with `getTime`/`seek`.
 */

type TweenSpec = {
  vars: Record<string, unknown>;
  targetIds: string[];
  duration: number;
  startTime?: number;
};

function makeTween(spec: TweenSpec, el: { id: string }) {
  const invalidate = vi.fn();
  return {
    vars: spec.vars,
    targets: () => spec.targetIds.map((id) => (id === el.id ? el : { id })),
    duration: () => spec.duration,
    startTime: () => spec.startTime ?? 0,
    invalidate,
  };
}

// A preview iframe whose runtime timeline holds the given tweens under `compKey`,
// resolves `#<el.id>`, and exposes a `__player` clock that re-renders the timeline
// when `seek` is called (so we can assert the post-seek interpolated value).
function fakeIframe(
  el: { id: string },
  tweens: ReturnType<typeof makeTween>[],
  opts: {
    compKey?: string;
    extraTimelines?: Record<string, unknown>;
    now?: number;
    onSeek?: (t: number) => void;
  } = {},
): {
  iframe: HTMLIFrameElement;
  seek: ReturnType<typeof vi.fn>;
  timeline: { getChildren: () => unknown[] };
} {
  const compKey = opts.compKey ?? "index.html";
  const now = opts.now ?? 0;
  const timeline = {
    getChildren: () => tweens,
    duration: () => 14.6,
    time: () => now,
  };
  const seek = vi.fn((t: number) => opts.onSeek?.(t));
  const iframe = {
    contentWindow: {
      __timelines: { [compKey]: timeline, ...(opts.extraTimelines ?? {}) },
      __player: { getTime: () => now, seek },
    },
    contentDocument: { querySelector: (sel: string) => (sel === `#${el.id}` ? el : null) },
  } as unknown as HTMLIFrameElement;
  return { iframe, seek, timeline };
}

describe("patchRuntimeTweenInPlace — set tweens", () => {
  it("patches a tl.set x/y; a simulated re-seek reflects the NEW x/y (not the old)", () => {
    const el = { id: "box" };
    // Model the runtime applying the set's vars to the element on seek.
    const rendered: { x: number; y: number } = { x: 0, y: 0 };
    const setTween = makeTween(
      { vars: { x: 0, y: 0 }, targetIds: ["box"], duration: 0, startTime: 0 },
      el,
    );
    const { iframe, seek } = fakeIframe(el, [setTween], {
      onSeek: () => {
        rendered.x = setTween.vars.x as number;
        rendered.y = setTween.vars.y as number;
      },
    });

    const ok = patchRuntimeTweenInPlace(iframe, "#box", {
      kind: "set",
      props: { x: 120, y: -40 },
    });

    expect(ok).toBe(true);
    expect(setTween.vars.x).toBe(120);
    expect(setTween.vars.y).toBe(-40);
    expect(setTween.invalidate).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(1);
    expect(rendered).toEqual({ x: 120, y: -40 });
  });

  it("patches only the rotation channel, leaving x/y untouched", () => {
    const el = { id: "knob" };
    const setTween = makeTween(
      { vars: { x: 10, y: 20, rotation: 0 }, targetIds: ["knob"], duration: 0 },
      el,
    );
    const { iframe } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#knob", {
      kind: "set",
      props: { rotation: 45 },
    });

    expect(ok).toBe(true);
    expect(setTween.vars.rotation).toBe(45);
    expect(setTween.vars.x).toBe(10);
    expect(setTween.vars.y).toBe(20);
  });

  it("patches only the scale channels", () => {
    const el = { id: "card" };
    const setTween = makeTween(
      { vars: { scaleX: 1, scaleY: 1, opacity: 1 }, targetIds: ["card"], duration: 0 },
      el,
    );
    const { iframe } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#card", {
      kind: "set",
      props: { scaleX: 2, scaleY: 1.5 },
    });

    expect(ok).toBe(true);
    expect(setTween.vars.scaleX).toBe(2);
    expect(setTween.vars.scaleY).toBe(1.5);
    expect(setTween.vars.opacity).toBe(1);
  });
});

describe("patchRuntimeTweenInPlace — authored-opacity capture guard", () => {
  function makeStampedEl(id: string, stamped: string | null, inlineOpacity: string) {
    const style = new Map<string, string>([["opacity", inlineOpacity]]);
    return {
      el: {
        id,
        style: {
          setProperty: (k: string, v: string) => void style.set(k, v),
          removeProperty: (k: string) => void style.delete(k),
        },
        getAttribute: (name: string) => (name === "data-hf-authored-opacity" ? stamped : null),
      },
      style,
    };
  }

  it("restores the stamped authored opacity before an opacity-touching patch", () => {
    // Runtime transient (grading hide / mid-flight tween) baked into inline style.
    const { el, style } = makeStampedEl("box", "0.75", "0");
    const setTween = makeTween(
      { vars: { opacity: 0.2, duration: 0 }, targetIds: ["box"], duration: 0 },
      el,
    );
    const { iframe } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#box", {
      kind: "set",
      props: { opacity: 0.5 },
    });

    expect(ok).toBe(true);
    // The re-init must capture the authored 0.75, not the transient 0.
    expect(style.get("opacity")).toBe("0.75");
    expect(setTween.vars.opacity).toBe(0.5);
  });

  it("removes inline opacity when the stamp recorded no authored value", () => {
    const { el, style } = makeStampedEl("box", "", "0");
    const setTween = makeTween(
      { vars: { opacity: 0.2, duration: 0 }, targetIds: ["box"], duration: 0 },
      el,
    );
    const { iframe } = fakeIframe(el, [setTween]);

    patchRuntimeTweenInPlace(iframe, "#box", { kind: "set", props: { opacity: 0.5 } });

    expect(style.has("opacity")).toBe(false);
  });

  it("leaves inline opacity alone for a position-only patch", () => {
    const { el, style } = makeStampedEl("box", "0.75", "0");
    const setTween = makeTween(
      { vars: { x: 0, y: 0, duration: 0 }, targetIds: ["box"], duration: 0 },
      el,
    );
    const { iframe } = fakeIframe(el, [setTween]);

    patchRuntimeTweenInPlace(iframe, "#box", { kind: "set", props: { x: 10, y: 20 } });

    expect(style.get("opacity")).toBe("0");
  });
});

describe("patchRuntimeTweenInPlace — channel-aware set resolution", () => {
  it("patches the {x,y} set, not a co-located rotation-only set", () => {
    const el = { id: "dual" };
    const posSet = makeTween({ vars: { x: 0, y: 0 }, targetIds: ["dual"], duration: 0 }, el);
    const rotSet = makeTween({ vars: { rotation: 0 }, targetIds: ["dual"], duration: 0 }, el);
    // rotation set listed FIRST — channel-blind resolution would grab it.
    const { iframe } = fakeIframe(el, [rotSet, posSet]);

    const ok = patchRuntimeTweenInPlace(iframe, "#dual", {
      kind: "set",
      props: { x: 33, y: 44 },
    });

    expect(ok).toBe(true);
    expect(posSet.vars).toMatchObject({ x: 33, y: 44 });
    // The rotation set must be untouched (no x/y written into it).
    expect(rotSet.vars).toEqual({ rotation: 0 });
    expect(rotSet.invalidate).not.toHaveBeenCalled();
    expect(posSet.invalidate).toHaveBeenCalled();
  });

  it("patches the rotation set, not a co-located {x,y} set", () => {
    const el = { id: "dual2" };
    const posSet = makeTween({ vars: { x: 5, y: 6 }, targetIds: ["dual2"], duration: 0 }, el);
    const rotSet = makeTween({ vars: { rotation: 0 }, targetIds: ["dual2"], duration: 0 }, el);
    // position set listed FIRST.
    const { iframe } = fakeIframe(el, [posSet, rotSet]);

    const ok = patchRuntimeTweenInPlace(iframe, "#dual2", {
      kind: "set",
      props: { rotation: 90 },
    });

    expect(ok).toBe(true);
    expect(rotSet.vars).toMatchObject({ rotation: 90 });
    expect(posSet.vars).toEqual({ x: 5, y: 6 });
    expect(posSet.invalidate).not.toHaveBeenCalled();
    expect(rotSet.invalidate).toHaveBeenCalled();
  });

  it("falls back to the only set when none carries the requested channel", () => {
    // Back-compat: a single {x,y} set, patched with {x,y} that obviously matches,
    // plus a set lacking the channel entirely still resolves to a match. Here the
    // only set carries opacity; patching opacity must still land on it.
    const el = { id: "solo" };
    const set = makeTween({ vars: { opacity: 1 }, targetIds: ["solo"], duration: 0 }, el);
    const { iframe } = fakeIframe(el, [set]);

    const ok = patchRuntimeTweenInPlace(iframe, "#solo", {
      kind: "set",
      props: { opacity: 0.5 },
    });

    expect(ok).toBe(true);
    expect(set.vars).toMatchObject({ opacity: 0.5 });
  });
});

describe("patchRuntimeTweenInPlace — keyframe tweens", () => {
  it("rebuilds the keyframes; a moved keyframe updates, others unchanged", () => {
    const el = { id: "puck" };
    const kfTween = makeTween(
      {
        vars: {
          keyframes: [
            { x: 0, y: 0 },
            { x: 100, y: 50 },
            { x: 200, y: 0 },
          ],
          duration: 3,
          ease: "power1.inOut",
        },
        targetIds: ["puck"],
        duration: 3,
        startTime: 1,
      },
      el,
    );
    const { iframe, seek } = fakeIframe(el, [kfTween], { now: 2 });

    const ok = patchRuntimeTweenInPlace(iframe, "#puck", {
      kind: "keyframes",
      keyframes: [
        { x: 0, y: 0 },
        { x: 140, y: 90 },
        { x: 200, y: 0 },
      ],
    });

    expect(ok).toBe(true);
    const kfs = kfTween.vars.keyframes as Array<Record<string, number>>;
    expect(kfs[1]).toEqual({ x: 140, y: 90 });
    expect(kfs[0]).toEqual({ x: 0, y: 0 });
    expect(kfs[2]).toEqual({ x: 200, y: 0 });
    expect(kfTween.invalidate).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing ease when rebuilding keyframes", () => {
    const el = { id: "puck2" };
    const kfTween = makeTween(
      {
        vars: {
          keyframes: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          duration: 2,
          ease: "back.out",
        },
        targetIds: ["puck2"],
        duration: 2,
        startTime: 0,
      },
      el,
    );
    const { iframe } = fakeIframe(el, [kfTween], { now: 1 });

    const ok = patchRuntimeTweenInPlace(iframe, "#puck2", {
      kind: "keyframes",
      keyframes: [
        { x: 0, y: 0 },
        { x: 250, y: 10 },
      ],
    });

    expect(ok).toBe(true);
    expect(kfTween.vars.ease).toBe("back.out");
  });
});

describe("patchRuntimeTweenInPlace — defensive false returns", () => {
  it("returns false when the selector has no matching tween", () => {
    const el = { id: "lonely" };
    const otherTween = makeTween(
      { vars: { x: 0 }, targetIds: ["someone-else"], duration: 0 },
      { id: "someone-else" },
    );
    const { iframe, seek } = fakeIframe(el, [otherTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#lonely", { kind: "set", props: { x: 50 } });

    expect(ok).toBe(false);
    expect(seek).not.toHaveBeenCalled();
  });

  it("returns false when the selector resolves to no element", () => {
    const el = { id: "present" };
    const setTween = makeTween({ vars: { x: 0 }, targetIds: ["present"], duration: 0 }, el);
    const { iframe } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#missing", { kind: "set", props: { x: 50 } });
    expect(ok).toBe(false);
  });

  it("returns false for a motionPath arc tween (defers to soft reload)", () => {
    const el = { id: "flyer" };
    const arcTween = makeTween(
      {
        vars: {
          motionPath: {
            path: [
              { x: 0, y: 0 },
              { x: 100, y: -50 },
              { x: 200, y: 0 },
            ],
            curviness: 1.5,
          },
          duration: 4,
        },
        targetIds: ["flyer"],
        duration: 4,
        startTime: 0,
      },
      el,
    );
    const { iframe, seek } = fakeIframe(el, [arcTween], { now: 1 });

    const ok = patchRuntimeTweenInPlace(iframe, "#flyer", {
      kind: "keyframes",
      keyframes: [
        { x: 0, y: 0 },
        { x: 120, y: -30 },
      ],
    });

    expect(ok).toBe(false);
    expect(arcTween.invalidate).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it("returns false for a dynamic/computed keyframe value (string expression)", () => {
    const el = { id: "dyn" };
    const kfTween = makeTween(
      {
        vars: {
          keyframes: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          duration: 2,
        },
        targetIds: ["dyn"],
        duration: 2,
        startTime: 0,
      },
      el,
    );
    const { iframe } = fakeIframe(el, [kfTween], { now: 1 });

    // A non-finite/string value in the requested change can't be safely expressed
    // as a static keyframe → defer to soft reload.
    const ok = patchRuntimeTweenInPlace(iframe, "#dyn", {
      kind: "keyframes",
      keyframes: [
        { x: 0, y: 0 },
        // @ts-expect-error — intentionally dynamic/computed value
        { x: "+=random(50,100)", y: 0 },
      ],
    });

    expect(ok).toBe(false);
  });

  it("returns false for a keyframes change against a set-only tween (shape mismatch)", () => {
    const el = { id: "static" };
    const setTween = makeTween({ vars: { x: 0, y: 0 }, targetIds: ["static"], duration: 0 }, el);
    const { iframe } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#static", {
      kind: "keyframes",
      keyframes: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    });
    expect(ok).toBe(false);
  });

  it("returns false rather than overwriting a dynamic string set value", () => {
    // The existing set value is a computed GSAP expression ("+=100"). Patching it
    // with a plain number would silently drop the dynamic intent → defer.
    const el = { id: "expr" };
    const setTween = makeTween(
      { vars: { x: "+=100", y: 0 }, targetIds: ["expr"], duration: 0 },
      el,
    );
    const { iframe, seek } = fakeIframe(el, [setTween]);

    const ok = patchRuntimeTweenInPlace(iframe, "#expr", {
      kind: "set",
      props: { x: 50, y: 10 },
    });

    expect(ok).toBe(false);
    // Declined → the dynamic expression survives, untouched.
    expect(setTween.vars.x).toBe("+=100");
    expect(setTween.invalidate).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it("never throws — returns false on internal error", () => {
    const el = { id: "boom" };
    const explodingTween = {
      get vars() {
        throw new Error("boom");
      },
      targets: () => [el],
      duration: () => 0,
      startTime: () => 0,
      invalidate: vi.fn(),
    };
    const timeline = {
      getChildren: () => {
        throw new Error("kaboom");
      },
      duration: () => 1,
      time: () => 0,
    };
    const iframe = {
      contentWindow: {
        __timelines: { "index.html": timeline },
        __player: { getTime: () => 0, seek: vi.fn() },
      },
      contentDocument: { querySelector: (sel: string) => (sel === "#boom" ? el : null) },
    } as unknown as HTMLIFrameElement;
    void explodingTween;

    expect(() =>
      patchRuntimeTweenInPlace(iframe, "#boom", { kind: "set", props: { x: 1 } }),
    ).not.toThrow();
    expect(patchRuntimeTweenInPlace(iframe, "#boom", { kind: "set", props: { x: 1 } })).toBe(false);
  });
});

describe("patchRuntimeTweenInPlace — composition isolation", () => {
  it("patches only the tween in the element's owning timeline, not others", () => {
    const el = { id: "owned" };
    const ownTween = makeTween({ vars: { x: 0, y: 0 }, targetIds: ["owned"], duration: 0 }, el);
    // Another composition's timeline holds a tween for a DIFFERENT element with the
    // same channel — it must be left untouched.
    const otherTween = makeTween(
      { vars: { x: 999, y: 999 }, targetIds: ["someone-else"], duration: 0 },
      { id: "someone-else" },
    );
    const otherTimeline = {
      getChildren: () => [otherTween],
      duration: () => 5,
      time: () => 0,
    };

    const { iframe } = fakeIframe(el, [ownTween], {
      compKey: "subscene",
      extraTimelines: { playground: otherTimeline, __proxied: true },
    });

    const ok = patchRuntimeTweenInPlace(iframe, "#owned", {
      kind: "set",
      props: { x: 7, y: 8 },
    });

    expect(ok).toBe(true);
    expect(ownTween.vars).toMatchObject({ x: 7, y: 8 });
    expect(otherTween.vars).toMatchObject({ x: 999, y: 999 });
    expect(otherTween.invalidate).not.toHaveBeenCalled();
  });
});

describe("patchRuntimeTweenInPlace — deferSeek", () => {
  /**
   * A group drag commits one member at a time. Each in-place patch used to seek,
   * and a seek re-renders the WHOLE timeline — so every member still queued behind
   * the current one got repainted from its un-patched tween, back to where it sat
   * before the drag, and stayed there until its own patch landed. That is the jump.
   */
  it("does not seek while a group commit is still writing its other members", () => {
    const a = { id: "a" };
    const rendered = { a: 0, b: 0 };
    const tweenA = makeTween({ vars: { x: 0 }, targetIds: ["a"], duration: 0 }, a);
    const tweenB = makeTween({ vars: { x: 0 }, targetIds: ["b"], duration: 0 }, a);
    const { iframe, seek } = fakeIframe(a, [tweenA, tweenB], {
      onSeek: () => {
        rendered.a = tweenA.vars.x as number;
        rendered.b = tweenB.vars.x as number;
      },
    });

    const first = patchRuntimeTweenInPlace(
      iframe,
      "#a",
      { kind: "set", props: { x: 500 } },
      undefined,
      true,
    );

    expect(first).toBe(true);
    expect(tweenA.vars.x).toBe(500);
    // No repaint yet: "b" keeps the transform the gesture left on it instead of
    // being rendered from its own tween, which still holds the pre-drag value.
    expect(seek).not.toHaveBeenCalled();
    expect(rendered).toEqual({ a: 0, b: 0 });

    tweenB.vars.x = 600;
    const last = patchRuntimeTweenInPlace(iframe, "#a", { kind: "set", props: { x: 500 } });

    expect(last).toBe(true);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(rendered).toEqual({ a: 500, b: 600 });
  });
});
