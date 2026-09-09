// Watches one prerelease across three workflow runs and keeps a single Feishu
// card up to date.
//
// The single-writer rule is the whole design. A PATCH replaces the entire card,
// so if the three build jobs each tried to update "their" row they would each
// overwrite the other two — every one of them only knows its own state. Nothing
// in the build path talks to Feishu at all: this job owns the message, and it
// learns everything by polling the GitHub jobs API of
//   * the release-prerelease run that is building and publishing,
//   * the release-prerelease-tests run dispatched alongside it,
//   * the release-prerelease-smoke run dispatched after publish.
//
// It starts immediately and depends on nothing, so it costs the release
// pipeline nothing; it lives in a workflow of its own so it cannot hold the
// pipeline's repository-wide concurrency group.
//
// The card is posted on the first poll, before any package exists, and every
// later state is an edit of that same message. The fear that used to withhold
// it — a "构建中…" card left standing forever when a build dies — is answered by
// the machinery that grew around it since: a failed lane renders its own
// terminal state, a release where nothing shipped turns the card red, and the
// watcher's own timeout stamps the card instead of abandoning it. Silence
// during the entire build window bought nothing and cost the channel the one
// thing it wanted, which is knowing a release is under way.

import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { FeishuAppClient } from "./feishu-app.ts";
import {
  PLATFORM_LABELS,
  PLATFORM_ORDER,
  isTerminal,
  readChangelogLines,
  renderPrereleaseCard,
  undiscoveredLaneStatus,
} from "./prerelease-card.ts";
import type {
  Changelog,
  LaneStatus,
  LaneTiming,
  PlatformKey,
  PlatformLane,
  PrereleaseCardState,
  TestLane,
} from "./prerelease-card.ts";

type GithubJob = {
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
  started_at?: unknown;
  completed_at?: unknown;
};
type GithubRun = { id?: unknown; name?: unknown; html_url?: unknown; status?: unknown };
type DispatchedRun = { completed: boolean; id: string; url: string };

function required(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw.length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = optional(name).toLowerCase();
  if (raw.length === 0) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

const apiBase = optional("GITHUB_API_URL", "https://api.github.com").replace(/\/+$/, "");
const serverUrl = optional("GITHUB_SERVER_URL", "https://github.com").replace(/\/+$/, "");
const repo = required("GITHUB_REPOSITORY");
const githubToken = optional("GH_TOKEN") || required("GITHUB_TOKEN");

const version = required("VERSION");
const commit = optional("COMMIT");
const branch = optional("BRANCH");
const previousCommit = optional("PREVIOUS_COMMIT");
const channelLabel = optional("CHANNEL_LABEL", "Prerelease");
const channelSlug = optional("RELEASE_CHANNEL", "prerelease");
const originRunId = required("ORIGIN_RUN_ID");
const publicOrigin = optional("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const expectTests = boolEnv("EXPECT_TESTS", true);
const expectSmoke = boolEnv("EXPECT_SMOKE", true);

const pollIntervalMs = numberEnv("CARD_POLL_INTERVAL_MS", 30_000);
const timeoutMs = numberEnv("CARD_TIMEOUT_MS", 140 * 60 * 1000);
// How long a dispatched lane may take to become a visible run before the card
// reports it as never having started. Long enough to absorb a GitHub queue,
// short enough that a failed dispatch does not pin the card open for hours.
const discoveryGraceMs = numberEnv("CARD_DISCOVERY_GRACE_MS", 20 * 60 * 1000);

const testsWorkflowFile = optional("TESTS_WORKFLOW_FILE", "release-prerelease-tests.yml");
const smokeWorkflowFile = optional("SMOKE_WORKFLOW_FILE", "release-prerelease-smoke.yml");
// Both dispatched workflows put `origin-run <id>` in their run-name, which is
// the only reliable correlation the Actions API offers: `gh workflow run`
// returns no run id at all.
const runMarker = `origin-run ${originRunId}`;

const ORIGIN_BUILD_JOB: Record<PlatformKey, string> = {
  mac_arm64: "Build prerelease mac arm64",
  mac_x64: "Build prerelease mac intel x64",
  win_x64: "Build prerelease win x64",
  linux_x64: "Build prerelease linux x64",
};
const ORIGIN_PUBLISH_JOB = "Publish prerelease release";
const SMOKE_JOB: Record<PlatformKey, string> = {
  mac_arm64: "Smoke prerelease mac arm64",
  mac_x64: "Smoke prerelease mac intel x64",
  win_x64: "Smoke prerelease win x64",
  linux_x64: "Smoke prerelease linux x64",
};
const TEST_JOBS: Array<{ key: string; label: string; prefix: string }> = [
  { key: "functional_e2e", label: "P0 Functional E2E", prefix: "P0 Functional E2E" },
  { key: "e2e_vitest", label: "E2E Vitest", prefix: "E2E Vitest" },
  { key: "daemon_unit_tests", label: "Daemon 单测（4 分片）", prefix: "Daemon tests" },
  { key: "verify", label: "Verify build（typecheck + guard）", prefix: "Verify build" },
];

/**
 * A reusable workflow prefixes its jobs with the calling job's name
 * ("Build prerelease from release branch / Build prerelease mac arm64"), and a
 * caller-side job name can equally end up as the prefix. Match either side of a
 * " / " boundary so the same catalogue works whether release-prerelease was
 * called or dispatched directly.
 */
function jobMatches(jobName: string, needle: string): boolean {
  return (
    jobName === needle ||
    jobName.endsWith(` / ${needle}`) ||
    jobName.startsWith(`${needle} / `) ||
    jobName.includes(` / ${needle} / `)
  );
}

function jobFamilyMatches(jobName: string, prefix: string): boolean {
  const tail = jobName.includes(" / ") ? (jobName.split(" / ").pop() ?? jobName) : jobName;
  const head = jobName.split(" / ")[0] ?? jobName;
  return tail.startsWith(prefix) || head.startsWith(prefix) || jobName.startsWith(prefix);
}

function statusOf(job: GithubJob): LaneStatus {
  const status = typeof job.status === "string" ? job.status : "";
  if (status === "queued" || status === "waiting" || status === "pending" || status === "requested") return "pending";
  if (status === "in_progress") return "running";
  const conclusion = typeof job.conclusion === "string" ? job.conclusion : "";
  if (conclusion === "success" || conclusion === "neutral") return "success";
  if (conclusion === "skipped") return "skipped";
  if (conclusion === "cancelled") return "cancelled";
  if (conclusion.length === 0) return "running";
  return "failure";
}

const NO_TIMING: LaneTiming = { startedAt: null, completedAt: null };

function epochMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The job's wall clock, taken verbatim.
 *
 * No interpretation happens here on purpose: GitHub sets `started_at` on a
 * QUEUED job too, and deciding which of these numbers is meaningful belongs to
 * the renderer, which is the only place that also knows the lane's status.
 */
function timingOf(job: GithubJob | undefined): LaneTiming {
  if (job == null) return NO_TIMING;
  return { startedAt: epochMs(job.started_at), completedAt: epochMs(job.completed_at) };
}

/** Worst-wins, with "still moving" beating "all done" so a family never reads terminal early. */
function rollup(statuses: LaneStatus[]): LaneStatus {
  if (statuses.length === 0) return "unknown";
  if (statuses.some((status) => status === "failure")) return "failure";
  if (statuses.some((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "pending")) return "pending";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "success";
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} failed: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function listJobs(runId: string): Promise<GithubJob[]> {
  const jobs: GithubJob[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const body = await githubJson<{ jobs?: GithubJob[]; total_count?: number }>(
      `/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}&filter=latest`,
    );
    const batch = body.jobs ?? [];
    jobs.push(...batch);
    if (batch.length < 100) break;
  }
  return jobs;
}

/**
 * When the origin run was created — the start of the round's own clock.
 *
 * Read in its own try/catch rather than inside the poll: the total elapsed time
 * is a convenience, and losing it must never cost the card a whole cycle of
 * lane states. Retried every cycle until it lands, so one 5xx does not drop it
 * for the rest of the watch.
 */
async function readRunCreatedAt(): Promise<number | null> {
  try {
    const run = await githubJson<{ created_at?: unknown; run_started_at?: unknown }>(
      `/repos/${repo}/actions/runs/${originRunId}`,
    );
    return epochMs(run.created_at) ?? epochMs(run.run_started_at);
  } catch (error) {
    console.warn(`[card] could not read run start: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function findDispatchedRun(workflowFile: string): Promise<DispatchedRun | null> {
  const body = await githubJson<{ workflow_runs?: GithubRun[] }>(
    `/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=40`,
  );
  for (const run of body.workflow_runs ?? []) {
    const name = typeof run.name === "string" ? run.name : "";
    if (!name.includes(runMarker)) continue;
    return {
      completed: run.status === "completed",
      id: String(run.id),
      url: typeof run.html_url === "string" ? run.html_url : "",
    };
  }
  return null;
}

const ARTIFACT_BASENAME: Record<PlatformKey, string> = {
  mac_arm64: "mac-arm64.dmg",
  mac_x64: "mac-x64.dmg",
  win_x64: "win-x64-setup.exe",
  linux_x64: "linux-x64.AppImage",
};

function downloadUrlFor(platform: PlatformKey): string {
  if (publicOrigin.length === 0) return "";
  return `${publicOrigin}/${channelSlug}/versions/${version}/open-design-${version}-${ARTIFACT_BASENAME[platform]}`;
}

const verifiedUrls = new Set<string>();

/**
 * The card links straight at R2, so a wrong URL would ship a 404 button to the
 * whole channel. HEAD it once per platform; a miss just means no button on this
 * cycle and another attempt on the next, which also absorbs R2 propagation.
 */
async function verifyDownloadUrl(url: string): Promise<boolean> {
  if (url.length === 0) return false;
  if (verifiedUrls.has(url)) return true;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.ok) {
      verifiedUrls.add(url);
      return true;
    }
    console.warn(`[card] download url not reachable yet (HTTP ${response.status}): ${url}`);
  } catch (error) {
    console.warn(`[card] download url HEAD threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
}

function readChangelog(): Changelog {
  const file = optional("CHANGELOG_FILE");
  if (file.length === 0 || !existsSync(file)) return { lines: [], total: 0, truncated: false };
  try {
    return readChangelogLines(readFileSync(file, "utf8"));
  } catch {
    return { lines: [], total: 0, truncated: false };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The watcher's report to the fallback job: `card_delivered=true` means the
 * card's FINAL state is in the chat.
 *
 * The job's own result cannot carry this. Every Feishu failure below is caught
 * on purpose — one hiccup must not end a two-hour watch — so an application bot
 * whose credentials expired, or which was removed from the chat, produces a
 * green job and an empty channel. Writing the signal only on the delivered path
 * is what lets the fallback tell that apart from a healthy release, and writing
 * it for the FINAL render (not the first) also catches a card that was posted
 * and then froze because the closing update could not be written.
 */
function reportDelivered(): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file == null || file.length === 0) return;
  try {
    appendFileSync(file, "card_delivered=true\n");
  } catch (error) {
    console.warn(`[card] could not record delivery: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type Watch = {
  originJobs: GithubJob[];
  publish: LaneStatus;
  /** When publish stopped, once it has. Feeds the card's whole-round clock. */
  publishCompletedAt: number | null;
  testsRun: DispatchedRun | null;
  testsJobs: GithubJob[];
  smokeRun: DispatchedRun | null;
  smokeJobs: GithubJob[];
  publishSucceededAt: number | null;
  runCreatedAt: number | null;
};

async function collect(previous: Watch): Promise<Watch> {
  const runCreatedAt = previous.runCreatedAt ?? (await readRunCreatedAt());
  const originJobs = await listJobs(originRunId);
  const publishJob = originJobs.find((job) => jobMatches(String(job.name ?? ""), ORIGIN_PUBLISH_JOB));
  const publish = publishJob == null ? "pending" : statusOf(publishJob);
  // Only a terminal publish has a completion to report; a job the API has not
  // finished with can still carry a stale or absent stamp.
  const publishCompletedAt = isTerminal(publish) ? timingOf(publishJob).completedAt : null;

  // Re-listed every cycle rather than cached, because the run's own
  // completion is what tells a MISSING job apart from a job the API has not
  // created yet. A run that has only just started reports a partial job list,
  // and reading that as "skipped" would fabricate green.
  let testsRun = previous.testsRun;
  let testsJobs = previous.testsJobs;
  if (expectTests && !(previous.testsRun?.completed ?? false)) {
    testsRun = (await findDispatchedRun(testsWorkflowFile)) ?? previous.testsRun;
    if (testsRun != null) testsJobs = await listJobs(testsRun.id);
  }

  let smokeRun = previous.smokeRun;
  let smokeJobs = previous.smokeJobs;
  // The smoke run is only dispatched once publish succeeds, so do not even look
  // for it before then — an early lookup would only burn API budget.
  if (expectSmoke && publish === "success" && !(previous.smokeRun?.completed ?? false)) {
    smokeRun = (await findDispatchedRun(smokeWorkflowFile)) ?? previous.smokeRun;
    if (smokeRun != null) smokeJobs = await listJobs(smokeRun.id);
  }

  return {
    originJobs,
    publish,
    publishCompletedAt,
    testsRun,
    testsJobs,
    smokeRun,
    smokeJobs,
    publishSucceededAt: previous.publishSucceededAt ?? (publish === "success" ? Date.now() : null),
    runCreatedAt,
  };
}

async function buildState(watch: Watch, startedAt: number, timedOut: boolean): Promise<PrereleaseCardState> {
  // Computed once, up front, and used BOTH to decide what a lane says and to
  // decide when the watcher may stop waiting for it. Deriving these twice is
  // what let the card report a never-dispatched smoke lane as "排队中" while
  // simultaneously concluding it had waited long enough to finish.
  const testsDiscoveryExpired = watch.testsRun == null && Date.now() - startedAt > discoveryGraceMs;
  const smokeDiscoveryExpired =
    watch.smokeRun == null &&
    watch.publishSucceededAt != null &&
    Date.now() - watch.publishSucceededAt > discoveryGraceMs;

  const platforms: PlatformLane[] = [];
  for (const key of PLATFORM_ORDER) {
    const job = watch.originJobs.find((candidate) => jobMatches(String(candidate.name ?? ""), ORIGIN_BUILD_JOB[key]));
    const build: LaneStatus = job == null ? "skipped" : statusOf(job);
    let downloadUrl = "";
    if (build === "success" && (await verifyDownloadUrl(downloadUrlFor(key)))) {
      downloadUrl = downloadUrlFor(key);
    }
    let smoke: LaneStatus = "skipped";
    if (expectSmoke && build === "success") {
      const smokeJob = watch.smokeJobs.find((candidate) => jobMatches(String(candidate.name ?? ""), SMOKE_JOB[key]));
      // Linux never had a lane in the packaged smoke workflow; a platform with
      // no job there stays "skipped" rather than pretending to be pending.
      if (key === "linux_x64") smoke = "skipped";
      else if (smokeJob != null) smoke = statusOf(smokeJob);
      // No job for this platform. Only a COMPLETED run proves it genuinely did
      // not run; while the run is still going, a missing job just means the API
      // has not created it yet — and a run that never appeared at all before
      // the discovery window closed was never dispatched.
      else if (watch.smokeRun != null || watch.publish === "success") {
        smoke = undiscoveredLaneStatus({
          runFound: watch.smokeRun != null,
          runCompleted: watch.smokeRun?.completed === true,
          discoveryExpired: smokeDiscoveryExpired,
        });
      } else smoke = "skipped";
    }
    platforms.push({ key, label: PLATFORM_LABELS[key], build, downloadUrl, smoke, timing: timingOf(job) });
  }

  const tests: TestLane[] = TEST_JOBS.map((entry) => {
    if (!expectTests) return { key: entry.key, label: entry.label, status: "skipped" as LaneStatus };
    const family = watch.testsJobs.filter((job) => jobFamilyMatches(String(job.name ?? ""), entry.prefix));
    if (family.length === 0) {
      // Same rule as the smoke lanes: only a COMPLETED run proves a job is
      // absent rather than not yet created, and a run that never appeared
      // before the discovery window closed was never dispatched at all.
      return {
        key: entry.key,
        label: entry.label,
        status: undiscoveredLaneStatus({
          runFound: watch.testsRun != null,
          runCompleted: watch.testsRun?.completed === true,
          discoveryExpired: testsDiscoveryExpired,
        }),
      };
    }
    return { key: entry.key, label: entry.label, status: rollup(family.map(statusOf)) };
  });

  const originDone = platforms.every((platform) => isTerminal(platform.build)) && isTerminal(watch.publish);
  const testsDone = !expectTests
    ? true
    : watch.testsRun == null
      ? testsDiscoveryExpired
      : tests.every((test) => isTerminal(test.status));
  const smokeDone = !expectSmoke
    ? true
    : watch.publish !== "success"
      ? isTerminal(watch.publish)
      : watch.smokeRun == null
        ? smokeDiscoveryExpired
        : platforms.every((platform) => isTerminal(platform.smoke));

  return {
    channelLabel,
    version,
    branch,
    commit,
    previousCommit,
    repo,
    originRunUrl: `${serverUrl}/${repo}/actions/runs/${originRunId}`,
    testsRunUrl: watch.testsRun?.url ?? "",
    smokeRunUrl: watch.smokeRun?.url ?? "",
    changelog: readChangelog(),
    platforms,
    tests,
    expectTests,
    expectSmoke,
    finished: originDone && testsDone && smokeDone,
    timedOut,
    now: Date.now(),
    runCreatedAt: watch.runCreatedAt,
    publishCompletedAt: watch.publishCompletedAt,
  };
}

async function main(): Promise<void> {
  const client = new FeishuAppClient({
    appId: required("FEISHU_APP_ID"),
    appSecret: required("FEISHU_APP_SECRET"),
  });
  const chatId = required("FEISHU_RELEASE_CHAT_ID");

  const startedAt = Date.now();
  let watch: Watch = {
    originJobs: [],
    publish: "pending",
    publishCompletedAt: null,
    testsRun: null,
    testsJobs: [],
    smokeRun: null,
    smokeJobs: [],
    publishSucceededAt: null,
    runCreatedAt: null,
  };
  let messageId: string | null = null;
  let lastRendered = "";
  // Whether the chat currently holds the render this loop last produced.
  let chatHoldsLatest = false;

  for (;;) {
    const timedOut = Date.now() - startedAt > timeoutMs;
    try {
      watch = await collect(watch);
    } catch (error) {
      // A transient API failure must not end the watch: the card would freeze
      // mid-release with no way back.
      console.warn(`[card] poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const state = await buildState(watch, startedAt, timedOut);
    const done = state.finished || timedOut;

    // No gate: the first render goes to the chat whatever it says, and every
    // one after it edits that same message. The only thing that suppresses a
    // write is "this render is identical to the one already delivered", which
    // is why the live durations are quantized to the minute — see
    // formatElapsed.
    const card = renderPrereleaseCard(state);
    const rendered = JSON.stringify(card);
    if (rendered !== lastRendered) {
      try {
        if (messageId == null) {
          messageId = await client.sendCard(chatId, card);
          console.log(`[card] posted ${messageId}`);
        } else {
          await client.patchCard(messageId, card);
          console.log("[card] updated");
        }
        lastRendered = rendered;
        chatHoldsLatest = true;
      } catch (error) {
        // Keep watching. The next cycle re-renders from the same state and
        // tries again, so one Feishu hiccup does not lose the card.
        console.warn(`[card] delivery failed: ${error instanceof Error ? error.message : String(error)}`);
        chatHoldsLatest = false;
      }
    }

    if (done) {
      if (chatHoldsLatest) reportDelivered();
      else console.warn("::warning::the prerelease card never reached the chat; the fallback notice takes over");
      if (timedOut && !state.finished) {
        console.warn(`::warning::prerelease card watcher timed out after ${Math.round(timeoutMs / 60000)} minutes`);
      }
      return;
    }
    await sleep(pollIntervalMs);
  }
}

await main();
