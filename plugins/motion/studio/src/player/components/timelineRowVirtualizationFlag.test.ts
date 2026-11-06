import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("timeline row virtualization flag", () => {
  it("enables virtualization by default", async () => {
    const { STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED } =
      await import("./timelineRowVirtualizationFlag");

    expect(STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED).toBe(true);
  });

  it("keeps an explicit rollback path", async () => {
    vi.stubEnv("VITE_STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED", "0");
    const { STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED } =
      await import("./timelineRowVirtualizationFlag");

    expect(STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED).toBe(false);
  });

  it("guards the import.meta.env read so it evaluates outside Vite", () => {
    // `import.meta.env` is a Vite-only extension and is undefined in a non-Vite
    // ESM host (e.g. @hyperframes/studio embedded in Turbopack/Next.js), where
    // an unguarded `import.meta.env.VITE_*` read crashes module evaluation. The
    // vitest runtime always provides a real `import.meta.env` object, so this
    // hazard can't be reproduced behaviorally in-environment; assert on the
    // source that the optional-chaining guard is present, matching the repo's
    // existing source-inspection tests (see timelineMotionStyles.test.ts).
    const source = readFileSync(
      new URL("./timelineRowVirtualizationFlag.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("import.meta.env?.VITE_STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED");
    expect(source).not.toMatch(/import\.meta\.env\.\w/);
  });
});
