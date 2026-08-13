import { describe, expect, it } from "vitest";

import {
  defaultReleaseParameterMatrix,
  releaseParameterMatrixFromEnv,
  signModeForTarget,
} from "../src/channel/parameter-matrix.js";

describe("release parameter matrix", () => {
  it("makes the unsigned Windows default explicit", () => {
    expect(releaseParameterMatrixFromEnv({})).toEqual(defaultReleaseParameterMatrix);
    expect(signModeForTarget("win_x64", defaultReleaseParameterMatrix)).toBe("unsigned");
  });

  it("parses each platform independently", () => {
    expect(releaseParameterMatrixFromEnv({
      RELEASE_MAC_ARM64_SIGN_MODE: "signed",
      RELEASE_MAC_X64_SIGN_MODE: "unsigned",
      RELEASE_WIN_X64_SIGN_MODE: "signed",
    })).toEqual({
      mac_arm64: { signMode: "signed" },
      mac_x64: { signMode: "unsigned" },
      win_x64: { signMode: "signed" },
    });
  });

  it("rejects a notarized Windows mode", () => {
    expect(() => releaseParameterMatrixFromEnv({
      RELEASE_WIN_X64_SIGN_MODE: "notarized",
    })).toThrow(/unsigned or signed/u);
  });
});
