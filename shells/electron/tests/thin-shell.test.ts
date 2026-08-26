import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Electron product shell", () => {
  it("keeps dev and pack as thin electron-kit entrypoints", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts.dev).toBe("node ./scripts/dev.mjs");
    expect(packageJson.scripts.pack).toBe("node ./scripts/pack.mjs");
    expect(packageJson.scripts.prepack).toBe(packageJson.scripts.pack);
    const [dev, pack] = await Promise.all([
      readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8"),
      readFile(new URL("../scripts/pack.mjs", import.meta.url), "utf8"),
    ]);
    expect(dev).not.toContain("distribution.json");
    expect(pack).toContain('new URL("../config/distribution.json"');
  });

  it("owns finite macOS and Windows distribution policy", async () => {
    const policy = JSON.parse(await readFile(new URL("../config/distribution.json", import.meta.url), "utf8")) as {
      mac: { targets: string[] };
      windows: { targets: string[]; nsis: Record<string, unknown> };
    };
    expect(policy.mac.targets).toEqual(["dir", "dmg"]);
    expect(policy.windows.targets).toEqual(["dir", "nsis"]);
    expect(policy.windows.nsis).toMatchObject({
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      multiLanguageInstaller: true,
      oneClick: false,
      perMachine: false,
      warningsAsErrors: false,
    });
  });

  it("does not import Closure or product app internals", async () => {
    const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/apps\/closure|apps\/web|apps\/daemon/u);
    expect(source).not.toMatch(/@open-design\/standalone/u);
  });

  it("owns concrete preflight, warmup topology and placeholder readiness outside electron-kit", async () => {
    const [runtimeSource, rendererSource, kitRuntimeSource, kitPreflightSource] = await Promise.all([
      readFile(new URL("../config/runtime.json", import.meta.url), "utf8"),
      readFile(new URL("../src/renderer/placeholder.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../packages/electron-kit/src/runtime/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../packages/electron-kit/src/runtime/startup/preflight/apply.ts", import.meta.url), "utf8"),
    ]);
    const runtime = JSON.parse(runtimeSource) as {
      preflight: { atoms: Array<{ hosts?: string[] }> };
      warmup: { nodes: Array<{ executor: string }> };
    };
    expect(runtime.warmup.nodes.map((node) => node.executor)).toEqual([
      "electron.ensure-carrier",
      "standalone.resolve",
      "standalone.await-ready",
      "electron.mount-renderer",
    ]);
    expect(rendererSource).toContain("electronShellMounted");
    expect(kitRuntimeSource).not.toMatch(/Electron Shell Foundation|electronShellMounted|electronKitMounted/u);
    expect(runtime.preflight.atoms.flatMap((atom) => atom.hosts ?? [])).toEqual(["127.0.0.1", "localhost"]);
    expect(kitPreflightSource).not.toMatch(/127\.0\.0\.1|localhost/u);
  });

  it("keeps a Shell-local copy of the same official Node lock", async () => {
    const [dev, pack, electronLock, terminalLock] = await Promise.all([
      readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8"),
      readFile(new URL("../scripts/pack.mjs", import.meta.url), "utf8"),
      readFile(new URL("../config/carriers/node-lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../terminal/node-lock.json", import.meta.url), "utf8"),
    ]);
    expect(dev).toContain('new URL("../config/carriers/node-lock.json"');
    expect(pack).toContain('new URL("../config/carriers/node-lock.json"');
    expect(dev).toContain('new URL("../config/runtime.json"');
    expect(pack).toContain('new URL("../config/runtime.json"');
    expect(dev).not.toMatch(/node-v\d/u);
    expect(pack).not.toMatch(/node-v\d/u);
    expect(JSON.parse(electronLock)).toEqual(JSON.parse(terminalLock));
  });
});
