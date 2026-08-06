import { describe, expect, it } from "vitest";

import { acquireHeadlessClosure } from "../src/index.js";

describe("Headless app boundary", () => {
  it("exposes the shell-neutral product lifecycle", () => {
    expect(acquireHeadlessClosure).toBeTypeOf("function");
  });
});
