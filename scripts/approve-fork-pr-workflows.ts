import { fileURLToPath } from "node:url";

type PullRequest = {
  number: number;
  state: string;
  draft?: boolean;
  changed_files: number;
  head: {
    sha: string;
    repo: { full_name: string } | null;
  };
  base: {
    ref: string;
    sha: string;
    repo: { full_name: string };
  };
};

type PullRequestFile = {
  filename: string;
  previous_filename?: string;
  status: string;
};

type WorkflowRun = {
  id: number;
  name: string | null;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_sha: string;
  path: string;
  pull_requests: Array<{
    number: number;
    head: { sha: string; repo: { full_name: string } | null };
    base: { ref: string; sha: string; repo: { full_name: string } };
  }>;
};

type WorkflowRunsResponse = {
  workflow_runs: WorkflowRun[];
};

type ListPendingApprovalRunsDeps = {
  loadWorkflowRunsResponsePage?: (path: string) => Promise<WorkflowRunsResponse>;
  loadPullRequestsForHeadSha?: (repo: string, headSha: string) => Promise<PullRequest[]>;
};

const dryRun = process.env.DRY_RUN === "true";
const defaultPendingRunPollIntervalMs = 3_000;
const defaultPendingRunFirstAppearanceTimeoutMs = 4 * 60_000;
const defaultPendingRunSettlingWindowMs = 30_000;

type PendingRunPollingConfig = {
  pollIntervalMs?: number;
  firstAppearanceTimeoutMs?: number;
  settlingWindowMs?: number;
};

function pendingRunSetSignature(runs: WorkflowRun[]): string {
  return runs
    .map((run) => `${run.id}:${run.head_sha}:${normalizeWorkflowPath(run.path)}`)
    .sort()
    .join(",");
}

// Workflow allowlisting is the security boundary: fork PRs may touch broader
// source paths, but this script only approves low-privilege pull_request
// workflows. Keep privileged workflow_run / release / deploy workflows out of
// this set.
const allowedWorkflowPaths = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/visual-pr-capture.yml",
  ".github/workflows/visual-pr-verify.yml",
]);

export function normalizeWorkflowPath(path: string): string {
  const suffixIndex = path.indexOf("@");
  return suffixIndex >= 0 ? path.slice(0, suffixIndex) : path;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getRepo(): string {
  return requireEnv("GITHUB_REPOSITORY");
}

function getToken(): string {
  return requireEnv("GITHUB_TOKEN");
}

function getPrNumber(): number {
  return Number(requireEnv("PR_NUMBER"));
}

function isAllowedSourceOrTestPath(path: string): boolean {
  return /^(apps|packages)\/[^/]+\/(src|tests)\//.test(path);
}

export function isAllowedChangedPath(path: string): boolean {
  if (isDeniedChangedPath(path)) return false;
  return (
    isDocsPath(path) ||
    path.startsWith("apps/web/") ||
    isAllowedSourceOrTestPath(path)
  );
}

export function isDeniedChangedPath(path: string): boolean {
  return (
    path.startsWith(".github/") ||
    path.startsWith("scripts/") ||
    path.startsWith("e2e/scripts/") ||
    path.startsWith("nix/") ||
    path.startsWith("tools/pack/") ||
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path === "pnpm-lock.yaml" ||
    path === "pnpm-workspace.yaml" ||
    path === "flake.nix" ||
    path === "flake.lock" ||
    /(^|\/)tsconfig(\.[^.]+)*\.json$/.test(path) ||
    /(^|\/)(next|vite|vitest|playwright|astro|postcss|tailwind|eslint|prettier|wrangler|electron-builder)(\.config)?\.[^.]+$/.test(
      path,
    ) ||
    path.endsWith("esbuild.config.mjs") ||
    path.endsWith("esbuild.config.ts")
  );
}

function isDocsPath(path: string): boolean {
  return (
    path === "README.md" ||
    path === "README.zh-CN.md" ||
    path === "CONTRIBUTING.md" ||
    path === "CONTRIBUTING.zh-CN.md" ||
    path === "QUICKSTART.md" ||
    path.startsWith("docs/")
  );
}

function changedPathSet(file: PullRequestFile): string[] {
  return [file.filename, file.previous_filename].filter((path): path is string => Boolean(path));
}

export function isPendingApprovalRun(run: WorkflowRun, pull: PullRequest): boolean {
  return (
    run.head_sha === pull.head.sha &&
    run.event === "pull_request" &&
    (run.status === "action_required" || run.conclusion === "action_required") &&
    allowedWorkflowPaths.has(normalizeWorkflowPath(run.path))
  );
}

export function hasPullApprovalStateDrift(initialPull: PullRequest, latestPull: PullRequest): boolean {
  return (
    latestPull.state !== "open" ||
    Boolean(latestPull.draft) ||
    latestPull.head.sha !== initialPull.head.sha ||
    latestPull.base.ref !== initialPull.base.ref ||
    latestPull.head.repo?.full_name !== initialPull.head.repo?.full_name
  );
}

function isSamePullRequest(candidate: WorkflowRun["pull_requests"][number] | PullRequest, pull: PullRequest): boolean {
  return (
    candidate.number === pull.number &&
    candidate.head.sha === pull.head.sha &&
    candidate.head.repo?.full_name === pull.head.repo?.full_name &&
    candidate.base.ref === pull.base.ref &&
    candidate.base.repo.full_name === pull.base.repo.full_name
  );
}

export function runTargetsPullRequest(
  run: WorkflowRun,
  pull: PullRequest,
  associatedPullsForHeadSha: PullRequest[],
): boolean {
  if (run.pull_requests.length > 0) {
    if (run.pull_requests.length !== 1) return false;
    const [associatedPull] = run.pull_requests;
    if (!associatedPull) return false;
    return isSamePullRequest(associatedPull, pull);
  }

  if (associatedPullsForHeadSha.length !== 1) return false;
  const [associatedPull] = associatedPullsForHeadSha;
  if (!associatedPull) return false;
  return isSamePullRequest(associatedPull, pull);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPendingApprovalRuns(
  loadRuns: () => Promise<WorkflowRun[]>,
  sleep: (ms: number) => Promise<void> = delay,
  now: () => number = Date.now,
  config: PendingRunPollingConfig = {},
): Promise<WorkflowRun[]> {
  const pollIntervalMs = config.pollIntervalMs ?? defaultPendingRunPollIntervalMs;
  const firstAppearanceTimeoutMs = config.firstAppearanceTimeoutMs ?? defaultPendingRunFirstAppearanceTimeoutMs;
  const settlingWindowMs = config.settlingWindowMs ?? defaultPendingRunSettlingWindowMs;
  const firstAppearanceDeadline = now() + firstAppearanceTimeoutMs;
  let pendingRuns: WorkflowRun[] = [];

  const collectRuns = async (): Promise<void> => {
    pendingRuns = await loadRuns();
  };

  await collectRuns();

  while (pendingRuns.length === 0 && now() < firstAppearanceDeadline) {
    await sleep(pollIntervalMs);
    await collectRuns();
  }

  let settlingDeadline = pendingRuns.length > 0 ? now() + settlingWindowMs : null;
  let lastPendingRunSetSignature = pendingRunSetSignature(pendingRuns);

  while (pendingRuns.length > 0 && settlingDeadline !== null && now() < settlingDeadline) {

    await sleep(pollIntervalMs);
    const previousPendingRunSetSignature = lastPendingRunSetSignature;
    await collectRuns();

    lastPendingRunSetSignature = pendingRunSetSignature(pendingRuns);
    if (lastPendingRunSetSignature !== previousPendingRunSetSignature) {
      settlingDeadline = now() + settlingWindowMs;
    }
  }

  return pendingRuns;
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getToken()}`,
      "User-Agent": "open-design-fork-pr-workflow-approver",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed with ${response.status}: ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function githubPaginated<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const items = await github<T[]>(`${path}${separator}per_page=100&page=${page}`);
    results.push(...items);
    if (items.length < 100) return results;
  }
}

async function approveRun(run: WorkflowRun): Promise<void> {
  const repo = getRepo();

  if (dryRun) {
    console.log(`[dry-run] would approve workflow run ${run.id} (${run.name ?? run.path})`);
    return;
  }

  await github<void>(`/repos/${repo}/actions/runs/${run.id}/approve`, { method: "POST" });
  console.log(`Approved workflow run ${run.id} (${run.name ?? run.path})`);
}

async function listPullRequestsForHeadSha(repo: string, headSha: string): Promise<PullRequest[]> {
  return githubPaginated<PullRequest>(`/repos/${repo}/commits/${headSha}/pulls`);
}

async function listWorkflowRunsForHeadSha(
  repo: string,
  headSha: string,
  loadWorkflowRunsResponsePage: (path: string) => Promise<WorkflowRunsResponse>,
): Promise<WorkflowRun[]> {
  const workflowRuns: WorkflowRun[] = [];

  for (let page = 1; ; page += 1) {
    const response = await loadWorkflowRunsResponsePage(
      `/repos/${repo}/actions/runs?event=pull_request&head_sha=${headSha}&per_page=100&page=${page}`,
    );
    workflowRuns.push(...response.workflow_runs);
    if (response.workflow_runs.length < 100) return workflowRuns;
  }
}

export async function listPendingApprovalRuns(
  repo: string,
  pull: PullRequest,
  deps: ListPendingApprovalRunsDeps = {},
): Promise<WorkflowRun[]> {
  const loadWorkflowRunsResponsePage = deps.loadWorkflowRunsResponsePage ?? ((path: string) => github<WorkflowRunsResponse>(path));
  const loadPullRequestsForHeadSha =
    deps.loadPullRequestsForHeadSha ?? ((currentRepo: string, headSha: string) => listPullRequestsForHeadSha(currentRepo, headSha));

  const workflowRuns = await listWorkflowRunsForHeadSha(repo, pull.head.sha, loadWorkflowRunsResponsePage);

  const associatedPullsForHeadSha = (await loadPullRequestsForHeadSha(repo, pull.head.sha)).filter(
    (candidate) => candidate.state === "open",
  );

  return workflowRuns.filter(
    (run) => isPendingApprovalRun(run, pull) && runTargetsPullRequest(run, pull, associatedPullsForHeadSha),
  );
}

async function main(): Promise<void> {
  const repo = getRepo();
  const prNumber = getPrNumber();

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid PR_NUMBER: ${process.env.PR_NUMBER ?? ""}`);
  }

  const pull = await github<PullRequest>(`/repos/${repo}/pulls/${prNumber}`);
  if (pull.state !== "open") {
    console.log(`Skipping PR #${prNumber}: state is ${pull.state}.`);
    return;
  }
  if (pull.draft) {
    console.log(`Skipping PR #${prNumber}: draft PR.`);
    return;
  }
  if (!pull.head.repo) {
    console.log(`Skipping PR #${prNumber}: head repository is unavailable.`);
    return;
  }
  if (pull.head.repo.full_name === pull.base.repo.full_name) {
    console.log(`Skipping PR #${prNumber}: not a fork PR.`);
    return;
  }

  const files = await githubPaginated<PullRequestFile>(`/repos/${repo}/pulls/${prNumber}/files`);
  if (files.length !== pull.changed_files) {
    console.log(
      `Skipping PR #${prNumber}: GitHub returned ${files.length} changed files, but PR reports ${pull.changed_files}.`,
    );
    return;
  }

  const latestPull = await github<PullRequest>(`/repos/${repo}/pulls/${prNumber}`);
  if (hasPullApprovalStateDrift(pull, latestPull)) {
    console.log(`Skipping PR #${prNumber}: PR head/base changed while evaluating workflow approval.`);
    return;
  }

  const blockedPaths = files.flatMap((file) => changedPathSet(file).filter((path) => !isAllowedChangedPath(path)));

  if (blockedPaths.length > 0) {
    console.log(`Skipping PR #${prNumber}: changed paths are outside the auto-approval allowlist.`);
    for (const path of blockedPaths) console.log(`- ${path}`);
    return;
  }

  const pendingRuns = await waitForPendingApprovalRuns(() => listPendingApprovalRuns(repo, pull));

  if (pendingRuns.length === 0) {
    console.log(`No action_required pull_request workflow runs found for PR #${prNumber} at ${pull.head.sha}.`);
    return;
  }

  const approvalPull = await github<PullRequest>(`/repos/${repo}/pulls/${prNumber}`);
  if (hasPullApprovalStateDrift(pull, approvalPull)) {
    console.log(`Skipping PR #${prNumber}: PR changed while waiting for approvable workflow runs.`);
    return;
  }

  for (const run of pendingRuns) await approveRun(run);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
