import { execFile } from "node:child_process";
import { appendFile, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Provider = "owned" | "github";
type ActionName =
  | "nix"
  | "guard"
  | "i18n"
  | "unit"
  | "typecheck"
  | "daemon"
  | "web"
  | "build"
  | "browser";
type ActionKind = "real" | "placeholder";
type ActionStatus = "success" | "failure" | "not-run";
type StepStatus = "success" | "failure";

type ActionStepTiming = {
  name: string;
  durationMs: number;
  status: StepStatus;
};

type ActionResult = {
  action: ActionName;
  kind: ActionKind;
  status: ActionStatus;
  steps?: ActionStepTiming[];
};

type WorkflowResult = {
  schemaVersion: number;
  provider: Provider;
  mode: string;
  eventName: string;
  headSha: string;
  runId: string;
  runAttempt: string;
  actions: ActionResult[];
};

type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  event: string;
  html_url: string;
  created_at: string;
};

const ACTIONS: ActionName[] = [
  "nix",
  "guard",
  "i18n",
  "unit",
  "typecheck",
  "daemon",
  "web",
  "build",
  "browser",
];

const token = process.env.GITHUB_TOKEN ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
let targetSha = process.env.TARGET_SHA ?? "";
let targetEvent = process.env.TARGET_EVENT ?? "";
const ownedWorkflow = process.env.OWNED_WORKFLOW ?? "ci-owned";
const githubWorkflow = process.env.GITHUB_HOSTED_WORKFLOW ?? "ci-github";
const ownedRunId = process.env.OWNED_RUN_ID ?? "";
const githubRunId = process.env.GITHUB_RUN_ID_OVERRIDE ?? "";
const timeoutSeconds = Number(process.env.POLL_TIMEOUT_SECONDS ?? "3600");
const pollIntervalSeconds = Number(process.env.POLL_INTERVAL_SECONDS ?? "20");
const summaryPath = process.env.GITHUB_STEP_SUMMARY ?? "";
const providerRunCreatedAfter = process.env.PROVIDER_RUN_CREATED_AFTER ?? "";

if (!token || !repository) {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "open-design-ci-gate",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

function sortNewest(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

async function fetchRunById(id: string): Promise<WorkflowRun> {
  return await github<WorkflowRun>(`/repos/${repository}/actions/runs/${id}`);
}

async function findRunByWorkflowName(workflowName: string): Promise<WorkflowRun | null> {
  const payload = await github<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(targetSha)}&event=${encodeURIComponent(targetEvent)}&per_page=100`,
  );
  const createdAfterMs = providerRunCreatedAfter ? Date.parse(providerRunCreatedAfter) : Number.NaN;
  const matches = sortNewest(payload.workflow_runs).filter((run) => {
    if (run.name !== workflowName) return false;
    if (Number.isNaN(createdAfterMs)) return true;
    return Date.parse(run.created_at) >= createdAfterMs;
  });
  return matches[0] ?? null;
}

async function waitForRun(workflowName: string, explicitRunId: string): Promise<WorkflowRun> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (true) {
    const run = explicitRunId ? await fetchRunById(explicitRunId) : await findRunByWorkflowName(workflowName);
    if (run != null) {
      if (run.head_sha !== targetSha) {
        throw new Error(`${workflowName} run ${run.id} head_sha ${run.head_sha} does not match target ${targetSha}`);
      }
      if (run.status === "completed") {
        return run;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${workflowName} to complete for ${targetSha}`);
    }
    await sleep(pollIntervalSeconds * 1000);
  }
}

async function downloadResultArtifact(provider: Provider, runId: number): Promise<WorkflowResult> {
  const dir = await mkdtemp(join(tmpdir(), `od-ci-${provider}-`));
  try {
    await execFileAsync(
      "gh",
      ["run", "download", String(runId), "--repo", repository, "--name", `ci-results-${provider}`, "--dir", dir],
      {
        env: { ...process.env, GH_TOKEN: token },
      },
    );
    const resultPath = await findResultFile(dir);
    const raw = await readFile(resultPath, "utf8");
    return parseWorkflowResult(JSON.parse(raw));
  } catch (error) {
    console.warn(`artifact download failed for ${provider} run ${runId}; falling back to structured log payload`);
    return await downloadResultFromLog(runId);
  }
}

async function findResultFile(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === "ci-results.json") {
      return path;
    }
    if (entry.isDirectory()) {
      try {
        return await findResultFile(path);
      } catch {
        // Keep walking until a matching result file is found.
      }
    }
  }
  throw new Error(`ci-results.json not found under ${root}`);
}

async function downloadResultFromLog(runId: number): Promise<WorkflowResult> {
  const { stdout } = await execFileAsync("gh", ["run", "view", String(runId), "--repo", repository, "--log"], {
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 1024 * 1024 * 32,
  });
  const marker = "OD_CI_RESULTS_JSON ";
  const payload = stdout
    .split("\n")
    .map((line) => {
      const index = line.indexOf(marker);
      return index >= 0 ? line.slice(index + marker.length).trim() : "";
    })
    .filter((line) => line.length > 0)
    .at(-1);
  if (!payload) {
    throw new Error(`OD_CI_RESULTS_JSON marker not found in run ${runId} logs`);
  }
  const raw = Buffer.from(payload, "base64").toString("utf8");
  return parseWorkflowResult(JSON.parse(raw));
}

function parseWorkflowResult(raw: unknown): WorkflowResult {
  if (typeof raw !== "object" || raw == null) {
    throw new Error("workflow result must be an object");
  }
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${String(data.schemaVersion)}`);
  }
  if (data.provider !== "owned" && data.provider !== "github") {
    throw new Error(`unsupported provider: ${String(data.provider)}`);
  }
  if (!Array.isArray(data.actions)) {
    throw new Error("workflow result actions must be an array");
  }
  const actions = data.actions.map((entry) => {
    if (typeof entry !== "object" || entry == null) {
      throw new Error("workflow result action must be an object");
    }
    const action = entry as Record<string, unknown>;
    const actionName = String(action.action);
    const kind = String(action.kind);
    const status = String(action.status);
    if (!ACTIONS.includes(actionName as ActionName)) {
      throw new Error(`unknown action: ${actionName}`);
    }
    if (kind !== "real" && kind !== "placeholder") {
      throw new Error(`unknown action kind: ${kind}`);
    }
    if (status !== "success" && status !== "failure" && status !== "not-run") {
      throw new Error(`unknown action status: ${status}`);
    }
    let steps: ActionStepTiming[] | undefined;
    if (action.steps != null) {
      if (!Array.isArray(action.steps)) {
        throw new Error(`action ${actionName} steps must be an array`);
      }
      steps = action.steps.map((stepEntry) => {
        if (typeof stepEntry !== "object" || stepEntry == null) {
          throw new Error(`action ${actionName} step must be an object`);
        }
        const step = stepEntry as Record<string, unknown>;
        const name = String(step.name ?? "");
        const durationMs = Number(step.durationMs);
        const stepStatus = String(step.status);
        if (!name) {
          throw new Error(`action ${actionName} step name is required`);
        }
        if (!Number.isFinite(durationMs) || durationMs < 0) {
          throw new Error(`action ${actionName} step ${name} has invalid durationMs`);
        }
        if (stepStatus !== "success" && stepStatus !== "failure") {
          throw new Error(`action ${actionName} step ${name} has invalid status ${stepStatus}`);
        }
        return {
          name,
          durationMs,
          status: stepStatus as StepStatus,
        };
      });
    }

    return {
      action: actionName as ActionName,
      kind: kind as ActionKind,
      status: status as ActionStatus,
      steps,
    };
  });

  return {
    schemaVersion: 1,
    provider: data.provider as Provider,
    mode: String(data.mode ?? ""),
    eventName: String(data.eventName ?? ""),
    headSha: String(data.headSha ?? ""),
    runId: String(data.runId ?? ""),
    runAttempt: String(data.runAttempt ?? ""),
    actions,
  };
}

function validateIdentity(result: WorkflowResult, provider: Provider): void {
  if (result.provider !== provider) {
    throw new Error(`expected provider ${provider}, got ${result.provider}`);
  }
  if (result.headSha !== targetSha) {
    throw new Error(`${provider} result headSha ${result.headSha} does not match target ${targetSha}`);
  }
  const explicitRunId = provider === "owned" ? ownedRunId : githubRunId;
  const skipStrictEventMatch = targetEvent === "workflow_dispatch" && explicitRunId !== "";
  if (!skipStrictEventMatch && result.eventName !== targetEvent && result.eventName !== "workflow_dispatch") {
    throw new Error(`${provider} result event ${result.eventName} does not match target ${targetEvent}`);
  }
  const actionNames = new Set(result.actions.map((action) => action.action));
  if (actionNames.size !== ACTIONS.length) {
    throw new Error(`${provider} result does not contain exactly one entry for each action`);
  }
}

function summarizeAction(action: ActionName, owned: WorkflowResult, github: WorkflowResult): {
  passed: boolean;
  reason: string;
} {
  const candidates = [owned, github]
    .flatMap((result) => result.actions.filter((entry) => entry.action === action).map((entry) => ({ ...entry, provider: result.provider })));
  const realCandidates = candidates.filter((entry) => entry.kind === "real");
  if (realCandidates.some((entry) => entry.status === "success")) {
    const providers = realCandidates.filter((entry) => entry.status === "success").map((entry) => entry.provider).join(", ");
    return { passed: true, reason: `success via ${providers}` };
  }
  if (realCandidates.length > 0) {
    const providers = realCandidates.map((entry) => `${entry.provider}:${entry.status}`).join(", ");
    return { passed: false, reason: `real results but no success (${providers})` };
  }
  return { passed: false, reason: "no real result available" };
}

async function appendSummary(lines: string[]): Promise<void> {
  if (!summaryPath) return;
  await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  if (!targetSha || !targetEvent) {
    const seedRunId = ownedRunId || githubRunId;
    if (!seedRunId) {
      throw new Error("TARGET_SHA and TARGET_EVENT are required unless an owned_run_id or github_run_id is provided");
    }
    const seedRun = await fetchRunById(seedRunId);
    targetSha ||= seedRun.head_sha;
    targetEvent ||= seedRun.event;
  }

  const ownedRun = await waitForRun(ownedWorkflow, ownedRunId);
  const githubRun = await waitForRun(githubWorkflow, githubRunId);

  const ownedResult = await downloadResultArtifact("owned", ownedRun.id);
  const githubResult = await downloadResultArtifact("github", githubRun.id);

  validateIdentity(ownedResult, "owned");
  validateIdentity(githubResult, "github");

  const failures: string[] = [];
  const summaryLines = [
    "## CI Gate",
    "",
    `Target SHA: \`${targetSha}\``,
    `Target event: \`${targetEvent}\``,
    `Owned run: [${ownedRun.id}](${ownedRun.html_url}) conclusion=\`${ownedRun.conclusion ?? "null"}\``,
    `GitHub-hosted run: [${githubRun.id}](${githubRun.html_url}) conclusion=\`${githubRun.conclusion ?? "null"}\` mode=\`${githubResult.mode}\``,
    "",
    "| Action | Result | Reason |",
    "| --- | --- | --- |",
  ];

  for (const action of ACTIONS) {
    const outcome = summarizeAction(action, ownedResult, githubResult);
    summaryLines.push(`| \`${action}\` | ${outcome.passed ? "pass" : "fail"} | ${outcome.reason} |`);
    if (!outcome.passed) {
      failures.push(`${action}: ${outcome.reason}`);
    }
  }

  await appendSummary(summaryLines);
  for (const line of summaryLines) {
    console.log(line);
  }

  if (failures.length > 0) {
    throw new Error(`ci-gate failed\n${failures.join("\n")}`);
  }
}

await main();
