import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const toolsDevRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("runLoggedCommand security: shell injection prevention (V-001)", () => {
  it("spawn is invoked with shell: false to prevent user-controlled argument injection", async () => {
    const src = await readFile(path.join(toolsDevRoot, "src/index.ts"), "utf8");

    // Security invariant: runLoggedCommand must pass shell: false to spawn.
    // Without this, shell metacharacters in user-controlled args (command or
    // args[]) are interpreted by /bin/sh, enabling arbitrary command execution.
    assert.match(
      src,
      /shell:\s*false/,
      "spawn() in runLoggedCommand must explicitly set shell: false",
    );

    // Guard against regressions that re-introduce shell: true anywhere in this file.
    assert.doesNotMatch(
      src,
      /shell:\s*true/,
      "No spawn() call in index.ts should set shell: true",
    );
  });
});
