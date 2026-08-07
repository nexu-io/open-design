import { describe, expect, it } from "vitest";

import { resolveBrandFromEnv } from "../src/brand.js";

describe("resolveBrandFromEnv", () => {
  it("returns undefined when OD_PRODUCT_NAME is absent", () => {
    expect(resolveBrandFromEnv({})).toBeUndefined();
    // appId alone must not be enough — productName is the activation key.
    expect(resolveBrandFromEnv({ OD_APP_ID: "io.xdesign.desktop" })).toBeUndefined();
  });

  it("returns undefined when OD_PRODUCT_NAME is empty or whitespace", () => {
    expect(resolveBrandFromEnv({ OD_PRODUCT_NAME: "" })).toBeUndefined();
    expect(resolveBrandFromEnv({ OD_PRODUCT_NAME: "   " })).toBeUndefined();
  });

  it("reads productName from OD_PRODUCT_NAME", () => {
    expect(resolveBrandFromEnv({ OD_PRODUCT_NAME: "xDesign" })).toEqual({ productName: "xDesign" });
  });

  it("trims the product name", () => {
    expect(resolveBrandFromEnv({ OD_PRODUCT_NAME: "  xDesign  " })).toEqual({ productName: "xDesign" });
  });

  it("includes appId and macIcon when provided", () => {
    expect(
      resolveBrandFromEnv({
        OD_PRODUCT_NAME: "xDesign",
        OD_APP_ID: "io.xdesign.desktop",
        OD_MAC_ICON: "/abs/path/icon.icns",
      }),
    ).toEqual({
      productName: "xDesign",
      appId: "io.xdesign.desktop",
      macIcon: "/abs/path/icon.icns",
    });
  });

  it("omits appId and macIcon when they are blank", () => {
    expect(
      resolveBrandFromEnv({ OD_PRODUCT_NAME: "xDesign", OD_APP_ID: "   ", OD_MAC_ICON: "" }),
    ).toEqual({ productName: "xDesign" });
  });
});
