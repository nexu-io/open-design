import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { assertShellWarmupBindings } from "@/composition/warmup-bindings.js";

async function shellSources(): Promise<Array<Readonly<{ name: string; source: string }>>> {
  const root = new URL("../src/", import.meta.url);
  const names = (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".ts")).sort();
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, root), "utf8") })));
}

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
    expect(dev).not.toMatch(/fixture-sidecar|createElectronFixture/u);
    expect(pack).not.toMatch(/fixture-sidecar|createElectronFixture/u);
    expect(dev).toContain("OD_ELECTRON_STANDALONE_RESOURCE_ROOT");
    expect(pack).toContain("OD_ELECTRON_STANDALONE_RESOURCE_ROOT");
    expect(pack).toContain('new URL("../config/distribution.json"');
    expect(pack).toContain('new URL("../config/platforms/windows.json"');
  });

  it("owns finite macOS and Windows distribution policy", async () => {
    const [policySource, macRuntimeSource, shellSource, windowsLifecycleSource] = await Promise.all([
      readFile(new URL("../config/distribution.json", import.meta.url), "utf8"),
      readFile(new URL("../config/platforms/mac.json", import.meta.url), "utf8"),
      readFile(new URL("../config/shell.json", import.meta.url), "utf8"),
      readFile(new URL("../config/platforms/windows.json", import.meta.url), "utf8"),
    ]);
    const policy = JSON.parse(policySource) as {
      mac: { targets: string[] };
      windows: { targets: string[]; nsis: Record<string, unknown> };
    };
    const windowsLifecycle = JSON.parse(windowsLifecycleSource) as {
      install: { scope: string };
      uninstall: { productData: string };
    };
    const macRuntime = JSON.parse(macRuntimeSource) as Record<string, unknown>;
    expect(macRuntime).toEqual({
      schemaVersion: 1,
      activationPolicy: "regular",
      dock: { headless: "hidden", interactive: "visible", pinning: "system-owned" },
    });
    expect(macRuntime).not.toHaveProperty("dock.pinned");
    expect(JSON.parse(shellSource)).toMatchObject({
      appId: "io.nexu.electron-foundation",
      productName: "Open Design Electron Foundation",
      executableName: "open-design-electron-foundation",
    });
    expect(policy.mac.targets).toEqual(["dir", "dmg"]);
    expect(policy.windows.targets).toEqual(["dir", "nsis"]);
    expect(policy.windows.nsis).toMatchObject({
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      multiLanguageInstaller: true,
      oneClick: false,
      warningsAsErrors: false,
    });
    expect(windowsLifecycle).toEqual({
      schemaVersion: 1,
      install: { scope: "current-user" },
      uninstall: { productData: "retain" },
    });
  });

  it("keeps one thin composition entry and explicit Electron adapter boundary", async () => {
    const sources = await shellSources();
    const main = sources.find(({ name }) => name === "main.ts")!.source;
    const composition = sources.filter(({ name }) => name.startsWith("composition/"));
    const definition = sources.find(({ name }) => name === "composition/definition.ts")!.source;
    expect(main).toContain('from "./composition/definition.js"');
    expect(main).not.toMatch(/config\/|adapters\/|ElectronFixture|scheduleElectronInstallerHandoff/u);
    expect(definition).toContain("createElectronStandaloneAuthorityFactory");
    expect(definition).not.toContain("createElectronFixtureStandaloneAuthorityFactory");
    for (const file of composition) expect(file.source).not.toMatch(/from "electron"/u);
    for (const file of sources.filter(({ name }) => !name.startsWith("adapters/"))) {
      expect(file.source, file.name).not.toMatch(/from "electron"/u);
    }
    for (const file of sources) {
      expect(file.source, file.name).not.toMatch(/apps\/closure|apps\/web|apps\/daemon/u);
      if (!file.name.startsWith("adapters/standalone/")) {
        expect(file.source, file.name).not.toMatch(/@open-design\/(?:sidecar|standalone)/u);
      }
    }
  });

  it("owns concrete preflight, warmup topology and placeholder readiness outside electron-kit", async () => {
    const [runtimeSource, rendererSource, preloadSource, kitRuntimeSource, kitPreflightSource] = await Promise.all([
      readFile(new URL("../config/runtime.json", import.meta.url), "utf8"),
      readFile(new URL("../src/adapters/renderer/placeholder.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/adapters/renderer/preload.ts", import.meta.url), "utf8"),
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
      "shell.placeholder-resource",
      "electron.mount-renderer",
    ]);
    expect(runtime.warmup).toMatchObject({ maxConcurrency: 4, totalTimeoutMs: 360000 });
    expect(runtimeSource).toContain('"failure": "required"');
    expect(rendererSource).toContain("createPlaceholderRendererAdapter");
    expect(rendererSource).toContain("let warmedHtml");
    expect(rendererSource).not.toContain("let warmedPlaceholder");
    expect(rendererSource).toContain("electronShell.acknowledgeMounted()");
    expect(rendererSource).not.toContain("executeJavaScript");
    expect(preloadSource).toContain("@open-design/electron-kit/renderer");
    expect(preloadSource).toContain("ipcRenderer.send");
    expect(kitRuntimeSource).not.toMatch(/Electron Shell Foundation|electronShellMounted|electronKitMounted/u);
    expect(kitRuntimeSource).not.toMatch(/lifecycle\.(?:heartbeat|release|status|stop)/u);
    expect(runtime.preflight.atoms.flatMap((atom) => atom.hosts ?? [])).toEqual(["127.0.0.1", "localhost"]);
    expect(kitPreflightSource).not.toMatch(/127\.0\.0\.1|localhost/u);
  });

  it("requires exact Shell warmup topology and adapter bindings", async () => {
    const runtime = JSON.parse(await readFile(new URL("../config/runtime.json", import.meta.url), "utf8")) as {
      warmup: Parameters<typeof assertShellWarmupBindings>[0];
    };
    const bindings = { "shell.placeholder-resource": () => undefined };
    expect(assertShellWarmupBindings(runtime.warmup, bindings)).toBe(bindings);
    expect(() => assertShellWarmupBindings(runtime.warmup, {}))
      .toThrow(/declared=shell\.placeholder-resource bound=/u);
    expect(() => assertShellWarmupBindings(runtime.warmup, {
      ...bindings,
      "shell.unused": () => undefined,
    })).toThrow(/bound=shell\.placeholder-resource,shell\.unused/u);
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
