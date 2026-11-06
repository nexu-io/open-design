import { describe, it, expect } from "vitest";
import { formatFrameTime, frameToSeconds, secondsToFrame, stepFrameTime, formatTime } from "./time";

describe("formatTime", () => {
  it("formats zero seconds", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  // fallow-ignore-next-line code-duplication
  it("formats seconds less than a minute", () => {
    expect(formatTime(5)).toBe("00:05");
    expect(formatTime(30)).toBe("00:30");
    expect(formatTime(59)).toBe("00:59");
  });

  it("formats exact minutes", () => {
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(120)).toBe("02:00");
    expect(formatTime(600)).toBe("10:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(90)).toBe("01:30");
    expect(formatTime(125)).toBe("02:05");
  });

  it("formats large values (over an hour)", () => {
    expect(formatTime(3600)).toBe("60:00");
    expect(formatTime(3661)).toBe("61:01");
    expect(formatTime(7200)).toBe("120:00");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(0.9)).toBe("00:00");
    expect(formatTime(1.5)).toBe("00:01");
    expect(formatTime(59.99)).toBe("00:59");
    expect(formatTime(60.5)).toBe("01:00");
  });

  it("pads single-digit minutes and seconds with leading zeros", () => {
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(61)).toBe("01:01");
    expect(formatTime(609)).toBe("10:09");
  });

  it("guards against negative values", () => {
    expect(formatTime(-1)).toBe("00:00");
  });

  it("guards against NaN", () => {
    expect(formatTime(NaN)).toBe("00:00");
  });

  it("guards against Infinity", () => {
    expect(formatTime(Infinity)).toBe("00:00");
  });
});

describe("frame helpers", () => {
  it("converts seconds to frames at 30 fps", () => {
    expect(secondsToFrame(0, 30)).toBe(0);
    expect(secondsToFrame(1, 30)).toBe(30);
    expect(secondsToFrame(1.5, 30)).toBe(45);
  });

  it("converts frames to seconds at 30 fps", () => {
    expect(frameToSeconds(0, 30)).toBe(0);
    expect(frameToSeconds(30, 30)).toBe(1);
    expect(frameToSeconds(45, 30)).toBe(1.5);
  });

  it("formats current and total frame display", () => {
    expect(formatFrameTime(1, 5, 30)).toBe("30f / 150f");
  });

  it("steps from a truncated runtime time by integer frame index", () => {
    expect(stepFrameTime(0.0333333, 1, 30)).toBe(2 / 30);
    expect(stepFrameTime(0.0666666, 1, 30)).toBe(3 / 30);
    expect(stepFrameTime(0.0666666, -1, 30)).toBe(1 / 30);
  });

  it("clamps frame stepping at zero", () => {
    expect(stepFrameTime(0, -1, 30)).toBe(0);
  });
});
