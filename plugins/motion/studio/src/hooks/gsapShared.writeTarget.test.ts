// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGsapScript } from "@hyperframes/core/gsap-parser";
import { addAnimationWithKeyframesToScript } from "@hyperframes/parsers/gsap-writer-acorn";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { mountGroupSiblings, stableSelectionFor } from "./domSelectionTestHarness";
import { resolveSelectorElementIds, tweenTargetsElement, writeTargetSelector } from "./gsapShared";
import { commitKeyframeAtTimeImpl } from "./gsapKeyframeCommit";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { trackKeyframeCommit } from "../utils/keyframeUsage";
import type { CommitMutation } from "./gsapScriptCommitTypes";
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { promoteSetToKeyframes } from "./useEnableKeyframes";

afterEach(() => {
  document.body.innerHTML = "";
});

const BASE_SCRIPT = `
const tl = gsap.timeline({ paused: true });
tl.to("#scene", { opacity: 1, duration: 0.5 }, 0);
`.trim();

const KEYFRAMES = [
  { percentage: 0, properties: { x: 0 } },
  { percentage: 100, properties: { x: 40 } },
];

/** Author the selector into a real script and read the tween's targets back. */
function roundTripTargets(selector: string): { script: string; targets: string[] } {
  const { script } = addAnimationWithKeyframesToScript(BASE_SCRIPT, selector, 0, 1, KEYFRAMES);
  const added = parseGsapScript(script).animations.find((a) => a.targetSelector === selector);
  if (!added) throw new Error(`written selector did not re-parse: ${selector}`);
  return { script, targets: resolveSelectorElementIds(added.targetSelector, document) };
}

describe("writeTargetSelector", () => {
  it("addresses exactly one element when the only identity is a shared class", () => {
    const groups = mountGroupSiblings(5);
    const selection = stableSelectionFor(groups[2]);

    // Precondition: this is the defect's input — a bare class hitting all five.
    expect(selection.selector).toBe(".group");
    expect(document.querySelectorAll(".group")).toHaveLength(5);

    const written = writeTargetSelector(selection);

    expect(written).toBeTruthy();
    expect(document.querySelectorAll(written!)).toHaveLength(1);
    expect(document.querySelector(written!)).toBe(groups[2]);
  });

  it("keeps a unique #id target", () => {
    document.body.innerHTML = `<div id="box" class="card"></div>`;
    const el = document.querySelector<HTMLElement>("#box")!;

    expect(writeTargetSelector(stableSelectionFor(el))).toBe("#box");
  });

  it("prefers data-hf-id over a generated structural selector", () => {
    document.body.innerHTML = `
      <div id="scene"><div class="group"></div><div class="group" data-hf-id="hf-42"></div></div>
    `;
    const el = document.querySelectorAll<HTMLElement>(".group")[1]!;

    const written = writeTargetSelector(stableSelectionFor(el));

    expect(written).toBe('[data-hf-id="hf-42"]');
    expect(document.querySelector(written!)).toBe(el);
  });

  it("keeps an already-unique class selector as authored", () => {
    document.body.innerHTML = `<div id="scene"><div class="header"></div></div>`;
    const el = document.querySelector<HTMLElement>(".header")!;

    expect(writeTargetSelector(stableSelectionFor(el))).toBe(".header");
  });

  it("hands identity back to a data-hf-id ancestor part way up a deep chain", () => {
    // Mixed identity: the walk must step past the id-less <section>, stop at the
    // data-hf-id row, and NOT keep climbing to #outer.
    document.body.innerHTML = `
      <div id="outer">
        <header></header>
        <section>
          <div data-hf-id="mid">
            <div class="cell"></div>
            <div class="cell"></div>
            <div class="cell"></div>
          </div>
        </section>
      </div>
    `;
    const el = document.querySelectorAll<HTMLElement>(".cell")[2]!;

    const written = writeTargetSelector(stableSelectionFor(el));

    expect(written).toBe('[data-hf-id="mid"] > div:nth-child(3)');
    expect(document.querySelectorAll(written!)).toHaveLength(1);
    expect(document.querySelector(written!)).toBe(el);
  });

  it("falls through to the structural walk when the selection's selector is not valid CSS", () => {
    document.body.innerHTML = `<div id="scene"><div></div><div></div></div>`;
    const el = document.querySelectorAll<HTMLElement>("#scene > div")[1]!;
    // querySelectorAll throws on this, so the "does it match exactly one?" rung
    // must read as a miss rather than crashing the add.
    const selection = { ...stableSelectionFor(el), selector: "div[unclosed" } as DomEditSelection;

    expect(writeTargetSelector(selection)).toBe("#scene > div:nth-child(2)");
  });

  it("anchors on an ancestor's id in the preview, whichever window built its nodes", () => {
    const frame = document.body.appendChild(document.createElement("iframe"));
    const doc = frame.contentDocument!;
    doc.body.innerHTML = `<div id="scene"><div></div><div></div></div>`;
    const el = doc.querySelectorAll<HTMLElement>("#scene > div")[1]!;
    const selection = { ...stableSelectionFor(el), selector: "div[unclosed" } as DomEditSelection;

    expect(writeTargetSelector(selection)).toBe("#scene > div:nth-child(2)");
  });

  it("returns null when a live DOM is present and no rung addresses one element", () => {
    document.body.innerHTML = `<div id="scene"><div class="group"></div><div class="group"></div></div>`;
    const el = document.querySelectorAll<HTMLElement>(".group")[1]!;
    const selection = stableSelectionFor(el);
    expect(selection.selector).toBe(".group");
    // Detached between selecting and committing: ownerDocument still resolves,
    // but there is no parent to count a :nth-child position in. Returning
    // ".group" here would re-author the very selector this function replaces.
    el.remove();

    expect(writeTargetSelector(selection)).toBeNull();
  });

  it("still returns the selection's own selector when there is no DOM to check against", () => {
    const selection = {
      selector: ".group",
      sourceFile: "index.html",
    } as unknown as DomEditSelection;

    expect(writeTargetSelector(selection)).toBe(".group");
  });
});

describe("writeTargetSelector — write/read round trip", () => {
  it("re-parses and attributes the new tween to the one element it targeted", () => {
    const groups = mountGroupSiblings(5);
    // Ids let resolveSelectorElementIds name the attributed elements; the
    // SELECTION still has none, so the write path still faces the bare class.
    groups.forEach((el, i) => el.setAttribute("id", `group-${i}`));
    const selection = { ...stableSelectionFor(groups[2]), id: undefined } as DomEditSelection;

    const written = writeTargetSelector(selection);
    const { targets } = roundTripTargets(written!);

    expect(targets).toEqual(["group-2"]);
  });

  it("does not widen the add to the element's four class siblings", () => {
    const groups = mountGroupSiblings(5);
    groups.forEach((el, i) => el.setAttribute("id", `group-${i}`));
    const selection = { ...stableSelectionFor(groups[0]), id: undefined } as DomEditSelection;

    // The old bare-class write attributed the one add to every sibling — the
    // attribution blow-up behind "one add collapsed the timeline to a single row".
    expect(roundTripTargets(".group").targets).toHaveLength(5);

    expect(roundTripTargets(writeTargetSelector(selection)!).targets).toHaveLength(1);
  });
});

describe("existingTweenTargetSelector", () => {
  it("keeps the narrowed target when a replace re-authors the tween", async () => {
    const groups = mountGroupSiblings(5);
    const selection = stableSelectionFor(groups[2]);
    const commitMutation = vi.fn(async () => undefined);
    // A tween a previous add already narrowed to one sibling. Re-deriving the
    // target from the selection would widen it back to all five.
    const setAnim = {
      id: "a1",
      targetSelector: "#scene > div:nth-child(3)",
      method: "set",
      position: 0,
      properties: { x: 10 },
    };

    await promoteSetToKeyframes({ commitMutation } as never, selection, setAnim as never, 0, null);

    const mutation = commitMutation.mock.calls[0]?.[0] as { targetSelector: string };
    expect(mutation.targetSelector).toBe("#scene > div:nth-child(3)");
    expect(document.querySelectorAll(mutation.targetSelector)).toHaveLength(1);
  });

  it("falls back to the selection when the tween's own target did not resolve", async () => {
    const groups = mountGroupSiblings(5);
    const selection = stableSelectionFor(groups[2]);
    const commitMutation = vi.fn(async () => undefined);
    const setAnim = {
      id: "a1",
      targetSelector: "targets[i]",
      hasUnresolvedSelector: true,
      method: "set",
      position: 0,
      properties: { x: 10 },
    };

    await promoteSetToKeyframes({ commitMutation } as never, selection, setAnim as never, 0, null);

    const mutation = commitMutation.mock.calls[0]?.[0] as { targetSelector: string };
    expect(mutation.targetSelector).toBe(".group");
  });
});

describe("commitKeyframeAtTimeImpl — new-tween target", () => {
  it("authors a one-element selector when no tween exists at the playhead", async () => {
    const groups = mountGroupSiblings(5);
    const selection = stableSelectionFor(groups[3]);
    const commitMutation = vi.fn(async () => undefined);

    await commitKeyframeAtTimeImpl(selection, 1, [], { x: 12 }, commitMutation);

    const mutation = commitMutation.mock.calls[0]?.[1] as { targetSelector: string };
    expect(mutation.targetSelector).not.toBe(".group");
    expect(document.querySelectorAll(mutation.targetSelector)).toHaveLength(1);
    expect(document.querySelector(mutation.targetSelector)).toBe(groups[3]);
  });
});

describe("tweenTargetsElement", () => {
  it("matches a tween narrowed to this element by a selector the selection does not use", () => {
    const groups = mountGroupSiblings(5);
    groups[2]!.id = "narrowed";

    // The write half authored "#narrowed"; the read half still has ".group".
    expect(tweenTargetsElement("#narrowed", ".group", groups[2])).toBe(true);
  });

  it("does not hand an individual element the group tween it merely inherits", () => {
    const groups = mountGroupSiblings(5);

    // Selecting one sibling by its own address must not let an edit mutate the
    // ".group" tween: that write moves all five, not the one being nudged.
    expect(tweenTargetsElement(".group", "#scene > div:nth-child(3)", groups[2])).toBe(false);
  });

  it("still edits a group tween when the group itself is the selection", () => {
    const groups = mountGroupSiblings(5);

    expect(tweenTargetsElement(".group", ".group", groups[0])).toBe(true);
  });

  it("does not match a target that is not a selector matches() understands", () => {
    const groups = mountGroupSiblings(5);

    expect(tweenTargetsElement("div[unclosed", ".group", groups[0])).toBe(false);
  });
});

describe("commitKeyframeAtTimeImpl — no one-element target", () => {
  it("drops the keyframe rather than authoring the bare class", async () => {
    const groups = mountGroupSiblings(5);
    const selection = stableSelectionFor(groups[3]!);
    groups[3]!.remove();
    const commitMutation = vi.fn(async () => undefined);

    await commitKeyframeAtTimeImpl(selection, 1, [], { x: 12 }, commitMutation);

    expect(commitMutation).not.toHaveBeenCalled();
  });
});

it("counts a keyframe-at-time conversion and insertion as one add gesture", async () => {
  vi.clearAllMocks();
  const el = document.createElement("div");
  el.id = "target";
  document.body.append(el);
  const selection = stableSelectionFor(el);
  const animations = parseGsapScript(
    'const tl = gsap.timeline(); tl.to("#target", {x:100,duration:4},0);',
  ).animations;
  const commit: CommitMutation = async (_selection, mutation, options) => {
    trackKeyframeCommit([mutation], { ok: true, changed: true }, options);
  };
  await commitKeyframeAtTimeImpl(selection, 1, animations, { x: 25 }, commit);
  expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("keyframe", { action: "add" });
});
