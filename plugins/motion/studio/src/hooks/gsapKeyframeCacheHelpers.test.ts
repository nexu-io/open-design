import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore, type KeyframeCacheEntry } from "../player/store/playerStore";
import {
  clearKeyframeCacheForElement,
  elementCacheKeys,
  pruneKeyframeCacheToFiles,
  replaceKeyframeCacheForFile,
  updateKeyframeCacheFromParsed,
} from "./gsapKeyframeCacheHelpers";
import { trackStudioEvent } from "../utils/studioTelemetry";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

const entry = (): KeyframeCacheEntry => ({
  format: "percentage",
  keyframes: [{ percentage: 0, properties: { x: 0 } }],
});

const seed = (key: string) => usePlayerStore.getState().setKeyframeCache(key, entry());
const cache = () => usePlayerStore.getState().keyframeCache;

const animWithKeyframes = (id: string): GsapAnimation => ({
  id,
  targetSelector: `#${id}`,
  method: "to",
  position: 0,
  properties: {},
  duration: 1,
  resolvedStart: 0,
  propertyGroup: "position",
  keyframes: { format: "percentage", keyframes: [{ percentage: 50, properties: { x: 100 } }] },
});

beforeEach(() => {
  usePlayerStore.setState({ keyframeCache: new Map(), gsapAnimations: new Map(), elements: [] });
  vi.mocked(trackStudioEvent).mockClear();
});

describe("non-string cache keys", () => {
  // `s.indexOf is not a function` in pruneKeyframeCacheToFiles, decoded from the
  // released 0.7.90 bundle. Some producer reaches elementCacheKeys with a
  // non-string id; the bare-id key was written through raw, so both maps ended
  // up holding a key that prune's `key.indexOf("#")` cannot handle.
  const badId = 42 as unknown as string;

  it("keeps every written key a string", () => {
    expect(elementCacheKeys("comp.html", badId).every((k) => typeof k === "string")).toBe(true);
  });

  it("reports the offending value instead of swallowing it", () => {
    elementCacheKeys("comp.html", badId);

    expect(trackStudioEvent).toHaveBeenCalledWith(
      "cache_key_non_string",
      expect.objectContaining({
        value_type: "number",
        constructor_name: "Number",
        source_file: "comp.html",
      }),
    );
  });

  it("stays silent on the normal string path", () => {
    elementCacheKeys("comp.html", "box");

    expect(trackStudioEvent).not.toHaveBeenCalled();
  });

  it("survives a prune after a write with a non-string id", () => {
    replaceKeyframeCacheForFile(
      "stale.html",
      new Map([[badId, entry()]]),
      new Map([[badId, [animWithKeyframes("box")]]]),
    );

    expect(() => pruneKeyframeCacheToFiles(["kept.html"])).not.toThrow();
  });
});

describe("replaceKeyframeCacheForFile re-reads", () => {
  it("publishes nothing when a file re-reads to the same entries, and the change when one differs", () => {
    const write = (x: number) =>
      replaceKeyframeCacheForFile(
        "comp.html",
        new Map([
          ["box", { format: "percentage", keyframes: [{ percentage: 0, properties: { x } }] }],
        ]),
        new Map([["box", [animWithKeyframes("box")]]]),
      );
    write(0);
    let notified = 0;
    const stop = usePlayerStore.subscribe(() => notified++);
    write(0);
    expect(notified).toBe(0);
    write(5);
    stop();
    expect(notified).toBe(1);
    expect(cache().get("comp.html#box")?.keyframes[0]?.properties).toEqual({ x: 5 });
  });

  it("leaves a sub-composition's entries alone when index.html re-reads", () => {
    const one = (id: string) => new Map([[id, entry()]]);
    const anims = (id: string) => new Map([[id, [animWithKeyframes(id)]]]);
    replaceKeyframeCacheForFile("comp.html", one("box"), anims("box"));
    replaceKeyframeCacheForFile("index.html", one("hero"), anims("hero"));
    let notified = 0;
    const stop = usePlayerStore.subscribe(() => notified++);
    replaceKeyframeCacheForFile("index.html", one("hero"), anims("hero"));
    stop();

    expect(notified).toBe(0);
    for (const key of ["comp.html#box", "index.html#box", "box", "index.html#hero", "hero"]) {
      expect(cache().has(key)).toBe(true);
    }
  });

  it("still drops index.html's own element that shares an id with a sub-composition", () => {
    const one = (id: string) => new Map([[id, entry()]]);
    const anims = (id: string) => new Map([[id, [animWithKeyframes(id)]]]);
    const own = { format: "percentage", keyframes: [{ percentage: 0, properties: { x: 9 } }] };
    replaceKeyframeCacheForFile("comp.html", one("title"), anims("title"));
    replaceKeyframeCacheForFile("index.html", new Map([["title", own]]), anims("title"));
    replaceKeyframeCacheForFile("index.html", new Map(), new Map());

    expect(cache().has("index.html#title")).toBe(false);
    expect(cache().has("comp.html#title")).toBe(true);
  });
});

describe("clearKeyframeCacheForElement", () => {
  it("drops the prefixed, index.html fallback, and bare key for a non-index source", () => {
    seed("comp.html#box");
    seed("index.html#box");
    seed("box");

    clearKeyframeCacheForElement("comp.html", "box");

    expect(cache().has("comp.html#box")).toBe(false);
    expect(cache().has("index.html#box")).toBe(false);
    // The bare key is what PropertyPanel's keyframe nav reads (element.id), so
    // it must be cleared too, not just the prefixed variants.
    expect(cache().has("box")).toBe(false);
  });

  it("drops the prefixed and bare key for an index.html source", () => {
    seed("index.html#hero");
    seed("hero");

    clearKeyframeCacheForElement("index.html", "hero");

    expect(cache().has("index.html#hero")).toBe(false);
    expect(cache().has("hero")).toBe(false);
  });

  it("leaves other elements' keys untouched", () => {
    seed("index.html#box");
    seed("box");
    seed("index.html#other");
    seed("other");

    clearKeyframeCacheForElement("index.html", "box");

    expect(cache().has("index.html#other")).toBe(true);
    expect(cache().has("other")).toBe(true);
  });
});

describe("pruneKeyframeCacheToFiles", () => {
  // Switching composition leaves the previous comp's elements cached with no
  // owner left to clear them: each file only ever clears its own entries.
  it("drops every element of a file the next scan no longer covers", () => {
    seed("index.html#stress-1");
    seed("stress-1");
    seed("index.html#stress-2");
    seed("stress-2");
    seed("kf200.html#kf200");
    seed("index.html#kf200");
    seed("kf200");

    pruneKeyframeCacheToFiles(["kf200.html"]);

    for (const key of ["index.html#stress-1", "stress-1", "index.html#stress-2", "stress-2"]) {
      expect(cache().has(key)).toBe(false);
    }
    expect(cache().has("kf200.html#kf200")).toBe(true);
  });

  it("prunes gsapAnimations alongside keyframeCache", () => {
    usePlayerStore.getState().setGsapAnimations("index.html#stress-1", [animWithKeyframes("t")]);
    usePlayerStore.getState().setGsapAnimations("kf200.html#kf200", [animWithKeyframes("u")]);

    pruneKeyframeCacheToFiles(["kf200.html"]);

    const animations = usePlayerStore.getState().gsapAnimations;
    expect(animations.has("index.html#stress-1")).toBe(false);
    expect(animations.has("kf200.html#kf200")).toBe(true);
  });

  it("keeps everything when every cached file is still covered", () => {
    seed("index.html#hero");
    seed("comp.html#a");

    pruneKeyframeCacheToFiles(["index.html", "comp.html"]);

    expect(cache().has("index.html#hero")).toBe(true);
    expect(cache().has("comp.html#a")).toBe(true);
  });

  // The prune runs immediately before the atomic repopulate on every
  // composition switch. One notification per stale element put every subscriber
  // through a cache that was progressively emptier, which is the flash the
  // atomic repopulate exists to avoid.
  it("drops every stale file in one notification", () => {
    seed("old.html#a");
    seed("old.html#b");
    seed("older.html#c");
    seed("kept.html#k");
    let notifications = 0;
    const unsubscribe = usePlayerStore.subscribe(() => {
      notifications += 1;
    });

    pruneKeyframeCacheToFiles(["kept.html"]);
    unsubscribe();

    expect(notifications).toBe(1);
    expect([...cache().keys()]).toEqual(["kept.html#k"]);
  });

  // A prune that finds nothing stale must not hand subscribers a fresh Map
  // identity: every keyframe consumer re-renders on cache identity alone.
  it("does not publish when nothing is stale", () => {
    seed("kept.html#k");
    const before = cache();
    let notifications = 0;
    const unsubscribe = usePlayerStore.subscribe(() => {
      notifications += 1;
    });

    pruneKeyframeCacheToFiles(["kept.html"]);
    unsubscribe();

    expect(notifications).toBe(0);
    expect(cache()).toBe(before);
  });
});

describe("replaceKeyframeCacheForFile", () => {
  it("publishes complete keyframe and animation maps in one notification", () => {
    const staleEntry = entry();
    const otherEntry = entry();
    const staleAnimation = animWithKeyframes("stale");
    const freshAnimation = animWithKeyframes("fresh");
    usePlayerStore.setState({
      keyframeCache: new Map([
        ["scene.html#stale", staleEntry],
        ["index.html#stale", staleEntry],
        ["stale", staleEntry],
        ["other.html#other", otherEntry],
        ["other", otherEntry],
      ]),
      gsapAnimations: new Map([
        ["scene.html#stale", [staleAnimation]],
        ["index.html#stale", [staleAnimation]],
        ["stale", [staleAnimation]],
        ["other.html#other", [staleAnimation]],
        ["other", [staleAnimation]],
      ]),
    });
    const snapshots: Array<{ cacheKeys: string[]; animationKeys: string[] }> = [];
    const unsubscribe = usePlayerStore.subscribe((state) => {
      snapshots.push({
        cacheKeys: [...state.keyframeCache.keys()].sort(),
        animationKeys: [...state.gsapAnimations.keys()].sort(),
      });
    });

    replaceKeyframeCacheForFile(
      "scene.html",
      new Map([["fresh", entry()]]),
      new Map([["fresh", [freshAnimation]]]),
    );
    unsubscribe();

    expect(snapshots).toEqual([
      {
        cacheKeys: ["fresh", "index.html#fresh", "other", "other.html#other", "scene.html#fresh"],
        animationKeys: [
          "fresh",
          "index.html#fresh",
          "other",
          "other.html#other",
          "scene.html#fresh",
        ],
      },
    ]);
    expect(usePlayerStore.getState().gsapAnimations.get("scene.html#fresh")).toEqual([
      freshAnimation,
    ]);
  });
});

describe("updateKeyframeCacheFromParsed", () => {
  it("records colliding animation targets with their own tween percentages", () => {
    const animation = (
      id: string,
      propertyGroup: string,
      properties: Record<string, number>,
      percentage: number,
      resolvedStart: number,
    ): GsapAnimation => ({
      ...animWithKeyframes(id),
      targetSelector: "#hero",
      propertyGroup,
      resolvedStart,
      keyframes: { format: "percentage", keyframes: [{ percentage, properties }] },
    });

    usePlayerStore.setState({
      elements: [{ id: "hero", domId: "hero", tag: "div", start: 0, duration: 4, track: 0 }],
    });

    updateKeyframeCacheFromParsed(
      [
        animation("hero-position", "position", { x: 100 }, 50, 0.5),
        animation("hero-visual", "visual", { opacity: 1 }, 80, 0.2),
        animation("hero-position", "position", { y: 50 }, 25, 0.75),
        animation("hero-scale", "scale", { scale: 2 }, 60, 0.4),
      ],
      "scene.html",
      "hero",
      {},
    );

    expect(cache().get("scene.html#hero")?.keyframes[0]?.collidingAnimationTargets).toEqual([
      { animationId: "hero-position", tweenPercentage: 50 },
      { animationId: "hero-visual", tweenPercentage: 80 },
      { animationId: "hero-scale", tweenPercentage: 60 },
    ]);
  });

  it("serializes a multi-keyframe tween with a stable shape and animation identity", () => {
    const animation: GsapAnimation = {
      ...animWithKeyframes("hero"),
      duration: 2,
      resolvedStart: 3,
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { x: 0 } },
          { percentage: 50, properties: { x: 100 }, ease: "power1.inOut" },
          { percentage: 100, properties: { x: 200 } },
        ],
        easeEach: "power1.inOut",
      },
    };
    usePlayerStore.setState({
      elements: [
        {
          id: "hero-clip",
          domId: "hero",
          tag: "div",
          start: 2,
          duration: 4,
          track: 0,
        },
      ],
    });

    updateKeyframeCacheFromParsed([animation], "scene.html", "hero", {});

    expect(JSON.stringify(cache().get("scene.html#hero"))).toBe(
      '{"format":"percentage","keyframes":[{"percentage":25,"properties":{"x":0},"tweenPercentage":0,"propertyGroup":"position","animationId":"hero"},{"percentage":50,"properties":{"x":100},"ease":"power1.inOut","tweenPercentage":50,"propertyGroup":"position","animationId":"hero"},{"percentage":75,"properties":{"x":200},"tweenPercentage":100,"propertyGroup":"position","animationId":"hero"}],"easeEach":"power1.inOut"}',
    );
  });

  it("clears the bare key when the selected element no longer has keyframes", () => {
    // Element previously had keyframes, so a bare entry exists (writes set both).
    seed("index.html#box");
    seed("box");

    // A mutation leaves #box without any keyframes in the parsed animations.
    updateKeyframeCacheFromParsed([], "index.html", "box", {});

    expect(cache().has("index.html#box")).toBe(false);
    // Without the bare-key clear this assertion fails: the stale entry survives
    // and PropertyPanel keeps rendering the removed keyframes.
    expect(cache().has("box")).toBe(false);
  });

  it("still writes the bare key for elements that have keyframes", () => {
    updateKeyframeCacheFromParsed([animWithKeyframes("hero")], "index.html", "hero", {});

    expect(cache().has("index.html#hero")).toBe(true);
    expect(cache().has("hero")).toBe(true);
  });

  it("caches flat tweens as clip-relative start and end keyframes", () => {
    const animation: GsapAnimation = {
      id: "flat-box",
      targetSelector: "#box",
      method: "to",
      position: 1,
      properties: { x: 420 },
      duration: 2,
      resolvedStart: 1,
      ease: "power2.out",
      propertyGroup: "position",
    };
    usePlayerStore.setState({
      elements: [{ id: "box-clip", domId: "box", tag: "div", start: 1, duration: 2, track: 0 }],
    });

    updateKeyframeCacheFromParsed([animation], "scene.html", "box", {});

    expect(cache().get("scene.html#box")).toEqual({
      format: "percentage",
      keyframes: [
        {
          percentage: 0,
          properties: { x: 0 },
          tweenPercentage: 0,
          propertyGroup: "position",
          animationId: "flat-box",
        },
        {
          percentage: 100,
          properties: { x: 420 },
          ease: "power2.out",
          tweenPercentage: 100,
          propertyGroup: "position",
          animationId: "flat-box",
        },
      ],
    });
    expect(usePlayerStore.getState().gsapAnimations.get("scene.html#box")).toEqual([animation]);
  });

  it("records an ungrouped tween in gsapAnimations too, so the two stores agree", () => {
    // `{ x, opacity }` spans two property groups, so the parser leaves
    // propertyGroup undefined. Skipping it here used to cache diamonds with no
    // source animation behind them: the collapsed row drew keyframes the
    // expanded lanes could not render.
    const animation: GsapAnimation = {
      id: "mixed-box",
      targetSelector: "#box",
      method: "to",
      position: 0,
      properties: { x: 100, opacity: 0 },
      duration: 1,
      resolvedStart: 0,
    };
    usePlayerStore.setState({
      elements: [{ id: "box-clip", domId: "box", tag: "div", start: 0, duration: 1, track: 0 }],
    });

    updateKeyframeCacheFromParsed([animation], "scene.html", "box", {});

    expect(cache().has("scene.html#box")).toBe(true);
    expect(usePlayerStore.getState().gsapAnimations.get("scene.html#box")).toEqual([animation]);
  });

  // `#stat3 .block` animates the BLOCK inside #stat3, not #stat3. An unanchored
  // `^#([\w-]+)/` prefix match filed it under "stat3", which both stole the
  // child's diamonds and collided with #stat3's own tween at the shared
  // percentage (dropping #stat3's ease as ambiguous).
  it("attributes a descendant selector to the child, not to its ancestor", () => {
    const parent: GsapAnimation = {
      id: "stat3-fromTo",
      targetSelector: "#stat3",
      method: "fromTo",
      position: 8.88,
      resolvedStart: 8.88,
      duration: 0.25,
      fromProperties: { y: 20 },
      properties: { y: 0 },
      ease: "power2.out",
      propertyGroup: "position",
    };
    const child: GsapAnimation = {
      id: "block-from",
      targetSelector: "#stat3 .block",
      method: "from",
      position: 9.13,
      resolvedStart: 9.13,
      duration: 0.3,
      properties: { opacity: 0 },
      ease: "power2.in",
      propertyGroup: "visual",
    };
    usePlayerStore.setState({
      elements: [
        { id: "stat3-clip", domId: "stat3", tag: "div", start: 8.88, duration: 1, track: 0 },
      ],
    });
    const doc = {
      querySelectorAll: (selector: string) =>
        (selector === "#stat3 .block"
          ? [{ id: "stat3-block" }]
          : []) as unknown as NodeListOf<Element>,
    } as unknown as Document;

    updateKeyframeCacheFromParsed([parent, child], "scene.html", "stat3", {}, doc);

    expect(usePlayerStore.getState().gsapAnimations.get("scene.html#stat3")).toEqual([parent]);
    expect(usePlayerStore.getState().gsapAnimations.get("scene.html#stat3-block")).toEqual([child]);
    // With the collision gone, #stat3's own curve survives instead of being
    // deleted as an ambiguous same-percentage merge.
    const parentKeyframes = cache().get("scene.html#stat3")?.keyframes ?? [];
    expect(parentKeyframes.at(-1)?.ease).toBe("power2.out");
    expect(parentKeyframes.some((keyframe) => "easeAmbiguous" in keyframe)).toBe(false);
  });

  it("attributes a descendant selector to nothing when there is no document", () => {
    const child: GsapAnimation = {
      ...animWithKeyframes("block-from"),
      targetSelector: "#stat3 .block",
    };

    updateKeyframeCacheFromParsed([child], "scene.html", "stat3", {});

    expect(cache().has("scene.html#stat3")).toBe(false);
    expect(usePlayerStore.getState().gsapAnimations.has("scene.html#stat3")).toBe(false);
  });

  it("does not cache a flat tween without animatable numeric properties", () => {
    const animation: GsapAnimation = {
      id: "flat-box",
      targetSelector: "#box",
      method: "to",
      position: 0,
      properties: { backgroundColor: "#fff" },
      duration: 1,
      propertyGroup: "visual",
    };

    updateKeyframeCacheFromParsed([animation], "scene.html", "box", {});

    expect(cache().has("scene.html#box")).toBe(false);
    expect(cache().has("box")).toBe(false);
    expect(usePlayerStore.getState().gsapAnimations.has("scene.html#box")).toBe(false);
  });
});
