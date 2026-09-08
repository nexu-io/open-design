import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { assertShellWarmupBindings } from "@/composition/warmup-bindings.js";

async function shellSources(): Promise<Array<Readonly<{ name: string; source: string }>>> {
  const root = new URL("../src/", import.meta.url);
  const names = (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".ts")).sort();
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, root), "utf8") })));
}

describe("Electron product shell", () => {
  it("has no script envelopes or local file RPC", async () => {
    const files = await readdir(new URL("../scripts/", import.meta.url)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    expect(files).toEqual([]);
    const sources = await shellSources();
    expect(sources.some(({ name }) => name.endsWith("file-command.ts"))).toBe(false);
    for (const { name, source } of sources) expect(source, name).not.toContain("runShellFileCommand");
  });
  it("exposes separate build and lifecycle APIs without local command wrappers", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string>; exports: Record<string, unknown> };
    expect(packageJson.scripts).not.toHaveProperty("dev");
    expect(Object.keys(packageJson.scripts).filter((name) => name.startsWith("exact:"))).toEqual([]);
    expect(packageJson.scripts).not.toHaveProperty("pack");
    expect(packageJson.scripts).not.toHaveProperty("prepack");
    expect(packageJson.scripts).not.toHaveProperty("pack:adapter");
    expect(packageJson.scripts).not.toHaveProperty("runtime:adapter");
    expect(packageJson.exports).toHaveProperty("./build");
    expect(packageJson.exports).toHaveProperty("./lifecycle");
    const lifecycle = await readFile(new URL("../src/lifecycle-api.ts", import.meta.url), "utf8");
    expect(lifecycle).not.toMatch(/distribution|pack-tool|process\.argv|runShellFileCommand/u);
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
      appId: "io.open-design.dev",
      productName: "Open Design Dev",
      executableName: "open-design-dev",
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
    expect(main).not.toContain('from "./composition/definition.js"');
    expect(main).not.toContain('import("./capsule.js")');
    expect(main).toContain('loadCapsule: loadInstalledElectronCapsule');
    expect(main).toContain('runElectronCarrier');
    expect(sources.find(({ name }) => name === "capsule.ts")!.source).toContain('from "./composition/definition.js"');
    expect(main).toContain('from "./adapters/standalone/electron-control.js"');
    expect(main).toContain('readFileSync(join(__dirname, "shell.json"');
    expect(main).toContain('readFileSync(join(__dirname, "carrier.json"');
    expect(main).not.toMatch(/config\/|ElectronFixture|scheduleElectronInstallerHandoff/u);
    expect(definition).toContain("createElectronStandaloneAuthorityFactory");
    expect(definition).not.toContain("createElectronFixtureStandaloneAuthorityFactory");
    for (const file of composition) expect(file.source).not.toMatch(/from "electron"/u);
    for (const file of sources.filter(({ name }) => !name.startsWith("adapters/"))) {
      expect(file.source, file.name).not.toMatch(/from "electron"/u);
    }
    for (const file of sources) {
      expect(file.source, file.name).not.toMatch(/apps\/closure|apps\/web|apps\/daemon/u);
      if (!file.name.startsWith("adapters/standalone/") && !file.name.startsWith("adapters/tools/")) {
        const source = file.name === "platform/build.ts"
          ? file.source.replace(/@open-design\/standalone\/packages(?:\/build)?(?=")/gu, "public-physical-packages")
          : file.source;
        expect(source, file.name).not.toMatch(/@open-design\/(?:sidecar|standalone)/u);
      }
    }
  });

  it("owns concrete preflight, warmup topology and renderer readiness outside electron-kit", async () => {
    const [runtimeSource, rendererSource, preloadSource, kitRuntimeSource, kitPreflightSource, carrierSource] = await Promise.all([
      readFile(new URL("../config/runtime.json", import.meta.url), "utf8"),
      readFile(new URL("../src/adapters/renderer/renderer.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/adapters/renderer/preload.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../packages/electron-kit/src/runtime/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../packages/electron-kit/src/runtime/startup/preflight/apply.ts", import.meta.url), "utf8"),
      readFile(new URL("../config/carrier.json", import.meta.url), "utf8"),
    ]);
    const runtime = JSON.parse(runtimeSource) as {
      warmup: { nodes: Array<{ executor: string }> };
    };
    expect(runtime.warmup.nodes.map((node) => node.executor)).toEqual([
      "standalone.resolve",
      "standalone.await-ready",
      "shell.renderer-resource",
      "electron.mount-renderer",
    ]);
    expect(runtime.warmup).toMatchObject({ maxConcurrency: 4, totalTimeoutMs: 360000 });
    expect(runtimeSource).toContain('"failure": "required"');
    expect(rendererSource).toContain("createElectronRendererAdapter");
    expect(rendererSource).toContain("readElectronProductRuntime");
    expect(rendererSource).not.toContain("placeholder");
    expect(preloadSource).not.toContain("DOMContentLoaded");
    expect(preloadSource).toContain("acknowledgedReady");
    expect(preloadSource).toContain("lifecycle:");
    expect(preloadSource).toContain("installElectronRendererContract");
    expect(rendererSource).not.toContain("executeJavaScript");
    expect(preloadSource).toContain("@open-design/electron-kit/renderer");
    expect(preloadSource).toContain("ipcRenderer.send");
    expect(preloadSource).toContain("OpenDesignElectronUpdaterStatusSnapshot");
    expect(rendererSource).toContain("createElectronContentUpdateHandler(contentUpdater)");
    expect(rendererSource).toContain("sender === window.webContents");
    expect(kitRuntimeSource).not.toMatch(/Electron Shell Foundation|electronShellMounted|electronKitMounted/u);
    expect(kitRuntimeSource).not.toMatch(/lifecycle\.(?:heartbeat|release|status|stop)/u);
    const carrier = JSON.parse(carrierSource) as { preflight: { atoms: Array<{ hosts?: string[] }> } };
    expect(carrier.preflight.atoms.flatMap((atom) => atom.hosts ?? [])).toEqual(["127.0.0.1", "localhost"]);
    expect(runtime).not.toHaveProperty("preflight");
    expect(runtime).not.toHaveProperty("shutdown");
    expect(kitPreflightSource).not.toMatch(/127\.0\.0\.1|localhost/u);
  });

  it("requires exact Shell warmup topology and adapter bindings", async () => {
    const runtime = JSON.parse(await readFile(new URL("../config/runtime.json", import.meta.url), "utf8")) as {
      warmup: Parameters<typeof assertShellWarmupBindings>[0];
    };
    const bindings = { "shell.renderer-resource": () => undefined };
    expect(assertShellWarmupBindings(runtime.warmup, bindings)).toBe(bindings);
    expect(() => assertShellWarmupBindings(runtime.warmup, {}))
      .toThrow(/declared=shell\.renderer-resource bound=/u);
    expect(() => assertShellWarmupBindings(runtime.warmup, {
      ...bindings,
      "shell.unused": () => undefined,
    })).toThrow(/bound=shell\.renderer-resource,shell\.unused/u);
  });

  it("keeps a Shell-local copy of the same official Node lock", async () => {
    const [dev, pack, electronLock, terminalLock] = await Promise.all([
      readFile(new URL("../src/adapters/tools/lifecycle/dev-tool.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/adapters/tools/pack-tool.ts", import.meta.url), "utf8"),
      readFile(new URL("../config/carriers/node-lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../terminal/node-lock.json", import.meta.url), "utf8"),
    ]);
    expect(dev).toContain("withElectronPhysicalPlatform");
    expect(pack).toContain("withElectronPhysicalPlatform");
    expect(dev).toContain('join(electronShellRoot, "config/carrier.json"');
    expect(pack).toContain('new URL("../../../config/carrier.json"');
    expect(dev).not.toMatch(/node-v\d/u);
    expect(pack).not.toMatch(/node-v\d/u);
    expect(JSON.parse(electronLock)).toEqual(JSON.parse(terminalLock));
  });
});
