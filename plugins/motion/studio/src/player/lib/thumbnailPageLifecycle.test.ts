import { describe, expect, it } from "vitest";
import { bindThumbnailPageLifecycle } from "./thumbnailPageLifecycle";
import {
  ThumbnailScheduler,
  type ThumbnailRequest,
  type ThumbnailLoadedResult,
} from "./thumbnailScheduler";

function mountLifetime() {
  const scheduler = new ThumbnailScheduler();
  const page = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const unbind = bindThumbnailPageLifecycle(page, document, scheduler);
  return { scheduler, page, document, unbind };
}

describe("thumbnail document lifetime", () => {
  it("cancels every active thumbnail kind on pagehide and resumes retained leases", async () => {
    const { scheduler, page, unbind } = mountLifetime();
    const signals: AbortSignal[] = [];
    const kinds = ["composition", "image", "video", "waveform"] as const;
    const requests = kinds.map((kind): ThumbnailRequest => {
      let attempts = 0;
      return {
        key: kind,
        projectId: "scene",
        sessionEpoch: 0,
        kind,
        priority: "visible",
        load: (signal: AbortSignal) => {
          signals.push(signal);
          attempts++;
          if (attempts > 1)
            return Promise.resolve<ThumbnailLoadedResult>({
              value: { kind: "image", url: kind, aspect: 1 },
              weight: 1,
            });
          return new Promise<ThumbnailLoadedResult>((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          );
        },
      };
    });
    const leases = requests.map((request) => scheduler.acquire(request, () => {}));
    expect(signals).toHaveLength(4);
    page.dispatchEvent(new Event("pagehide"));
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true, true, true]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.map((request) => scheduler.getSnapshot(request).status)).toEqual([
      "queued",
      "queued",
      "queued",
      "queued",
    ]);
    page.dispatchEvent(new Event("pageshow"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signals).toHaveLength(8);
    expect(requests.map((request) => scheduler.getSnapshot(request).status)).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
    leases.forEach((lease) => lease.release());
    unbind();
  });

  it("holds new jobs while away and preserves a preview reload hold on pageshow", async () => {
    const { scheduler, page, document, unbind } = mountLifetime();
    const started: string[] = [];
    const make = (kind: "composition" | "image"): ThumbnailRequest => ({
      key: kind,
      projectId: "scene",
      kind,
      priority: "visible",
      load: async () => {
        started.push(kind);
        return { value: { kind: "image", url: kind, aspect: 1 }, weight: 1 };
      },
    });
    scheduler.setPreviewReloading(true);
    page.dispatchEvent(new Event("pagehide"));
    const leases = [make("composition"), make("image")].map((request) =>
      scheduler.acquire(request, () => {}),
    );
    expect(started).toEqual([]);
    document.hidden = true;
    page.dispatchEvent(new Event("pageshow"));
    expect(started).toEqual([]);
    document.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(started).toEqual(["image"]);
    scheduler.setPreviewReloading(false);
    expect(started).toEqual(["image", "composition"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    leases.forEach((lease) => lease.release());
    unbind();
  });

  it("removes the lifecycle listeners when unbound", () => {
    const { scheduler, page, unbind } = mountLifetime();
    unbind();
    page.dispatchEvent(new Event("pagehide"));
    let started = false;
    const lease = scheduler.acquire(
      {
        key: "poster",
        projectId: "scene",
        kind: "image",
        priority: "visible",
        load: async () => {
          started = true;
          return { value: { kind: "image", url: "poster", aspect: 1 }, weight: 1 };
        },
      },
      () => {},
    );
    expect(started).toBe(true);
    lease.release();
  });
});
