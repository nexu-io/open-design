// @vitest-environment jsdom
import { expect, it } from "vitest";
import { clipPeaksUrl } from "./clipPeakMap";
import { resolveMediaPreviewUrl } from "./thumbnailUtils";

it("a root-path clip, read back from preview as its project-relative src, keeps its peaks and preview URLs", () => {
  // studio-server's preview serves `src="/assets/vo-1.mp3"` as `src="assets/vo-1.mp3"`.
  expect(clipPeaksUrl("assets/vo-1.mp3", "demo")).toBe("/api/projects/demo/peaks/assets/vo-1.mp3");
  expect(clipPeaksUrl("assets/vo-1.mp3", "demo")).toBe(clipPeaksUrl("/assets/vo-1.mp3", "demo"));
  expect(resolveMediaPreviewUrl("assets/vo-1.mp3", "demo")).toBe(
    "/api/projects/demo/preview/assets/vo-1.mp3",
  );
});
