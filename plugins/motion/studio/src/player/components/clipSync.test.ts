import { describe, expect, it } from "vitest";
import { clipSyncState, syncPartnerOf } from "./clipSync";

const clip = (id: string, tag: string, start: number, extra: Record<string, unknown> = {}) => ({
  id,
  tag,
  start,
  duration: 4,
  track: 0,
  syncOrigin: "lk-1",
  ...extra,
});

describe("syncPartnerOf", () => {
  it("pairs a video with the audio sharing its sync origin, not another video", () => {
    const v = clip("v", "video", 0);
    const a = clip("a", "audio", 0);
    const other = clip("v2", "video", 0);
    expect(syncPartnerOf(a, [v, a, other])?.id).toBe("v");
    expect(syncPartnerOf(v, [v, a, other])?.id).toBe("a");
  });

  it("ignores clips with no or another origin", () => {
    const v = clip("v", "video", 0);
    expect(syncPartnerOf(v, [v, clip("a", "audio", 0, { syncOrigin: "lk-2" })])).toBeNull();
    expect(syncPartnerOf({ ...v, syncOrigin: undefined }, [v])).toBeNull();
  });

  it.each([{ sourceFile: "child.html" }, { compositionScope: "child" }])(
    "never pairs across compositions reusing an origin (%o)",
    (scope) => {
      const v = clip("v", "video", 0);
      expect(syncPartnerOf(v, [v, clip("a", "audio", 0, scope)])).toBeNull();
    },
  );

  it("after a split, picks the partner sharing the most timeline", () => {
    const a = clip("a", "audio", 4.2);
    const left = clip("v", "video", 0);
    const right = clip("v-split", "video", 4);
    expect(syncPartnerOf(a, [left, right, a])?.id).toBe("v-split");
  });
});

describe("clipSyncState", () => {
  it("is null in sync and signed per side when drifted", () => {
    const v = clip("v", "video", 1);
    expect(clipSyncState(v, [v, clip("a", "audio", 1)], 30)).toBeNull();
    const late = clip("a", "audio", 1 + 10 / 30);
    expect(clipSyncState(late, [v, late], 30)?.frames).toBe(10);
    expect(clipSyncState(v, [v, late], 30)?.frames).toBe(-10);
  });

  it("offers move and slip targets that each restore sync", () => {
    const v = clip("v", "video", 1, { playbackStart: 0 });
    const a = clip("a", "audio", 1.5, { playbackStart: 0 });
    const state = clipSyncState(a, [v, a], 30);
    expect(state?.moveStart).toBeCloseTo(1);
    expect(state?.slipMediaStart).toBeCloseTo(0.5);
  });

  it("has no badge when the halves play at different rates", () => {
    const v = clip("v", "video", 1, { playbackRate: 2 });
    const a = clip("a", "audio", 2);
    expect(clipSyncState(a, [v, a], 30)).toBeNull();
  });
});
