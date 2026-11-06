import { describe, expect, it, vi } from "vitest";

// Kill-switch contract: with VITE_STUDIO_SDK_CUTOVER_ENABLED=false, EVERY cutover
// persist chokepoint must explicitly decline so the caller takes the legacy server
// path — even when a valid SDK session exists (one always does, for
// shadow/selection). Default is ON (manualEditingAvailability.test.ts pins that);
// this file pins that the env override still turns it fully off. A future
// refactor of the gate guards that ignores the flag turns these red.
// (sdkCutover.test.ts mocks the flag TRUE; this is its sibling.)
vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: false,
  STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
}));
vi.mock("./studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

import { sdkTimingPersist, sdkGsapTweenPersist, sdkDeletePersist } from "./sdkCutover";

const makeSession = () =>
  ({
    getElement: () => ({ inlineStyles: {} }),
    serialize: () => "<html></html>",
    batch: (fn: () => void) => fn(),
    setTiming: vi.fn(),
    dispatch: vi.fn(),
  }) as never;

const makeDeps = () =>
  ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
  }) as never;

describe("dark-launch gate — STUDIO_SDK_CUTOVER_ENABLED=false ⇒ persist declines", () => {
  it("sdkTimingPersist falls back without writing", async () => {
    const deps = makeDeps();
    expect(
      await sdkTimingPersist("hf-a", "/c.html", { start: 1 }, makeSession(), deps),
    ).toMatchObject({ status: "declined", reason: "feature_disabled" });
    expect(
      (deps as unknown as { writeProjectFile: ReturnType<typeof vi.fn> }).writeProjectFile,
    ).not.toHaveBeenCalled();
  });

  it("sdkGsapTweenPersist (shared GSAP-op chokepoint) falls back", async () => {
    expect(
      await sdkGsapTweenPersist(
        "/c.html",
        { kind: "remove", animationId: "a" },
        makeSession(),
        makeDeps(),
      ),
    ).toMatchObject({ status: "declined", reason: "feature_disabled" });
  });

  it("sdkDeletePersist falls back", async () => {
    expect(
      await sdkDeletePersist("hf-a", "<html></html>", "/c.html", makeSession(), makeDeps()),
    ).toMatchObject({ status: "declined", reason: "feature_disabled" });
  });
});
