// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThumbnailScheduler, type ThumbnailRequest } from "../player/lib/thumbnailScheduler";
import { useThumbnailLease } from "./useThumbnailLease";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useThumbnailLease", () => {
  it("subscribes once, publishes the result, and releases on unmount", async () => {
    const scheduler = new ThumbnailScheduler();
    const load = vi.fn(async () => ({
      value: { kind: "image" as const, url: "blob:poster", aspect: 16 / 9 },
      weight: 10,
    }));
    const request: ThumbnailRequest = {
      key: "poster",
      projectId: "demo",
      sessionEpoch: 1,
      kind: "image",
      priority: "visible",
      load,
    };
    let status = "missing";

    function Probe() {
      status = useThumbnailLease(request, scheduler).status;
      return null;
    }

    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(status).toBe("ready");
    expect(scheduler.getDiagnostics().leases).toBe(1);

    act(() => root.unmount());
    expect(scheduler.getDiagnostics().leases).toBe(0);
  });

  it("does not acquire work for a null request", () => {
    const scheduler = new ThumbnailScheduler();
    let status = "missing";
    function Probe() {
      status = useThumbnailLease(null, scheduler).status;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    expect(status).toBe("idle");
    expect(scheduler.getDiagnostics().leases).toBe(0);
    act(() => root.unmount());
  });

  it("updates priority without restarting the active request", async () => {
    const scheduler = new ThumbnailScheduler();
    let resolve!: (value: {
      value: { kind: "image"; url: string; aspect: number };
      weight: number;
    }) => void;
    const pending = new Promise<{
      value: { kind: "image"; url: string; aspect: number };
      weight: number;
    }>((accept) => {
      resolve = accept;
    });
    const load = vi.fn(() => pending);
    let priority: ThumbnailRequest["priority"] = "overscan";
    function Probe() {
      useThumbnailLease(
        {
          key: "same-content",
          projectId: "demo",
          sessionEpoch: 1,
          kind: "image",
          priority,
          load,
        },
        scheduler,
      );
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    priority = "interaction";
    act(() => root.render(React.createElement(Probe)));
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ value: { kind: "image", url: "blob:done", aspect: 1 }, weight: 1 });
      await pending;
    });
    act(() => root.unmount());
  });

  it("resubscribes when the request work shape changes", async () => {
    const scheduler = new ThumbnailScheduler();
    const imageLoad = vi.fn(async () => ({
      value: { kind: "image" as const, url: "blob:image", aspect: 1 },
      weight: 1,
    }));
    const videoLoad = vi.fn(async () => ({
      value: { kind: "image" as const, url: "blob:video", aspect: 1 },
      weight: 1,
    }));
    let kind: ThumbnailRequest["kind"] = "image";
    let rich = false;
    function Probe() {
      useThumbnailLease(
        {
          key: "same-content",
          projectId: "demo",
          sessionEpoch: 1,
          kind,
          rich,
          priority: "visible",
          load: kind === "image" ? imageLoad : videoLoad,
        },
        scheduler,
      );
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
    });

    kind = "video";
    rich = true;
    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
    });

    expect(imageLoad).toHaveBeenCalledTimes(1);
    expect(videoLoad).toHaveBeenCalledTimes(1);
    expect(scheduler.getDiagnostics().leases).toBe(1);
    act(() => root.unmount());
  });
});
