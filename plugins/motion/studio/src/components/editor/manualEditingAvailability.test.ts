import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStudioBooleanEnvFlag } from "./manualEditingAvailability";
import { STUDIO_SDK_OPERATION_FAMILIES } from "../../utils/sdkCutoverPolicy";

async function loadAvailabilityWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) vi.stubEnv(key, value);
  }
  return import("./manualEditingAvailability");
}

describe("manual editing availability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("enables feature flags with explicit truthy env values", () => {
    expect(
      resolveStudioBooleanEnvFlag(
        { VITE_STUDIO_ENABLE_FLAT_INSPECTOR: "true" },
        ["VITE_STUDIO_ENABLE_FLAT_INSPECTOR"],
        false,
      ),
    ).toBe(true);
    expect(
      resolveStudioBooleanEnvFlag(
        { VITE_STUDIO_SDK_CUTOVER_ENABLED: "1" },
        ["VITE_STUDIO_SDK_CUTOVER_ENABLED"],
        false,
      ),
    ).toBe(true);
  });

  it("disables feature flags with explicit falsy env values", () => {
    expect(
      resolveStudioBooleanEnvFlag(
        { VITE_STUDIO_ENABLE_FLAT_INSPECTOR: "off" },
        ["VITE_STUDIO_ENABLE_FLAT_INSPECTOR"],
        true,
      ),
    ).toBe(false);
    expect(
      resolveStudioBooleanEnvFlag(
        { VITE_STUDIO_SDK_CUTOVER_ENABLED: "0" },
        ["VITE_STUDIO_SDK_CUTOVER_ENABLED"],
        true,
      ),
    ).toBe(false);
  });

  it("supports legacy flag aliases after the preferred name", () => {
    expect(
      resolveStudioBooleanEnvFlag(
        { VITE_STUDIO_FLAT_INSPECTOR_ENABLED: "yes" },
        ["VITE_STUDIO_ENABLE_FLAT_INSPECTOR", "VITE_STUDIO_FLAT_INSPECTOR_ENABLED"],
        false,
      ),
    ).toBe(true);
  });

  it("lets preferred flag values override legacy aliases", () => {
    expect(
      resolveStudioBooleanEnvFlag(
        {
          VITE_STUDIO_ENABLE_FLAT_INSPECTOR: "off",
          VITE_STUDIO_FLAT_INSPECTOR_ENABLED: "on",
        },
        ["VITE_STUDIO_ENABLE_FLAT_INSPECTOR", "VITE_STUDIO_FLAT_INSPECTOR_ENABLED"],
        true,
      ),
    ).toBe(false);
  });

  it("falls back for missing, empty, or unknown env values", () => {
    expect(resolveStudioBooleanEnvFlag({}, ["MISSING"], false)).toBe(false);
    expect(resolveStudioBooleanEnvFlag({ EMPTY: "" }, ["EMPTY"], true)).toBe(true);
    expect(resolveStudioBooleanEnvFlag({ UNKNOWN: "maybe" }, ["UNKNOWN"], false)).toBe(false);
  });

  it("defaults the flat inspector flag to true and honors an explicit override", async () => {
    const on = await loadAvailabilityWithEnv({});
    expect(on.STUDIO_FLAT_INSPECTOR_ENABLED).toBe(true);

    const off = await loadAvailabilityWithEnv({
      VITE_STUDIO_FLAT_INSPECTOR_ENABLED: "false",
    });
    expect(off.STUDIO_FLAT_INSPECTOR_ENABLED).toBe(false);
  });

  it("defaults SDK cutover on for every family", async () => {
    const all = await loadAvailabilityWithEnv({});
    expect(all.STUDIO_SDK_CUTOVER_ENABLED).toBe(true);
    expect(all.STUDIO_SDK_CUTOVER_FAMILIES).toEqual(new Set(STUDIO_SDK_OPERATION_FAMILIES));
  });

  it("honors the SDK cutover kill switches", async () => {
    const off = await loadAvailabilityWithEnv({ VITE_STUDIO_SDK_CUTOVER_ENABLED: "false" });
    expect(off.STUDIO_SDK_CUTOVER_ENABLED).toBe(false);
    expect(off.STUDIO_SDK_CUTOVER_FAMILIES.size).toBe(0);

    const subset = await loadAvailabilityWithEnv({
      VITE_STUDIO_SDK_CUTOVER_FAMILIES: "dom,timing",
    });
    expect(subset.STUDIO_SDK_CUTOVER_ENABLED).toBe(true);
    expect(subset.STUDIO_SDK_CUTOVER_FAMILIES).toEqual(new Set(["dom", "timing"]));
  });
});
