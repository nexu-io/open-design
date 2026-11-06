// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCachedSourceDurations,
  getMediaProbeDiagnostics,
  probeMediaUrl,
  probeMissingSourceDurations,
  resetMediaProbeRegistry,
} from "./mediaProbe";
import { MediaFetchError } from "./mediaFetch";

const dispose = vi.fn();
const getDurationFromMetadata = vi.fn(async () => 5);
const requestedSources: string[] = [];
const sourceRetryRules: string[] = [];

vi.mock("mediabunny", () => ({
  ALL_FORMATS: {},
  UrlSource: class {
    constructor(
      readonly url: string,
      readonly options?: { getRetryDelay?: unknown },
    ) {
      requestedSources.push(url);
      sourceRetryRules.push(typeof options?.getRetryDelay);
    }
  },
  Input: class {
    getDurationFromMetadata = getDurationFromMetadata;
    getPrimaryVideoTrack = vi.fn(async () => ({ displayWidth: 640, displayHeight: 360 }));
    getAudioTracks = vi.fn(async () => []);
    dispose = dispose;
  },
}));

beforeEach(() => {
  resetMediaProbeRegistry();
  vi.clearAllMocks();
  requestedSources.length = 0;
  sourceRetryRules.length = 0;
  getDurationFromMetadata.mockResolvedValue(5);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("media probe registry", () => {
  it("reports a failed range fetch as one typed line and records the probe as failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new MediaFetchError("probe", 403, null);
    getDurationFromMetadata.mockRejectedValue(failure);

    await expect(probeMediaUrl("/locked.mp4")).resolves.toBeNull();
    expect(sourceRetryRules).toEqual(["function"]);
    expect(warn.mock.calls).toEqual([
      ["[Studio] probe range fetch failed: HTTP 403 after 0 retries"],
    ]);
    warn.mockRestore();
  });

  it("deduplicates and caches successful probes", async () => {
    const [first, second] = await Promise.all([
      probeMediaUrl("/video.mp4"),
      probeMediaUrl("/video.mp4"),
    ]);
    expect(first).toEqual(second);
    expect(getDurationFromMetadata).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(getMediaProbeDiagnostics()).toEqual({ cached: 1, failed: 0, inflight: 0 });
  });

  it("bounds retained successes to the configured registry count", async () => {
    for (let index = 0; index < 513; index++) {
      await probeMediaUrl(`/video-${index}.mp4`);
    }
    expect(getMediaProbeDiagnostics().cached).toBe(512);
  });

  it("limits concurrent metadata probes and drains the queue", async () => {
    const resolvers: Array<(duration: number) => void> = [];
    getDurationFromMetadata.mockImplementation(
      () => new Promise<number>((resolve) => resolvers.push(resolve)),
    );

    const probes = Array.from({ length: 5 }, (_, index) => probeMediaUrl(`/queued-${index}.mp4`));
    await Promise.resolve();
    await Promise.resolve();
    expect(getDurationFromMetadata).toHaveBeenCalledTimes(4);

    resolvers[0]?.(5);
    await vi.waitFor(() => expect(getDurationFromMetadata).toHaveBeenCalledTimes(5));

    for (const resolve of resolvers.slice(1)) resolve(5);
    await expect(Promise.all(probes)).resolves.toHaveLength(5);
    expect(getMediaProbeDiagnostics()).toEqual({ cached: 5, failed: 0, inflight: 0 });
  });

  it("retries failures only after the failure TTL", async () => {
    vi.useFakeTimers();
    getDurationFromMetadata.mockRejectedValue(new Error("bad source"));
    await expect(probeMediaUrl("/bad.mp4")).resolves.toBeNull();
    await expect(probeMediaUrl("/bad.mp4")).resolves.toBeNull();
    expect(getDurationFromMetadata).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_001);
    await expect(probeMediaUrl("/bad.mp4")).resolves.toBeNull();
    expect(getDurationFromMetadata).toHaveBeenCalledTimes(2);
  });

  it("probes a dropped clip's URL-spelled src at its own file", async () => {
    await probeMissingSourceDurations(
      [{ id: "clip", tag: "video", src: "assets/My%20clip%20%231.mp4" }],
      "project-a",
      vi.fn(),
    );

    expect(requestedSources).toEqual([
      `${window.location.origin}/api/projects/project-a/preview/assets/My%20clip%20%231.mp4`,
    ]);
  });

  it("probes same-origin rooted media through the active project preview", async () => {
    const apply = vi.fn();
    await probeMissingSourceDurations(
      [
        {
          id: "clip",
          tag: "video",
          src: `${window.location.origin}/assets/clip.mp4`,
        },
      ],
      "project-a",
      apply,
    );

    expect(requestedSources).toEqual([
      `${window.location.origin}/api/projects/project-a/preview/assets/clip.mp4`,
    ]);
    expect(apply).toHaveBeenCalledWith("clip", 5);
    expect(
      applyCachedSourceDurations(
        [
          {
            id: "clip",
            tag: "video",
            src: `${window.location.origin}/assets/clip.mp4`,
          },
        ],
        "project-a",
      ),
    ).toEqual([
      {
        id: "clip",
        tag: "video",
        src: `${window.location.origin}/assets/clip.mp4`,
        sourceDuration: 5,
      },
    ]);

    await probeMissingSourceDurations(
      [
        {
          id: "clip",
          tag: "video",
          src: `${window.location.origin}/assets/clip.mp4`,
        },
      ],
      "project-a",
      apply,
    );
    expect(requestedSources).toHaveLength(1);
  });
});
