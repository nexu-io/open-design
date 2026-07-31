import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseParentPidOption } from "../src/config.js";

describe("tools-dev parent ownership", () => {
  it("accepts only positive safe owner process identifiers", () => {
    assert.equal(parseParentPidOption(undefined), null);
    assert.equal(parseParentPidOption("42"), 42);
    assert.equal(parseParentPidOption(42), 42);
    assert.throws(() => parseParentPidOption("0"), /positive safe integer/);
    assert.throws(() => parseParentPidOption("-1"), /positive safe integer/);
    assert.throws(() => parseParentPidOption("1.5"), /positive safe integer/);
    assert.throws(() => parseParentPidOption("not-a-pid"), /positive safe integer/);
  });
});
