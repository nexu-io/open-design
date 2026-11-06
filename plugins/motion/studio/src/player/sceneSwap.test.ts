// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCENE_SWAP_MS,
  announcePreviewDocumentLoaded,
  onPreviewContentReplaced,
  sceneSwapFor,
  supersededByNewerEdit,
} from "./sceneSwap";
import { errorProps } from "../utils/rejectionTelemetry";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Swap = (html: string, signal?: AbortSignal) => Promise<void>;

function swappableIframe(swap: Swap = vi.fn(async () => {})) {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  Object.assign(iframe.contentWindow as object, { __hfSwapScenes: swap });
  return { iframe, swap };
}

describe("sceneSwapFor", () => {
  it("gives up on a preview download that never finishes, so the caller can reload", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    const { iframe, swap } = swappableIframe();
    const swapping = sceneSwapFor(iframe)!("/preview", () => true);
    const outcome = expect(swapping).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(SCENE_SWAP_MS);
    await outcome;
    expect(swap).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that never finishes", async () => new Response(new ReadableStream())],
    ["a runtime swap that never finishes", async () => new Response("<html></html>")],
  ])("gives up on %s, so the caller can reload", async (_stall, respond) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(respond);
    const { iframe } = swappableIframe(vi.fn(() => new Promise<void>(() => {})));
    const swapped = vi.fn();
    iframe.addEventListener("hf-scenes-swapped", swapped);
    const outcome = expect(sceneSwapFor(iframe)!("/preview", () => true)).rejects.toThrow(
      "took too long",
    );
    await vi.advanceTimersByTimeAsync(SCENE_SWAP_MS);
    await outcome;
    expect(swapped).not.toHaveBeenCalled();
  });

  it("cancels the runtime's swap as it gives up, so captions arriving later replace nothing", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html></html>"));
    let captionsArrive = () => {};
    const captions = new Promise<void>((resolve) => (captionsArrive = resolve));
    let replaced = false;
    // As the runtime does: it waits for the caption overrides, then refuses a cancelled swap.
    const { iframe } = swappableIframe(async (_html, signal) => {
      await captions;
      if (signal?.aborted) throw new Error("the swap was cancelled");
      replaced = true;
    });
    const outcome = expect(sceneSwapFor(iframe)!("/preview", () => true)).rejects.toThrow(
      "took too long",
    );
    await vi.advanceTimersByTimeAsync(SCENE_SWAP_MS);
    await outcome;
    captionsArrive();
    await vi.advanceTimersByTimeAsync(0);
    expect(replaced).toBe(false);
  });

  it("does not start a swap whose cancel signal was aborted before the call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("<html></html>"));
    const { iframe, swap } = swappableIframe();
    const cancel = new AbortController();
    cancel.abort(supersededByNewerEdit());
    const rejection = await sceneSwapFor(iframe)!("/preview", () => true, cancel.signal).catch(
      (error: unknown) => error,
    );
    // The rejection listener files AbortErrors as cancellations, never as unhandled failures.
    expect(errorProps(rejection)).toMatchObject({
      error_name: "AbortError",
      error_message: "superseded by a newer edit",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(swap).not.toHaveBeenCalled();
  });

  it("leaves no listener on the caller's cancel signal once swaps settle, so a swapped film can be freed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html></html>"));
    const cancel = new AbortController();
    const live = new Set<unknown>();
    const { signal } = cancel;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((type: string, listener: EventListener, options?: unknown) => {
      live.add(listener);
      add(type, listener, options as AddEventListenerOptions);
    }) as AbortSignal["addEventListener"];
    signal.removeEventListener = ((type: string, listener: EventListener, options?: unknown) => {
      live.delete(listener);
      remove(type, listener, options as EventListenerOptions);
    }) as AbortSignal["removeEventListener"];
    const { iframe } = swappableIframe();
    const refused = swappableIframe(vi.fn(async () => Promise.reject(new Error("refused")))).iframe;
    for (let n = 0; n < 3; n++) await sceneSwapFor(iframe)!("/preview", () => true, signal);
    await expect(sceneSwapFor(refused)!("/preview", () => true, signal)).rejects.toThrow("refused");
    expect(live.size).toBe(0);
  });

  it("swaps a document that arrives in time", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html></html>"));
    const { iframe, swap } = swappableIframe();
    await sceneSwapFor(iframe)!("/preview", () => true);
    expect(swap).toHaveBeenCalledWith("<html></html>", expect.anything());
  });
});

describe("onPreviewContentReplaced", () => {
  it("reports Player's document-loaded announcement and a scene swap, never a raw load", () => {
    const iframe = document.createElement("iframe");
    const replaced = vi.fn();
    const stop = onPreviewContentReplaced(iframe, replaced);

    iframe.dispatchEvent(new Event("load"));
    expect(replaced).not.toHaveBeenCalled();

    announcePreviewDocumentLoaded(iframe);
    expect(replaced).toHaveBeenCalledTimes(1);

    iframe.dispatchEvent(new Event("hf-scenes-swapped"));
    expect(replaced).toHaveBeenCalledTimes(2);

    stop();
    announcePreviewDocumentLoaded(iframe);
    expect(replaced).toHaveBeenCalledTimes(2);
  });
});
