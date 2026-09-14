import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";

import { resolveToolsDevDataRoot } from "../src/data-root.js";

test("preserves an absent daemon data root for sandbox startup validation", () => {
  assert.equal(resolveToolsDevDataRoot("/workspace", {}), null);
  assert.equal(resolveToolsDevDataRoot("/workspace", { OD_SANDBOX_MODE: "1" }), null);
});

test("forwards an explicit isolated daemon data root", () => {
  assert.equal(
    resolveToolsDevDataRoot("/workspace", { OD_DATA_DIR: "isolated", OD_SANDBOX_MODE: "1" }),
    path.resolve("/workspace", "isolated"),
  );
});
