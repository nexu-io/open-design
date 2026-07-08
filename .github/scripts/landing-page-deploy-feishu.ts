#!/usr/bin/env node

// Posts a Feishu (Lark) interactive card to the landing group right after a
// `landing-page-production` promotion finishes. This is the production-deploy
// analog of `notify-release-feishu` (packaged builds) and the daily QA digest
// (`landing-page-daily-feishu`): it answers "the live site just changed — what
// shipped, who shipped it, and why".
//
// Unlike the daily digest this card is anchored to ONE deploy event, so it
// reports success/failure, the exact deployed commit, the operator and their
// "why promote now?" reason, and the landing-relevant changelog since the
// previous successful production deploy.
//
// Inputs (all via env):
//   FEISHU_WEBHOOK       (required) custom-bot webhook URL
//   FEISHU_SIGN_SECRET   (optional) signing secret when the bot enables 签名校验
//   GITHUB_REPOSITORY    (required) owner/name — used for commit links + run lookup
//   GH_TOKEN             (required for `run`) token with actions:read to find the
//                        previous production run; not needed for `self-check`
//   DEPLOY_RESULT        deploy job result: success | failure (default success)
//   DEPLOY_SHA           the commit that production shipped (github.sha)
//   ACTOR                who dispatched the promotion (github.actor)
//   REASON               the workflow_dispatch "Why promote now?" input
//   PRODUCTION_URL       live site URL (default https://open-design.ai)
//   RUN_ID               this workflow run id, to exclude it from the baseline lookup
//   RUN_URL              link back to the GitHub Actions run
//
// Two commands: `run` (post the card) and `self-check` (build a card from
// fixtures and assert the copy, no network) — mirrors landing-page-daily-feishu.ts.

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

type WorkflowRun = {
  conclusion: string | null;
  created_at: string;
  head_sha: string;
  html_url: string;
  id: number;
  run_number: number;
  status: string;
};

type WorkflowRunsResponse = {
  workflow_runs: WorkflowRun[];
};

type ChangelogEntry = { sha: string; subject: string };

type Changelog = {
  entries: ChangelogEntry[];
  previous: WorkflowRun | null;
  rangeTotal: number;
  truncated: number;
};

const PRODUCTION_WORKFLOW = "landing-page-production.yml";

// Commits that touch these paths can change what the deployed site renders.
// Kept in sync in spirit with landing-page-daily-feishu.ts so the "what shipped"
// story is consistent across the two cards. Non-landing commits on `main`
// (daemon, web, …) are filtered out — a production deploy only rebuilds the
// landing page, so they are noise here.
const LANDING_PATHSPECS = [
  "apps/landing-page/",
  "craft/",
  "design-systems/",
  "design-templates/open-design-landing/",
  "plugins/",
  "skills/",
  "templates/",
  ".github/workflows/landing-page-production.yml",
  ".github/workflows/landing-page-staging.yml",
  ".github/workflows/landing-page-ci.yml",
];

const MAX_CHANGELOG_LINES = 25;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function githubApiBase(): string {
  return optionalEnv("GITHUB_API_URL", "https://api.github.com").replace(/\/+$/, "");
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 15000)));
}

async function githubJson<T>(path: string): Promise<T> {
  const token = requiredEnv("GH_TOKEN");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let response;
    try {
      response = await fetch(`${githubApiBase()}${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
    } catch (error) {
      if (attempt === 5) throw error;
      await retryDelay(attempt);
      continue;
    }
    if (response.ok) {
      return (await response.json()) as T;
    }
    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 5) {
      throw new Error(`GitHub API ${path} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
    }
    console.warn(`[landing-deploy-feishu] GitHub API ${path} attempt ${attempt}/5: HTTP ${response.status}`);
    await retryDelay(attempt);
  }
  throw new Error(`GitHub API ${path} failed`);
}

// The previous successful production deploy: the newest completed+success run
// for the production workflow on `main`, excluding this run. That commit is the
// changelog baseline. At notify time this run is still in_progress, so it would
// be skipped anyway, but excluding by id keeps the lookup correct on reruns.
async function findPreviousProductionRun(repo: string, currentRunId: number): Promise<WorkflowRun | null> {
  const response = await githubJson<WorkflowRunsResponse>(
    `/repos/${repo}/actions/workflows/${PRODUCTION_WORKFLOW}/runs?branch=main&status=success&per_page=20`,
  );
  return (
    response.workflow_runs
      .filter((run) => run.id !== currentRunId && run.status === "completed" && run.conclusion === "success")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
  );
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function commitExists(sha: string): boolean {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function deployedSubject(sha: string): string {
  if (!commitExists(sha)) return "";
  return gitOutput(["log", "-1", "--pretty=%s", sha]);
}

// Landing-relevant, non-merge commits in (previous, current]. Uses a unit
// separator so subjects containing arbitrary punctuation round-trip cleanly.
function collectChangelog(previous: WorkflowRun | null, current: string): Changelog {
  if (previous == null || !commitExists(previous.head_sha) || !commitExists(current)) {
    return { entries: [], previous, rangeTotal: 0, truncated: 0 };
  }
  const range = `${previous.head_sha}..${current}`;
  const rangeTotal = gitOutput(["rev-list", "--no-merges", "--count", range])
    .split("\n")
    .map((line) => Number.parseInt(line, 10))
    .find((n) => Number.isFinite(n)) ?? 0;
  const raw = gitOutput(["log", "--no-merges", "--pretty=format:%h\x1f%s", range, "--", ...LANDING_PATHSPECS]);
  const all = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, ...rest] = line.split("\x1f");
      return { sha: sha ?? "", subject: rest.join("\x1f") };
    });
  const truncated = Math.max(0, all.length - MAX_CHANGELOG_LINES);
  return { entries: all.slice(0, MAX_CHANGELOG_LINES), previous, rangeTotal, truncated };
}

function shortSha(sha: string): string {
  return sha.length >= 7 ? sha.slice(0, 7) : sha;
}

function shanghaiDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function sanitizeMarkdown(value: string): string {
  return value.replace(/\s+/g, " ").replaceAll("[", "［").replaceAll("]", "］").replaceAll("`", "'").trim();
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function commitLink(repo: string, sha: string): string {
  const short = shortSha(sha);
  return repo.length > 0 ? `[\`${short}\`](https://github.com/${repo}/commit/${sha})` : `\`${short}\``;
}

function changelogMarkdown(repo: string, changelog: Changelog): string {
  if (changelog.previous == null) {
    return "未找到上一次成功的正式部署,无法对比(可能是首次部署)。";
  }
  const base = `对比基线: [run #${changelog.previous.run_number}](${changelog.previous.html_url}) @ ${shortSha(changelog.previous.head_sha)}`;
  if (changelog.entries.length === 0) {
    const range = changelog.rangeTotal > 0 ? `(区间共 ${changelog.rangeTotal} 条提交,均与 landing 无关)` : "(区间无新增提交)";
    return `${base}\n本次部署未包含 landing 相关代码改动${range}。`;
  }
  const lines = changelog.entries.map((entry) => `- ${truncateText(sanitizeMarkdown(entry.subject), 90)} (${commitLink(repo, entry.sha)})`);
  const more = changelog.truncated > 0 ? `\n- …还有 ${changelog.truncated} 条 landing 相关提交` : "";
  return `${base}\n${lines.join("\n")}${more}`;
}

function buildCard(params: {
  actor: string;
  changelog: Changelog;
  deploySha: string;
  deployedSubject: string;
  now: Date;
  productionUrl: string;
  reason: string;
  repo: string;
  runUrl: string;
  success: boolean;
}): Record<string, unknown> {
  const { actor, changelog, deploySha, deployedSubject: subject, now, productionUrl, reason, repo, runUrl, success } = params;

  const fields: Record<string, unknown>[] = [
    { is_short: true, text: { tag: "lark_md", content: `**状态**\n${success ? "✅ 成功" : "❌ 失败"}` } },
    { is_short: true, text: { tag: "lark_md", content: `**部署提交**\n${deploySha.length > 0 ? commitLink(repo, deploySha) : "未知"}` } },
    { is_short: true, text: { tag: "lark_md", content: `**发布人**\n${actor.length > 0 ? actor : "未知"}` } },
    { is_short: true, text: { tag: "lark_md", content: `**发布时间**\n${shanghaiDateTime(now)}` } },
  ];

  const detailLines = [
    subject.length > 0 ? `**HEAD 提交**: ${truncateText(sanitizeMarkdown(subject), 100)}` : "",
    `**发布理由**: ${reason.length > 0 ? truncateText(sanitizeMarkdown(reason), 200) : "未填写"}`,
  ].filter(Boolean);

  const elements: Record<string, unknown>[] = [
    { tag: "div", fields },
    { tag: "div", text: { tag: "lark_md", content: detailLines.join("\n") } },
    { tag: "hr" },
    {
      tag: "div",
      text: { tag: "lark_md", content: `**自上次正式部署以来的 landing 改动**\n${changelogMarkdown(repo, changelog)}` },
    },
    { tag: "hr" },
    {
      tag: "action",
      actions: [
        { tag: "button", text: { tag: "plain_text", content: "打开 open-design.ai" }, type: "primary", url: productionUrl },
      ],
    },
  ];

  if (runUrl.length > 0) {
    elements.push({ tag: "note", elements: [{ tag: "lark_md", content: `[GitHub Actions run](${runUrl})` }] });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: success ? "green" : "red",
      title: { tag: "plain_text", content: success ? "🌐 Landing 正式发布 · open-design.ai" : "🌐 Landing 正式发布失败 · open-design.ai" },
    },
    elements,
  };
}

function signedEnvelope(card: Record<string, unknown>): Record<string, unknown> {
  const body = { msg_type: "interactive", card };
  const signSecret = optionalEnv("FEISHU_SIGN_SECRET");
  if (signSecret.length === 0) return body;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHmac("sha256", `${timestamp}\n${signSecret}`).update("").digest("base64");
  return { timestamp, sign, ...body };
}

async function postFeishu(card: Record<string, unknown>): Promise<void> {
  const webhook = requiredEnv("FEISHU_WEBHOOK");
  const body = signedEnvelope(card);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let response;
    try {
      response = await fetch(webhook, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (error) {
      console.warn(`[landing-deploy-feishu] POST attempt ${attempt}/5 threw: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt === 5) throw error;
      await retryDelay(attempt);
      continue;
    }
    const text = await response.text();
    let code: unknown = null;
    try {
      const parsed = JSON.parse(text) as { code?: unknown; StatusCode?: unknown };
      code = parsed.code ?? parsed.StatusCode ?? null;
    } catch {
      // Feishu normally returns JSON; keep the HTTP status fallback.
    }
    if (response.ok && (code === 0 || code == null)) {
      console.log(`[landing-deploy-feishu] delivered (HTTP ${response.status}, code ${code ?? "n/a"})`);
      return;
    }
    const retryable = response.status === 429 || response.status >= 500 || code === 9499;
    console.warn(`[landing-deploy-feishu] attempt ${attempt}/5 failed: HTTP ${response.status} code ${String(code)} ${text.slice(0, 300)}`);
    if (!retryable || attempt === 5) {
      throw new Error(`Feishu webhook failed: HTTP ${response.status} code ${String(code)}`);
    }
    await retryDelay(attempt);
  }
}

async function run(): Promise<void> {
  const repo = requiredEnv("GITHUB_REPOSITORY");
  const now = new Date();
  const deploySha = optionalEnv("DEPLOY_SHA");
  const success = optionalEnv("DEPLOY_RESULT", "success") === "success";
  const runId = Number.parseInt(optionalEnv("RUN_ID", "0"), 10) || 0;

  const previous = await findPreviousProductionRun(repo, runId);
  const changelog = collectChangelog(previous, deploySha);

  const card = buildCard({
    actor: optionalEnv("ACTOR"),
    changelog,
    deploySha,
    deployedSubject: deployedSubject(deploySha),
    now,
    productionUrl: optionalEnv("PRODUCTION_URL", "https://open-design.ai"),
    reason: optionalEnv("REASON"),
    repo,
    runUrl: optionalEnv("RUN_URL"),
    success,
  });

  console.log(
    JSON.stringify(
      {
        deploySha: shortSha(deploySha),
        success,
        previousProductionRun: previous == null ? null : { run_number: previous.run_number, head_sha: shortSha(previous.head_sha), url: previous.html_url },
        landingCommits: changelog.entries.length,
        rangeTotal: changelog.rangeTotal,
      },
      null,
      2,
    ),
  );
  await postFeishu(card);
}

function selfCheck(): void {
  const now = new Date();
  const previous: WorkflowRun = {
    conclusion: "success",
    created_at: now.toISOString(),
    head_sha: "a".repeat(40),
    html_url: "https://github.com/nexu-io/open-design/actions/runs/1",
    id: 1,
    run_number: 41,
    status: "completed",
  };
  const changelog: Changelog = {
    entries: [
      { sha: "1234567", subject: "feat(landing-page): add /showcase gallery" },
      { sha: "89abcde", subject: "fix(landing-page): tighten hero [spacing] on `mobile`" },
    ],
    previous,
    rangeTotal: 12,
    truncated: 0,
  };
  const card = buildCard({
    actor: "lefarcen",
    changelog,
    deploySha: "f".repeat(40),
    deployedSubject: "chore(release): promote landing to production",
    now,
    productionUrl: "https://open-design.ai",
    reason: "Ship the new showcase gallery",
    repo: "nexu-io/open-design",
    runUrl: "https://github.com/nexu-io/open-design/actions/runs/2",
    success: true,
  });
  const json = JSON.stringify(card);
  if (!json.includes("Landing 正式发布") || !json.includes("open-design.ai")) {
    throw new Error("self-check expected production-deploy header + live URL");
  }
  if (!json.includes("发布理由") || !json.includes("发布人")) {
    throw new Error("self-check expected operator + reason fields");
  }
  if (!json.includes("自上次正式部署以来的 landing 改动") || !json.includes("run #41")) {
    throw new Error("self-check expected changelog section anchored on previous production run");
  }
  // Bracket/backtick in subjects must be sanitized so they can't break lark_md.
  if (json.includes("[spacing]") || json.includes("`mobile`")) {
    throw new Error("self-check expected markdown sanitization of commit subjects");
  }
  // Failure path flips header color + title.
  const failCard = buildCard({
    actor: "lefarcen",
    changelog: { entries: [], previous: null, rangeTotal: 0, truncated: 0 },
    deploySha: "f".repeat(40),
    deployedSubject: "",
    now,
    productionUrl: "https://open-design.ai",
    reason: "",
    repo: "nexu-io/open-design",
    runUrl: "",
    success: false,
  });
  const failJson = JSON.stringify(failCard);
  if (!failJson.includes('"template":"red"') || !failJson.includes("失败")) {
    throw new Error("self-check expected red failure card");
  }
  if (!failJson.includes("未填写") || !failJson.includes("首次部署")) {
    throw new Error("self-check expected empty-reason + no-baseline fallbacks");
  }
  if (PRODUCTION_WORKFLOW !== "landing-page-production.yml") {
    throw new Error("self-check expected production workflow to stay landing-page-production.yml");
  }
  console.log("[landing-deploy-feishu] self-check passed");
}

const command = process.argv[2] ?? "run";
if (command === "self-check") {
  selfCheck();
} else if (command === "run") {
  await run();
} else {
  throw new Error(`Unknown command: ${command}`);
}
