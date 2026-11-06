// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  clipHasSound,
  normalizeRequestBody,
  normalizeToastText,
  requestNormalizePlan,
} from "./clipMenuNormalize";
import type { TimelineElement } from "../store/timelineElement";

const clip = (over: Partial<TimelineElement>): TimelineElement => ({
  id: "vo",
  tag: "audio",
  start: 0,
  duration: 4,
  track: 0,
  ...over,
});

describe("clipHasSound", () => {
  it("is true for audio and for a video with sound, false for silent or muted video", () => {
    expect(clipHasSound(clip({}))).toBe(true);
    expect(clipHasSound(clip({ tag: "video", hasAudio: true }))).toBe(true);
    expect(clipHasSound(clip({ tag: "video", hasAudio: false }))).toBe(false);
    expect(clipHasSound(clip({ tag: "video", hasAudio: true, muted: true }))).toBe(false);
    expect(clipHasSound(clip({ tag: "img" }))).toBe(false);
  });
});

describe("normalizeRequestBody", () => {
  it("sends the played source window and the current gain", () => {
    const body = normalizeRequestBody(
      clip({ domId: "a-roll", playbackStart: 2, playbackRate: 2, volume: 0.5, duration: 3 }),
      "talk.mp4",
    );
    expect(body).toEqual({
      id: "a-roll",
      src: "talk.mp4",
      mediaStart: 2,
      duration: 3,
      playbackRate: 2,
      volume: 0.5,
    });
  });
});

describe("normalizeToastText", () => {
  it("names the target and the change", () => {
    expect(
      normalizeToastText({
        targetLufs: -16,
        projectedLufs: -16,
        volume: 1.44,
        changeDb: 3.2,
        limitedBy: null,
      }),
    ).toBe("Normalized to −16 LUFS (+3.2 dB)");
  });

  it("says so when a limit held it back", () => {
    expect(
      normalizeToastText({
        targetLufs: -16,
        projectedLufs: -18.4,
        volume: 4,
        changeDb: 12,
        limitedBy: "gain-ceiling",
      }),
    ).toBe("Raised to −18 LUFS (+12.0 dB), the most the +12 dB ceiling allows");
  });
});

describe("requestNormalizePlan", () => {
  it("posts the project-relative source and returns the plan", async () => {
    const plan = { targetLufs: -16, projectedLufs: -16, volume: 2, changeDb: 6, limitedBy: null };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ plan }));
    const origin = window.location.origin;
    const el = clip({ src: `${origin}/api/projects/p1/preview/assets/vo.wav` });
    await expect(requestNormalizePlan("p1", el, fetchImpl)).resolves.toEqual(plan);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("/api/projects/p1/loudness/normalize");
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({ src: "assets/vo.wav" }),
    );
  });

  it("surfaces the server's reason", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "#vo is silent" }, { status: 422 }),
    );
    await expect(
      requestNormalizePlan("p1", clip({ src: "assets/vo.wav" }), fetchImpl),
    ).rejects.toThrow(/silent/);
  });
});
