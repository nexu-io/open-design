// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installReactActEnvironment, makeSelection } from "../../hooks/domSelectionTestHarness";
import { resolveZIndexEntries } from "./useDomEditZOrder";
import { useElementLifecycleOps } from "../../hooks/useElementLifecycleOps";
import { makeLifecycleOpsParams } from "../../hooks/elementLifecycleOpsTestUtils";
import type { DomEditPatchBatch } from "../../hooks/domEditCommitTypes";
import { CanvasContextMenu } from "./CanvasContextMenu";
import type { ZOrderAction, ZOrderPatch } from "./canvasContextMenuZOrder";
import type { DomEditSelection } from "./domEditing";

installReactActEnvironment();

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderMenu(props: {
  selection: DomEditSelection;
  onApplyZIndex?: (patches: ZOrderPatch[], action: ZOrderAction) => void;
  onZOrderCrossed?: (crossed: HTMLElement, action: ZOrderAction) => void;
  onDelete?: (selection: DomEditSelection) => void;
}) {
  root = createRoot(host);
  act(() => {
    root!.render(
      React.createElement(CanvasContextMenu, {
        x: 10,
        y: 10,
        selection: props.selection,
        onClose: () => {},
        onApplyZIndex: props.onApplyZIndex,
        onZOrderCrossed: props.onZOrderCrossed,
        onDelete: props.onDelete,
      }),
    );
  });
}

/** All menu buttons live in the portal under document.body. */
function menuButtons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll("button")];
}

function hasDeleteItem(): boolean {
  return menuButtons().some((b) => b.textContent?.includes("Delete"));
}

function zOrderButtons(): HTMLButtonElement[] {
  return menuButtons().filter((b) => !b.textContent?.includes("Delete"));
}

describe("CanvasContextMenu — handler gating", () => {
  it("renders all four z-order items, a divider, and Delete when both handlers are present", () => {
    const el = document.createElement("div");
    el.id = "target";
    document.body.append(el);

    renderMenu({
      selection: makeSelection("Target", el),
      onApplyZIndex: vi.fn(),
      onDelete: vi.fn(),
    });

    expect(zOrderButtons()).toHaveLength(4);
    expect(hasDeleteItem()).toBe(true);
    // The divider only appears between the two groups.
    expect(document.body.querySelector(".border-t")).not.toBeNull();
  });

  it("hides every item and does NOT render the menu when no handlers are present", () => {
    const el = document.createElement("div");
    el.id = "target";
    // A z-index that a stray optimistic write would clobber — assert it is
    // untouched, since the menu must not mutate the DOM without a persist path.
    el.style.zIndex = "3";
    document.body.append(el);

    renderMenu({ selection: makeSelection("Target", el) });

    // No menu opened at all — no buttons, no dead-end items, no DOM mutation.
    expect(menuButtons()).toHaveLength(0);
    expect(document.body.querySelector(".fixed.z-\\[200\\]")).toBeNull();
    expect(el.style.zIndex).toBe("3");
  });

  it("shows only the z-order items (no Delete, no divider) when onDelete is absent", () => {
    const el = document.createElement("div");
    el.id = "target";
    document.body.append(el);

    renderMenu({ selection: makeSelection("Target", el), onApplyZIndex: vi.fn() });

    const buttons = zOrderButtons();
    expect(buttons).toHaveLength(4);
    expect(hasDeleteItem()).toBe(false);
    expect(document.body.querySelector(".border-t")).toBeNull();

    // Labels stay the exact industry-standard names (the icons add no text)...
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Bring to front",
      "Bring forward",
      "Send backward",
      "Send to back",
    ]);
    // ...and each item leads with a stroke icon that inherits the item's text
    // color (currentColor), so the disabled muted tone applies to it too.
    for (const button of buttons) {
      const svg = button.firstElementChild;
      expect(svg?.tagName.toLowerCase()).toBe("svg");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("shows only Delete (no z-order items, no divider) when onApplyZIndex is absent", () => {
    const el = document.createElement("div");
    el.id = "target";
    document.body.append(el);

    renderMenu({ selection: makeSelection("Target", el), onDelete: vi.fn() });

    expect(zOrderButtons()).toHaveLength(0);
    expect(hasDeleteItem()).toBe(true);
    expect(document.body.querySelector(".border-t")).toBeNull();
  });
});

// ── Menu z-action → commit path (wired the way ConnectedDomEditOverlay wires the app) ──

function pressMenuItem(label: string) {
  const button = zOrderButtons().find((b) => b.textContent === label);
  expect(button).toBeDefined();
  act(() => {
    button!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

/** Target (static, earlier in DOM) below an equal-z sibling — z action must renumber. */
function makeStaticFamily() {
  const parent = document.createElement("div");
  const target = document.createElement("div");
  target.id = "target";
  // In happy-dom an unset computed position is "" (not "static"), which would
  // skip the commit hook's static-position injection; declare it explicitly so
  // the test exercises the browser default.
  target.style.position = "static";
  const other = document.createElement("div");
  other.id = "other";
  parent.append(target, other);
  document.body.append(parent);
  return { parent, target, other };
}

interface CapturedBatchCall {
  batches: DomEditPatchBatch[];
  options: { label: string; coalesceKey: string };
}

/** Mount the REAL commit hook (persist layer mocked at commitDomEditPatchBatches). */
function renderCommitHook(captured: CapturedBatchCall[]) {
  type Commit = ReturnType<typeof useElementLifecycleOps>["handleDomZIndexReorderCommit"];
  let commit: Commit | undefined;
  function Harness() {
    ({ handleDomZIndexReorderCommit: commit } = useElementLifecycleOps(
      makeLifecycleOpsParams({
        commitDomEditPatchBatches: async (batches, options) => {
          captured.push({ batches, options });
          return { durable: true, allMatched: true, changed: true };
        },
      }),
    ));
    return null;
  }
  const hookHost = document.createElement("div");
  document.body.append(hookHost);
  const hookRoot = createRoot(hookHost);
  act(() => hookRoot.render(<Harness />));
  return { commit: commit!, cleanup: () => act(() => hookRoot.unmount()) };
}

describe("resolveZIndexEntries", () => {
  it("keys a same-class sibling by its index among them, not as the first of its class", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const [first, second, selected] = ["card", "card", "picked"].map((name) => {
      const child = parent.appendChild(document.createElement("div"));
      child.className = name;
      return child;
    });
    const { entries } = resolveZIndexEntries(
      makeSelection("Picked", selected!),
      [first!, second!].map((element, zIndex) => ({ element, zIndex })),
      null,
    );
    expect(entries.map((entry) => [entry.selector, entry.selectorIndex])).toEqual([
      [".card", 0],
      [".card", 1],
    ]);
    parent.remove();
  });
});

describe("CanvasContextMenu — z-action commit path", () => {
  it("never mutates live styles itself and persists the position patch for a static element", async () => {
    const { target } = makeStaticFamily();
    const selection = makeSelection("Target", target);
    const captured: CapturedBatchCall[] = [];
    const { commit, cleanup } = renderCommitHook(captured);

    // Wire onApplyZIndex the way the app does (ConnectedDomEditOverlay → the commit
    // hook), asserting the menu has NOT touched the DOM when it fires — the
    // hook must capture true pre-change styles for its rollback.
    const stylesAtApply: Array<{ zIndex: string; position: string }> = [];
    renderMenu({
      selection,
      onApplyZIndex: (patches, action) => {
        stylesAtApply.push({ zIndex: target.style.zIndex, position: target.style.position });
        const { entries } = resolveZIndexEntries(selection, patches, null);
        void commit(entries, undefined, action);
      },
    });

    await act(async () => pressMenuItem("Bring forward"));

    // The menu left the element pristine; only the commit hook wrote styles.
    expect(stylesAtApply).toEqual([{ zIndex: "", position: "static" }]);
    expect(target.style.zIndex).toBe("1");
    expect(target.style.position).toBe("relative");

    // The persisted payload carries BOTH the z-index and the injected position,
    // so the reorder survives the post-commit reloadPreview().
    expect(captured).toHaveLength(1);
    const targetPatch = captured[0]?.batches
      .flatMap((batch) => batch.patches)
      .find((patch) => patch.target.id === "target");
    expect(targetPatch?.operations).toEqual(
      expect.arrayContaining([
        { type: "inline-style", property: "z-index", value: "1" },
        { type: "inline-style", property: "position", value: "relative" },
      ]),
    );
    // F7: the action kind is part of the default undo coalesce key, so two
    // different menu actions never merge into one undo step.
    expect(captured[0]?.options.coalesceKey).toContain("bring-forward");

    cleanup();
  });

  it("reports the crossed sibling to onZOrderCrossed for a forward step (resolved pre-mutation)", async () => {
    // target (earlier in DOM) and other are tied — bring-forward steps over
    // `other`, and the flash callback must receive exactly that element, after
    // onApplyZIndex ran (call order lets the host measure post-commit rects).
    const { target, other } = makeStaticFamily();
    const selection = makeSelection("Target", target);
    const calls: Array<{ kind: string; crossed?: HTMLElement }> = [];

    renderMenu({
      selection,
      onApplyZIndex: () => calls.push({ kind: "apply" }),
      onZOrderCrossed: (crossed, action) => {
        expect(action).toBe("bring-forward");
        calls.push({ kind: "crossed", crossed });
      },
    });

    await act(async () => pressMenuItem("Bring forward"));

    expect(calls.map((c) => c.kind)).toEqual(["apply", "crossed"]);
    expect(calls[1]?.crossed).toBe(other);
  });

  it("does not call onZOrderCrossed for bring-to-front", async () => {
    const { target } = makeStaticFamily();
    const onZOrderCrossed = vi.fn();

    renderMenu({
      selection: makeSelection("Target", target),
      onApplyZIndex: vi.fn(),
      onZOrderCrossed,
    });

    await act(async () => pressMenuItem("Bring to front"));

    expect(onZOrderCrossed).not.toHaveBeenCalled();
  });
});
