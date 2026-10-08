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

type JobStub = { name: string; status: string; conclusion: string | null; started_at?: string; completed_at?: string };

const RUN_CREATED_AT = "2026-09-09T11:00:00Z";

const QUEUED_JOBS: JobStub[] = [
  { name: "Build prerelease mac arm64", status: "queued", conclusion: null, started_at: "2026-09-09T11:00:05Z" },
  { name: "Publish prerelease release", status: "queued", conclusion: null, started_at: "2026-09-09T11:00:05Z" },
];

const JOBS: JobStub[] = [
  {
    name: "Build prerelease mac arm64",
    status: "completed",
    conclusion: "success",
    started_at: "2026-09-09T11:01:00Z",
    completed_at: "2026-09-09T11:12:42Z",
  },
  {
    name: "Publish prerelease release",
    status: "completed",
    conclusion: "success",
    started_at: "2026-09-09T11:13:00Z",
    completed_at: "2026-09-09T11:15:30Z",
  },
];

type Stub = { url: string; sends: number; patches: number; cards: string[] };

async function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** The card body of one Feishu POST/PATCH: `content` is a JSON *string*. */
function cardOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { content?: unknown };
    return typeof parsed.content === "string" ? parsed.content : body;
  } catch {
    return body;
  }
}

async function startStub(options: {
  tokenFails: boolean;
  /** Called once per job-list poll, so a test can advance the run's state. */
  jobs?: () => JobStub[];
}): Promise<{ stub: Stub; server: Server }> {
  const stub: Stub = { url: "", sends: 0, patches: 0, cards: [] };
  const server = createServer((request, response) => {
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    // Every card body is recorded BEFORE the response is written, so a test can
    // read the sequence the moment the watcher exits.
    void readBody(request).then((body) => {
      const path = (request.url ?? "").split("?")[0] ?? "";
      if (path.endsWith("/jobs")) {
        const jobs = options.jobs?.() ?? JOBS;
        json(200, { jobs, total_count: jobs.length });
        return;
      }
      if (/\/actions\/runs\/\d+$/.test(path)) {
        json(200, { created_at: RUN_CREATED_AT, run_started_at: RUN_CREATED_AT, status: "in_progress" });
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
        stub.cards.push(cardOf(body));
        json(200, { code: 0, data: { message_id: "om_stub" } });
        return;
      }
      if (path.startsWith("/open-apis/im/v1/messages/")) {
        stub.patches += 1;
        stub.cards.push(cardOf(body));
        json(200, { code: 0, data: {} });
        return;
      }
      json(404, { code: 404 });
    });
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

  it("posts the card while every platform is still queued", async () => {
    // The direction reversal, observed end to end. The first thing that reaches
    // the chat must be the 构建中 card — posted before any package exists — and
    // everything after it is an edit of that same message. Previously nothing
    // was sent until a platform published, so the first card a reader ever saw
    // already said 已发布 and the whole build window was silent.
    let poll = 0;
    const started = await startStub({
      tokenFails: false,
      jobs: () => {
        poll += 1;
        return poll === 1 ? QUEUED_JOBS : JOBS;
      },
    });
    server = started.server;
    const outputFile = join(workdir, "first-card.txt");

    expect(await runWatcher(outputFile, started.stub.url)).toBe(0);

    expect(started.stub.cards.length).toBeGreaterThanOrEqual(2);
    const first = started.stub.cards[0] ?? "";
    expect(first).toContain("构建中");
    expect(first).not.toContain("已发布");

    const last = started.stub.cards.at(-1) ?? "";
    expect(last).toContain("已发布");
    // Both the per-lane and the whole-round clocks come from the job list and
    // the run the watcher already polls.
    expect(last).toContain("用时 11m42s");
    expect(last).toContain("本轮总耗时 15m30s");

    // One message, edited in place: an early card must not become a second one.
    expect(started.stub.sends).toBe(1);
    expect(started.stub.patches).toBeGreaterThanOrEqual(1);
    expect(await readFile(outputFile, "utf8")).toContain("card_delivered=true");
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
