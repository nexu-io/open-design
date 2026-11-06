// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// React's act() emits a warning unless the runtime is flagged as a test env.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { CommitMutation } from "./gsapScriptCommitTypes";
import { useSafeGsapCommitMutation } from "./useSafeGsapCommitMutation";

/**
 * Regression: the safe wrapper used to `void` the commit and return undefined, so
 * the facade resolved IMMEDIATELY — consumers that `await session.commitMutation`
 * (gesture recording, enable-keyframes) fired their post-actions (toast, reseek,
 * "idle") BEFORE the server save landed. The wrapper must now RETURN the chain so
 * awaiters resolve only after the save (and its error handling) settles.
 */

const selection = { id: "box", selector: "#box" } as unknown as DomEditSelection;

// Mount a hook and capture its return value via a ref.
function renderSafeCommit(
  commitMutation: CommitMutation,
  showToast?: (message: string, tone?: "error" | "info") => void,
) {
  const captured: { fn: ReturnType<typeof useSafeGsapCommitMutation> | null } = { fn: null };
  function Probe() {
    captured.fn = useSafeGsapCommitMutation(commitMutation, vi.fn(), showToast);
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Probe));
  });
  return captured.fn!;
}

describe("useSafeGsapCommitMutation — returned promise settles after the commit", () => {
  it("resolves only after the underlying commit resolves", async () => {
    let resolveCommit!: () => void;
    const order: string[] = [];
    const commitMutation: CommitMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCommit = () => {
            order.push("commit-settled");
            resolve();
          };
        }),
    );

    const safe = renderSafeCommit(commitMutation);
    const awaited = safe(selection, { type: "noop" }, { label: "test" }).then(() => {
      order.push("awaiter-resumed");
    });

    // Give the microtask queue a chance — the awaiter must NOT have resumed yet
    // because the commit is still pending.
    await Promise.resolve();
    expect(order).toEqual([]);

    resolveCommit();
    await awaited;
    expect(order).toEqual(["commit-settled", "awaiter-resumed"]);
  });

  it("resolves (success-after-handled) after a failed commit, surfacing a toast", async () => {
    const showToast = vi.fn();
    const order: string[] = [];
    const commitMutation: CommitMutation = vi.fn(async () => {
      order.push("commit-rejected");
      throw new Error("save failed");
    });

    const safe = renderSafeCommit(commitMutation, showToast);
    await safe(selection, { type: "noop" }, { label: "test" });
    order.push("awaiter-resumed");

    // The awaiter resumes AFTER the rejection was handled, and the promise does
    // not reject (the .catch swallows it for the toast).
    expect(order).toEqual(["commit-rejected", "awaiter-resumed"]);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't save"), "error");
  });
});
