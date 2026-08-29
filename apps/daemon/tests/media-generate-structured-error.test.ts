import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const daemonRoot = fileURLToPath(new URL("..", import.meta.url));
const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const LARGE_ERROR_MESSAGE = "x".repeat(2 * 1024 * 1024);

let server: http.Server | undefined;
let baseUrl = "";
let responseStatus = 403;
let responseBody = "";

beforeEach(async () => {
  responseStatus = 403;
  responseBody = JSON.stringify({
    error: {
      code: "MEDIA_EXECUTION_DISABLED",
      message: "media generation is disabled for this run",
      retryable: false,
      details: {
        internalPath: "/private/runtime/media-config.json",
        runId: "run-secret",
      },
    },
  });
  server = http.createServer((_req, res) => {
    res.writeHead(responseStatus, { "content-type": "application/json" });
    res.end(responseBody);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function runCli(options: { delayStderrReadMs?: number } = {}): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        cliEntry,
        "media",
        "generate",
        "--surface",
        "image",
        "--model",
        "test-model",
        "--prompt",
        "Draw a test image",
        "--daemon-url",
        baseUrl,
      ],
      {
        cwd: daemonRoot,
        env: { ...process.env, OD_PROJECT_ID: "project-1", OD_TOOL_TOKEN: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    if ((options.delayStderrReadMs ?? 0) > 0) child.stderr.pause();
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if ((options.delayStderrReadMs ?? 0) > 0) {
      setTimeout(() => child.stderr.resume(), options.delayStderrReadMs);
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe("od media generate structured daemon failures", () => {
  it("preserves the safe daemon error envelope without leaking diagnostics", async () => {
    const result = await runCli();

    expect(result.code).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: "MEDIA_EXECUTION_DISABLED",
        message: "media generation is disabled for this run",
        retryable: false,
      },
    });
    expect(result.stderr).not.toContain("internalPath");
    expect(result.stderr).not.toContain("run-secret");
  });

  it("flushes a large structured error envelope before exiting", async () => {
    responseBody = JSON.stringify({
      error: {
        code: "provider_error",
        message: LARGE_ERROR_MESSAGE,
        retryable: true,
      },
    });

    const result = await runCli({ delayStderrReadMs: 100 });

    expect(result.code).toBe(4);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: "provider_error",
        message: LARGE_ERROR_MESSAGE,
        retryable: true,
      },
    });
  });

  it("classifies an unstructured daemon failure without echoing its body", async () => {
    responseStatus = 500;
    responseBody = "fatal: token=secret-value at /private/dispatcher.ts";

    const result = await runCli();

    expect(result.code).toBe(4);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: "MEDIA_DISPATCH_FAILED",
        message: "media dispatcher failed before generation started",
      },
    });
    expect(result.stderr).not.toContain("secret-value");
    expect(result.stderr).not.toContain("/private/dispatcher.ts");
  });

  it("classifies daemon reachability without echoing the URL or network error", async () => {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const result = await runCli();

    expect(result.code).toBe(3);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: "MEDIA_DISPATCHER_UNREACHABLE",
        message: "local media dispatcher could not be reached",
      },
    });
    expect(result.stderr).not.toContain(baseUrl);
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });
});
