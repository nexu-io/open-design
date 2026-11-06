import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { bindThumbnailPlaybackHold } from "./thumbnailPlaybackHold";
import {
  ThumbnailScheduler,
  thumbnailScheduler,
  type ThumbnailLoadedResult,
  type ThumbnailRequest,
} from "./thumbnailScheduler";

const decoded = (): ThumbnailLoadedResult => ({
  value: { kind: "image", url: "frame", aspect: 1 },
  weight: 1,
});

let requests = 0;
function videoRequest(load: ThumbnailRequest["load"]): ThumbnailRequest {
  return {
    key: `video-${++requests}`,
    projectId: "project-a",
    sessionEpoch: 1,
    kind: "video",
    priority: "visible",
    load,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => usePlayerStore.getState().reset());

describe("bindThumbnailPlaybackHold", () => {
  it("holds video decodes while the store plays, and lets them go when a reset stops it", async () => {
    const scheduler = new ThumbnailScheduler();
    const unbind = bindThumbnailPlaybackHold(usePlayerStore, scheduler);
    try {
      usePlayerStore.getState().setIsPlaying(true);
      const held = vi.fn(async () => decoded());
      scheduler.acquire(videoRequest(held), vi.fn());
      await settle();
      expect(held).not.toHaveBeenCalled();

      // reset() writes isPlaying: false itself, without setIsPlaying.
      usePlayerStore.getState().reset();
      await settle();
      expect(held).toHaveBeenCalledTimes(1);

      usePlayerStore.getState().setIsPlaying(true);
      const nextProject = vi.fn(async () => decoded());
      scheduler.acquire(videoRequest(nextProject), vi.fn());
      usePlayerStore.getState().beginTimelineSession(`project-${requests}`);
      await settle();
      expect(nextProject).toHaveBeenCalledTimes(1);
    } finally {
      unbind();
    }
  });

  it("reads the store as it is when bound, and stops following it once unbound", async () => {
    const scheduler = new ThumbnailScheduler();
    usePlayerStore.getState().setIsPlaying(true);
    const unbind = bindThumbnailPlaybackHold(usePlayerStore, scheduler);
    const held = vi.fn(async () => decoded());
    scheduler.acquire(videoRequest(held), vi.fn());
    await settle();
    expect(held).not.toHaveBeenCalled();

    unbind();
    usePlayerStore.getState().setIsPlaying(false);
    await settle();
    expect(held).not.toHaveBeenCalled();
  });

  it("holds the app's scheduler once video thumbnails are loaded", async () => {
    await import("../components/VideoThumbnail");
    usePlayerStore.getState().setIsPlaying(true);
    const held = vi.fn(async () => decoded());
    const lease = thumbnailScheduler.acquire(videoRequest(held), vi.fn());
    await settle();
    expect(held).not.toHaveBeenCalled();
    usePlayerStore.getState().setIsPlaying(false);
    await settle();
    expect(held).toHaveBeenCalledTimes(1);
    lease.release();
  });
});
