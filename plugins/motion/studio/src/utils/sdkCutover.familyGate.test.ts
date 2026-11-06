import { describe, expect, it, vi } from "vitest";

vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: true,
  STUDIO_SDK_CUTOVER_FAMILIES: new Set(["timing"]),
  STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
}));
vi.mock("./studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

import {
  sdkCutoverPersist,
  sdkDeletePersist,
  sdkGsapTweenPersist,
  sdkTimingPersist,
} from "./sdkCutover";

const deps = {
  editHistory: { recordEdit: vi.fn() },
  writeProjectFile: vi.fn(),
  reloadPreview: vi.fn(),
} as never;

describe("SDK family gate mapping", () => {
  it("enables timing independently while declining other operation families", async () => {
    await expect(
      sdkTimingPersist("hf", "/c.html", { start: 1 }, null, deps),
    ).resolves.toMatchObject({ status: "declined", reason: "session_unavailable" });
    await expect(
      sdkGsapTweenPersist("/c.html", { kind: "remove", animationId: "a" }, null, deps),
    ).resolves.toMatchObject({ status: "declined", reason: "feature_disabled" });
    await expect(sdkDeletePersist("hf", "before", "/c.html", null, deps)).resolves.toMatchObject({
      status: "declined",
      reason: "feature_disabled",
    });
    await expect(
      sdkCutoverPersist(
        { hfId: "hf" } as never,
        [{ type: "inline-style", property: "color", value: "red" }],
        "before",
        "/c.html",
        {} as never,
        deps,
      ),
      // The dom family is off, so the gate declines on the FLAG, not on the op
      // batch (which is a perfectly eligible inline-style edit). Before the
      // reason split this reported `ineligible_operation`, which read as "the
      // SDK cannot express this edit" when the truth was "this family is off".
    ).resolves.toMatchObject({ status: "declined", reason: "feature_disabled" });
  });
});
