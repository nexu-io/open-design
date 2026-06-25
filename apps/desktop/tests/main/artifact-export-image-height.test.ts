import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");

function artifactExportSource(): string {
  return readFileSync(join(desktopRoot, "src/main/artifact-export.ts"), "utf8");
}

function renderImageBody(): string {
  const source = artifactExportSource();
  const start = source.indexOf("async function renderImage");
  expect(start, "renderImage not found in artifact-export.ts").toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\nfunction buildDocument", start);
  expect(end, "end of renderImage not found").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("artifact image export height guard", () => {
  it("fails fast instead of silently cropping tall non-deck pages", () => {
    const source = artifactExportSource();
    const body = renderImageBody();

    expect(source).toContain("MAX_IMAGE_EXPORT_HEIGHT_PX = 20_000");
    expect(body).not.toContain("Math.min(20000");
    expect(body).not.toContain("Math.min(20_000");
    expect(body).toContain("height exceeds supported image export limit");
    expect(body.indexOf("throw new Error")).toBeLessThan(body.indexOf("window.setContentSize"));
  });
});
