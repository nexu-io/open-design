import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";
import * as launcherProto from "@open-design/launcher-proto";
import * as release from "@open-design/release";
import type { SidecarStamp } from "@open-design/sidecar";
import * as sidecarProto from "@open-design/sidecar-proto";

const require = createRequire(import.meta.url);
function compile(name: string, entry = false): string {
  let source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
  if (entry) {
    // Execute the production main body without its process-level fatal handler.
    // No statement inside main is changed; unexpected dependency calls fail.
    const boundary = source.indexOf("void main().catch(");
    if (boundary < 0) throw new Error("packaged entry invocation missing");
    source = `${source.slice(0, boundary)}\nexport { main };\n`;
  }
  return transpileModule(source, { compilerOptions: {
    module: ModuleKind.CommonJS, target: ScriptTarget.ES2022,
  } }).outputText;
}
const entryCode = compile("index", true);
const helperCode = compile("launcher-after-quit");
function evaluate(code: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (name.startsWith("node:")) return require(name);
      if (name in modules) return modules[name];
      return new Proxy({}, { get: (_, property) => {
        throw new Error(`Unexpected dependency: ${name}.${String(property)}`);
      } });
    },
    console: { info() {}, warn() {}, error() {} },
    ...globals,
  });
  return exports;
}

type Kind = "visible" | "hidden" | "gone" | "duplicate" | "timeout";
async function scenario(platform: "darwin" | "win32", channel: "stable" | "prerelease", kind: Kind) {
  const root = await mkdtemp(join(tmpdir(), "od-entry-handoff-"));
  const trace: string[] = [];
  let alive = kind !== "gone";
  const armed = Promise.withResolvers<void>();
  const exited = Promise.withResolvers<boolean>();
  const quit = () => {
    if (alive) { alive = false; trace.push("old-exit"); }
    exited.resolve(true);
  };
  if (!alive) exited.resolve(true);
  const namespace = "entry-handoff-test";
  const version = channel === "stable" ? "0.22.2" : "0.22.2-prerelease.1";
  const paths = { logsRoot: join(root, "logs"), dataRoot: join(root, "data"), runtimeRoot: join(root, "runtime") };
  const selected = new Error("selection boundary");
  const modules: Record<string, unknown> = {
    "@open-design/launcher-proto": launcherProto,
    "@open-design/release": release,
    "@open-design/sidecar-proto": sidecarProto,
    "@open-design/platform": {
      waitForProcessExit: async (pid: number) => {
        expect(pid).toBe(4242);
        trace.push("wait-armed"); armed.resolve();
        return kind === "timeout" ? false : exited.promise;
      },
      stopProcesses: async () => {
        trace.push("force-stop");
        return { remainingPids: [4242], forcedPids: [], stoppedPids: [] };
      },
    },
    "@open-design/sidecar": {
      readCurrentSidecarStamp: () => null,
      isCurrentSidecarLauncher: () => false,
      getSidecarStatus: async (stamp: SidecarStamp) => {
        trace.push(`inspect:${stamp.app}:${alive}`);
        if (!alive || stamp.mode !== "runtime") return { state: "stopped" };
        return { pid: 4242, state: "running", windowVisible: kind !== "hidden",
          update: { currentVersion: kind === "duplicate" ? version : "0.22.0" }, url: "http://127.0.0.1:1" };
      },
      invokeSidecar: async () => { trace.push("show"); return { accepted: true }; },
      stopSidecar: async () => { quit(); return { remainingPids: [] }; },
      bootstrapSidecarProcess: async () => { trace.push(`bootstrap:${alive}`); return false; },
    },
    "electron": { app: { commandLine: { appendSwitch() {} }, exit: (code: number) => trace.push(`exit:${code}`) } },
    "@open-design/desktop/main": { async recordIncomingUpdateLifecycle() {}, applyOsLocaleSwitch() {}, applyLoopbackConnectionLimitSwitch() {} },
    "./config.js": { readPackagedConfig: async () => ({ namespace, appVersion: version }) },
    "./headless-runtime.js": { parsePackagedHeadlessRequest: () => ({ headless: false }), runPackagedMcpActionAgainstExistingDaemon: async () => false },
    "./paths.js": { resolvePackagedNamespacePaths: () => paths },
    "./launch.js": { createPackagedSecondInstanceHandoff: () => ({}) },
    "./payload-desktop-launch.js": { findPackagedDeeplinkArg: () => null },
    "./launcher-runtime.js": { resolvePackagedLauncherRuntime: async (_config: unknown, _paths: unknown, options: { delegated: unknown }) => {
      expect(alive).toBe(false);
      expect(options.delegated).toEqual({ generation: 8, version });
      trace.push("select"); throw selected;
    } },
  };
  modules["./launcher-after-quit.js"] = evaluate(helperCode, modules);
  const argv = ["electron", "index.js", ...(kind === "duplicate" ? [] : [
    ...launcherProto.buildLauncherAfterQuitArgs({ targetPid: 4242, timeoutMs: 1000 }),
    ...launcherProto.buildLauncherDelegatedArgs({ generation: 8, version }),
  ])];
  try {
    const entry = evaluate(entryCode, modules, { process: { argv, env: {}, platform } }) as { main: () => Promise<void> };
    const running = entry.main().catch(error => { if (error !== selected) throw error; });
    // Hold the old instance until the wait is armed or the new entry exits.
    // This exposes the bad ordering without a scheduler-dependent sleep.
    await Promise.race([armed.promise, running]);
    if (kind !== "timeout") quit();
    await running;
    const log = await readFile(join(paths.logsRoot, "launcher", "after-quit.log"), "utf8");
    return { trace, log };
  } finally {
    quit();
    await rm(root, { recursive: true, force: true });
  }
}

describe.each(["darwin", "win32"] as const)("%s packaged update entry", platform => {
  it.each(["stable", "prerelease"] as const)("waits for the %s old desktop before instance discovery and bootstrap", async channel => {
    const { trace, log } = await scenario(platform, channel, "visible");
    expect(trace).toContain("select");
    expect(trace).not.toContain("show");
    expect(trace).not.toContain("bootstrap:true");
    expect(trace.filter(event => event.startsWith("inspect:")).every(event => event.endsWith(":false"))).toBe(true);
    expect(log).toContain("observed-exit targetPid=4242");
  });
  it.each(["hidden", "gone"] as const)("continues when the old desktop is %s", async kind => {
    expect((await scenario(platform, "stable", kind)).trace).toContain("select");
  });
  it("preserves ordinary duplicate-open focus without an updater wait", async () => {
    const { trace } = await scenario(platform, "stable", "duplicate");
    expect(trace).toContain("show");
    expect(trace).toContain("exit:0");
    expect(trace).not.toContain("wait-armed");
    expect(trace).not.toContain("select");
  });
  it("fails closed when the old process survives timeout and force-stop", async () => {
    const { trace } = await scenario(platform, "stable", "timeout");
    expect(trace).toContain("force-stop");
    expect(trace).toContain("exit:1");
    expect(trace).not.toContain("show");
    expect(trace.some(event => /^(inspect|bootstrap|select)/.test(event))).toBe(false);
  });
});
