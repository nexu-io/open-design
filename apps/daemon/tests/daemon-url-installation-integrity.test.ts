import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const daemonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let compiledResolver: string;

beforeAll(async () => {
  compiledResolver = ts.transpileModule(
    await fs.readFile(path.join(daemonRoot, "src/daemon-url.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
});

type Layout = "mac" | "payload" | "source" | "dist";

async function runDiscovery(options: {
  layout: Layout;
  ipc?: "failed" | "success";
  explicit?: boolean;
  missing?: string;
  wrongIdentity?: boolean;
  devFailure?: boolean;
  appSource?: boolean;
}) {
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "od-discovery-integrity-")));
  try {
    const source = options.layout === "source" || options.layout === "dist";
    const root = path.join(temp, options.layout === "mac" || options.appSource
      ? "Open Design.app/Contents/Resources/app"
      : source ? "checkout" : "launcher/payload/0.22.2/app");
    const modulePath = path.join(root, source
      ? `apps/daemon/${options.layout === "dist" ? "dist" : "src"}/daemon-url.mjs`
      : "prebundled/daemon/chunks/discovery.mjs");
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, compiledResolver);
    // Production dependencies are read through a link; no package manager is run.
    await fs.symlink(path.join(daemonRoot, "node_modules"), path.join(root, "node_modules"), "junction");
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "open-design", type: "module" }));
    const devEntry = path.join(root, "tools/dev/bin/tools-dev.mjs");
    if (source) {
      await fs.mkdir(path.dirname(devEntry), { recursive: true });
      await fs.mkdir(path.join(root, ".git"));
      await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - tools/*\n");
      await fs.writeFile(path.join(root, "apps/daemon/package.json"), JSON.stringify({ name: "@open-design/daemon" }));
      await fs.writeFile(path.join(root, "tools/dev/package.json"), JSON.stringify({
        name: options.wrongIdentity ? "unrelated-tool" : "@open-design/tools-dev",
        bin: { "tools-dev": "./bin/tools-dev.mjs" },
      }));
      await fs.writeFile(devEntry, options.devFailure ? "process.exit(1)" :
        `console.log(JSON.stringify({apps:{daemon:{url:'http://127.0.0.1:60123'}}}))`);
      if (options.missing) await fs.rm(path.join(root, options.missing), { recursive: true });
    }
    const runner = path.join(root, "runner.mjs");
    // Intercept before importing the production resolver. Baseline pnpm calls
    // return a harmless child response instead of touching dependencies.
    await fs.writeFile(runner, `
      import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const calls = [];
      const spawn = cp.spawn;
      cp.spawn = (command, args, options) => {
        calls.push({command,args,cwd:options.cwd});
        return command === process.execPath
          ? spawn(command,args,options)
          : spawn(process.execPath,['-e','console.log(JSON.stringify({url:"http://127.0.0.1:60999"}))'],options);
      };
      syncBuiltinESMExports();
      const {resolveDaemonUrl} = await import(${JSON.stringify(pathToFileURL(modulePath).href)});
      const env = { PATH: process.env.PATH };
      const ipc = ${JSON.stringify(options.ipc ?? null)};
      const url = await resolveDaemonUrl({env, timeoutMs:2000,
        flagUrl:${JSON.stringify(options.explicit ? "http://127.0.0.1:60444" : null)},
        connectInherited: () => ipc ? {status: async () => {
          if (ipc === 'failed') throw new Error('stale IPC');
          return {url:'http://127.0.0.1:60333'};
        }} : null,
      });
      console.log(JSON.stringify({url,calls}));
    `);
    const { stdout } = await execFileAsync(process.execPath, [runner], { cwd: root });
    const result = JSON.parse(stdout.trim()) as {
      url: string; calls: { command: string; args: string[]; cwd: string }[];
    };
    return { ...result, devEntry, root };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

describe("daemon discovery preserves installed runtime integrity", () => {
  it.each(["mac", "payload"] as const)("does not spawn from a %s bundle with old MCP environment", async (layout) => {
    const result = await runDiscovery({ layout });
    expect(result.calls).toEqual([]);
    expect(result.url).toBe("http://127.0.0.1:7456");
  });

  it("does not spawn after inherited IPC fails", async () => {
    expect((await runDiscovery({ layout: "mac", ipc: "failed" })).calls).toEqual([]);
  });

  it.each(["source", "dist"] as const)("discovers a %s checkout through Node without a package manager", async (layout) => {
    const result = await runDiscovery({ layout });
    expect(result.url).toBe("http://127.0.0.1:60123");
    expect(result.calls).toEqual([{
      command: process.execPath, args: [result.devEntry, "status", "--json"], cwd: result.root,
    }]);
  });

  it.each([".git", "pnpm-workspace.yaml", "apps/daemon/package.json", "tools/dev/bin/tools-dev.mjs"])(
    "does not execute a checkout missing %s", async (missing) => {
      expect((await runDiscovery({ layout: "source", missing })).calls).toEqual([]);
    },
  );

  it("rejects an unrelated tools-dev package", async () => {
    expect((await runDiscovery({ layout: "source", wrongIdentity: true })).calls).toEqual([]);
  });

  it("rejects source markers inside an installed macOS app", async () => {
    expect((await runDiscovery({ layout: "source", appSource: true })).calls).toEqual([]);
  });

  it("never retries a failed Node probe with a package manager", async () => {
    const result = await runDiscovery({ layout: "source", devFailure: true });
    expect(result.url).toBe("http://127.0.0.1:7456");
    expect(result.calls.map((call) => call.command)).toEqual([process.execPath]);
  });

  it("preserves explicit URL and inherited IPC short circuits", async () => {
    const explicit = await runDiscovery({ layout: "mac", explicit: true });
    expect(explicit.url).toBe("http://127.0.0.1:60444");
    expect(explicit.calls).toEqual([]);
    const ipc = await runDiscovery({ layout: "mac", ipc: "success" });
    expect(ipc.url).toBe("http://127.0.0.1:60333");
    expect(ipc.calls).toEqual([]);
  });
});
