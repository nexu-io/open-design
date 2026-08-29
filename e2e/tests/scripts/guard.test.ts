import { describe, expect, test } from "vitest";

import { isScriptTestFile } from "../../../scripts/guard.ts";

describe("scripts test-free boundary", () => {
  test.each(["scripts/example.test.ts", "scripts/example.test.mts"])("recognizes %s as a test file", (file) => {
    expect(isScriptTestFile(file)).toBe(true);
  });

  test("does not classify a non-test filename as a test file", () => {
    expect(isScriptTestFile("scripts/example.ts")).toBe(false);
  });
});
