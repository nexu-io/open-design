import { describe, expect, it } from "vitest";

import { normalizePublicUrl, publicUrl } from "../src/storage/common.js";

describe("public release URLs", () => {
  it("encodes artifact path segments without changing their hierarchy", () => {
    expect(publicUrl(
      "https://releases.example/",
      "/beta/shells/electron/versions/0.19.0-beta.4/darwin-arm64/",
      "Open Design-release-beta.dmg",
    )).toBe(
      "https://releases.example/beta/shells/electron/versions/0.19.0-beta.4/darwin-arm64/Open%20Design-release-beta.dmg",
    );
  });

  it("keeps already canonical URLs stable", () => {
    expect(normalizePublicUrl("https://releases.example/a/Open%20Design.dmg")).toBe(
      "https://releases.example/a/Open%20Design.dmg",
    );
  });

  it("rejects non-http public URLs", () => {
    expect(() => normalizePublicUrl("file:///tmp/release.dmg")).toThrow(/http or https/);
  });
});
