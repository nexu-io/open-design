import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The watcher's self-report is what the fallback job keys on, so it has to be
// exercised through the real script: the interesting case is one where the
// script exits 0, which is exactly what a job-result-only signal cannot see.
const releaseRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const watcherScript = join(releaseRoot, "src", "notifications", "prerelease-progress-card.ts");

const JOBS = [
  { name: "Build prerelease mac arm64", status: "completed", conclusion: "success" },
  { name: "Publish prerelease release", status: "completed", conclusion: "success" },
];

type Stub = { url: string; sends: number };

async function startStub(options: { tokenFails: boolean }): Promise<{ stub: Stub; server: Server }> {
  const stub: Stub = { url: "", sends: 0 };
  const server = createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0] ?? "";
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (path.endsWith("/jobs")) {
      json(200, { jobs: JOBS, total_count: JOBS.length });
      return;
    }
    if (path === "/open-apis/auth/v3/tenant_access_token/internal") {
      // A 200 carrying a non-retryable Feishu error code is what an expired app
      // secret or a bot removed from the chat actually looks like.
      if (options.tokenFails) json(200, { code: 99991663, msg: "app ticket invalid" });
      else json(200, { code: 0, tenant_access_token: "t-stub", expire: 7200 });
      return;
    }
    if (path === "/open-apis/im/v1/messages") {
      stub.sends += 1;
      json(200, { code: 0, data: { message_id: "om_stub" } });
      return;
    }
    json(404, { code: 404 });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("stub server has no port");
  stub.url = `http://127.0.0.1:${address.port}`;
  return { stub, server };
}

async function runWatcher(outputFile: string, baseUrl: string): Promise<number> {
  // The runner always hands a step an existing (empty) $GITHUB_OUTPUT file, and
  // "the script wrote nothing" is a real assertion here, not an absent file.
  await writeFile(outputFile, "");
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", watcherScript], {
      env: {
        ...process.env,
        CARD_POLL_INTERVAL_MS: "10",
        COMMIT: "0123456789abcdef0123456789abcdef01234567",
        EXPECT_SMOKE: "false",
        EXPECT_TESTS: "false",
        FEISHU_APP_ID: "cli_stub",
        FEISHU_APP_SECRET: "secret_stub",
        FEISHU_BASE_URL: baseUrl,
        FEISHU_RELEASE_CHAT_ID: "oc_stub",
        GH_TOKEN: "gh_stub",
        GITHUB_API_URL: baseUrl,
        GITHUB_OUTPUT: outputFile,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        ORIGIN_RUN_ID: "4242",
        RELEASE_PUBLIC_ORIGIN: "",
        VERSION: "0.21.1-prerelease.3",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });
}

describe("progressive card delivery signal", () => {
  let workdir = "";
  let server: Server | null = null;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "od-card-delivery-"));
  });

  afterEach(async () => {
    if (server != null) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    await rm(workdir, { force: true, recursive: true });
  });

  it("reports the card as delivered once its final state is in the chat", async () => {
    const started = await startStub({ tokenFails: false });
    server = started.server;
    const outputFile = join(workdir, "delivered.txt");

    expect(await runWatcher(outputFile, started.stub.url)).toBe(0);
    expect(started.stub.sends).toBe(1);
    expect(await readFile(outputFile, "utf8")).toContain("card_delivered=true");
  });

  it("exits green but claims no delivery when the application bot is rejected", async () => {
    // This is the silent path the fallback exists for. The watcher swallows a
    // Feishu failure on purpose (one hiccup must not end a 2-hour watch), so
    // the job goes green with nothing in the channel. Only an explicit
    // "delivered" signal can tell this apart from a healthy release.
    const started = await startStub({ tokenFails: true });
    server = started.server;
    const outputFile = join(workdir, "not-delivered.txt");

    expect(await runWatcher(outputFile, started.stub.url)).toBe(0);
    expect(started.stub.sends).toBe(0);
    expect(await readFile(outputFile, "utf8")).not.toContain("card_delivered=true");
  });
});
