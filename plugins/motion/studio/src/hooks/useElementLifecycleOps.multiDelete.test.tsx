// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementLifecycleOps } from "./useElementLifecycleOps";
import { makeLifecycleOpsParams } from "./elementLifecycleOpsTestUtils";
import { mountReactHarness, makeSelection } from "./domSelectionTestHarness";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function selectionFor(id: string) {
  const el = document.createElement("div");
  el.id = id;
  document.body.append(el);
  return { ...makeSelection(id, el), sourceFile: "index.html" };
}

function mountDeleteOps(overrides: Partial<Parameters<typeof useElementLifecycleOps>[0]> = {}) {
  const captured: { ops: ReturnType<typeof useElementLifecycleOps> | null } = { ops: null };
  function Probe() {
    captured.ops = useElementLifecycleOps(
      makeLifecycleOpsParams({
        commitDomEditPatchBatches: vi.fn(async () => ({ ok: true }) as never),
        ...overrides,
      }),
    );
    return null;
  }
  mountReactHarness(<Probe />);
  if (!captured.ops) throw new Error("hook did not initialize");
  return captured.ops;
}

describe("useElementLifecycleOps — deleting a canvas multi-selection", () => {
  const removed: string[] = [];
  const requests: string[] = [];
  let changes = true;
  let removeOk = true;

  beforeEach(() => {
    removed.length = 0;
    requests.length = 0;
    changes = true;
    removeOk = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const requestUrl = String(url);
        requests.push(requestUrl);
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          targets?: { id?: string; selector?: string }[];
        };
        const keys = (body.targets ?? [])
          .map((target) => target.id ?? target.selector)
          .filter((key): key is string => key !== undefined);
        removed.push(...keys);
        const isRemove = requestUrl.includes("/file-mutations/remove-elements/");
        const status = isRemove && !removeOk ? 500 : 200;
        return {
          ok: status === 200,
          status,
          text: async () => (status === 200 ? "" : "server said no"),
          json: async () => ({ changed: changes, content: "<html></html>" }),
        } as unknown as Response;
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("removes every selected element, not just the first", async () => {
    // The reported bug: select several elements on the canvas, press Delete, and
    // one disappears while the rest stay — still drawn as selected.
    const ops = mountDeleteOps({ projectIdRef: { current: "p1" } });

    const selections = ["a", "b", "c"].map(selectionFor);
    let outcome: unknown;
    await act(async () => {
      outcome = await ops.handleDomEditElementsDelete(selections);
    });

    // The defect: only the first was ever removed.
    expect(removed).toEqual(["a", "b", "c"]);
    // And one request for the selection, not one per member: a canvas selection
    // runs to hundreds, and a round trip each made Delete look like a no-op.
    expect(requests.filter((url) => url.includes("remove-elements"))).toHaveLength(1);
    expect(outcome).toEqual({ ok: true });
  });

  it("reports a successful SDK delete as landed", async () => {
    const ops = mountDeleteOps({
      projectIdRef: { current: "p1" },
      onTrySdkDelete: vi.fn(
        async () => ({ status: "committed", version: "v1", before: "", after: "" }) as const,
      ),
    });

    const target = { ...selectionFor("a"), hfId: "hf-a" };
    let outcome: unknown;
    await act(async () => {
      outcome = await ops.handleDomEditElementsDelete([target]);
    });

    expect(outcome).toEqual({ ok: true });
    expect(requests.some((url) => url.includes("remove-elements"))).toBe(false);
  });

  it("reports missing project and selection without starting a request", async () => {
    const projectIdRef = { current: null as string | null };
    const ops = mountDeleteOps({ projectIdRef });

    await expect(ops.handleDomEditElementsDelete([selectionFor("a")])).resolves.toEqual({
      ok: false,
      reason: "no-project",
    });
    projectIdRef.current = "p1";
    await expect(ops.handleDomEditElementsDelete([])).resolves.toEqual({
      ok: false,
      reason: "no-selection",
    });
    expect(requests).toEqual([]);
  });

  it("reports an HTTP write failure instead of only toasting", async () => {
    removeOk = false;
    const ops = mountDeleteOps({ projectIdRef: { current: "p1" } });

    await expect(ops.handleDomEditElementsDelete([selectionFor("a")])).resolves.toEqual({
      ok: false,
      reason: "persist-failed",
    });
  });

  it("says so when the preview is stale instead of claiming a delete", async () => {
    // Every target missing means the preview is describing a document the file
    // does not have. Reporting success there is what read as Delete doing
    // nothing at all, with nothing on screen to explain it.
    changes = false;
    const showToast = vi.fn();
    const ops = mountDeleteOps({ projectIdRef: { current: "p1" }, showToast });

    let outcome: unknown;
    await act(async () => {
      outcome = await ops.handleDomEditElementsDelete([selectionFor("a")]);
    });

    expect(showToast.mock.calls.flat().join(" ")).toContain("out of date");
    expect(outcome).toEqual({ ok: false, reason: "preview-stale" });
  });
});
