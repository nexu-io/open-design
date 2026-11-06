// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { DomEditGroupPathOffsetCommit } from "../components/editor/domEditOverlayGestures";
import { usePlayerStore } from "../player/store/playerStore";
import {
  beginStudioPendingEdit,
  paintBackNewestStudioPendingEdit,
} from "../utils/studioPendingEdits";
import { trackStudioEditBlocked } from "../utils/studioSaveDiagnostics";
import { GSAP_EDIT_BLOCK_COPY } from "./gsapEditOutcome";
import { mountGsapAwareEditing } from "./useGsapAwareEditing.testHelpers";

vi.mock("../utils/studioSaveDiagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/studioSaveDiagnostics")>()),
  trackStudioEditBlocked: vi.fn(),
  trackStudioSaveFailure: vi.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  usePlayerStore.setState({ autoKeyframeEnabled: true, currentTime: 1, activeKeyframePct: null });
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  Reflect.deleteProperty(window, "__timelines");
});

const positionTween = (id: string, extra: Partial<GsapAnimation> = {}) =>
  ({
    id: `#${id}-to-0-position`,
    targetSelector: `#${id}`,
    propertyGroup: "position",
    method: "to",
    properties: { x: 100 },
    position: 0,
    resolvedStart: 0,
    duration: 2,
    ease: "none",
    ...extra,
  }) as unknown as GsapAnimation;

/** Three members GSAP is visibly moving, one `to` tween each in the file. */
function mountGroup(animations: GsapAnimation[]) {
  const elements = ["a", "b", "c"].map((id) => {
    const el = Object.assign(document.createElement("div"), { id });
    document.body.append(el);
    return el;
  });
  const live = elements.map((el) => ({
    targets: () => [el],
    vars: { x: 100, duration: 2 },
    duration: () => 2,
    startTime: () => 0,
  }));
  const timelines = { root: { getChildren: () => live, duration: () => 2 } };
  Reflect.set(window, "__timelines", timelines);
  const iframe = {
    contentWindow: { gsap: { getProperty: () => 0, set: vi.fn() }, __timelines: timelines },
    contentDocument: document,
  } as unknown as HTMLIFrameElement;
  const commitMutation = Object.assign(vi.fn().mockResolvedValue(undefined), {
    batch: vi.fn().mockResolvedValue(undefined),
  });
  const showToast = vi.fn();
  const stageElementPositionOffset = vi.fn((selection: DomEditSelection) => {
    selection.element.style.setProperty("translate", "30px 0px");
    return { save: vi.fn().mockResolvedValue(undefined), rollback: vi.fn() };
  });
  const { editing, root } = mountGsapAwareEditing({
    gsapCommitMutation: commitMutation,
    activeCompPath: "index.html",
    previewIframeRef: { current: iframe },
    showToast,
    makeFetchFallback: () => async () => animations,
    stageElementPositionOffset,
  });
  const groupCommit = (updates: DomEditGroupPathOffsetCommit[]) =>
    editing().handleGsapAwareGroupPathOffsetCommit(updates);
  const updates = elements.map((element) => ({
    selection: {
      element,
      id: element.id,
      selector: `#${element.id}`,
    } as unknown as DomEditSelection,
    next: { x: 30, y: 0 },
  }));
  const written = () => [
    ...commitMutation.mock.calls.map((call) => call[1]),
    ...commitMutation.batch.mock.calls.flatMap(([calls]) =>
      calls.map((c: { mutation: unknown }) => c.mutation),
    ),
  ];
  return { elements, iframe, updates, groupCommit, commitMutation, written, showToast, root };
}

describe("a group drag plans every member before its first write", () => {
  it("refuses the whole group when one member's tween cannot take a keyframe", async () => {
    const h = mountGroup([
      positionTween("a"),
      positionTween("b", { ease: undefined }),
      positionTween("c"),
    ]);
    const styles = h.elements.map((el) => el.getAttribute("style"));

    await expect(h.groupCommit(h.updates)).rejects.toMatchObject({
      name: "GsapEditBlockedError",
      reason: "keyframes-uneditable",
      detail: "unknown-ease",
    });

    expect(h.written()).toEqual([]);
    expect(h.commitMutation.batch).not.toHaveBeenCalled();
    const gsap = (h.iframe.contentWindow as unknown as { gsap: { set: unknown } }).gsap;
    expect(gsap.set).not.toHaveBeenCalled();
    expect(h.elements.map((el) => el.getAttribute("style"))).toEqual(styles);
    expect(h.showToast).toHaveBeenCalledTimes(1);
    expect(h.showToast).toHaveBeenCalledWith(GSAP_EDIT_BLOCK_COPY["keyframes-uneditable"], "error");
    expect(trackStudioEditBlocked).toHaveBeenCalledTimes(1);
    expect(trackStudioEditBlocked).toHaveBeenCalledWith(expect.objectContaining({ targetId: "b" }));
    act(() => h.root.unmount());
  });

  it("with auto-keyframe off, refuses the whole group when one member's step list holds a step delay", async () => {
    usePlayerStore.setState({ autoKeyframeEnabled: false });
    const steps = {
      format: "object-array",
      keyframes: [
        { percentage: 50, properties: { x: 100, y: 0, delay: 0.5 } },
        { percentage: 100, properties: { x: 200, y: 0 } },
      ],
    };
    const h = mountGroup([
      positionTween("a"),
      positionTween("b", { keyframes: steps } as Partial<GsapAnimation>),
      positionTween("c"),
    ]);

    await expect(h.groupCommit(h.updates)).rejects.toMatchObject({
      reason: "keyframes-uneditable",
      detail: "array-step-delay",
    });

    expect(h.written()).toEqual([]);
    expect(trackStudioEditBlocked).toHaveBeenCalledWith(expect.objectContaining({ targetId: "b" }));
    act(() => h.root.unmount());
  });

  it("refuses members animated in two files, since the batch writes one file", async () => {
    const h = mountGroup(["a", "b", "c"].map((id) => positionTween(id)));
    const updates = h.updates.map((u, i) => ({
      ...u,
      selection: { ...u.selection, sourceFile: i === 2 ? "scenes/intro.html" : "index.html" },
    }));

    await expect(h.groupCommit(updates)).rejects.toMatchObject({ reason: "mixed-files" });

    expect(h.written()).toEqual([]);
    expect(trackStudioEditBlocked).toHaveBeenCalledWith(expect.objectContaining({ targetId: "c" }));
    act(() => h.root.unmount());
  });

  it("writes a group whose members name the open file or leave it implied", async () => {
    const h = mountGroup(["a", "b", "c"].map((id) => positionTween(id)));
    const updates = h.updates.map((u, i) => ({
      ...u,
      selection: { ...u.selection, sourceFile: i === 0 ? "" : "index.html" },
    }));

    await h.groupCommit(updates);

    expect(h.written()).toHaveLength(3);
    act(() => h.root.unmount());
  });

  it("writes every member when each plan holds", async () => {
    const h = mountGroup(["a", "b", "c"].map((id) => positionTween(id)));

    await h.groupCommit(h.updates);

    const ids = h.written().map((m) => (m as { animationId?: string }).animationId);
    expect(ids).toEqual(["#a-to-0-position", "#b-to-0-position", "#c-to-0-position"]);
    expect(h.showToast).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });
});

it("keeps a member it moves on its own CSS undone when undo painted the group back", async () => {
  const h = mountGroup(["b", "c"].map((id) => positionTween(id)));
  const plain = h.elements[0]!;
  const edit = beginStudioPendingEdit(() => {
    const shown = plain.getAttribute("style") ?? "";
    plain.setAttribute("style", "");
    return () => plain.setAttribute("style", shown);
  });
  const saved = edit.adopt(() =>
    h.groupCommit(h.updates.map((u, i) => (i === 0 ? { ...u, plainTranslate: true } : u))),
  );
  edit.settle(saved);
  const shown = paintBackNewestStudioPendingEdit();

  await act(() => saved);
  expect(plain.getAttribute("style")).toBe("");
  shown!.showAgain();
  expect(plain.getAttribute("style")).toContain("translate: 30px 0px");
  act(() => h.root.unmount());
});
