// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/timelineElement";
import { normalizeClipsLoudness, writeClipGains } from "./audioGainApply";

const clip = (id: string, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  domId: id,
  tag: "audio",
  src: `${id}.mp3`,
  start: 0,
  duration: 4,
  track: 0,
  ...extra,
});

const volumeLane = JSON.stringify({
  version: 1,
  lanes: [{ target: "volume", points: [{ t: 0, v: 0.25 }] }],
});
const plan = { targetLufs: -16, projectedLufs: -16, volume: 2, changeDb: 6, limitedBy: null };

afterEach(() => vi.unstubAllGlobals());

describe("normalizeClipsLoudness", () => {
  it("refuses a clip whose volume lane owns its gain, before measuring or writing", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ plan }));
    vi.stubGlobal("fetch", fetchSpy);
    const onSetElementAttributeQuiet = vi.fn(async () => ({ status: "saved" as const }));
    await expect(
      normalizeClipsLoudness("p1", [clip("vo", { automation: volumeLane })], {
        onSetElementAttributeQuiet,
      }),
    ).rejects.toThrow(/volume is automated/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  it("rejects instead of claiming success when the save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ plan })),
    );
    const onSetElementAttributeQuiet = vi.fn(async () => ({
      status: "failed" as const,
      reason: "disk full",
    }));
    await expect(
      normalizeClipsLoudness("p1", [clip("vo")], { onSetElementAttributeQuiet }),
    ).rejects.toThrow("disk full");
  });
});

describe("writeClipGains", () => {
  it("stops at the first refused single save", async () => {
    const onSetElementAttributeQuiet = vi.fn(async () => ({
      status: "refused" as const,
      reason: "Cannot edit timeline while recording",
    }));
    await expect(
      writeClipGains(
        [
          { element: clip("a"), gain: 2 },
          { element: clip("b"), gain: 2 },
        ],
        { onSetElementAttributeQuiet },
      ),
    ).rejects.toThrow("Cannot edit timeline while recording");
    expect(onSetElementAttributeQuiet).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed multi-clip save", async () => {
    const onSetElementsAttributeQuiet = vi.fn(async () => ({
      status: "failed" as const,
      reason: "disk full",
    }));
    await expect(
      writeClipGains(
        [
          { element: clip("a"), gain: 2 },
          { element: clip("b"), gain: 2 },
        ],
        { onSetElementsAttributeQuiet },
      ),
    ).rejects.toThrow("disk full");
  });
});
