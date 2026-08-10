import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import { afterEach, describe, expect, it } from "vitest";

type JsonRpcResponse = {
  error?: { code: number; message: string };
  id: number;
  result?: unknown;
};

class McpClient {
  readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, {
    reject(error: Error): void;
    resolve(value: unknown): void;
  }>();
  private nextId = 1;
  private stdout = "";
  private stderr = "";

  constructor(entry: string, env: NodeJS.ProcessEnv) {
    this.child = spawn(process.execPath, [entry, "mcp"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.stdout += chunk;
      while (true) {
        const newline = this.stdout.indexOf("\n");
        if (newline < 0) break;
        const line = this.stdout.slice(0, newline).trim();
        this.stdout = this.stdout.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line) as JsonRpcResponse;
        if (typeof message.id !== "number") continue;
        const waiter = this.pending.get(message.id);
        if (!waiter) continue;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      }
    });
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    this.child.once("exit", (code, signal) => {
      const error = new Error(
        `MCP child exited code=${code ?? "null"} signal=${signal ?? "none"}: ${this.stderr}`,
      );
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      capabilities: {},
      clientInfo: { name: "packaged-reconnect-test", version: "1" },
      protocolVersion: "2025-03-26",
    }, 60_000);
    this.child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })}\n`);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.request("tools/call", {
      arguments: args,
      name,
    }, 30_000) as { content?: Array<{ text?: string }>; isError?: boolean };
    const text = result.content?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) throw new Error(`MCP ${name} returned no text payload`);
    if (result.isError === true) throw new Error(`MCP ${name} failed: ${text}`);
    return JSON.parse(text) as Record<string, unknown>;
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end();
    await Promise.race([
      new Promise<void>((resolveExit) => this.child.once("exit", () => resolveExit())),
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
    if (this.child.exitCode === null) this.child.kill("SIGKILL");
  }

  private async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    let timeout: NodeJS.Timeout | undefined;
    const response = new Promise<unknown>((resolveResponse, rejectResponse) => {
      this.pending.set(id, { reject: rejectResponse, resolve: resolveResponse });
      timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectResponse(new Error(`MCP request ${method} timed out after ${timeoutMs}ms: ${this.stderr}`));
      }, timeoutMs);
    });
    this.child.stdin.write(`${JSON.stringify({
      id,
      jsonrpc: "2.0",
      method,
      params,
    })}\n`);
    try {
      return await response;
    } finally {
      if (timeout != null) clearTimeout(timeout);
    }
  }
}

async function waitFor<T>(
  inspect: () => Promise<T | null>,
  description: string,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await inspect();
      if (value != null) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(
    `timed out waiting for ${description}${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function writeFakeCodex(options: {
  completeMarker: string;
  invocationLog: string;
  releaseMarker: string;
  signalLog: string;
  startMarker: string;
  tempRoot: string;
}): Promise<string> {
  const script = join(options.tempRoot, "fake-codex.cjs");
  await writeFile(script, `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex-cli 0.142.5");
  process.exit(0);
}
if (args[0] === "debug" && args[1] === "models") {
  console.log(JSON.stringify({ models: [] }));
  process.exit(0);
}
if (args[0] === "login" && args[1] === "status") {
  console.log("Logged in using ChatGPT");
  process.exit(0);
}
fs.appendFileSync(${JSON.stringify(options.invocationLog)}, JSON.stringify({ args, pid: process.pid }) + "\\n");
fs.writeFileSync(${JSON.stringify(options.startMarker)}, String(process.pid));
process.on("SIGTERM", () => {
  fs.appendFileSync(${JSON.stringify(options.signalLog)}, "SIGTERM\\n");
  process.exit(143);
});
console.log(JSON.stringify({ type: "thread.started", thread_id: "019f-packaged-reconnect" }));
console.log(JSON.stringify({ type: "turn.started" }));
const deadline = Date.now() + 15000;
const timer = setInterval(() => {
  if (fs.existsSync(${JSON.stringify(options.releaseMarker)})) {
    clearInterval(timer);
    console.log(JSON.stringify({
      type: "item.completed",
      item: { id: "item-1", type: "agent_message", text: "Reconnect completed." },
    }));
    console.log(JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 5, cached_input_tokens: 0, output_tokens: 2 },
    }));
    fs.writeFileSync(${JSON.stringify(options.completeMarker)}, "complete");
    setTimeout(() => process.exit(0), 20);
    return;
  }
  if (Date.now() >= deadline) {
    clearInterval(timer);
    process.stderr.write("timed out waiting for reconnect release\\n");
    process.exit(2);
  }
}, 25);
`, "utf8");

  const bin = join(options.tempRoot, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex");
  if (process.platform === "win32") {
    await writeFile(
      bin,
      `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      "utf8",
    );
  } else {
    await writeFile(
      bin,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
      "utf8",
    );
    await chmod(bin, 0o755);
  }
  return bin;
}

describe("packaged headless MCP reconnect lifecycle", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close();
  });

  it("keeps the daemon-owned run alive while a separate MCP client reconnects", async () => {
    const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..");
    const daemonCli = join(workspaceRoot, "apps", "daemon", "dist", "cli.js");
    const packagedHeadless = join(workspaceRoot, "apps", "packaged", "dist", "headless.mjs");
    const webSidecar = join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js");
    expect(existsSync(daemonCli), "packaged pretest must build the daemon MCP entry").toBe(true);
    expect(existsSync(packagedHeadless), "packaged pretest must build the headless entry").toBe(true);
    expect(existsSync(webSidecar), "packaged pretest must build the web sidecar entry").toBe(true);

    const tempRoot = await mkdtemp(join(tmpdir(), "od-packaged-mcp-reconnect-"));
    cleanup.push(async () => await rm(tempRoot, {
      force: true,
      maxRetries: 20,
      recursive: true,
      retryDelay: 100,
    }));
    const bootstrapLog = join(tempRoot, "bootstrap.log");
    const completeMarker = join(tempRoot, "codex-complete");
    const invocationLog = join(tempRoot, "codex-invocations.jsonl");
    const releaseMarker = join(tempRoot, "release-codex");
    const signalLog = join(tempRoot, "codex-signals.log");
    const startMarker = join(tempRoot, "codex-started");
    const webStartedMarker = join(tempRoot, "standalone-web-started");
    const fakeCodex = await writeFakeCodex({
      completeMarker,
      invocationLog,
      releaseMarker,
      signalLog,
      startMarker,
      tempRoot,
    });

    const standaloneRoot = join(tempRoot, "web-standalone");
    const standaloneWebRoot = join(standaloneRoot, "apps", "web");
    await mkdir(standaloneWebRoot, { recursive: true });
    await writeFile(join(standaloneWebRoot, "server.js"), `
const fs = require("node:fs");
const http = require("node:http");
const server = http.createServer((_request, response) => response.end("ok"));
server.listen(Number(process.env.PORT), process.env.HOSTNAME, () => {
  fs.writeFileSync(${JSON.stringify(webStartedMarker)}, String(process.pid));
});
`, "utf8");

    const bootstrapWrapper = join(tempRoot, "bootstrap-wrapper.mjs");
    await writeFile(bootstrapWrapper, `
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(bootstrapLog)}, String(process.pid) + "\\n");
await import(${JSON.stringify(pathToFileURL(packagedHeadless).href)});
`, "utf8");

    const namespace = `reconnect-${randomUUID()}`;
    const daemonIpc = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    });
    const desktopIpc = resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    });
    let ownerPid: number | null = null;
    cleanup.push(async () => {
      await requestJsonIpc(
        desktopIpc,
        { type: SIDECAR_MESSAGES.SHUTDOWN },
        { timeoutMs: 1_000 },
      ).catch(() => undefined);
      if (ownerPid != null) {
        const closingPid = ownerPid;
        await waitFor(
          async () => isProcessAlive(closingPid) ? null : true,
          "packaged owner process exit",
          15_000,
        ).catch(() => undefined);
      }
    });

    const clientEnv = {
      ...process.env,
      [SIDECAR_ENV.IPC_PATH]: daemonIpc,
      CODEX_BIN: fakeCodex,
      CODEX_HOME: join(tempRoot, "codex-home"),
      OD_DATA_DIR: tempRoot,
      OD_MCP_BOOTSTRAP_ARGS: JSON.stringify([bootstrapWrapper, "--headless"]),
      OD_MCP_BOOTSTRAP_COMMAND: process.execPath,
      OD_PACKAGED_NAMESPACE: namespace,
      OD_RESOURCE_ROOT: workspaceRoot,
      OD_WEB_OUTPUT_MODE: "standalone",
      OD_WEB_STANDALONE_ROOT: standaloneRoot,
    } satisfies NodeJS.ProcessEnv;

    const firstClient = new McpClient(daemonCli, clientEnv);
    cleanup.push(async () => await firstClient.close());
    await firstClient.initialize();

    const ownerBefore = await waitFor(async () => {
      const status = await requestJsonIpc<DesktopStatusSnapshot>(
        desktopIpc,
        { type: SIDECAR_MESSAGES.STATUS },
        { timeoutMs: 500 },
      );
      return status.state === "running" && status.url ? status : null;
    }, "packaged headless owner");
    if (typeof ownerBefore.pid !== "number") throw new Error("packaged owner status omitted pid");
    ownerPid = ownerBefore.pid;
    const daemonBefore = await requestJsonIpc<DaemonStatusSnapshot>(
      daemonIpc,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs: 500 },
    );
    expect(existsSync(webStartedMarker), "headless bootstrap must honor standalone web configuration").toBe(true);

    const projectId = `reconnect-${randomUUID()}`;
    const project = await firstClient.callTool("create_project", {
      id: projectId,
      name: "Packaged MCP reconnect lifecycle",
    });
    expect(project).toMatchObject({ project: { id: projectId } });
    const started = await firstClient.callTool("start_run", {
      agent: "codex",
      project: projectId,
      prompt: "Remain alive until the replacement MCP client reconnects.",
      requestId: randomUUID(),
    });
    const runId = String(started.runId ?? started.id ?? "");
    expect(runId).not.toBe("");
    await waitFor(async () => existsSync(startMarker) ? true : null, "daemon-owned Codex child");
    expect(existsSync(completeMarker)).toBe(false);

    await firstClient.close();
    const ownerAfterDisconnect = await requestJsonIpc<DesktopStatusSnapshot>(
      desktopIpc,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs: 500 },
    );
    expect(ownerAfterDisconnect.pid).toBe(ownerBefore.pid);

    const secondClient = new McpClient(daemonCli, clientEnv);
    cleanup.push(async () => await secondClient.close());
    await secondClient.initialize();
    const daemonAfterReconnect = await requestJsonIpc<DaemonStatusSnapshot>(
      daemonIpc,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs: 500 },
    );
    expect(daemonAfterReconnect.pid).toBe(daemonBefore.pid);

    await writeFile(releaseMarker, "release", "utf8");
    const terminal = await waitFor(async () => {
      const status = await secondClient.callTool("get_run", { runId });
      expect(status.id).toBe(runId);
      return status.status === "succeeded" ? status : null;
    }, "same run to reach terminal success", 20_000);

    expect(terminal).toMatchObject({
      cancelRequested: false,
      exitCode: 0,
      id: runId,
      signal: null,
      status: "succeeded",
    });
    expect(existsSync(completeMarker)).toBe(true);
    expect(existsSync(signalLog)).toBe(false);
    const invocations = (await readFile(invocationLog, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[]; pid: number });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.args).toContain("exec");
    const bootstraps = (await readFile(bootstrapLog, "utf8")).trim().split("\n").filter(Boolean);
    expect(bootstraps).toEqual([String(ownerBefore.pid)]);
  }, 90_000);
});
