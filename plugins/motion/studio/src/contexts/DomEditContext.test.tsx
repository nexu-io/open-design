// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { flushStudioPendingEdits } from "../utils/studioPendingEdits";
import { DomEditProvider, useDomEditActionsContext } from "./DomEditContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((step) => step()));

/** A resize whose save is still running, committed through the actions the canvas and panels use. */
function commitResize(save: Promise<void>) {
  const handleDomBoxSizeCommit = vi.fn(() => save);
  const value = { handleDomBoxSizeCommit } as unknown as Parameters<
    typeof DomEditProvider
  >[0]["value"];
  let actions!: ReturnType<typeof useDomEditActionsContext>;
  function Canvas() {
    actions = useDomEditActionsContext();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <DomEditProvider value={value}>
        <Canvas />
      </DomEditProvider>,
    ),
  );
  cleanup.push(() => act(() => root.unmount()));
  const committed = actions.handleDomBoxSizeCommit(
    {} as never,
    { width: 300, height: 200 },
    undefined,
  );
  return { committed, handleDomBoxSizeCommit };
}

it("undo waits for an edit committed before its save has written anything", async () => {
  let finish!: () => void;
  const { committed } = commitResize(new Promise<void>((resolve) => (finish = resolve)));
  let drained = false;
  const drain = flushStudioPendingEdits().then(() => (drained = true));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(drained).toBe(false);
  finish();
  await drain;
  await committed;
  expect(drained).toBe(true);
});

it("an edit that fails is waited out and reported to the drain, like every tracked edit", async () => {
  let fail!: (error: Error) => void;
  const { committed } = commitResize(new Promise<void>((_, reject) => (fail = reject)));
  const drain = flushStudioPendingEdits();
  const failure = new Error("blocked");
  fail(failure);
  await expect(committed).rejects.toThrow("blocked");
  await expect(drain).resolves.toEqual({ status: "failed", error: failure });
});
