import { describe, expect, it } from "vitest";
import { isExtensionOnlyStack } from "./rejectionTelemetry";

describe("isExtensionOnlyStack", () => {
  it("is true when every V8 frame is an extension script", () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'M_ID')",
      "    at Y (chrome-extension://abcdefghijklmnop/executors/200.js:1:761)",
      "    at E (chrome-extension://abcdefghijklmnop/executors/200.js:1:1442)",
    ].join("\n");
    expect(isExtensionOnlyStack(stack)).toBe(true);
  });

  it("is true for a wallet's single-frame connect failure", () => {
    const stack =
      "i: Failed to connect to MetaMask\n    at Object.connect (chrome-extension://abcdefghijklmnop/scripts/inpage.js:7:84292)";
    expect(isExtensionOnlyStack(stack)).toBe(true);
  });

  it("reads Firefox and Safari frames", () => {
    expect(isExtensionOnlyStack("connect@moz-extension://1234-abcd/inpage.js:3:10\n")).toBe(true);
    expect(isExtensionOnlyStack("f@safari-web-extension://1234-abcd/content.js:1:5")).toBe(true);
  });

  it("is false when a Studio frame is in the stack, even under an extension's fetch wrapper", () => {
    const stack = [
      "TypeError: Failed to fetch",
      "    at o (chrome-extension://abcdefghijklmnop/frame_ant/frame_ant.js:2:18135)",
      "    at window.fetch (chrome-extension://abcdefghijklmnop/frame_ant/frame_ant.js:2:18200)",
      "    at Dt (http://localhost:3002/assets/index-abc.js:49:296453)",
    ].join("\n");
    expect(isExtensionOnlyStack(stack)).toBe(false);
  });

  it("is false for a stack with no frames to judge", () => {
    expect(isExtensionOnlyStack(null)).toBe(false);
    expect(isExtensionOnlyStack("Error: chrome-extension://abcdefghijklmnop failed")).toBe(false);
  });
});
