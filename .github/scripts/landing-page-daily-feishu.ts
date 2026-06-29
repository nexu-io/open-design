#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

type PullFile = {
  filename: string;
};

type PullRequest = {
  draft: boolean;
  html_url: string;
  merge_commit_sha: string | null;
  merged_at: string | null;
  number: number;
  state: "open" | "closed";
  title: string;
  updated_at: string;
  user?: { login?: string };
};

type SearchIssue = {
  number: number;
};

type SearchResponse = {
  items: SearchIssue[];
  total_count: number;
};

type WorkflowRun = {
  conclusion: string | null;
  created_at: string;
  event: string;
  head_sha: string;
  html_url: string;
  id: number;
  name: string | null;
  run_attempt?: number;
  run_number: number;
  run_started_at?: string | null;
  status: string;
  updated_at: string;
};

type WorkflowRunsResponse = {
  workflow_runs: WorkflowRun[];
};

type LandingPull = {
  files: PullFile[];
  pull: PullRequest;
};

type StagingSnapshot = {
  current: WorkflowRun | null;
  inFlight: WorkflowRun | null;
  failed: WorkflowRun | null;
};

type DeploymentState =
  | { kind: "deployed"; label: string; run: WorkflowRun }
  | { kind: "deploying"; label: string; run: WorkflowRun }
  | { kind: "failed"; label: string; run: WorkflowRun }
  | { kind: "not-merged"; label: string }
  | { kind: "pending"; label: string };

const LANDING_EXACT_PATHS = new Set([
  ".github/workflows/blog-indexing-on-deploy.yml",
  ".github/workflows/landing-page-ci.yml",
  ".github/workflows/landing-page-production.yml",
  ".github/workflows/landing-page-staging.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);

const LANDING_PREFIXES = [
  "apps/landing-page/",
  "craft/",
  "design-systems/",
  "design-templates/open-design-landing/",
  "plugins/",
  "skills/",
  "templates/",
];

const MAX_CARD_PULLS = 30;
const PR_FETCH_CONCURRENCY = 8;
const STAGING_URL = "https://staging.open-design.ai";
const STAGING_WORKFLOW = "landing-page-staging.yml";
const PRODUCTION_WORKFLOW = "landing-page-production.yml";

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
      throw new Error(`GitHub API ${path} failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    }
    console.warn(`[landing-feishu] GitHub API ${path} attempt ${attempt}/5 failed: HTTP ${response.status}`);
    await retryDelay(attempt);
  }
  throw new Error(`GitHub API ${path} failed`);
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 15000)));
}

function encodeQuery(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
}

async function searchPullNumbers(repo: string, since: Date): Promise<number[]> {
  const query = `repo:${repo} is:pr is:merged base:main merged:>=${since.toISOString()}`;
  const numbers: number[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubJson<SearchResponse>(
      `/search/issues?${encodeQuery({ q: query, sort: "updated", order: "desc", per_page: 100, page })}`,
    );
    numbers.push(...response.items.map((item) => item.number));
    if (numbers.length >= response.total_count || response.items.length < 100) break;
  }
  return [...new Set(numbers)];
}

async function pullRequest(repo: string, number: number): Promise<PullRequest> {
  return githubJson<PullRequest>(`/repos/${repo}/pulls/${number}`);
}

async function pullFiles(repo: string, number: number): Promise<PullFile[]> {
  const files: PullFile[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const pageFiles = await githubJson<PullFile[]>(`/repos/${repo}/pulls/${number}/files?${encodeQuery({ per_page: 100, page })}`);
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
  }
  return files;
}

async function workflowRuns(repo: string, workflow: string): Promise<WorkflowRun[]> {
  const response = await githubJson<WorkflowRunsResponse>(
    `/repos/${repo}/actions/workflows/${workflow}/runs?${encodeQuery({ branch: "main", per_page: 100 })}`,
  );
  return response.workflow_runs;
}

function latestSuccessfulRun(runs: WorkflowRun[]): WorkflowRun | null {
  return sortRunsNewestFirst(runs).find((run) => run.status === "completed" && run.conclusion === "success") ?? null;
}

function sortRunsNewestFirst(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((a, b) => {
    const timeDiff = runOperationalTime(b) - runOperationalTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.run_attempt ?? 1) - (a.run_attempt ?? 1);
  });
}

function runOperationalTime(run: WorkflowRun | null): number {
  if (run == null) return 0;
  return new Date(run.run_started_at ?? run.updated_at ?? run.created_at).getTime();
}

function createStagingSnapshot(stagingRuns: WorkflowRun[]): StagingSnapshot {
  const runs = sortRunsNewestFirst(stagingRuns);
  const current = latestSuccessfulRun(runs);
  const currentTime = runOperationalTime(current);
  const newerThanCurrent = (run: WorkflowRun) => runOperationalTime(run) > currentTime;
  return {
    current,
    inFlight:
      runs.find((run) => newerThanCurrent(run) && ["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status)) ?? null,
    failed: runs.find((run) => newerThanCurrent(run) && run.status === "completed" && run.conclusion !== "success") ?? null,
  };
}

function isLandingPath(path: string): boolean {
  return LANDING_EXACT_PATHS.has(path) || LANDING_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function landingBuckets(files: PullFile[]): string {
  const labels = new Set<string>();
  for (const { filename } of files) {
    if (filename.startsWith("apps/landing-page/")) labels.add("landing app");
    else if (filename.startsWith("design-templates/open-design-landing/")) labels.add("homepage template");
    else if (filename.startsWith("skills/")) labels.add("skills catalog");
    else if (filename.startsWith("design-systems/")) labels.add("systems catalog");
    else if (filename.startsWith("craft/")) labels.add("craft catalog");
    else if (filename.startsWith("templates/")) labels.add("templates catalog");
    else if (filename.startsWith("plugins/")) labels.add("plugins catalog");
    else if (filename.startsWith(".github/workflows/landing-page")) labels.add("landing CI");
    else if (filename.startsWith(".github/workflows/blog-indexing")) labels.add("blog indexing");
    else if (LANDING_EXACT_PATHS.has(filename)) labels.add("workspace plumbing");
  }
  return [...labels].join(", ") || "landing-related files";
}

function isAncestor(ancestor: string | null, descendant: string | null): boolean {
  if (ancestor == null || descendant == null) return false;
  if (ancestor === descendant) return true;
  if (!/^[0-9a-f]{40}$/.test(ancestor) || !/^[0-9a-f]{40}$/.test(descendant)) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveDeploymentState(pull: PullRequest, staging: StagingSnapshot): DeploymentState {
  if (pull.merged_at == null || pull.merge_commit_sha == null) {
    return { kind: "not-merged", label: pull.state === "open" ? "PR 未合并, staging 暂无" : "PR 已关闭未合并" };
  }

  if (staging.current != null && isAncestor(pull.merge_commit_sha, staging.current.head_sha)) {
    return { kind: "deployed", label: "已自动部署到当前 staging.open-design.ai", run: staging.current };
  }

  if (staging.inFlight != null && isAncestor(pull.merge_commit_sha, staging.inFlight.head_sha)) {
    return { kind: "deploying", label: "正在部署到 staging.open-design.ai", run: staging.inFlight };
  }

  if (staging.failed != null && isAncestor(pull.merge_commit_sha, staging.failed.head_sha)) {
    return { kind: "failed", label: `staging 部署 ${staging.failed.conclusion ?? "未成功"}`, run: staging.failed };
  }

  return { kind: "pending", label: "已合并, 当前 staging.open-design.ai 尚未包含" };
}

function shortSha(sha: string | null): string {
  return sha == null ? "" : sha.slice(0, 7);
}

function shanghaiDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function sanitizeMarkdown(value: string): string {
  return value.replace(/\s+/g, " ").replaceAll("[", "［").replaceAll("]", "］").replaceAll("`", "'");
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function stateLine(state: DeploymentState): string {
  if ("run" in state) {
    return `${state.label}: [run #${state.run.run_number}](${state.run.html_url})`;
  }
  return state.label;
}

function buildPullLine(item: LandingPull, index: number, state: DeploymentState): string {
  const { pull, files } = item;
  const title = truncate(sanitizeMarkdown(pull.title), 90);
  const actor = pull.user?.login != null ? ` by ${pull.user.login}` : "";
  const when =
    pull.merged_at != null
      ? `merged ${shanghaiDateTime(pull.merged_at)}`
      : pull.state === "open"
        ? `updated ${shanghaiDateTime(pull.updated_at)}`
        : `closed ${shanghaiDateTime(pull.updated_at)}`;
  const merge = pull.merge_commit_sha != null ? `, ${shortSha(pull.merge_commit_sha)}` : "";
  return [
    `${index + 1}. [#${pull.number} ${title}](${pull.html_url})`,
    `   - ${when}${actor}${merge}`,
    `   - 改动: ${landingBuckets(files)}`,
    `   - staging: ${stateLine(state)}`,
  ].join("\n");
}

function buildCard(params: {
  activeRuns: WorkflowRun[];
  deployedCount: number;
  landingPulls: LandingPull[];
  now: Date;
  productionRun: WorkflowRun;
  repo: string;
  runUrl: string;
  staging: StagingSnapshot;
  states: Map<number, DeploymentState>;
}): Record<string, unknown> {
  const { activeRuns, deployedCount, landingPulls, now, productionRun, repo, runUrl, staging, states } = params;
  const latestSuccess = staging.current;
  const deployingCount = [...states.values()].filter((state) => state.kind === "deploying").length;
  const headerTemplate = deployingCount > 0 ? "orange" : "blue";
  const shown = landingPulls.slice(0, MAX_CARD_PULLS);
  const omitted = Math.max(0, landingPulls.length - shown.length);
  const summaryLines = [
    `**仓库**: ${repo}`,
    `**验收范围**: 最近一次正式发布之后新增的 landing 相关 PR`,
    `**正式环境基线**: [production run #${productionRun.run_number}](${productionRun.html_url}) @ ${shortSha(productionRun.head_sha)}, ${shanghaiDateTime(productionRun.updated_at)}`,
    `**生成时间**: ${shanghaiDateTime(now)}`,
    `**staging**: [staging.open-design.ai](${STAGING_URL})`,
    latestSuccess != null
      ? `**最新成功 staging 部署**: [run #${latestSuccess.run_number}](${latestSuccess.html_url}) @ ${shortSha(latestSuccess.head_sha)}`
      : "**最新成功 staging 部署**: 未找到",
    activeRuns.length > 0 ? `**当前 staging 部署中**: ${activeRuns.map((run) => `[run #${run.run_number}](${run.html_url})`).join(", ")}` : "",
    runUrl.length > 0 ? `**本次汇总 CI**: [run](${runUrl})` : "",
  ].filter(Boolean);

  const pullLines =
    shown.length === 0
      ? "最近一次正式发布之后没有发现新增 landing 相关 PR。"
      : shown.map((item, index) => buildPullLine(item, index, states.get(item.pull.number) ?? { kind: "pending", label: "状态未知" })).join("\n");

  const footer = omitted > 0 ? `\n\n还有 ${omitted} 个 landing PR 未展示, 请打开本次汇总 CI 查看完整日志。` : "";

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate,
      title: { tag: "plain_text", content: "Landing QA 验收摘要" },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `${summaryLines.join("\n")}\n\n**待 QA 验收**: ${landingPulls.length} 个 landing PR, ${deployedCount} 个已进入 staging, ${deployingCount} 个正在部署。`,
        },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: { tag: "lark_md", content: `${pullLines}${footer}` },
      },
    ],
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
    const response = await fetch(webhook, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const text = await response.text();
    let code: unknown = null;
    try {
      const parsed = JSON.parse(text) as { code?: unknown; StatusCode?: unknown };
      code = parsed.code ?? parsed.StatusCode ?? null;
    } catch {
      // Feishu normally returns JSON, but preserve the HTTP status fallback.
    }
    if (response.ok && (code === 0 || code == null)) {
      console.log(`[landing-feishu] delivered (HTTP ${response.status}, code ${code ?? "n/a"})`);
      return;
    }
    const retryable = response.status === 429 || response.status >= 500 || code === 9499;
    console.warn(`[landing-feishu] attempt ${attempt}/5 failed: HTTP ${response.status} code ${String(code)} ${text.slice(0, 500)}`);
    if (!retryable || attempt === 5) {
      throw new Error(`Feishu webhook failed: HTTP ${response.status} code ${String(code)}`);
    }
    await retryDelay(attempt);
  }
}

async function collectLandingPullsSinceProduction(repo: string, productionRun: WorkflowRun): Promise<LandingPull[]> {
  const productionTime = new Date(productionRun.created_at);
  const numbers = await searchPullNumbers(repo, productionTime);
  const pulls = await mapLimit(numbers, PR_FETCH_CONCURRENCY, async (number) => {
    const [pull, files] = await Promise.all([pullRequest(repo, number), pullFiles(repo, number)]);
    if (pull.merged_at == null || pull.merge_commit_sha == null) {
      return null;
    }
    if (isAncestor(pull.merge_commit_sha, productionRun.head_sha)) {
      return null;
    }
    const landingFiles = files.filter((file) => isLandingPath(file.filename));
    if (landingFiles.length > 0) {
      return { pull, files: landingFiles };
    }
    return null;
  });
  return pulls.filter((item): item is LandingPull => item != null).sort((a, b) => {
    const aTime = new Date(a.pull.merged_at ?? a.pull.updated_at).getTime();
    const bTime = new Date(b.pull.merged_at ?? b.pull.updated_at).getTime();
    return bTime - aTime;
  });
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

async function run(): Promise<void> {
  const repo = requiredEnv("GITHUB_REPOSITORY");
  const now = new Date();
  const [productionRuns, stagingRuns] = await Promise.all([workflowRuns(repo, PRODUCTION_WORKFLOW), workflowRuns(repo, STAGING_WORKFLOW)]);
  const productionRun = latestSuccessfulRun(productionRuns);
  if (productionRun == null) {
    throw new Error(`No successful ${PRODUCTION_WORKFLOW} run found on main; cannot compute the QA delta from production.`);
  }
  const landingPulls = await collectLandingPullsSinceProduction(repo, productionRun);
  const staging = createStagingSnapshot(stagingRuns);
  const states = new Map<number, DeploymentState>();
  let deployedCount = 0;
  for (const item of landingPulls) {
    const state = resolveDeploymentState(item.pull, staging);
    states.set(item.pull.number, state);
    if (state.kind === "deployed") deployedCount += 1;
  }
  const activeRuns = staging.inFlight == null ? [] : [staging.inFlight];
  const runUrl = optionalEnv("RUN_URL");
  const card = buildCard({ activeRuns, deployedCount, landingPulls, now, productionRun, repo, runUrl, staging, states });

  console.log(
    JSON.stringify(
      {
        activeStagingRuns: activeRuns.map((run) => ({ head_sha: run.head_sha, run_number: run.run_number, status: run.status, url: run.html_url })),
        currentStaging: staging.current == null ? null : { head_sha: staging.current.head_sha, run_number: staging.current.run_number, url: staging.current.html_url },
        productionBaseline: { head_sha: productionRun.head_sha, run_number: productionRun.run_number, url: productionRun.html_url },
        landingPrs: landingPulls.map((item) => ({ number: item.pull.number, state: states.get(item.pull.number)?.kind })),
      },
      null,
      2,
    ),
  );
  await postFeishu(card);
}

function selfCheck(): void {
  const now = new Date();
  const run: WorkflowRun = {
    conclusion: "success",
    created_at: now.toISOString(),
    event: "push",
    head_sha: "b".repeat(40),
    html_url: "https://github.com/nexu-io/open-design/actions/runs/1",
    id: 1,
    name: "landing-page-staging",
    run_attempt: 1,
    run_number: 12,
    run_started_at: now.toISOString(),
    status: "completed",
    updated_at: now.toISOString(),
  };
  const pull: LandingPull = {
    files: [{ filename: "apps/landing-page/app/page.tsx" }],
    pull: {
      draft: false,
      html_url: "https://github.com/nexu-io/open-design/pull/123",
      merge_commit_sha: "a".repeat(40),
      merged_at: now.toISOString(),
      number: 123,
      state: "closed",
      title: "Update landing hero",
      updated_at: now.toISOString(),
      user: { login: "designer" },
    },
  };
  const card = buildCard({
    activeRuns: [],
    deployedCount: 1,
    landingPulls: [pull],
    now,
    productionRun: { ...run, html_url: "https://github.com/nexu-io/open-design/actions/runs/3", name: "landing-page-production", run_number: 11 },
    repo: "nexu-io/open-design",
    runUrl: "https://github.com/nexu-io/open-design/actions/runs/2",
    staging: createStagingSnapshot([run]),
    states: new Map([[123, { kind: "deployed", label: "已自动部署到 staging.open-design.ai", run }]]),
  });
  const json = JSON.stringify(card);
  if (STAGING_WORKFLOW !== "landing-page-staging.yml") {
    throw new Error("self-check expected staging workflow to stay landing-page-staging.yml");
  }
  if (PRODUCTION_WORKFLOW !== "landing-page-production.yml") {
    throw new Error("self-check expected production workflow to stay landing-page-production.yml");
  }
  if (!json.includes("正式环境基线") || !json.includes("待 QA 验收")) {
    throw new Error("self-check expected QA production-baseline copy");
  }
  if (!json.includes(STAGING_URL)) {
    throw new Error(`self-check expected card to include ${STAGING_URL}`);
  }
  const older = new Date(now.getTime() - 120000).toISOString();
  const newer = new Date(now.getTime() - 60000).toISOString();
  const latest = now.toISOString();
  const historicalStaging = { ...run, created_at: older, head_sha: "a".repeat(40), run_number: 10, run_started_at: older, updated_at: older };
  const currentStaging = { ...run, created_at: newer, head_sha: "b".repeat(40), run_number: 12, run_started_at: newer, updated_at: newer };
  const historicalOnlyState = resolveDeploymentState(pull.pull, createStagingSnapshot([currentStaging, historicalStaging]));
  if (historicalOnlyState.kind === "deployed") {
    throw new Error("self-check expected historical staging success not to count as current staging deployment");
  }
  const rerunHistoricalStaging = { ...historicalStaging, run_attempt: 2, run_started_at: latest, updated_at: latest };
  const rerunState = resolveDeploymentState(pull.pull, createStagingSnapshot([currentStaging, rerunHistoricalStaging]));
  if (rerunState.kind !== "deployed") {
    throw new Error("self-check expected rerun historical staging success to become current staging deployment");
  }
  const rerunCard = buildCard({
    activeRuns: [],
    deployedCount: 1,
    landingPulls: [pull],
    now,
    productionRun: { ...run, html_url: "https://github.com/nexu-io/open-design/actions/runs/3", name: "landing-page-production", run_number: 11 },
    repo: "nexu-io/open-design",
    runUrl: "https://github.com/nexu-io/open-design/actions/runs/2",
    staging: createStagingSnapshot([currentStaging, rerunHistoricalStaging]),
    states: new Map([[123, { kind: "deployed", label: "已自动部署到 staging.open-design.ai", run: rerunHistoricalStaging }]]),
  });
  const rerunJson = JSON.stringify(rerunCard);
  if (!rerunJson.includes("**最新成功 staging 部署**: [run #10]")) {
    throw new Error("self-check expected rerun staging header to use the rerun historical deployment");
  }
  if (!String(resolveDeploymentState).includes("正在部署")) {
    throw new Error("self-check expected deploying status copy");
  }
  if (!LANDING_PREFIXES.includes("apps/landing-page/")) {
    throw new Error("self-check expected apps/landing-page/ path prefix");
  }
  console.log("[landing-feishu] self-check passed");
}

const command = process.argv[2] ?? "run";
if (command === "self-check") {
  selfCheck();
} else if (command === "run") {
  await run();
} else {
  throw new Error(`Unknown command: ${command}`);
}
