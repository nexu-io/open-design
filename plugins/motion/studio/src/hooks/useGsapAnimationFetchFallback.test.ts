// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { GsapAnimation, ParsedGsap } from "@hyperframes/core/gsap-parser";
import {
  gsapSourceFileForSelection,
  selectElementAnimationsOrRetry,
  useGsapAnimationFetchFallback,
} from "./useGsapAnimationFetchFallback";
import { fetchParsedAnimations } from "./useGsapTweenCache";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

vi.mock("./useGsapTweenCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useGsapTweenCache")>()),
  fetchParsedAnimations: vi.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("gsapSourceFileForSelection", () => {
  it("uses the explicit target source instead of ambient selection state", () => {
    expect(
      gsapSourceFileForSelection({ sourceFile: "compositions/card.html" } as DomEditSelection),
    ).toBe("compositions/card.html");
  });
});

const anim = (targetSelector: string): GsapAnimation =>
  ({ id: targetSelector, targetSelector, properties: {} }) as unknown as GsapAnimation;
const parsed = (anims: GsapAnimation[]): ParsedGsap => ({ animations: anims }) as ParsedGsap;
const target = { id: "puck-a", selector: "#puck-a" };

describe("selectElementAnimationsOrRetry", () => {
  it("signals fetch-error (short retry) when the fetch itself failed (null)", () => {
    // A null parse means fetchParsedAnimations hit a 404/network/JSON failure —
    // not a parse-warming race, so it must NOT be conflated with a cold parse.
    expect(selectElementAnimationsOrRetry(null, target)).toEqual({ kind: "fetch-error" });
  });

  it("resolves to [] for a file with no tweens at all: the endpoint parses the file per request", () => {
    expect(selectElementAnimationsOrRetry(parsed([]), target)).toEqual({
      kind: "resolved",
      animations: [],
    });
  });

  it("resolves the matching animations from a warm parse", () => {
    const outcome = selectElementAnimationsOrRetry(
      parsed([anim("#puck-a"), anim("#other")]),
      target,
    );
    expect(outcome.kind).toBe("resolved");
    expect(outcome.kind === "resolved" && outcome.animations.map((a) => a.targetSelector)).toEqual([
      "#puck-a",
    ]);
  });

  it("matches a class tween through the live element, as the selected-element list does", () => {
    const element = document.createElement("div");
    element.id = "puck-a";
    element.className = "puck";
    const outcome = selectElementAnimationsOrRetry(parsed([anim(".puck")]), target, element);
    expect(outcome.kind === "resolved" && outcome.animations.map((a) => a.targetSelector)).toEqual([
      ".puck",
    ]);
  });

  it("resolves to [] (no retry) for a warm parse with no match — element genuinely has no animation", () => {
    const outcome = selectElementAnimationsOrRetry(parsed([anim("#other")]), target);
    expect(outcome).toEqual({ kind: "resolved", animations: [] });
  });
});

describe("useGsapAnimationFetchFallback", () => {
  const fetchFor = (projectId: string) => {
    let fetcher: ReturnType<typeof useGsapAnimationFetchFallback> | null = null;
    function Probe() {
      fetcher = useGsapAnimationFetchFallback(projectId);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    act(() => root.unmount());
    const element = document.createElement("div");
    return fetcher!({ id: "puck-a", selector: "#puck-a", element } as unknown as DomEditSelection);
  };

  it("answers a GSAP-free file with one parse request, no retries", async () => {
    vi.mocked(fetchParsedAnimations).mockReset().mockResolvedValue(parsed([]));
    await expect(fetchFor("demo")()).resolves.toEqual([]);
    expect(fetchParsedAnimations).toHaveBeenCalledTimes(1);
  });

  it("retries a failed fetch once, then reports no animation", async () => {
    vi.mocked(fetchParsedAnimations).mockReset().mockResolvedValue(null);
    await expect(fetchFor("demo")()).resolves.toEqual([]);
    expect(fetchParsedAnimations).toHaveBeenCalledTimes(2);
  });
});
