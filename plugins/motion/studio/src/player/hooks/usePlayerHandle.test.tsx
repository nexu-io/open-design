// @vitest-environment happy-dom

import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NLEProvider, useNLEContext, type NLEContextValue } from "../../components/nle/NLEContext";
import { liveTime, usePlayerStore } from "../store/playerStore";
import { makeAdapterWindow, makeFakeIframe } from "./timelinePlayerTestHarness";
import { usePlayerHandle, type PlayerHandle } from "./usePlayerHandle";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderHandle() {
  let latest: PlayerHandle | null = null;
  let context: NLEContextValue | null = null;
  let renders = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <NLEProvider projectId="player-handle-test">
        <HandleHarness
          onContext={(value) => (context = value)}
          onValue={(value) => (latest = value)}
          onRender={() => renders++}
        />
      </NLEProvider>,
    );
  });
  if (!latest || !context) throw new Error("usePlayerHandle did not mount");
  return {
    root,
    getHandle: () => latest as PlayerHandle,
    getContext: () => context as NLEContextValue,
    getRenderCount: () => renders,
  };
}

function HandleHarness({
  onContext,
  onValue,
  onRender,
}: {
  onContext: (value: NLEContextValue) => void;
  onValue: (value: PlayerHandle) => void;
  onRender: () => void;
}) {
  onRender();
  const context = useNLEContext();
  const handle = usePlayerHandle();
  useEffect(() => {
    onContext(context);
    onValue(handle);
  }, [context, handle, onContext, onValue]);
  return null;
}

afterEach(() => {
  usePlayerStore.getState().reset();
  document.body.innerHTML = "";
});

describe("usePlayerHandle", () => {
  it("refuses seek before readiness and notifies structural changes independently", () => {
    const { root, getHandle } = renderHandle();
    const handle = getHandle();

    expect(handle.ready).toBe(false);
    expect(handle.seek(4)).toBe(false);

    const structuralListener = vi.fn();
    const unsubscribe = handle.subscribe(structuralListener);
    act(() => usePlayerStore.setState({ timelineReady: true }));
    expect(structuralListener).toHaveBeenCalledTimes(1);
    act(() => usePlayerStore.setState({ duration: 8 }));
    expect(structuralListener).toHaveBeenCalledTimes(2);
    act(() =>
      usePlayerStore.setState({
        elements: [
          {
            id: "clip",
            tag: "div",
            start: 2,
            duration: 3,
            track: 0,
            selector: "#clip",
            sourceFile: "index.html",
            compositionSrc: "compositions/intro.html",
          },
        ],
      }),
    );
    expect(structuralListener).toHaveBeenCalledTimes(3);
    expect(getHandle().elements).toEqual([
      {
        id: "clip",
        start: 2,
        end: 5,
        selector: "#clip",
        sourceFile: "index.html",
        compositionSrc: "compositions/intro.html",
      },
    ]);

    unsubscribe();
    act(() => root.unmount());
  });

  it("uses the shell player to seek a real preview adapter after readiness", async () => {
    const { root, getContext, getHandle } = renderHandle();
    const { adapter, win } = makeAdapterWindow();
    await act(async () => {
      getContext().iframeRef.current = makeFakeIframe(win);
      getContext().onIframeLoad();
      await Promise.resolve();
    });

    expect(usePlayerStore.getState().timelineReady).toBe(true);
    expect(getHandle().seek(4)).toBe(true);
    expect(adapter.getTime()).toBe(4);
    expect(usePlayerStore.getState().currentTime).toBe(4);
    act(() => getHandle().play());
    expect(getHandle().playing).toBe(true);

    act(() => root.unmount());
  });

  it("keeps playback time out of React renders and forwards live time notifications", () => {
    const { root, getHandle, getRenderCount } = renderHandle();
    const initialRenderCount = getRenderCount();
    const timeListener = vi.fn();
    const structuralListener = vi.fn();
    const unsubscribeTime = getHandle().subscribeTime(timeListener);
    const unsubscribe = getHandle().subscribe(structuralListener);

    act(() => {
      usePlayerStore.setState({ currentTime: 2.5 });
      liveTime.notify(7.25);
    });

    expect(getRenderCount()).toBe(initialRenderCount);
    expect(getHandle().currentTime).toBe(2.5);
    expect(timeListener).toHaveBeenCalledWith(7.25);
    expect(structuralListener).not.toHaveBeenCalled();

    unsubscribeTime();
    unsubscribe();
    act(() => root.unmount());
  });
});
