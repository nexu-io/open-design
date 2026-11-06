import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultThumbnailMode, effectiveThumbnailMode } from "./thumbnailPolicy";

describe("thumbnail runtime policy", () => {
  it("defaults missing preferences adaptively after activation", () => {
    expect(defaultThumbnailMode(undefined, "follow-preference")).toBe("adaptive");
    expect(defaultThumbnailMode(undefined, "legacy-default")).toBe("hidden");
  });

  it("forces the safe renderer without overwriting user intent", () => {
    expect(effectiveThumbnailMode("adaptive", "force-hidden")).toBe("hidden");
    expect(effectiveThumbnailMode("adaptive", "follow-preference")).toBe("adaptive");
  });

  it("guards the import.meta.env read so it evaluates outside Vite", () => {
    // `import.meta.env` is a Vite-only extension and is undefined in a non-Vite
    // ESM host (e.g. @hyperframes/studio embedded in Turbopack/Next.js), where
    // an unguarded `import.meta.env.VITE_*` read crashes module evaluation. The
    // vitest runtime always provides a real `import.meta.env` object, so this
    // hazard can't be reproduced behaviorally in-environment; assert on the
    // source that the optional-chaining guard is present, matching the repo's
    // existing source-inspection tests (see timelineMotionStyles.test.ts).
    const source = readFileSync(new URL("./thumbnailPolicy.ts", import.meta.url), "utf8");
    expect(source).toContain("import.meta.env?.VITE_STUDIO_TIMELINE_THUMBNAIL_POLICY");
    expect(source).not.toMatch(/import\.meta\.env\.\w/);
  });
});
