import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import { afterEach, describe, expect, it } from "vitest";

import { acquireOrAdoptPackagedHeadlessStartup } from "../src/headless-runtime.js";

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
    });
    this.child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })}\n`);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.request("tools/call", {
      arguments: args,
      name,
    }) as { content?: Array<{ text?: string }> };
    const text = result.content?.find((entry) => typeof entry.text === "string")?.text;
    if (!text) throw new Error(`MCP ${name} returned no text payload`);
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

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const response = new Promise<unknown>((resolveResponse, rejectResponse) => {
      this.pending.set(id, { reject: rejectResponse, resolve: resolveResponse });
    });
    this.child.stdin.write(`${JSON.stringify({
      id,
      jsonrpc: "2.0",
      method,
      params,
    })}\n`);
    return await Promise.race([
      response,
      new Promise<never>((_resolve, rejectTimeout) => {
        setTimeout(() => rejectTimeout(new Error(`MCP request ${method} timed out`)), 10_000);
      }),
    ]);
  }
}

function sendJson(response: import("node:http").ServerResponse, body: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

describe("packaged headless MCP reconnect lifecycle", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close();
  });

  it("keeps one owner and one real child alive across separate MCP clients", async () => {
    const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..");
    const daemonCli = join(workspaceRoot, "apps", "daemon", "dist", "cli.js");
    expect(existsSync(daemonCli), "packaged pretest must build the daemon MCP entry").toBe(true);

    const tempRoot = await mkdtemp(join(tmpdir(), "od-packaged-mcp-reconnect-"));
    cleanup.push(async () => await rm(tempRoot, { force: true, recursive: true }));
    const signalLog = join(tempRoot, "worker-signals.log");
    const runId = "run-packaged-reconnect";
    const projectId = "project-packaged-reconnect";
    let runCreationCount = 0;
    let runStatus: "running" | "succeeded" = "running";
    let workerSignal: NodeJS.Signals | null = null;
    let worker: ChildProcess | null = null;

    const httpServer: Server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/api/health") {
        sendJson(response, { ok: true });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/projects") {
        sendJson(response, { projects: [{ id: projectId, name: "Reconnect project" }] });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/runs") {
        runCreationCount++;
        if (worker == null) {
          const spawnedWorker = spawn(process.execPath, ["-e", [
            "const fs=require('node:fs');",
            `const log=${JSON.stringify(signalLog)};`,
            "process.on('SIGTERM',()=>{fs.appendFileSync(log,'SIGTERM\\n');process.exit(143);});",
            "setTimeout(()=>process.exit(0),700);",
          ].join("")], {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          });
          worker = spawnedWorker;
          spawnedWorker.once("exit", (code, signal) => {
            workerSignal = signal;
            if (code === 0 && signal == null) runStatus = "succeeded";
          });
        }
        sendJson(response, {
          conversationId: "conversation-packaged-reconnect",
          id: runId,
          projectId,
          runId,
          status: runStatus,
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === `/api/runs/${runId}`) {
        sendJson(response, {
          artifactCount: 0,
          cancelRequested: false,
          conversationId: "conversation-packaged-reconnect",
          deliverableEntryFile: null,
          deliverableValid: false,
          deliverableValidation: "none",
          error: null,
          exitCode: runStatus === "succeeded" ? 0 : null,
          id: runId,
          projectId,
          signal: workerSignal,
          status: runStatus,
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === `/api/runs/${runId}/events`) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end("event: agent\ndata: {\"type\":\"text_delta\",\"delta\":\"done\"}\n\n");
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/mcp/install-info") {
        sendJson(response, { webBaseUrl: null });
        return;
      }
      sendJson(response, {});
    });
    await new Promise<void>((resolveListen) => httpServer.listen(0, "127.0.0.1", resolveListen));
    cleanup.push(async () => await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose())));
    const address = httpServer.address();
    if (address == null || typeof address === "string") throw new Error("fake daemon did not bind TCP");
    const daemonUrl = `http://127.0.0.1:${address.port}`;

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
    const daemonIpcServer = await createJsonIpcServer({
      socketPath: daemonIpc,
      handler: async () => ({
        desktopAuthGateActive: false,
        pid: process.pid,
        state: "running",
        updatedAt: new Date().toISOString(),
        url: daemonUrl,
      }),
    });
    cleanup.push(async () => await daemonIpcServer.close());

    let ownerStartCount = 0;
    const dependencies = {
      confirmRuntime: async () => undefined,
      createIpcServer: async ({
        currentWebUrl,
        shutdown,
      }: {
        currentWebUrl(): string | null;
        shutdown(): Promise<void>;
      }) => await createJsonIpcServer({
        socketPath: desktopIpc,
        handler: async (message: unknown) => {
          const type = (message as { type?: unknown })?.type;
          if (type === SIDECAR_MESSAGES.SHUTDOWN) {
            setImmediate(() => void shutdown());
            return { accepted: true };
          }
          const url = currentWebUrl();
          return {
            pid: process.pid,
            state: url ? "running" : "idle",
            updatedAt: new Date().toISOString(),
            url,
            windowVisible: false,
          } satisfies DesktopStatusSnapshot;
        },
      }),
      exit: () => undefined,
      installMcp: async () => undefined,
      startSidecars: async () => {
        ownerStartCount++;
        return {
          close: async () => undefined,
          currentWebUrl: () => daemonUrl,
          daemon: {
            desktopAuthGateActive: false,
            state: "running" as const,
            url: daemonUrl,
          },
          web: { state: "running" as const, url: daemonUrl },
        };
      },
      writeIdentity: async () => ({ close: async () => undefined, identity: {} as never }),
      writeWebIdentity: async () => undefined,
    };
    const inspectExistingOwner = async () => {
      try {
        const status = await requestJsonIpc<DesktopStatusSnapshot>(
          desktopIpc,
          { type: SIDECAR_MESSAGES.STATUS },
          { timeoutMs: 300 },
        );
        return {
          state: status.state === "running" ? "running" as const : "starting" as const,
          webUrl: status.url ?? null,
        };
      } catch {
        return null;
      }
    };
    const owner = await acquireOrAdoptPackagedHeadlessStartup(dependencies, { inspectExistingOwner });
    expect(owner.ownership).toBe("owner");
    if (owner.ownership !== "owner") throw new Error("first packaged runtime did not own lifecycle");
    cleanup.push(async () => await owner.shutdown());

    const clientEnv = {
      ...process.env,
      [SIDECAR_ENV.IPC_PATH]: daemonIpc,
      OD_DATA_DIR: tempRoot,
    };
    const firstClient = new McpClient(daemonCli, clientEnv);
    await firstClient.initialize();
    const started = await firstClient.callTool("start_run", {
      project: projectId,
      prompt: "complete after the initiating MCP client disconnects",
      requestId: "request-packaged-reconnect",
    });
    expect(started.runId).toBe(runId);
    expect(runStatus).toBe("running");
    await firstClient.close();

    const adopted = await acquireOrAdoptPackagedHeadlessStartup(dependencies, { inspectExistingOwner });
    expect(adopted).toEqual({ ownership: "adopted", webUrl: daemonUrl });
    expect(ownerStartCount).toBe(1);

    const secondClient = new McpClient(daemonCli, clientEnv);
    cleanup.push(async () => await secondClient.close());
    await secondClient.initialize();
    let terminal: Record<string, unknown> | null = null;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      terminal = await secondClient.callTool("get_run", { runId });
      expect(terminal.id).toBe(runId);
      if (terminal.status === "succeeded") break;
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 40));
    }

    expect(terminal).toMatchObject({
      cancelRequested: false,
      exitCode: 0,
      id: runId,
      signal: null,
      status: "succeeded",
    });
    expect(runCreationCount).toBe(1);
    expect(ownerStartCount).toBe(1);
    expect(workerSignal).toBeNull();
    expect(existsSync(signalLog)).toBe(false);
  }, 30_000);
});
