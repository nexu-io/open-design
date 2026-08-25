import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Electron product shell", () => {
  it("keeps dev and pack as thin electron-kit entrypoints", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts.dev).toBe("node ./scripts/dev.mjs");
    expect(packageJson.scripts.pack).toBe("node ./scripts/pack.mjs");
    expect(packageJson.scripts.prepack).toBe(packageJson.scripts.pack);
  });

  it("does not import Closure or product app internals", async () => {
    const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/apps\/closure|apps\/web|apps\/daemon/u);
    expect(source).not.toMatch(/@open-design\/standalone/u);
  });

  it("keeps a Shell-local copy of the same official Node lock", async () => {
    const [dev, pack, electronLock, terminalLock] = await Promise.all([
      readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8"),
      readFile(new URL("../scripts/pack.mjs", import.meta.url), "utf8"),
      readFile(new URL("../node-lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../terminal/node-lock.json", import.meta.url), "utf8"),
    ]);
    expect(dev).toContain('new URL("../node-lock.json"');
    expect(pack).toContain('new URL("../node-lock.json"');
    expect(dev).not.toMatch(/node-v\d/u);
    expect(pack).not.toMatch(/node-v\d/u);
    expect(JSON.parse(electronLock)).toEqual(JSON.parse(terminalLock));
  });
});
