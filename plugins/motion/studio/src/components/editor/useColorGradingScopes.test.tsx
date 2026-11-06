// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColorGradingCapturedFrame } from "./useColorGradingPreviews";
import { useColorGradingScopes } from "./useColorGradingScopes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Harness({
  open,
  refreshKey,
  captureFrame,
}: {
  open: boolean;
  refreshKey: string;
  captureFrame: () => Promise<ColorGradingCapturedFrame | null>;
}) {
  const scopes = useColorGradingScopes({ open, refreshKey, captureFrame });
  return (
    <>
      <span data-status>{scopes.status}</span>
      <span data-analysis>{scopes.analysis ? "ready" : "empty"}</span>
      <button type="button" onClick={scopes.refresh}>
        Refresh
      </button>
    </>
  );
}

function installPixelDecode() {
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray([255, 255, 255, 255]),
    }),
  } as unknown as CanvasRenderingContext2D);
}

function renderScopeHarness({ open, refreshKey = "a" }: { open: boolean; refreshKey?: string }) {
  vi.useFakeTimers();
  installPixelDecode();
  const captureFrame = vi.fn().mockResolvedValue({
    dataUrl: "data:image/png;base64,scope",
    width: 1,
    height: 1,
  });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() =>
    root.render(<Harness open={open} refreshKey={refreshKey} captureFrame={captureFrame} />),
  );
  return { captureFrame, host, root };
}

describe("useColorGradingScopes", () => {
  it("captures once on open rather than polling during playback", async () => {
    const { captureFrame, host, root } = renderScopeHarness({ open: false });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(captureFrame).not.toHaveBeenCalled();

    act(() => root.render(<Harness open refreshKey="a" captureFrame={captureFrame} />));
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(captureFrame).toHaveBeenCalledOnce();
    expect(host.querySelector("[data-status]")?.textContent).toBe("ready");

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(captureFrame).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("refreshes only after a committed grading key or explicit request", async () => {
    const { captureFrame, host, root } = renderScopeHarness({ open: true });
    await act(async () => vi.advanceTimersByTimeAsync(180));

    act(() => root.render(<Harness open refreshKey="b" captureFrame={captureFrame} />));
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(captureFrame).toHaveBeenCalledTimes(2);

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(captureFrame).toHaveBeenCalledTimes(3);
    act(() => root.unmount());
  });

  it("reports unavailable when capture returns no frame", async () => {
    vi.useFakeTimers();
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    act(() =>
      root.render(<Harness open refreshKey="a" captureFrame={vi.fn().mockResolvedValue(null)} />),
    );

    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(host.querySelector("[data-status]")?.textContent).toBe("unavailable");
    act(() => root.unmount());
  });

  it("clears stale analysis while a refresh is pending and when it is unavailable", async () => {
    vi.useFakeTimers();
    installPixelDecode();
    let resolveRefresh: (frame: ColorGradingCapturedFrame | null) => void = () => {};
    const pendingRefresh = new Promise<ColorGradingCapturedFrame | null>((resolve) => {
      resolveRefresh = resolve;
    });
    const captureFrame = vi
      .fn()
      .mockResolvedValueOnce({
        dataUrl: "data:image/png;base64,scope",
        width: 1,
        height: 1,
      })
      .mockReturnValueOnce(pendingRefresh);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    act(() => root.render(<Harness open refreshKey="a" captureFrame={captureFrame} />));

    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(host.querySelector("[data-analysis]")?.textContent).toBe("ready");

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(180));
    expect(host.querySelector("[data-status]")?.textContent).toBe("loading");
    expect(host.querySelector("[data-analysis]")?.textContent).toBe("empty");

    await act(async () => resolveRefresh(null));
    expect(host.querySelector("[data-status]")?.textContent).toBe("unavailable");
    expect(host.querySelector("[data-analysis]")?.textContent).toBe("empty");
    act(() => root.unmount());
  });
});
