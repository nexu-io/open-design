import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { terminalRoot } from "./helpers.js";

describe("Terminal native contract", () => {
  it("keeps every public contract parseable and the runtime free of TypeScript entrypoints", () => {
    const contracts = readdirSync(join(terminalRoot, "contract"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(terminalRoot, "contract", entry.name));
    expect(contracts.length).toBeGreaterThanOrEqual(10);
    for (const file of contracts) expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
    expect(existsSync(join(terminalRoot, "src"))).toBe(false);
    expect(readFileSync(join(terminalRoot, "sh/terminal.sh"), "utf8")).toMatch(/^#!\/bin\/sh/);
    expect(readFileSync(join(terminalRoot, "runtime/fossil.mjs"), "utf8")).not.toContain("apps/closure");

    const targets = ["darwin-arm64", "darwin-x64", "win32-x64"];
    const nodeLock = JSON.parse(readFileSync(join(terminalRoot, "node-lock.json"), "utf8"));
    expect(Object.keys(nodeLock.targets).sort()).toEqual(targets);
    for (const contract of ["carrier-resolution", "distribution-request", "install-manifest", "scene-request"]) {
      const schema = JSON.parse(readFileSync(join(terminalRoot, "contract", `${contract}.schema.json`), "utf8"));
      expect(schema.properties.target.enum).toEqual(targets);
    }
  });

});
