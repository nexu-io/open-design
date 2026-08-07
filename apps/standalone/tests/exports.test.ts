import { describe, expect, it } from "vitest";

import { acquireStandalone } from "../src/index.js";

describe("Standalone app boundary", () => {
  it("exposes the shell-neutral product lifecycle", () => {
    expect(acquireStandalone).toBeTypeOf("function");
  });
});
