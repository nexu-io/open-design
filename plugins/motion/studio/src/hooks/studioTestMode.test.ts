import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Studio test mode", () => {
  it("exposes hooks in the normal development runtime", async () => {
    const { STUDIO_RUNTIME_MODE, STUDIO_TEST_HOOKS_ENABLED } = await import("./studioTestMode");

    expect(STUDIO_RUNTIME_MODE).toBe("development");
    expect(STUDIO_TEST_HOOKS_ENABLED).toBe(true);
  });

  it("keeps hooks on the development server while it uses production React", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "development");

    const { STUDIO_RUNTIME_MODE, STUDIO_TEST_HOOKS_ENABLED } = await import("./studioTestMode");

    expect(STUDIO_RUNTIME_MODE).toBe("production");
    expect(STUDIO_TEST_HOOKS_ENABLED).toBe(true);
  });

  it("keeps test hooks out of an ordinary production build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    const { STUDIO_RUNTIME_MODE, STUDIO_TEST_HOOKS_ENABLED } = await import("./studioTestMode");

    expect(STUDIO_RUNTIME_MODE).toBe("production");
    expect(STUDIO_TEST_HOOKS_ENABLED).toBe(false);
  });
});
