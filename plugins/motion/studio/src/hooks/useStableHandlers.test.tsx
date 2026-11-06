// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useStableHandlers } from "./useStableHandlers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Result {
  count: number;
  read: () => number;
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function renderStable(seen: Result[]) {
  function Probe({ count, base }: { count: number; base: number }) {
    seen.push(useStableHandlers({ count, read: () => base }, "project"));
    return null;
  }
  root = createRoot(document.createElement("div"));
  return (count: number, base: number) =>
    act(() => root!.render(<Probe count={count} base={base} />));
}

describe("useStableHandlers", () => {
  it("keeps the object while only its handlers change, and the handler calls the latest one", () => {
    const seen: Result[] = [];
    const render = renderStable(seen);
    render(1, 10);
    render(1, 20);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1]!.read()).toBe(20);
  });

  it("gives a new object when a data field changes, with the same handler identity", () => {
    const seen: Result[] = [];
    const render = renderStable(seen);
    render(1, 10);
    render(2, 10);
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]!.count).toBe(2);
    expect(seen[1]!.read).toBe(seen[0]!.read);
  });

  it("keeps a wrapper from an earlier scope calling that scope's handler", () => {
    const seen: { write: () => string }[] = [];
    function Scoped({ project }: { project: string }) {
      seen.push(useStableHandlers({ write: () => project }, project));
      return null;
    }
    root = createRoot(document.createElement("div"));
    act(() => root!.render(<Scoped project="a" />));
    const kept = seen[0]!.write;
    act(() => root!.render(<Scoped project="b" />));
    expect(kept()).toBe("a");
    expect(seen[1]!.write).not.toBe(kept);
    expect(seen[1]!.write()).toBe("b");
  });

  it("gives a new object when a key is swapped for another with the same value", () => {
    const seen: Record<string, unknown>[] = [];
    function Keys({ name }: { name: string }) {
      seen.push(useStableHandlers({ [name]: undefined }, "project"));
      return null;
    }
    root = createRoot(document.createElement("div"));
    act(() => root!.render(<Keys name="old" />));
    act(() => root!.render(<Keys name="fresh" />));
    expect(Object.keys(seen[1]!)).toEqual(["fresh"]);
  });
});
