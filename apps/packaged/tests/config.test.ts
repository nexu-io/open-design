import { describe, expect, it } from "vitest";

import { assertPackagedRootWebBasePath } from "../src/config.js";

describe("packaged web base path boundary", () => {
  it("allows the default root deployment", () => {
    expect(() => assertPackagedRootWebBasePath({})).not.toThrow();
    expect(() => assertPackagedRootWebBasePath({ OD_WEB_BASE_PATH: "" })).not.toThrow();
  });

  it("fails clearly when a self-hosted prefix leaks into packaged runtime", () => {
    expect(() => assertPackagedRootWebBasePath({ OD_WEB_BASE_PATH: "/open-design" })).toThrow(
      /not supported by the packaged desktop runtime/,
    );
  });
});
