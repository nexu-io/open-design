// Regression test for issue #7704: the packaged `od automation create --skill`
// crashed before any HTTP request because esbuild's prebundle (`--splitting`)
// emitted a daemon CLI chunk that called a missing `splitAutomationIds`.
//
// The esbuild options below mirror `buildPrebundledStandaloneRuntime` in
// tools/pack/src/mac/app.ts. Entries are bundled from source rather than the
// tsc `dist` output so this suite needs no daemon build; the output is written
// under apps/daemon so the externalized daemon deps resolve from its
// node_modules exactly as they do in the packaged app.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MAC_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER,
  MAC_PREBUNDLE_ESBUILD_TARGET,
  MAC_PREBUNDLE_POLICIES,
} from "@/mac/prebundle.js";

const execFileP = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method ?? "", url: req.url ?? "", body: raw });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ routine: { id: "routine-1" } }));
    });
  });

  return new Promise<StubServer>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("stub server has no address");
      resolveListen({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        requests,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}

let tempRoot: string | undefined;
let cliBundlePath: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(join(workspaceRoot, "apps", "daemon", ".tmp-daemon-cli-prebundle-"));
  const entrypointsDir = join(tempRoot, "prebundle-entrypoints");
  await mkdir(entrypointsDir, { recursive: true });

  const cliEntrypoint = join(entrypointsDir, "daemon-cli.js");
  const sidecarEntrypoint = join(entrypointsDir, "daemon-sidecar.js");

  await writeFile(
    cliEntrypoint,
    [
      'import { fileURLToPath } from "node:url";',
      "const selfPath = fileURLToPath(import.meta.url);",
      "process.env.OD_BIN ??= selfPath;",
      "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
      `await import(${JSON.stringify(join(workspaceRoot, "apps", "daemon", "src", "cli.ts"))});`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    sidecarEntrypoint,
    `import ${JSON.stringify(join(workspaceRoot, "apps", "daemon", "src", "sidecar", "index.ts"))};\n`,
    "utf8",
  );

  const outdir = join(tempRoot, "daemon");
  await build({
    banner: { js: MAC_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER },
    bundle: true,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[name]",
    entryPoints: [sidecarEntrypoint, cliEntrypoint],
    external: [...MAC_PREBUNDLE_POLICIES.daemonSidecar.externals],
    format: "esm",
    logLevel: "silent",
    outExtension: { ".js": ".mjs" },
    outdir,
    platform: "node",
    splitting: true,
    target: MAC_PREBUNDLE_ESBUILD_TARGET,
  });
  cliBundlePath = join(outdir, "daemon-cli.mjs");
}, 60_000);

afterAll(async () => {
  if (tempRoot) await rm(tempRoot, { force: true, recursive: true });
});

async function runBundledCli(
  args: string[],
  baseUrl: string,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, OD_DAEMON_URL: baseUrl };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [cliBundlePath, ...args], {
      env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 20_000,
    });
    return { code: 0, stderr, stdout };
  } catch (err) {
    const failed = err as { code?: number | null; stderr?: string; stdout?: string };
    return { code: failed.code ?? 1, stderr: failed.stderr ?? "", stdout: failed.stdout ?? "" };
  }
}

describe("packaged daemon CLI automation create --skill", () => {
  it("sends one routine request carrying skillId and context.skillIds", async () => {
    const stub = await startStubServer();
    try {
      const result = await runBundledCli(
        [
          "automation",
          "create",
          "--name",
          "skill-smoke",
          "--prompt",
          "smoke",
          "--schedule",
          "weekly:sun:03:00",
          "--target",
          "reuse=project-1",
          "--agent",
          "claude",
          "--skill",
          "alpha,beta",
          "--json",
        ],
        stub.baseUrl,
      );

      expect(result.code, result.stderr).toBe(0);

      const routines = stub.requests.filter(
        (request) => request.method === "POST" && request.url === "/api/routines",
      );
      expect(routines).toHaveLength(1);
      const body = JSON.parse(routines[0].body) as {
        skillId?: string;
        context?: { skillIds?: string[] };
      };
      expect(body.skillId).toBe("alpha");
      expect(body.context?.skillIds).toEqual(["alpha", "beta"]);
    } finally {
      await stub.close();
    }
  });
});
