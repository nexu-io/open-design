import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import media from "../config/splash-media.json" with { type: "json" };
import manifest from "../config/shell.json" with { type: "json" };

it("retains the gold brand clip and overlapping minimum presentation policy", () => {
  expect(media.mimeType).toBe("video/webm");
  expect(createHash("sha256").update(Buffer.from(media.base64, "base64")).digest("hex"))
    .toBe("bb1c0530000a5bfe58becb53d2b8264486c1180efa9ba02fa2f41c4f6db5ce9b");
  expect(manifest.splash).toMatchObject({ width: 1280, height: 900, minimumVisibleMs: 2000 });
});
