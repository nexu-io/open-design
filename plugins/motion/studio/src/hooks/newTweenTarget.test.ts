// @vitest-environment jsdom
/**
 * Sibling writers of the "add keyframe at playhead" path fixed in
 * gsapShared.writeTarget.test.ts. Every mutation that authors a NEW tween must
 * address ONE element; a bare class attributes the write to every sibling that
 * shares it, which is what collapsed the timeline to a single row.
 *
 * Same round trip as the U3 test: author through the real writer, re-parse with
 * the real parser, resolve through the very function that feeds the keyframe
 * cache and the lanes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGsapScript } from "@hyperframes/core/gsap-parser";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { mountGroupSiblings, stableSelectionFor } from "./domSelectionTestHarness";
import { resolveSelectorElementIds } from "./gsapShared";
import { ensureElementAddressable } from "./gsapScriptCommitHelpers";
import {
  commitStaticGsapPosition,
  commitStaticGsapRotation,
  commitStaticGsapSize,
  commitWholePathOffset,
  findExistingPositionWrite,
} from "./gsapDragCommit";
import { promoteSetToKeyframes } from "./useEnableKeyframes";
import { commitValueAtPlayhead } from "./gsapValueAtPlayhead";

afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * The selection production hands these writers: the element HAS an id in the
 * DOM (so resolveSelectorElementIds can name it) but the SELECTION carries none,
 * which is the id-less shape buildStableSelector answers with a bare class.
 */
function classOnlySelection(el: HTMLElement): DomEditSelection {
  return { ...stableSelectionFor(el), id: undefined, selector: ".group" } as DomEditSelection;
}

/** The elements a written targetSelector actually attributes the tween to. */
function attributedTo(targetSelector: string): string[] {
  return resolveSelectorElementIds(targetSelector, document);
}

function recorder() {
  const mutations: Array<Record<string, unknown>> = [];
  const commitMutation = vi.fn(async (_sel, mutation, _opts) => {
    mutations.push(mutation as Record<string, unknown>);
  });
  return { mutations, callbacks: { commitMutation } as never };
}

/** Every `targetSelector` a run of mutations wrote. */
function writtenTargets(mutations: Array<Record<string, unknown>>): string[] {
  return mutations.map((m) => m.targetSelector).filter((s): s is string => typeof s === "string");
}

describe("ensureElementAddressable — add-animation button", () => {
  it("addresses one element when the selection's only identity is a shared class", () => {
    // Truly id-less siblings: the shape production reaches this path with (an
    // element WITH an id never gets here, selection.id short-circuits above).
    document.body.innerHTML = `
      <div id="scene" class="clip">
        <div class="group"></div><div class="group"></div><div class="group"></div>
      </div>
    `;
    const el = document.querySelectorAll<HTMLElement>(".group")[1]!;
    const selection = stableSelectionFor(el);
    expect(selection.selector).toBe(".group");

    const { selector, autoId } = ensureElementAddressable(selection);

    expect(autoId).toBeTruthy();
    expect(el.hasAttribute("id")).toBe(false);
    // addGsapAnimation sets the id the server confirms; the proposal is free in the preview.
    el.setAttribute("id", autoId!);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(el);
    expect(attributedTo(selector)).toEqual([autoId]);
  });

  it("keeps a unique #id target", () => {
    document.body.innerHTML = `<div id="box" class="card"></div>`;
    const el = document.querySelector<HTMLElement>("#box")!;

    expect(ensureElementAddressable(stableSelectionFor(el)).selector).toBe("#box");
  });

  it("keeps an already-unique class selector as authored", () => {
    document.body.innerHTML = `<div id="scene"><div class="header"></div></div>`;
    const el = document.querySelector<HTMLElement>(".header")!;

    expect(ensureElementAddressable(stableSelectionFor(el)).selector).toBe(".header");
  });

  it("still mints an id when there is no live element to disambiguate against", () => {
    document.body.innerHTML = `<div id="scene"><div></div></div>`;
    const el = document.querySelector<HTMLElement>("#scene > div")!;
    const selection = { ...stableSelectionFor(el), selector: undefined } as DomEditSelection;

    const { selector, autoId } = ensureElementAddressable(selection);

    expect(autoId).toBe("div");
    expect(selector).toBe("#div");
  });
});

/** Moves the middle of five class-only siblings with no position yet; returns the selector written. */
async function positionMiddleSibling(): Promise<string> {
  const groups = mountGroupSiblings(5, true);
  const { mutations, callbacks } = recorder();
  await commitStaticGsapPosition(
    classOnlySelection(groups[2]!),
    { x: 10, y: 10 },
    { x: 0, y: 0 },
    ".group",
    null,
    callbacks,
  );
  return writtenTargets(mutations)[0]!;
}

describe("gsapDragCommit — new-tween targets", () => {
  it("commitStaticGsapPosition authors the new set against one element", async () => {
    expect(attributedTo(await positionMiddleSibling())).toEqual(["group-2"]);
  });

  it("commitStaticGsapRotation authors the new set against one element", async () => {
    const groups = mountGroupSiblings(5, true);
    const { mutations, callbacks } = recorder();

    await commitStaticGsapRotation(classOnlySelection(groups[1]!), 42, ".group", null, callbacks);

    expect(attributedTo(writtenTargets(mutations)[0]!)).toEqual(["group-1"]);
  });

  it("commitStaticGsapSize authors the new set against one element", async () => {
    const groups = mountGroupSiblings(5, true);
    const { mutations, callbacks } = recorder();

    await commitStaticGsapSize(
      classOnlySelection(groups[4]!),
      { width: 100, height: 50 },
      ".group",
      null,
      callbacks,
    );

    expect(attributedTo(writtenTargets(mutations)[0]!)).toEqual(["group-4"]);
  });

  it("a keyframe edit refuses a tween its siblings share instead of moving them all", async () => {
    const groups = mountGroupSiblings(5, true);
    const { mutations, callbacks } = recorder();
    const sharedTween = {
      id: "t1",
      targetSelector: ".group",
      method: "to",
      properties: { width: 120 },
      resolvedStart: 0,
      duration: 2,
      ease: "none",
    } as unknown as GsapAnimation;

    const outcome = await commitValueAtPlayhead(
      classOnlySelection(groups[3]!),
      sharedTween,
      { width: 80 },
      null,
      callbacks,
      { label: "Resize" },
    );

    expect(outcome).toMatchObject({ status: "blocked", detail: "shared-tween" });
    expect(mutations).toEqual([]);
  });

  it("commitStaticGsapPosition replaces a corrupt keyframed hold against one element", async () => {
    const groups = mountGroupSiblings(5, true);
    const { mutations, callbacks } = recorder();
    const corruptHold = {
      id: "hold-1",
      targetSelector: ".group",
      method: "to",
      properties: {},
      duration: 0,
      keyframes: { keyframes: [{ percentage: 0, properties: { x: 0, y: 0 } }] },
    } as unknown as GsapAnimation;

    await commitStaticGsapPosition(
      classOnlySelection(groups[0]!),
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      ".group",
      corruptHold,
      callbacks,
    );

    expect(attributedTo(writtenTargets(mutations)[0]!)).toEqual(["group-0"]);
  });
});

describe("gsapDragCommit — retargeting an existing tween is left alone", () => {
  it("commitWholePathOffset keeps the tween's own group target", async () => {
    const groups = mountGroupSiblings(5, true);
    const { mutations, callbacks } = recorder();
    const groupTween = {
      id: "t-group",
      targetSelector: ".group",
      method: "to",
      properties: { x: 100 },
      resolvedStart: 0,
      duration: 2,
    } as unknown as GsapAnimation;

    await commitWholePathOffset(
      classOnlySelection(groups[2]!),
      groupTween,
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      null,
      ".group",
      callbacks,
    );

    // A tween the author aimed at all five siblings must STAY aimed at all five:
    // narrowing it here would silently drop four elements out of the animation.
    expect(writtenTargets(mutations)[0]).toBe(".group");
    expect(attributedTo(writtenTargets(mutations)[0]!)).toHaveLength(5);
  });
});

/**
 * The write selector and the "is there already a write for this element?"
 * lookup are two halves of one contract. Narrowing only the write half would
 * make the next nudge miss its own previous write and append a second one — the
 * duplicate-position-write bug findExistingPositionWrite exists to prevent.
 */
describe("a re-nudge updates its own previous write instead of stacking a second one", () => {
  it("finds the write the first nudge authored", async () => {
    const groups = mountGroupSiblings(5, true);
    const selection = classOnlySelection(groups[2]!);
    const first = recorder();

    await commitStaticGsapPosition(
      selection,
      { x: 10, y: 10 },
      { x: 0, y: 0 },
      ".group",
      null,
      first.callbacks,
    );
    const written = writtenTargets(first.mutations)[0]!;

    // Read the first write back the way the next drag does: parse the source,
    // then run the production lookup for this element's position write.
    const script = `
const tl = gsap.timeline({ paused: true });
gsap.set(${JSON.stringify(written)}, { x: 10, y: 10 });
`.trim();
    const animations = parseGsapScript(script).animations;
    const existing = findExistingPositionWrite(animations, ".group", selection.element);
    expect(existing).toBeTruthy();

    const second = recorder();
    await commitStaticGsapPosition(
      selection,
      { x: 5, y: 0 },
      { x: 10, y: 10 },
      ".group",
      existing,
      second.callbacks,
    );

    expect(second.mutations[0]!.type).toBe("update-properties");
    expect(second.mutations[0]!.animationId).toBe(existing!.id);
  });
});

/**
 * Candidate C. Every `replace-with-keyframes` in useEnableKeyframes names an
 * `animationId` parsed out of the CURRENT SOURCE (the anims list comes from
 * tryFetchAnimationsForElement), so each one rewrites a tween the author already
 * has. Narrowing those to one element would silently drop the other four
 * siblings out of an animation that was aimed at the group on purpose.
 */
describe("useEnableKeyframes — rewriting an existing tween keeps its group target", () => {
  it("promoteSetToKeyframes leaves a group-authored set aimed at the group", async () => {
    const groups = mountGroupSiblings(5, true);
    const mutations: Array<Record<string, unknown>> = [];
    const setAnim = {
      id: "set-group",
      targetSelector: ".group",
      method: "set",
      properties: { x: 0, y: 0 },
      resolvedStart: 0,
      duration: 0,
    } as unknown as GsapAnimation;
    const session = {
      commitMutation: async (mutation: Record<string, unknown>) => {
        mutations.push(mutation);
      },
      handleGsapRemoveKeyframe: vi.fn(),
    };

    // Playhead at the set: the branch that replaces it with a single keyframe,
    // which can source its value from the set itself (no live iframe needed).
    await promoteSetToKeyframes(session as never, classOnlySelection(groups[2]!), setAnim, 0, null);

    expect(mutations[0]!.type).toBe("replace-with-keyframes");
    expect(mutations[0]!.animationId).toBe("set-group");
    expect(mutations[0]!.targetSelector).toBe(".group");
    expect(attributedTo(mutations[0]!.targetSelector as string)).toHaveLength(5);
  });
});

describe("the written selector survives the real writer and parser", () => {
  it("re-parses to a tween attributed to the one element it targeted", async () => {
    const written = await positionMiddleSibling();

    const script = `
const tl = gsap.timeline({ paused: true });
gsap.set(${JSON.stringify(written)}, { x: 10, y: 10 });
`.trim();
    const parsed = parseGsapScript(script).animations.find((a) => a.targetSelector === written);

    expect(parsed).toBeTruthy();
    expect(resolveSelectorElementIds(parsed!.targetSelector, document)).toEqual(["group-2"]);
  });
});
