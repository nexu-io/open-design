import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// A GitHub re-run happens IN PLACE. `run_attempt` increments, `status` goes back
// to `in_progress`, and `conclusion` is rewritten — all under the SAME run id.
// So a watcher that treats "I once saw this run completed" as a permanent fact
// stops looking at it and pins the card to the first attempt's verdict forever.
//
// Observed in production on nexu-io/open-design run 34333568105
// (release-prerelease-tests, release/v0.22.1 @ 2779d97): attempt 1 failed E2E
// Vitest, someone re-ran it, attempt 2 went green at 09:35:09 — and the card's
// watcher, still in_progress at the time, never moved the row off 未通过.
//
// Driven through the real script rather than a unit harness because the bug
// lives in the poll loop's carry-forward between cycles, which only exists when
// the script runs for real.
const releaseRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const watcherScript = join(releaseRoot, "src", "notifications", "prerelease-progress-card.ts");

const ORIGIN_RUN_ID = "4242";
const TESTS_RUN_ID = "34333568105";
const SMOKE_RUN_ID = "34333568106";
const RUN_MARKER = `origin-run ${ORIGIN_RUN_ID}`;
const RUN_CREATED_AT = "2026-09-09T09:14:15Z";

type JobStub = { name: string; status: string; conclusion: string | null; started_at?: string; completed_at?: string };
type RunStub = { status: string; conclusion: string | null; run_attempt: number; updated_at: string };

/** One poll cycle's worth of the world, keyed by how many origin polls have happened. */
type Scenario = {
  originJobs: JobStub[];
  testsRun?: RunStub;
  testsJobs?: JobStub[];
  smokeRun?: RunStub;
  smokeJobs?: JobStub[];
};

type Counters = {
  /** Job-list calls per run id — the expensive call whose budget the fix must respect. */
  jobsCalls: Record<string, number>;
  /** Workflow-run-list calls per workflow file — the cheap per-cycle discovery call. */
  runListCalls: Record<string, number>;
  cycles: number;
  cards: string[];
};

function done(name: string, conclusion: string): JobStub {
  return {
    name,
    status: "completed",
    conclusion,
    started_at: "2026-09-09T09:14:20Z",
    completed_at: "2026-09-09T09:19:29Z",
  };
}

function running(name: string): JobStub {
  return { name, status: "in_progress", conclusion: null, started_at: "2026-09-09T09:14:20Z" };
}

async function readBody(request: IncomingMessage): Promise<string> {
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

/**
 * A GitHub + Feishu stub whose world advances one step per origin job-list poll.
 *
 * The origin poll is the first thing every `collect()` cycle does, so counting
 * it gives every later lookup in the same cycle a stable cycle number.
 */
async function startStub(scenarios: Scenario[]): Promise<{ counters: Counters; server: Server; url: string }> {
  const counters: Counters = { cards: [], cycles: 0, jobsCalls: {}, runListCalls: {} };
  const at = (): Scenario => scenarios[Math.min(counters.cycles, scenarios.length) - 1] ?? scenarios[0]!;

  const server = createServer((request, response) => {
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    void readBody(request).then((body) => {
      const path = (request.url ?? "").split("?")[0] ?? "";

      const jobsMatch = /\/actions\/runs\/(\d+)\/jobs$/.exec(path);
      if (jobsMatch != null) {
        const runId = jobsMatch[1] ?? "";
        if (runId === ORIGIN_RUN_ID) counters.cycles += 1;
        counters.jobsCalls[runId] = (counters.jobsCalls[runId] ?? 0) + 1;
        const scenario = at();
        const jobs =
          runId === ORIGIN_RUN_ID
            ? scenario.originJobs
            : runId === TESTS_RUN_ID
              ? (scenario.testsJobs ?? [])
              : (scenario.smokeJobs ?? []);
        json(200, { jobs, total_count: jobs.length });
        return;
      }

      const runsMatch = /\/actions\/workflows\/([^/]+)\/runs$/.exec(path);
      if (runsMatch != null) {
        const file = decodeURIComponent(runsMatch[1] ?? "");
        counters.runListCalls[file] = (counters.runListCalls[file] ?? 0) + 1;
        const scenario = at();
        const isTests = file.includes("tests");
        const run = isTests ? scenario.testsRun : scenario.smokeRun;
        const id = isTests ? TESTS_RUN_ID : SMOKE_RUN_ID;
        json(200, {
          workflow_runs:
            run == null
              ? []
              : [
                  {
                    conclusion: run.conclusion,
                    html_url: `https://github.com/nexu-io/open-design/actions/runs/${id}`,
                    id: Number(id),
                    name: `prerelease ${isTests ? "tests" : "smoke"} · 0.22.1-prerelease.12 · ${RUN_MARKER}`,
                    run_attempt: run.run_attempt,
                    status: run.status,
                    updated_at: run.updated_at,
                  },
                ],
        });
        return;
      }

      if (/\/actions\/runs\/\d+$/.test(path)) {
        json(200, { created_at: RUN_CREATED_AT, run_started_at: RUN_CREATED_AT, status: "in_progress" });
        return;
      }
      if (path === "/open-apis/auth/v3/tenant_access_token/internal") {
        json(200, { code: 0, expire: 7200, tenant_access_token: "t-stub" });
        return;
      }
      if (path === "/open-apis/im/v1/messages") {
        counters.cards.push(cardOf(body));
        json(200, { code: 0, data: { message_id: "om_stub" } });
        return;
      }
      if (path.startsWith("/open-apis/im/v1/messages/")) {
        counters.cards.push(cardOf(body));
        json(200, { code: 0, data: {} });
        return;
      }
      json(404, { code: 404 });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("stub server has no port");
  return { counters, server, url: `http://127.0.0.1:${address.port}` };
}

async function runWatcher(options: {
  baseUrl: string;
  expectSmoke: boolean;
  expectTests: boolean;
  outputFile: string;
}): Promise<number> {
  await writeFile(options.outputFile, "");
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", watcherScript], {
      env: {
        ...process.env,
        CARD_POLL_INTERVAL_MS: "10",
        COMMIT: "2779d97687a0ab84925c3760b240afdb750dad2b",
        EXPECT_SMOKE: options.expectSmoke ? "true" : "false",
        EXPECT_TESTS: options.expectTests ? "true" : "false",
        FEISHU_APP_ID: "cli_stub",
        FEISHU_APP_SECRET: "secret_stub",
        FEISHU_BASE_URL: options.baseUrl,
        FEISHU_RELEASE_CHAT_ID: "oc_stub",
        GH_TOKEN: "gh_stub",
        GITHUB_API_URL: options.baseUrl,
        GITHUB_OUTPUT: options.outputFile,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        ORIGIN_RUN_ID,
        RELEASE_PUBLIC_ORIGIN: "",
        VERSION: "0.22.1-prerelease.12",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });
}

const TESTS_FAMILY_GREEN: JobStub[] = [
  done("P0 Functional E2E / UI P0 (project-collab)", "success"),
  done("Daemon tests (1/4)", "success"),
  done("Verify build (typecheck + tests)", "success"),
];

/**
 * Origin lane that keeps the watcher awake until `settleCycle`.
 *
 * One platform stays in flight so the watcher cannot finish early — the whole
 * bug only exists in the window where a lane has finished but the watch has not.
 */
function originAt(cycle: number, settleCycle: number, publish: "success" | "running"): JobStub[] {
  const settled = cycle >= settleCycle;
  return [
    done("Build prerelease mac arm64", "success"),
    settled ? done("Build prerelease mac intel x64", "success") : running("Build prerelease mac intel x64"),
    publish === "success" || settled
      ? done("Publish prerelease release", "success")
      : running("Publish prerelease release"),
  ];
}

describe("prerelease card tracks in-place re-runs", () => {
  let workdir = "";
  let server: Server | null = null;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "cardrerun-"));
  });

  afterEach(async () => {
    if (server != null) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    await rm(workdir, { force: true, recursive: true });
  });

  it("moves a tests row off 未通过 when the tests run is re-run in place", async () => {
    // Production shape: the tests run finishes red, is re-run under the same id,
    // and goes green while the watcher is still awake for the origin lane.
    const scenarios: Scenario[] = [
      {
        originJobs: originAt(1, 4, "running"),
        testsJobs: [done("E2E Vitest", "failure"), ...TESTS_FAMILY_GREEN],
        testsRun: { conclusion: "failure", run_attempt: 1, status: "completed", updated_at: "2026-09-09T09:26:17Z" },
      },
      {
        originJobs: originAt(2, 4, "running"),
        testsJobs: [running("E2E Vitest"), ...TESTS_FAMILY_GREEN],
        testsRun: { conclusion: null, run_attempt: 2, status: "in_progress", updated_at: "2026-09-09T09:28:51Z" },
      },
      {
        originJobs: originAt(3, 4, "running"),
        testsJobs: [done("E2E Vitest", "success"), ...TESTS_FAMILY_GREEN],
        testsRun: { conclusion: "success", run_attempt: 2, status: "completed", updated_at: "2026-09-09T09:35:09Z" },
      },
      {
        originJobs: originAt(4, 4, "success"),
        testsJobs: [done("E2E Vitest", "success"), ...TESTS_FAMILY_GREEN],
        testsRun: { conclusion: "success", run_attempt: 2, status: "completed", updated_at: "2026-09-09T09:35:09Z" },
      },
    ];
    const started = await startStub(scenarios);
    server = started.server;

    expect(
      await runWatcher({
        baseUrl: started.url,
        expectSmoke: false,
        expectTests: true,
        outputFile: join(workdir, "cardrerun-tests.txt"),
      }),
    ).toBe(0);

    const first = started.counters.cards[0] ?? "";
    expect(first).toContain("E2E Vitest · 未通过");

    const last = started.counters.cards.at(-1) ?? "";
    expect(last).toContain("E2E Vitest · 通过");
    expect(last).not.toContain("E2E Vitest · 未通过");
  });

  it("moves a smoke row off 未通过 when the smoke run is re-run in place", async () => {
    const smokeJob = "Smoke prerelease mac arm64";
    const scenarios: Scenario[] = [
      {
        originJobs: originAt(1, 4, "success"),
        smokeJobs: [done(smokeJob, "failure")],
        smokeRun: { conclusion: "failure", run_attempt: 1, status: "completed", updated_at: "2026-09-09T09:26:17Z" },
      },
      {
        originJobs: originAt(2, 4, "success"),
        smokeJobs: [running(smokeJob)],
        smokeRun: { conclusion: null, run_attempt: 2, status: "in_progress", updated_at: "2026-09-09T09:28:51Z" },
      },
      {
        originJobs: originAt(3, 4, "success"),
        smokeJobs: [done(smokeJob, "success")],
        smokeRun: { conclusion: "success", run_attempt: 2, status: "completed", updated_at: "2026-09-09T09:35:09Z" },
      },
      {
        originJobs: originAt(4, 4, "success"),
        smokeJobs: [done(smokeJob, "success")],
        smokeRun: { conclusion: "success", run_attempt: 2, status: "completed", updated_at: "2026-09-09T09:35:09Z" },
      },
    ];
    const started = await startStub(scenarios);
    server = started.server;

    expect(
      await runWatcher({
        baseUrl: started.url,
        expectSmoke: true,
        expectTests: false,
        outputFile: join(workdir, "cardrerun-smoke.txt"),
      }),
    ).toBe(0);

    const first = started.counters.cards[0] ?? "";
    expect(first).toContain("macOS (Apple Silicon) packaged smoke · 未通过");

    const last = started.counters.cards.at(-1) ?? "";
    expect(last).toContain("macOS (Apple Silicon) packaged smoke · 通过");
    expect(last).not.toContain("macOS (Apple Silicon) packaged smoke · 未通过");
  });

  it("re-reads a finished run every cycle but re-lists its jobs only when it moved", async () => {
    // The budget half of the fix. Watching for a re-run costs the list-runs call
    // the lane already made anyway; the paginated job list is spent only when
    // the run's own fields say something changed. Without that gate a 140-minute
    // watch would re-list every finished lane's jobs on every 30s poll.
    const settled: RunStub = {
      conclusion: "success",
      run_attempt: 1,
      status: "completed",
      updated_at: "2026-09-09T09:26:17Z",
    };
    const testsJobs = [done("E2E Vitest", "success"), ...TESTS_FAMILY_GREEN];
    const scenarios: Scenario[] = [1, 2, 3, 4, 5].map((cycle) => ({
      originJobs: originAt(cycle, 5, "running"),
      testsJobs,
      testsRun: settled,
    }));
    const started = await startStub(scenarios);
    server = started.server;

    expect(
      await runWatcher({
        baseUrl: started.url,
        expectSmoke: false,
        expectTests: true,
        outputFile: join(workdir, "cardrerun-budget.txt"),
      }),
    ).toBe(0);

    const cycles = started.counters.cycles;
    expect(cycles).toBeGreaterThanOrEqual(5);
    // Kept watching: one cheap list-runs call per cycle, for the whole watch.
    expect(started.counters.runListCalls["release-prerelease-tests.yml"] ?? 0).toBe(cycles);
    // Stayed cheap: the run never moved, so its jobs were listed exactly once.
    expect(started.counters.jobsCalls[TESTS_RUN_ID] ?? 0).toBe(1);
  });
});
