// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { tryGsapDragIntercept } from "./gsapRuntimeBridge";

const WORDS = ["How", "we", "build", "videos", "at", "scale", "every", "day"];

function mountPhrase(): HTMLElement[] {
  document.body.innerHTML = `<h1>${WORDS.map(
    (word, i) => `<span class="w" data-hf-id="hf-w${i}">${word}</span>`,
  ).join("")}</h1>`;
  return [...document.querySelectorAll<HTMLElement>(".w")];
}

function wordSelection(element: HTMLElement, index: number): DomEditSelection {
  return {
    selector: ".w",
    selectorIndex: index,
    hfId: element.getAttribute("data-hf-id") ?? undefined,
    element,
  } as unknown as DomEditSelection;
}

// One staggered entrance on the shared class, the way generated titles are written.
const staggerIn = {
  id: ".w-from-200",
  targetSelector: ".w",
  method: "from",
  properties: { y: 60, opacity: 0 },
  position: 0.2,
  resolvedStart: 0.2,
  duration: 0.6,
  stagger: 0.08,
} as unknown as GsapAnimation;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("tryGsapDragIntercept: one word of a staggered phrase", () => {
  it("leaves the shared tween alone and hands the move to that word's own offset", async () => {
    const words = mountPhrase();
    const commitMutation = vi.fn();
    const outcome = await tryGsapDragIntercept(
      wordSelection(words[0]!, 0),
      { x: -40, y: 0 },
      [staggerIn],
      null,
      commitMutation,
      async () => [staggerIn],
    );
    expect(outcome).toEqual({ status: "element-offset" });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("still edits a tween that targets only the dragged word", async () => {
    const words = mountPhrase();
    const own = { ...staggerIn, id: "own", targetSelector: '[data-hf-id="hf-w0"]' };
    const commitMutation = vi.fn();
    const outcome = await tryGsapDragIntercept(
      wordSelection(words[0]!, 0),
      { x: -40, y: 0 },
      [own as GsapAnimation],
      null,
      commitMutation,
      async () => [own as GsapAnimation],
    );
    expect(outcome.status).toBe("persisted");
    expect(commitMutation).toHaveBeenCalled();
  });
});

describe("tryGsapDragIntercept: which tweens a word's drag may use", () => {
  it("edits the word's own position tween, not the shared one, when it has both", async () => {
    const words = mountPhrase();
    const own = {
      ...staggerIn,
      id: "own",
      method: "set",
      targetSelector: '[data-hf-id="hf-w0"]',
      properties: { x: 10, y: 0 },
      duration: 0,
      propertyGroup: "position",
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();
    const outcome = await tryGsapDragIntercept(
      wordSelection(words[0]!, 0),
      { x: -40, y: 0 },
      [staggerIn, own],
      null,
      commitMutation,
      async () => [staggerIn, own],
    );
    expect(outcome.status).toBe("persisted");
    const touched = commitMutation.mock.calls.map((call) => JSON.stringify(call[1]));
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((m) => !m.includes(staggerIn.id))).toBe(true);
    expect(touched.some((m) => m.includes('"own"'))).toBe(true);
  });

  it("ignores a tween whose target never reaches the word", async () => {
    document.body.innerHTML = `<div id="title"><span class="w">A</span><span class="w">B</span></div>
      <div id="subtitle"><span class="w" data-hf-id="hf-s0">C</span></div>`;
    const word = document.querySelector<HTMLElement>('[data-hf-id="hf-s0"]')!;
    const titleOnly = { ...staggerIn, id: "title-only", targetSelector: "#title .w" };
    const commitMutation = vi.fn();
    const outcome = await tryGsapDragIntercept(
      wordSelection(word, 2),
      { x: -40, y: 0 },
      [titleOnly as GsapAnimation],
      null,
      commitMutation,
      async () => [titleOnly as GsapAnimation],
    );
    expect(outcome.status).toBe("persisted");
    const touched = commitMutation.mock.calls.map((call) => JSON.stringify(call[1]));
    expect(touched.every((m) => !m.includes("title-only"))).toBe(true);
  });
});

describe("tryGsapDragIntercept: one drag is one undo step", () => {
  it("records the move under one gesture key, without splitting the mixed tween", async () => {
    document.body.innerHTML = `<div id="hero"></div>`;
    const hero = document.getElementById("hero")!;
    const mixed = {
      id: "#hero-fromTo-0",
      targetSelector: "#hero",
      method: "fromTo",
      fromProperties: { x: 0, opacity: 0 },
      properties: { x: 100, opacity: 1 },
      position: 0,
      resolvedStart: 0,
      duration: 1,
      ease: "none",
    } as unknown as GsapAnimation;
    const commitMutation = vi.fn();
    await tryGsapDragIntercept(
      { id: "hero", selector: "#hero", element: hero } as unknown as DomEditSelection,
      { x: 20, y: 0 },
      [mixed],
      null,
      commitMutation,
      async () => [mixed],
    );
    const types = commitMutation.mock.calls.map((call) => call[1].type);
    const options = commitMutation.mock.calls.map((call) => call[2]);
    expect(types).not.toContain("split-into-property-groups");
    expect(options.length).toBeGreaterThan(0);
    expect(new Set(options.map((o) => o.coalesceKey)).size).toBe(1);
    expect(options[0].coalesceKey).toMatch(/^gsap:drag:/);
    expect(options.every((o) => o.coalesceMs === Number.POSITIVE_INFINITY)).toBe(true);
  });
});
