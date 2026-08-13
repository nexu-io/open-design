import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STANDALONE_CLOSURE_SOURCE_FILES,
  STANDALONE_CLOSURE_SOURCE_LIMIT,
  standaloneClosureSourceSizeErrors,
} from "../../../scripts/lib/guard/source-size.ts";

describe("Standalone Closure source layering", () => {
  it("keeps the authored boundary modules below the local size ceiling", async () => {
    expect(STANDALONE_CLOSURE_SOURCE_LIMIT).toBe(800);
    expect(STANDALONE_CLOSURE_SOURCE_FILES).toContain("packages/closure/src/store/distribution-paths.ts");
    const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
    await expect(standaloneClosureSourceSizeErrors(workspaceRoot)).resolves.toEqual([]);
  });
});
