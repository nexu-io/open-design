// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useInspectorGestureTransaction } from "./useInspectorGestureTransaction";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useInspectorGestureTransaction", () => {
  it("restores the durable baseline when an inspector commit rejects", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onPreview = vi.fn();
    const onCommit = vi.fn().mockRejectedValue(new Error("save failed"));
    let gesture: ReturnType<typeof useInspectorGestureTransaction<number>> | null = null;

    function Probe() {
      gesture = useInspectorGestureTransaction({ sourceValue: 10, onPreview, onCommit });
      return null;
    }

    act(() => root.render(<Probe />));
    act(() => {
      gesture?.preview(25);
      gesture?.settle();
    });
    expect(onPreview.mock.calls.map(([value]) => value)).toEqual([25]);
    await act(async () => Promise.resolve());

    expect(onPreview.mock.calls.map(([value]) => value)).toEqual([25, 10]);
    act(() => root.unmount());
  });

  it("keeps a new gesture active when the prior async commit is acknowledged", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    let gesture: ReturnType<typeof useInspectorGestureTransaction<number>> | null = null;

    function Probe({ sourceValue }: { sourceValue: number }) {
      gesture = useInspectorGestureTransaction({ sourceValue, onPreview, onCommit });
      return null;
    }

    act(() => root.render(<Probe sourceValue={10} />));
    act(() => {
      gesture?.preview(20);
      gesture?.settle();
      gesture?.preview(30);
    });
    act(() => root.render(<Probe sourceValue={20} />));

    expect(onPreview).toHaveBeenLastCalledWith(30);
    act(() => gesture?.settle());
    expect(onCommit.mock.calls.map(([value]) => value)).toEqual([20, 30]);

    act(() => root.unmount());
  });

  it("does not let an older rejected commit roll back a newer successful gesture", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onPreview = vi.fn();
    let rejectFirst: ((error: Error) => void) | null = null;
    const onCommit = vi
      .fn()
      .mockImplementationOnce((value: number) => {
        onPreview(value);
        return new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      })
      .mockImplementationOnce((value: number) => {
        onPreview(value);
        return Promise.resolve();
      });
    let gesture: ReturnType<typeof useInspectorGestureTransaction<number>> | null = null;

    function Probe() {
      gesture = useInspectorGestureTransaction({ sourceValue: 10, onPreview, onCommit });
      return null;
    }

    act(() => root.render(<Probe />));
    act(() => {
      gesture?.preview(20);
      gesture?.settle();
      gesture?.preview(30);
      gesture?.settle();
    });
    await act(async () => {
      rejectFirst?.(new Error("old save failed"));
      await Promise.resolve();
    });

    expect(onCommit.mock.calls.map(([value]) => value)).toEqual([20, 30]);
    expect(onPreview).toHaveBeenLastCalledWith(30);
    act(() => root.unmount());
  });
});
