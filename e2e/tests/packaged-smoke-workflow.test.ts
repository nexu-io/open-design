import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { T } from "@/timeouts";

import {
  uiP0CiMatrix,
  uiP0Groups,
  validatePlaywrightSuiteTopology,
} from "../lib/playwright/suites.ts";

const execFileAsync = promisify(execFile);
const launchEnv = { ...process.env };
const launchPath = launchEnv.PATH ?? launchEnv.Path ?? "";
const nodeBinDir = dirname(process.execPath);
const jqBin = process.platform !== "win32" && existsSync("/usr/bin/jq") ? "/usr/bin/jq" : "jq";
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const configureCiParallelismActionPath = join(
  workspaceRoot,
  ".github",
  "actions",
  "configure-ci-parallelism",
  "action.yml",
);
const uiExtendedMainWorkflowPath = join(workspaceRoot, ".github", "workflows", "ui-extended-main.yml");
const visualBaselineWorkflowPath = join(workspaceRoot, ".github", "workflows", "visual-baseline.yml");
const playwrightConfigPath = join(e2eRoot, "playwright.config.ts");
const commentWorkflowPath = join(workspaceRoot, ".github", "workflows", "comment.atom.yml");
const autofixWorkflowPath = join(workspaceRoot, ".github", "workflows", "autofix.atom.yml");
const reportWorkflowPath = join(workspaceRoot, ".github", "workflows", "report.atom.yml");
const convergenceWorkflowPath = join(workspaceRoot, ".github", "workflows", "convergence.atom.yml");
const contributorMaintainerCheckWorkflowPath = join(
  workspaceRoot,
  ".github",
  "workflows",
  "contributor-maintainer-check.yml",
);
const prAuthorInactivityWorkflowPath = join(workspaceRoot, ".github", "workflows", "pr-author-inactivity.yml");
const rerunWorkflowPath = join(workspaceRoot, ".github", "workflows", "rerun.atom.yml");
const rerunInfraCancelScriptPath = join(workspaceRoot, ".github", "scripts", "rerun_infra_cancel.py");
const bakePluginPreviewsWorkflowPath = join(workspaceRoot, ".github", "workflows", "bake-plugin-previews.yml");
const bakePluginPreviewsPrWorkflowPath = join(workspaceRoot, ".github", "workflows", "bake-plugin-previews-pr.yml");
const dockerImageWorkflowPath = join(workspaceRoot, ".github", "workflows", "docker-image.yml");
const flakePath = join(workspaceRoot, "flake.nix");
const backportAutomergeWorkflowPath = join(workspaceRoot, ".github", "workflows", "backport-automerge.yml");
const bakePreviewsAutomergeWorkflowPath = join(
  workspaceRoot,
  ".github",
  "workflows",
  "bake-plugin-previews-automerge.yml",
);
const bakePreviewsWorkflowPath = join(workspaceRoot, ".github", "workflows", "bake-plugin-previews.yml");
const bakePreviewsReleaseWorkflowPath = join(
  workspaceRoot,
  ".github",
  "workflows",
  "bake-plugin-previews-release.yml",
);
const finalizeReleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "finalize-release.yml");
const handoffScriptPath = join(workspaceRoot, ".github", "scripts", "handoff.py");
const convergenceScriptPath = join(workspaceRoot, ".github", "scripts", "convergence.py");
const r2PythonLibPath = join(workspaceRoot, ".github", "scripts", "lib", "r2.py");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const dailyBetaRecoveryScriptPath = join(
  workspaceRoot,
  ".github",
  "scripts",
  "release",
  "resolve-daily-beta-recovery.ts",
);
const releasePrereleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-prerelease.yml");
const mainPrereleaseWinSmokeWorkflowPath = join(
  workspaceRoot,
  ".github",
  "workflows",
  "main-prerelease-win-smoke.yml",
);
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const releaseStableNotesScriptPath = join(workspaceRoot, ".github", "scripts", "release", "github", "stable-notes.sh");
const releaseStableScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-stable.ts");
const releaseBetaScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-beta.ts");
const packagedPackageJsonPath = join(workspaceRoot, "apps", "packaged", "package.json");
const scopesScriptPath = join(workspaceRoot, ".github", "scripts", "scopes.py");
const runnersScriptPath = join(workspaceRoot, ".github", "scripts", "runners.py");
const notifyDailyFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "notify-daily-feishu.yml");
const notifyReleaseFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "notify-release-feishu.yml");
const cutReleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "cut-release.yml");
const cutPatchReleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "cut-patch-release.yml");
const feishuCardScriptPath = join(workspaceRoot, "tools", "release", "src", "notifications", "feishu.ts");
const feishuNoticeScriptPath = join(workspaceRoot, "tools", "release", "src", "notifications", "feishu-notice.ts");
const landingPageDailyFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "landing-page-daily-feishu.yml");
const landingPageCiWorkflowPath = join(workspaceRoot, ".github", "workflows", "landing-page-ci.yml");
const landingPageStagingWorkflowPath = join(workspaceRoot, ".github", "workflows", "landing-page-staging.yml");
const landingPageProductionWorkflowPath = join(workspaceRoot, ".github", "workflows", "landing-page-production.yml");
const landingPageDailyFeishuScriptPath = join(workspaceRoot, ".github", "scripts", "landing-page-daily-feishu.ts");
const releasePublishMetadataScriptPath = join(
  workspaceRoot,
  "tools",
  "release",
  "src",
  "storage",
  "publish-metadata.ts",
);
const releaseBetaPosixBuildScriptPath = join(workspaceRoot, "tools", "release", "scripts", "build-platform.sh");
const releaseBetaWindowsBuildScriptPath = join(workspaceRoot, "tools", "release", "scripts", "build-platform.ps1");
const releaseBetaPlatformPublishScriptPath = join(
  workspaceRoot,
  "tools",
  "release",
  "src",
  "storage",
  "publish-platform.ts",
);

function workflowFixtureEnv(
  overrides: Record<string, string>,
  executableDir?: string,
): NodeJS.ProcessEnv {
  const childPath = [executableDir, nodeBinDir, launchPath].filter(Boolean).join(delimiter);
  return {
    ...launchEnv,
    ...overrides,
    Path: childPath,
    PATH: childPath,
  };
}

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

function extractWorkflowRunScript(workflow: string, stepName: string): string {
  const marker = `      - name: ${stepName}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - ", start + marker.length);
  const step = workflow.slice(start, next === -1 ? workflow.length : next);
  const runStart = step.indexOf("        run: |\n");
  expect(runStart).toBeGreaterThanOrEqual(0);
  return step
    .slice(runStart + "        run: |\n".length)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n")
    .trimEnd();
}

function parseGithubOutput(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const sep = line.indexOf("=");
        expect(sep).toBeGreaterThan(0);
        return [line.slice(0, sep), line.slice(sep + 1)];
      }),
  );
}

async function gitPatchId(mode: "--stable" | "--verbatim", diff: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = execFile("git", ["patch-id", mode], { cwd: workspaceRoot, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve(stdout.trim().split(/\s+/)[0] ?? "");
    });
    child.stdin?.end(diff);
  });
}

// Pull the two jq programs that the `validate` job's "Check workspace validation jobs" step runs
// (the blanket failure scan and the required-jobs scan) straight out of ci.yml, so the gate logic
// under test stays the real workflow source rather than a reimplementation. Both are invoked as
// `jq -r '<program>'` and contain no single quotes, so the program is the text between the opening
// and the next `'`.
function extractValidateGateJqPrograms(workflow: string): { failures: string; requiredMisses: string } {
  const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");
  // Only the "Check workspace validation jobs" step — later validate steps also use jq.
  const needsCheck = sectionBetween(
    validate,
    "      - name: Check workspace validation jobs",
    "      - name: Checkout convergence control plane",
  );
  const programs = [...needsCheck.matchAll(/jq -r '([\s\S]*?)'/g)].map((match) => match[1] ?? "");
  expect(programs).toHaveLength(2);
  return { failures: programs[0] ?? "", requiredMisses: programs[1] ?? "" };
}

function runValidateGateJq(program: string, needs: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(jqBin, ["-r", program], { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin?.end(JSON.stringify(needs));
  });
}

// Mirrors the bash gate decision: the step exits non-zero when either jq program emits any line.
async function validateGatePasses(workflow: string, needs: unknown): Promise<boolean> {
  const { failures, requiredMisses } = extractValidateGateJqPrograms(workflow);
  const [failureLines, missLines] = await Promise.all([
    runValidateGateJq(failures, needs),
    runValidateGateJq(requiredMisses, needs),
  ]);
  return failureLines === "" && missLines === "";
}

async function runReleaseStableForFailure(env: Record<string, string>): Promise<string> {
  try {
    await execFileAsync(process.execPath, ["--experimental-strip-types", releaseStableScriptPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_RELEASE_CHANNEL: "stable",
        ...env,
      },
    });
  } catch (error) {
    const failed = error as { stderr?: string; stdout?: string };
    return `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
  }

  throw new Error("release-stable script unexpectedly succeeded");
}

async function readPackagedVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(packagedPackageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("apps/packaged/package.json must define a version");
  }
  return packageJson.version;
}

async function runScopesPrint(eventName: string, eventPayload: unknown, changedFiles: string[] = []): Promise<Record<string, unknown>> {
  const inputMode = (eventPayload as { inputs?: { ci_mode?: string } }).inputs?.ci_mode;
  const context =
    eventName === "workflow_dispatch" && inputMode !== "hot"
      ? "full"
      : eventName === "merge_group" && changedFiles.length === 0
        ? "full"
        : eventName === "merge_group"
          ? "merge-queue"
          : "pr";
  const { stdout } = await execFileAsync("python3", [scopesScriptPath, "plan", "--context", context, "--files", ...changedFiles], {
    cwd: workspaceRoot,
  });
  const value = JSON.parse(stdout) as {
    scopes: Record<string, unknown>;
    enabled: Record<string, boolean>;
  };
  return {
    ...value.scopes,
    run_e2e_vitest: value.enabled.e2e_vitest,
    run_playwright_critical: value.enabled.playwright_critical,
    run_playwright_visual: value.enabled.playwright_visual,
    run_preflight: value.enabled.preflight,
    run_ui_p0: value.enabled.ui_p0,
    run_web_workspace_tests: value.enabled.web_workspace_tests,
    run_windows_tools_pack_payload_tests: value.enabled.windows_tools_pack_payload_tests,
    run_workspace_unit_tests: value.enabled.workspace_unit_tests,
  };
}

async function runRunners(mode?: string): Promise<Record<string, string>> {
  const env = { ...process.env };
  if (mode === undefined) {
    delete env.OD_CI_RUNNER_MODE;
  } else {
    env.OD_CI_RUNNER_MODE = mode;
  }
  delete env.GITHUB_OUTPUT;

  const { stdout } = await execFileAsync("python3", [runnersScriptPath], {
    cwd: workspaceRoot,
    env,
  });
  return Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        expect(separatorIndex).toBeGreaterThan(0);
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function runnerOutput(profiles: Record<string, string>, key: string): string {
  const value = profiles[key];
  if (value === undefined) {
    throw new Error(`Missing runner profile output: ${key}`);
  }
  return value;
}

function runnerDecision(profiles: Record<string, string>): { schema_version: number; mode: string } {
  return JSON.parse(runnerOutput(profiles, "decision")) as { schema_version: number; mode: string };
}

function runnerRunsOn(profiles: Record<string, string>): Record<string, string[]> {
  return JSON.parse(runnerOutput(profiles, "runs_on")) as Record<string, string[]>;
}

async function writeFakeGhBin(binDir: string, releases: unknown[]): Promise<void> {
  const ghPath = join(binDir, "gh");
  const ghCmdPath = join(binDir, "gh.cmd");
  await writeFile(
    ghPath,
    `#!/usr/bin/env node
if (process.argv[2] === "api" && /^repos\\/[^/]+\\/[^/]+\\/releases\\?/.test(process.argv[3] ?? "")) {
  const url = new URL(process.argv[3], "https://api.github.com/");
  const page = url.searchParams.get("page") ?? "1";
  process.stdout.write(JSON.stringify(page === "1" ? ${JSON.stringify(releases)} : []));
  process.exit(0);
}
console.error("unexpected gh invocation: " + process.argv.slice(2).join(" "));
process.exit(1);
`,
  );
  await chmod(ghPath, 0o755);
  await writeFile(ghCmdPath, `@echo off\r\n"${process.execPath}" "%~dp0gh" %*\r\n`);
}

async function renderFeishuBuildCard(env: Record<string, string>): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    void (async () => {
      let raw = "";
      for await (const chunk of request) raw += chunk.toString();
      payload = JSON.parse(raw) as Record<string, unknown>;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: 0 }));
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("Feishu card fixture did not bind to a TCP port");
  }

  try {
    await execFileAsync(process.execPath, ["--experimental-strip-types", feishuCardScriptPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BUILD_STATE: "success",
        CHANNEL_LABEL: "Prerelease",
        FEISHU_WEBHOOK: `http://127.0.0.1:${address.port}`,
        VERSION: "0.19.0-prerelease.1",
        ...env,
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error == null ? resolve() : reject(error)));
    });
  }

  if (payload == null) throw new Error("Feishu card fixture received no payload");
  return payload;
}

describe("packaged smoke workflow", () => {
  it("[P2] keeps packaged smoke outside the main CI gate", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    expect(workflow).not.toContain("packaged_smoke_");
    expect(workflow).not.toContain("Build PR mac artifacts");
    expect(workflow).not.toContain("Build PR windows artifacts");
    expect(workflow).not.toContain("Build PR linux headless artifacts");
    expect(workflow).not.toContain("Smoke PR mac packaged runtime");
    expect(workflow).not.toContain("Smoke PR windows packaged runtime");
    expect(workflow).not.toContain("Smoke PR linux headless packaged runtime");
    expect(workflow).not.toContain("OD_PACKAGED_E2E_");
  });

  it("[P2] runs the independent Windows launcher payload test set", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const job = sectionBetween(workflow, "  windows_tools_pack_payload_tests:", "  web_workspace_tests:");
    const validate = sectionBetween(workflow, "  validate:", "          if [ -n \"$failures\" ]; then");

    expect(job).toContain("fromJSON(needs.runners.outputs.runs_on).windows_tools");
    expect(job).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).windows_tools)");
    expect(job).toContain("fromJSON(needs.plan.outputs.run).windows_tools_pack_payload_tests");
    expect(job).toContain("pnpm --filter @open-design/tools-pack exec vitest run tests/launcher/windows/payload.test.ts");
    expect(validate).toContain("windows_tools_pack_payload_tests");
  });

  it("[P2] limits manual blob guard checks to changed files against main", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const blobGuard = sectionBetween(workflow, "  static_gate:", "  preflight:");

    expect(blobGuard).toContain('${{ github.event_name }}" = "workflow_dispatch"');
    expect(blobGuard).toContain("repos/${{ github.repository }}/compare/main...${{ github.sha }}");
    expect(blobGuard).toContain("select(.status != \"removed\") | .filename");
  });

  it("[P2] keeps merge queue as the authoritative post-PR validation path", async () => {
    const [ciWorkflow, dockerWorkflow, commentWorkflow, autofixWorkflow, reportWorkflow] = await Promise.all([
      readFile(ciWorkflowPath, "utf8"),
      readFile(dockerImageWorkflowPath, "utf8"),
      readFile(commentWorkflowPath, "utf8"),
      readFile(autofixWorkflowPath, "utf8"),
      readFile(reportWorkflowPath, "utf8"),
    ]);

    const ciTrigger = sectionBetween(ciWorkflow, "on:", "\npermissions:");
    const ciBlobGuard = sectionBetween(ciWorkflow, "  static_gate:", "  preflight:");
    const dockerTrigger = sectionBetween(dockerWorkflow, "on:", "\njobs:");

    expect(ciTrigger).toContain("pull_request:");
    expect(ciTrigger).toContain("merge_group:");
    expect(ciTrigger).toContain("workflow_dispatch:");
    expect(ciTrigger).not.toContain("push:");
    expect(ciBlobGuard).not.toContain('${{ github.event_name }}" = "push"');
    expect(dockerTrigger).toContain("workflow_call:");
    expect(dockerTrigger).toContain("tags: ['v*.*.*']");
    expect(dockerTrigger).toContain("pull_request:");
    // Publish stays tag/call only — no continuous main-branch image push.
    expect(dockerTrigger).not.toContain("branches: [main]");
    expect(dockerTrigger).not.toMatch(/push:\s*\n\s*branches:/);
    // Publish mode must not key only on event_name == workflow_call (caller keeps
    // its own event name). Release calls pass release_version / publish_latest.
    const dockerMode = sectionBetween(dockerWorkflow, "Resolve publish mode", "Set up QEMU");
    expect(dockerMode).toContain("RELEASE_VERSION");
    expect(dockerMode).toContain("PUBLISH_LATEST");
    expect(dockerMode).toContain('[ "$EVENT_NAME" = "push" ]');
    expect(dockerMode).toContain('[ -n "${RELEASE_VERSION:-}" ]');
    // Shell condition must not treat literal workflow_call as the publish signal.
    expect(dockerMode).not.toMatch(/\[\s*"\$EVENT_NAME"\s*=\s*"workflow_call"\s*\]/);
    // Smoke-only sha tags must be disabled whenever publish mode is true (release
    // callers are workflow_dispatch with release_version, and would otherwise push
    // manual-sha-* alongside the real version tags).
    expect(dockerWorkflow).toContain("steps.mode.outputs.publish != 'true' && github.event_name == 'pull_request'");
    expect(dockerWorkflow).toContain("steps.mode.outputs.publish != 'true' && github.event_name == 'workflow_dispatch'");
    expect(commentWorkflow).toContain("workflows: [ci]");
    // comment.atom consumes merge_group runs too, so the needs-validation gate can surface a
    // queue-ejection notice on the PR; autofix/report stay pull_request-only trusted consumers.
    expect(commentWorkflow).toContain(
      "(github.event.workflow_run.event == 'pull_request' || github.event.workflow_run.event == 'merge_group')",
    );
    expect(autofixWorkflow).toContain("workflows: [ci]");
    expect(autofixWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(autofixWorkflow).not.toContain("merge_group");
    expect(autofixWorkflow).not.toContain("ci-nix");
    expect(reportWorkflow).toContain("workflows: [ci]");
    expect(reportWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(reportWorkflow).not.toContain("merge_group");
  });

  it("[P2] gates infra-cancel auto-rerun as a trusted workflow_run consumer", async () => {
    const [rerunWorkflow, rerunScript, ciWorkflow] = await Promise.all([
      readFile(rerunWorkflowPath, "utf8"),
      readFile(rerunInfraCancelScriptPath, "utf8"),
      readFile(ciWorkflowPath, "utf8"),
    ]);

    // Triggered only by completed `ci` runs; never a business-layer write inside ci.yml.
    expect(rerunWorkflow).toContain("workflows: [ci]");
    expect(rerunWorkflow).toContain("types: [completed]");
    expect(rerunWorkflow).toContain("actions: write");
    // Annotations + commit→pulls need explicit read scopes when permissions: is set.
    expect(rerunWorkflow).toContain("checks: read");
    expect(rerunWorkflow).toContain("pull-requests: read");
    expect(rerunWorkflow).toContain("group: rerun-${{ github.event.workflow_run.id }}");
    expect(rerunWorkflow).toContain("cancel-in-progress: false");
    expect(rerunWorkflow).toContain("github.event.repository.default_branch");
    expect(rerunWorkflow).toContain("python3 .github/scripts/rerun_infra_cancel.py self-check");
    expect(rerunWorkflow).toContain("python3 .github/scripts/rerun_infra_cancel.py run");

    // pull_request + merge_group only, one automatic retry, skip green/skipped conclusions.
    expect(rerunWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(rerunWorkflow).toContain("github.event.workflow_run.event == 'merge_group'");
    expect(rerunWorkflow).toContain("github.event.workflow_run.run_attempt < 2");
    expect(rerunWorkflow).toContain("github.event.workflow_run.conclusion != 'success'");
    expect(rerunWorkflow).toContain("github.event.workflow_run.conclusion != 'skipped'");
    expect(rerunWorkflow).not.toContain("workflow_dispatch");

    // Decision stays in the helper; ci.yml itself must not gain actions:write or gh run rerun.
    expect(rerunScript).toContain("The runner has received a shutdown signal");
    expect(rerunScript).toContain("gh run rerun");
    expect(rerunScript).toContain("--failed");
    expect(rerunScript).toContain("DEFAULT_MAX_ATTEMPT = 2");
    // merge_group freshness: open PR still at the PR head SHA encoded in the
    // queue branch (pr-N-<sha>), not live queue membership and not open-only.
    // (required-check failure ejects the synthetic head before workflow_run completed).
    expect(rerunScript).toContain("resolve_merge_group_open_pr");
    expect(rerunScript).toContain("parse_merge_group_pr_number");
    expect(rerunScript).toContain("parse_merge_group_pr_head_sha");
    expect(rerunScript).toContain("no open PR at the merge_group originating head");
    // Mixed ordinary failure + cancelled leaf must refuse --failed rerun.
    expect(rerunScript).toContain("classify_non_success_jobs");
    expect(rerunScript).toContain("ordinary non-infra failures present");
    // Warning-level annotations (e.g. scopes.ts full-plan fallback) are not ordinary failures.
    expect(rerunScript).toContain('level in {"notice", "warning"}');
    expect(ciWorkflow).not.toContain("gh run rerun");
    expect(ciWorkflow).toContain("actions: read");
    expect(ciWorkflow).not.toContain("actions: write");
  });

  it("[P2] surfaces a merge-queue needs-validation ejection as a PR comment handoff", async () => {
    const [ciWorkflow, commentWorkflow] = await Promise.all([
      readFile(ciWorkflowPath, "utf8"),
      readFile(commentWorkflowPath, "utf8"),
    ]);

    const mergePolicy = sectionBetween(ciWorkflow, "  merge_policy:", "  validate:");
    const validate = sectionBetween(ciWorkflow, "  validate:", "  runtime_summary:");

    // Producer: merge policy is a merge-group-only sibling of every workload. It emits a
    // handoff/comment artifact for a labeled PR and uploads it on the failure path.
    expect(mergePolicy).toContain("needs: [plan, runners]");
    expect(mergePolicy).toContain("if: ${{ github.event_name == 'merge_group' }}");
    expect(mergePolicy).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(mergePolicy).toContain("<!-- merge-queue-needs-validation -->");
    expect(mergePolicy).toContain("emit_ejection_notice");
    expect(mergePolicy).toContain(
      "if: ${{ failure() && steps.merge_blocking_label_gate.outputs.comment_created == 'true' }}",
    );

    // Policy converges only at the required workspace gate. It never becomes a prerequisite
    // that could suppress workload coverage for a labeled merge group.
    expect(validate).toContain("      - merge_policy");
    expect(validate).toContain("if: ${{ always() }}");
    expect(validate).not.toContain("Block merge while a merge-blocking label is present");
    const workloadSections = [
      ["  static_gate:", "  preflight:"],
      ["  preflight:", "  workspace_unit_tests:"],
      ["  workspace_unit_tests:", "  daemon_unit_tests:"],
      ["  daemon_unit_tests:", "  windows_tools_pack_payload_tests:"],
      ["  windows_tools_pack_payload_tests:", "  web_workspace_tests:"],
      ["  web_workspace_tests:", "  e2e_vitest:"],
      ["  e2e_vitest:", "  playwright_critical:"],
      ["  playwright_critical:", "  ui_p0:"],
      ["  ui_p0:", "  playwright_visual:"],
      ["  playwright_visual:", "  merge_policy:"],
    ] as const;
    for (const [start, end] of workloadSections) {
      expect(sectionBetween(ciWorkflow, start, end)).toContain("needs: [plan, runners]");
    }

    // Consumer: a merge_group run's head_sha is the queue's synthetic merge commit, so the atom
    // binds merge_group artifacts to their producing run by run_id and skips the base-freshness
    // check (PRs ahead in the queue move the base while the run completes).
    expect(commentWorkflow).toContain('"$RUN_EVENT" = "merge_group"');
    expect(commentWorkflow).toContain('"$artifact_run_id" != "$RUN_ID"');
    expect(commentWorkflow).toContain('[ "$RUN_EVENT" != "merge_group" ] && [ "$current_base" != "$base_sha" ]');
  });

  it("[P2] surfaces a merge-queue CI failure ejection as a PR comment handoff", async () => {
    const ciWorkflow = await readFile(ciWorkflowPath, "utf8");
    const mergePolicy = sectionBetween(ciWorkflow, "  merge_policy:", "  validate:");
    const validate = sectionBetween(ciWorkflow, "  validate:", "  runtime_summary:");

    // The label gate tells the generic notice whether it already announced this ejection, so a
    // label-only ejection gets exactly one comment.
    expect(mergePolicy).toContain(
      "ejection_notice: ${{ steps.merge_blocking_label_gate.outputs.comment_created }}",
    );
    expect(validate).toContain("LABEL_NOTICE_EMITTED: ${{ needs.merge_policy.outputs.ejection_notice }}");

    // Producer: merge-group only, only after the gate has already failed, unable to change the
    // gate result, and uploaded on the failure path exactly like the label notice.
    expect(validate).toContain("<!-- merge-queue-ci-failure -->");
    expect(validate).toContain("if: ${{ failure() && github.event_name == 'merge_group' }}");
    expect(validate).toContain("continue-on-error: true");
    expect(validate).toContain(
      "if: ${{ failure() && steps.merge_queue_failure_notice.outputs.comment_created == 'true' }}",
    );
    // It sits after hash publication so the success path is untouched and the gate's own jq
    // programs stay isolated (see extractValidateGateJqPrograms).
    expect(validate.indexOf("Save successful hash map")).toBeLessThan(
      validate.indexOf("Produce merge-queue failure notice handoff"),
    );

    // Behavior: run the real step script against a stubbed `gh`, then read the handoff it
    // produced through the same helper comment.atom.yml uses to consume it.
    const script = extractWorkflowRunScript(ciWorkflow, "Produce merge-queue failure notice handoff");
    const prHead = "4821c4ee".padEnd(40, "0");
    const prBase = "1a7a23d4".padEnd(40, "0");
    const groupHead = "e3051e63".padEnd(40, "0");
    const runId = "32105196624";
    const planRun = JSON.stringify({ static_gate: true, daemon_unit_tests: true, e2e_vitest: false });
    const esc = String.fromCharCode(27);
    const failedShardLog = [
      `2026-08-18T06:05:15.3329113Z ${esc}[31m⎯⎯⎯ Failed Tests 1 ⎯⎯⎯${esc}[39m`,
      `2026-08-18T06:05:15.3330283Z ${esc}[41m${esc}[1m FAIL ${esc}[22m${esc}[49m tests/project-archive.test.ts > buildProjectArchive > exposes a consumable stream with the same archive contents`,
      `2026-08-18T06:05:15.3333182Z ${esc}[31mAssertionError: expected [ Array(6) ] to deeply equal [ 'DESIGN-HANDOFF.md', …(4) ]${esc}[39m`,
      "2026-08-18T06:05:15.3398469Z ##[error]AssertionError: expected [ Array(6) ] to deeply equal [ 'DESIGN-HANDOFF.md', …(4) ]",
      "2026-08-18T06:05:15.4000000Z ##[error]Process completed with exit code 1.",
      "",
    ].join("\n");

    async function runNotice(args: {
      needs: Record<string, unknown>;
      labelNoticeEmitted?: string;
      labels?: string[];
      mergePolicyConclusion?: string;
      // gh >= 2.97 refuses to print a body with terminal escape sequences unless
      // `--allow-escape-sequences` is passed; older gh rejects that flag as unknown.
      ghSupportsEscapeFlag?: boolean;
    }): Promise<{
      stdout: string;
      output: Record<string, string>;
      listed: Array<Record<string, unknown>>;
      body: string;
    }> {
      const dir = await mkdtemp(join(tmpdir(), "od-merge-queue-notice-"));
      const ghPath = join(dir, "gh");
      const outputPath = join(dir, "github-output");
      const runnerTemp = join(dir, "runner-temp");
      await mkdir(runnerTemp);
      await writeFile(outputPath, "");
      const mergePolicyConclusion = args.mergePolicyConclusion ?? "success";
      const fixtures = {
        pull: {
          head: { sha: prHead },
          base: { sha: prBase },
          labels: (args.labels ?? []).map((name) => ({ name })),
        },
        jobs: {
          jobs: [
            {
              id: 101,
              name: "Daemon tests (1/4)",
              conclusion: "failure",
              html_url: `https://github.com/nexu-io/open-design/actions/runs/${runId}/job/101`,
              steps: [
                { name: "Checkout", conclusion: "success" },
                { name: "Run daemon test shard", conclusion: "failure" },
              ],
            },
            { id: 102, name: "Daemon tests (2/4)", conclusion: "success", html_url: "", steps: [] },
            {
              id: 103,
              name: "Merge policy",
              conclusion: mergePolicyConclusion,
              html_url: `https://github.com/nexu-io/open-design/actions/runs/${runId}/job/103`,
              steps: [{ name: "Block merge while a merge-blocking label is present", conclusion: mergePolicyConclusion }],
            },
            // Replaying a completed run reports the gate itself as failed; it must never be listed.
            { id: 104, name: "Validate workspace", conclusion: "failure", html_url: "", steps: [] },
          ],
        },
        compare: {
          commits: [
            { commit: { message: "fix(daemon): keep daemon as sole writer of run events (#6559)\n\nbody" } },
            { commit: { message: "fix(daemon): list dot-prefixed user content in managed projects (#6214)" } },
          ],
        },
        logs: failedShardLog,
      };
      const supportsEscapeFlag = args.ghSupportsEscapeFlag ?? true;
      await writeFile(
        ghPath,
        `#!/usr/bin/env node
const fixtures = JSON.parse(process.env.FAKE_GH_FIXTURES);
const supportsEscapeFlag = ${supportsEscapeFlag ? "true" : "false"};
const argv = process.argv.slice(2);
const args = argv.join(" ");
const hasEscapeFlag = argv.includes("--allow-escape-sequences");
if (args === "--version") process.stdout.write(supportsEscapeFlag ? "gh version 2.98.0 (fake)\\n" : "gh version 2.87.3 (fake)\\n");
// Real help text is long: a probe that lets grep exit early would SIGPIPE gh and, under
// pipefail, read as "flag unsupported". Pad well past the pipe buffer so that stays red.
else if (args === "api --help") process.stdout.write((supportsEscapeFlag ? "      --allow-escape-sequences   Allow printing terminal escape sequences\\n" : "      --cache duration           Cache the response\\n") + "      --padding\\n".repeat(8192));
else if (hasEscapeFlag && !supportsEscapeFlag) { process.stderr.write("unknown flag: --allow-escape-sequences\\n"); process.exit(1); }
else if (/\\/pulls\\/6214$/.test(args)) process.stdout.write(JSON.stringify(fixtures.pull));
else if (/\\/actions\\/runs\\/${runId}\\/jobs/.test(args)) process.stdout.write(JSON.stringify(fixtures.jobs));
else if (/\\/actions\\/jobs\\/\\d+\\/logs$/.test(args)) {
  // Real gh >= 2.97 behavior for a body full of ANSI codes: nothing on stdout, exit 1.
  if (supportsEscapeFlag && !hasEscapeFlag) { process.stderr.write("the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway\\n"); process.exit(1); }
  process.stdout.write(fixtures.logs);
}
else if (/\\/compare\\//.test(args)) process.stdout.write(JSON.stringify(fixtures.compare));
else { process.stderr.write("unexpected gh call: " + args + "\\n"); process.exit(1); }
`,
      );
      await chmod(ghPath, 0o755);
      try {
        const { stdout } = await execFileAsync("bash", ["-c", script], {
          cwd: workspaceRoot,
          env: workflowFixtureEnv(
            {
              GH_TOKEN: "fake",
              REPO: "nexu-io/open-design",
              RUN_ID: runId,
              NEEDS_JSON: JSON.stringify(args.needs),
              MERGE_GROUP_REF: `gh-readonly-queue/main/pr-6214-${prBase}`,
              BASE_SHA: prBase,
              HEAD_SHA: groupHead,
              LABEL_NOTICE_EMITTED: args.labelNoticeEmitted ?? "",
              SELF_JOB_NAME: "Validate workspace",
              GITHUB_OUTPUT: outputPath,
              GITHUB_SERVER_URL: "https://github.com",
              RUNNER_TEMP: runnerTemp,
              FAKE_GH_FIXTURES: JSON.stringify(fixtures),
            },
            dir,
          ),
        });
        const output = parseGithubOutput(await readFile(outputPath, "utf8"));
        let listed: Array<Record<string, unknown>> = [];
        let body = "";
        if (output.comment_path) {
          const { stdout: listStdout } = await execFileAsync(
            "python3",
            [handoffScriptPath, "list", "comment", output.comment_path],
            { cwd: workspaceRoot },
          );
          listed = listStdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Record<string, unknown>);
          body = await readFile(
            join(output.comment_path, "handoff", "comment", "merge-queue-ci-failure-pr-6214", "body.md"),
            "utf8",
          );
        }
        return { stdout, output, listed, body };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    // A failed workload: one notice for the PR heading the group, naming the job, the step,
    // the failing assertion, the run, and the PR batched ahead of it.
    const workloadFailure = await runNotice({
      needs: {
        plan: { result: "success", outputs: { run: planRun } },
        merge_policy: { result: "success", outputs: { ejection_notice: "" } },
        static_gate: { result: "success" },
        daemon_unit_tests: { result: "failure" },
        e2e_vitest: { result: "skipped" },
      },
    });
    expect(workloadFailure.output.comment_created).toBe("true");
    expect(workloadFailure.output.comment_name).toBe("handoff-comment-merge-queue-ci-failure-pr-6214");
    expect(workloadFailure.listed).toHaveLength(1);
    expect(workloadFailure.listed[0]).toMatchObject({
      kind: "comment",
      id: "merge-queue-ci-failure-pr-6214",
      pr_number: 6214,
      head_sha: prHead,
      base_sha: prBase,
      run_id: 32105196624,
      marker: "<!-- merge-queue-ci-failure -->",
    });
    expect(workloadFailure.body).toContain("<!-- merge-queue-ci-failure -->");
    expect(workloadFailure.body).toContain(
      `[run ${runId}](https://github.com/nexu-io/open-design/actions/runs/${runId})`,
    );
    expect(workloadFailure.body).toContain(
      `- **Daemon tests (1/4)** — failure at \`Run daemon test shard\` ([job log](https://github.com/nexu-io/open-design/actions/runs/${runId}/job/101))`,
    );
    expect(workloadFailure.body).not.toContain("Daemon tests (2/4)");
    expect(workloadFailure.body).not.toContain("Validate workspace");
    expect(workloadFailure.body).toContain(
      "FAIL  tests/project-archive.test.ts > buildProjectArchive > exposes a consumable stream with the same archive contents",
    );
    expect(workloadFailure.body).toContain("AssertionError: expected [ Array(6) ]");
    expect(workloadFailure.body).not.toContain("Process completed with exit code");
    expect(workloadFailure.body).not.toContain(esc);
    expect(workloadFailure.body).toContain("queued ahead of it (#6559)");
    expect(workloadFailure.body).toContain("add the PR back to the merge queue");

    // A label-only ejection is already announced by the gate's notice: no second comment.
    const labelOnly = await runNotice({
      needs: {
        plan: { result: "success", outputs: { run: planRun } },
        merge_policy: { result: "failure", outputs: { ejection_notice: "true" } },
        static_gate: { result: "success" },
        daemon_unit_tests: { result: "success" },
      },
      labelNoticeEmitted: "true",
      labels: ["needs-validation"],
      mergePolicyConclusion: "failure",
    });
    expect(labelOnly.output.comment_created).toBeUndefined();
    expect(labelOnly.stdout).toContain("its own notice covers this ejection");

    // A workload that failed alongside a blocking label is still reported, without repeating
    // the policy job — and the live label alone is enough to recognize the label ejection.
    const labelPlusWorkload = await runNotice({
      needs: {
        plan: { result: "success", outputs: { run: planRun } },
        merge_policy: { result: "failure", outputs: { ejection_notice: "" } },
        static_gate: { result: "success" },
        daemon_unit_tests: { result: "failure" },
      },
      labels: ["needs-maintainer-check"],
      mergePolicyConclusion: "failure",
    });
    expect(labelPlusWorkload.output.comment_created).toBe("true");
    expect(labelPlusWorkload.body).toContain("**Daemon tests (1/4)**");
    expect(labelPlusWorkload.body).not.toContain("Merge policy");

    // A runner whose gh predates the escape-sequence policy must still get the excerpt: the
    // probe finds no flag and the plain fetch is used.
    const olderGh = await runNotice({
      needs: {
        plan: { result: "success", outputs: { run: planRun } },
        merge_policy: { result: "success", outputs: { ejection_notice: "" } },
        daemon_unit_tests: { result: "failure" },
      },
      ghSupportsEscapeFlag: false,
    });
    expect(olderGh.output.comment_created).toBe("true");
    expect(olderGh.body).toContain("FAIL  tests/project-archive.test.ts");
    expect(olderGh.stdout).toContain("gh version 2.87.3 (fake)");
  });

  it("[P1] routes configured contributors into an independent maintainer merge block", async () => {
    const [routingWorkflow, ciWorkflow, inactivityWorkflow] = await Promise.all([
      readFile(contributorMaintainerCheckWorkflowPath, "utf8"),
      readFile(ciWorkflowPath, "utf8"),
      readFile(prAuthorInactivityWorkflowPath, "utf8"),
    ]);
    const trigger = sectionBetween(routingWorkflow, "on:", "\npermissions:");

    expect(trigger).toContain("pull_request_target:");
    expect(trigger).toContain("types: [opened, reopened, synchronize]");
    expect(trigger).not.toContain("unlabeled");
    expect(routingWorkflow).toContain("permissions:\n  issues: write");
    expect(routingWorkflow).toContain("actions/github-script@v8");
    expect(routingWorkflow).toContain("secrets.NEEDS_MAINTAINER_CHECK_USER_IDS");
    expect(routingWorkflow).toContain("rawIds ? JSON.parse(rawIds) : []");
    expect(routingWorkflow).toContain("Number.isSafeInteger(id) && id > 0");
    expect(routingWorkflow).toContain("context.payload.pull_request?.user?.id");
    expect(routingWorkflow).toContain("configuredIds.includes(authorId)");
    expect(routingWorkflow).toContain("github.rest.issues.addLabels");
    expect(routingWorkflow).toContain("labels: ['needs-maintainer-check']");
    expect(routingWorkflow).not.toContain("actions/checkout");

    expect(ciWorkflow).toContain("Block merge while a merge-blocking label is present");
    expect(ciWorkflow).toContain("grep -qx 'needs-maintainer-check'");
    expect(ciWorkflow).toContain("<!-- merge-queue-needs-maintainer-check -->");
    expect(ciWorkflow).toContain("needs-maintainer-check-pr-$pr");
    expect(inactivityWorkflow).toContain("'needs-maintainer-check'");
  });

  it("[P2] gates the backport auto-merge follow-up as a trusted workflow_run consumer", async () => {
    const workflow = await readFile(backportAutomergeWorkflowPath, "utf8");

    // Triggered only by ci completing, and only for a pull_request run on a backport-* branch —
    // never a push / manual dispatch, so a non-PR run can't reach the App-token or merge steps.
    expect(workflow).toContain("workflows: [ci]");
    expect(workflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(workflow).toContain("startsWith(github.event.workflow_run.head_branch, 'backport-')");

    // It mints the privileged release App token, hence the identity + SHA gates below.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("secrets.RELEASE_BOT_APP_ID");

    // Only a non-draft, same-repo PR authored by the release bot, targeting release/v*, is merged.
    expect(workflow).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(workflow).toContain("steps.pr.outputs.cross == 'false'");
    expect(workflow).toContain("steps.pr.outputs.draft == 'false'");
    expect(workflow).toContain('startswith("release/v")');

    // A human commit pushed on top of the cherry-pick (conflict resolution, CI fix) is never
    // reviewed, so auto-approve/merge require pristine == 'true': the backport cumulative diff
    // must be patch-equivalent to the source PR's reviewed merge commit on main. Author/committer
    // identity is a spoofable git header, so the gate must not trust github-actions[bot] metadata.
    expect(workflow).toContain("steps.pr.outputs.pristine == 'true'");
    expect(workflow).toContain("Checkout trusted repository history");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("Backport of #([0-9]+)");
    expect(workflow).toContain("source_patch_id");
    expect(workflow).toContain("backport_patch_id");
    expect(workflow).toContain("git patch-id --verbatim");
    expect(workflow).not.toContain("git patch-id --stable");
    expect(workflow).toContain("+refs/heads/$(printf '%s' \"$row\" | jq -r '.baseRefName')");
    expect(workflow).toContain("+refs/pull/$num/head:refs/remotes/pull/$num/head");
    expect(workflow).toContain('backport_base="$(git merge-base "$base_oid" "$head_oid" 2>/dev/null || true)"');
    expect(workflow).toContain('if [ -n "$backport_base" ]; then');
    expect(workflow).toContain("git diff --binary \"$source_merge^\" \"$source_merge\"");
    expect(workflow).toContain("git diff --binary \"$backport_base\" \"$head_oid\"");
    expect(workflow).toContain("source_base\" = \"main");
    expect(workflow).not.toContain('.[].committer.login // "none"');
    expect(workflow).not.toContain("grep -Fvxc 'github-actions[bot]'");

    // The PR is resolved from the run's authoritative workflow_run.pull_requests association
    // (filtered to the release/* base at exactly the run's SHA), not a branch-name guess, and the
    // merge is bound to that same SHA (no post-green commit merged untested).
    expect(workflow).toContain("github.event.workflow_run.pull_requests");
    expect(workflow).toContain("select(.head.sha == $sha)");
    expect(workflow).toContain("steps.pr.outputs.head_oid == github.event.workflow_run.head_sha");
    expect(workflow).toContain("--match-head-commit");
    expect(workflow).toContain("--squash");
    expect(workflow).toContain("--delete-branch");

    // To satisfy release/v*'s one-approval rule, the bot's own clean backport is auto-approved by
    // github-actions[bot] (pull-requests: write) — under the same author==bot gate as the merge.
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("gh pr review");
    expect(workflow).toContain("--approve");
    const approveStep = sectionBetween(workflow, "Approve the clean backport", "gh pr review");
    expect(approveStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(approveStep).toContain("steps.pr.outputs.pristine == 'true'");
    expect(approveStep).toContain("github.token");
    expect(approveStep).toContain("github.event.workflow_run.conclusion == 'success'");

    // The Feishu failure path carries the same identity + SHA gates, so a fork / non-bot
    // backport-* PR can't spam the release group and stale failed runs do not page after the PR
    // head advanced. Alert on failure and timed_out, but not routine cancelled runs.
    const feishuStep = sectionBetween(workflow, "Notify Feishu on failed backport CI", "python3");
    expect(feishuStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(feishuStep).toContain("steps.pr.outputs.cross == 'false'");
    expect(feishuStep).toContain("steps.pr.outputs.head_oid == github.event.workflow_run.head_sha");
    expect(feishuStep).toContain(
      "(github.event.workflow_run.conclusion == 'failure' || github.event.workflow_run.conclusion == 'timed_out')",
    );
    expect(feishuStep).not.toContain("'cancelled'");
  });

  it("[P2] gates the finalize-release follow-up as a trusted workflow_run consumer", async () => {
    const workflow = await readFile(finalizeReleaseWorkflowPath, "utf8");

    // Reacts to release-stable completing (not release: published — release-stable promotes its
    // own draft with GITHUB_TOKEN, which cannot trigger workflows), plus a manual backfill.
    expect(workflow).toContain('workflows: ["release-stable"]');
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.repository == 'nexu-io/open-design'");
    expect(workflow).not.toContain("github.event.workflow_run.conclusion != 'cancelled'");

    // It mints the privileged release App token for label deletion, branch push, PR + merge-queue.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("secrets.RELEASE_BOT_APP_ID");

    // The shipped version is resolved from the LATEST published release (release-stable marks it
    // --latest) or the dispatch tag — NEVER from workflow_run.head_branch, which can be the
    // dispatch ref rather than the built release branch when release-stable runs with a `ref` input.
    expect(workflow).toContain("gh release view --repo nexu-io/open-design --json tagName,isDraft,isPrerelease");
    expect(workflow).not.toContain("github.event.workflow_run.head_branch");
    expect(workflow).not.toContain("HEAD_BRANCH");

    // Only a published (draft=false), non-prerelease, open-design-vX.Y.Z release finalizes; a
    // dry-run completion (latest stays the previous, already-finalized stable) must no-op.
    expect(workflow).toContain("isDraft");
    expect(workflow).toContain("isPrerelease");
    expect(workflow).toContain("^[0-9]+\\.[0-9]+\\.[0-9]+$");
    expect(workflow).toContain('echo "skip=true"');
    expect(workflow).toContain("steps.ver.outputs.skip != 'true'");

    // Idempotent forward-only bump of the synchronized manifests (patch, not the next minor that
    // cut-release owns); independently-versioned packages are skipped via npm pkg set version.
    expect(workflow).toContain("sort -V");
    expect(workflow).toContain("npm pkg set version");
    expect(workflow).toContain("changed=true");

    // The bump PR needs one core-maintainer approval (code-owned manifests + require_code_owner_review
    // on main), so finalize requests that review and arms the merge queue pinned to the pushed SHA.
    expect(workflow).toContain("--add-reviewer nexu-io/core-maintainers");
    expect(workflow).toContain("--squash --auto --match-head-commit");
    expect(workflow).toContain("head_sha=$(git rev-parse HEAD)");
    expect(workflow).toContain("git ls-remote --exit-code --heads origin \"$BRANCH\"");

    // The shipped release's backport label is cleaned up (tolerant of an already-deleted label).
    expect(workflow).toContain('label="backport release/v$VERSION"');
    expect(workflow).toContain("gh label delete");
  });

  it("[P2] resolves finalize-release shipped versions from the real workflow shell step", async () => {
    const workflow = await readFile(finalizeReleaseWorkflowPath, "utf8");
    const script = extractWorkflowRunScript(
      workflow,
      "Resolve the shipped version (latest published stable, or the dispatch tag)",
    );

    async function runResolve(args: {
      event: "workflow_dispatch" | "workflow_run";
      inputTag?: string;
      state?: string;
      ghExit?: boolean;
    }): Promise<{ output: Record<string, string>; ghArgs: string[] }> {
      const dir = await mkdtemp(join(tmpdir(), "od-finalize-resolve-"));
      const ghPath = join(dir, "gh");
      const jqPath = join(dir, "jq");
      const outputPath = join(dir, "github-output");
      const ghLogPath = join(dir, "gh-args.log");
      await writeFile(
        ghPath,
        `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.FAKE_GH_LOG, process.argv.slice(2).join(" ") + "\\n");
if (process.env.FAKE_GH_EXIT === "1") process.exit(1);
process.stdout.write(process.env.FAKE_GH_STATE || "");
`,
      );
      await chmod(ghPath, 0o755);
      await writeFile(
        jqPath,
        `#!/usr/bin/env node
const selector = process.argv[process.argv.length - 1];
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(input);
  const key = selector.startsWith(".") ? selector.slice(1) : selector;
  process.stdout.write(String(data[key]) + "\\n");
});
`,
      );
      await chmod(jqPath, 0o755);

      try {
        await execFileAsync("bash", ["-c", script], {
          cwd: dir,
          env: workflowFixtureEnv({
            EVENT: args.event,
            INPUT_TAG: args.inputTag ?? "",
            GITHUB_OUTPUT: outputPath,
            FAKE_GH_LOG: ghLogPath,
            FAKE_GH_STATE: args.state ?? "",
            FAKE_GH_EXIT: args.ghExit ? "1" : "0",
          }, dir),
        });
        const [rawOutput, rawGhArgs] = await Promise.all([
          readFile(outputPath, "utf8").catch(() => ""),
          readFile(ghLogPath, "utf8").catch(() => ""),
        ]);
        return {
          output: parseGithubOutput(rawOutput),
          ghArgs: rawGhArgs.split(/\r?\n/).filter(Boolean),
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    await expect(
      runResolve({
        event: "workflow_dispatch",
        inputTag: "0.12.0",
        state: JSON.stringify({ tagName: "open-design-v0.12.0", isDraft: false, isPrerelease: false }),
      }),
    ).resolves.toMatchObject({
      output: {
        skip: "false",
        version: "0.12.0",
        next: "0.12.1",
        branch: "release-bot/bump-main-v0.12.1",
      },
      ghArgs: [expect.stringContaining("release view open-design-v0.12.0")],
    });

    await expect(
      runResolve({
        event: "workflow_dispatch",
        inputTag: "open-design-v1.2.3",
        state: JSON.stringify({ tagName: "open-design-v1.2.3", isDraft: false, isPrerelease: false }),
      }),
    ).resolves.toMatchObject({
      output: { skip: "false", version: "1.2.3", next: "1.2.4" },
      ghArgs: [expect.stringContaining("release view open-design-v1.2.3")],
    });

    for (const state of [
      { tagName: "open-design-v0.12.0", isDraft: true, isPrerelease: false },
      { tagName: "open-design-v0.12.0", isDraft: false, isPrerelease: true },
      { tagName: "open-design-v0.12.0-beta.1", isDraft: false, isPrerelease: false },
    ]) {
      await expect(runResolve({ event: "workflow_run", state: JSON.stringify(state) })).resolves.toMatchObject({
        output: { skip: "true" },
      });
    }

    await expect(runResolve({ event: "workflow_run", ghExit: true })).resolves.toMatchObject({
      output: { skip: "true" },
    });
  });

  it("[P2] bumps only synchronized workspace manifests in finalize-release", async () => {
    const workflow = await readFile(finalizeReleaseWorkflowPath, "utf8");
    const script = extractWorkflowRunScript(workflow, "Bump main's synchronized workspace versions");
    const dir = await mkdtemp(join(tmpdir(), "od-finalize-bump-"));
    const outputPath = join(dir, "github-output");
    const writeJson = (relativePath: string, value: unknown) =>
      writeFile(join(dir, relativePath), `${JSON.stringify(value, null, 2)}\n`);

    try {
      await Promise.all([
        mkdir(join(dir, "apps", "web"), { recursive: true }),
        mkdir(join(dir, "packages", "platform"), { recursive: true }),
        mkdir(join(dir, "packages", "components"), { recursive: true }),
        mkdir(join(dir, "tools", "dev"), { recursive: true }),
        mkdir(join(dir, "e2e"), { recursive: true }),
      ]);
      await Promise.all([
        writeJson("package.json", { name: "root", version: "0.12.0", dependencies: { untouched: "0.12.0" } }),
        writeJson("apps/web/package.json", { name: "@open-design/web", version: "0.12.0" }),
        writeJson("packages/platform/package.json", { name: "@open-design/platform", version: "0.12.0" }),
        writeJson("packages/components/package.json", { name: "@open-design/components", version: "0.5.0" }),
        writeJson("tools/dev/package.json", { name: "@open-design/dev", version: "0.12.0" }),
        writeJson("e2e/package.json", { name: "@open-design/e2e", version: "0.12.0" }),
      ]);

      await execFileAsync("bash", ["-c", script], {
        cwd: dir,
        env: workflowFixtureEnv({ NEXT: "0.12.1", GITHUB_OUTPUT: outputPath }),
      });

      await expect(readFile(outputPath, "utf8")).resolves.toContain("changed=true");
      await expect(readFile(join(dir, "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.1",
        dependencies: { untouched: "0.12.0" },
      });
      await expect(readFile(join(dir, "apps", "web", "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.1",
      });
      await expect(readFile(join(dir, "packages", "platform", "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.1",
      });
      await expect(readFile(join(dir, "tools", "dev", "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.1",
      });
      await expect(readFile(join(dir, "e2e", "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.1",
      });
      await expect(readFile(join(dir, "packages", "components", "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.5.0",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("[P2] keeps finalize-release version bumps forward-only", async () => {
    const workflow = await readFile(finalizeReleaseWorkflowPath, "utf8");
    const script = extractWorkflowRunScript(workflow, "Bump main's synchronized workspace versions");
    const dir = await mkdtemp(join(tmpdir(), "od-finalize-bump-noop-"));
    const outputPath = join(dir, "github-output");

    try {
      await writeFile(join(dir, "package.json"), `${JSON.stringify({ name: "root", version: "0.12.2" }, null, 2)}\n`);

      await execFileAsync("bash", ["-c", script], {
        cwd: dir,
        env: workflowFixtureEnv({ NEXT: "0.12.1", GITHUB_OUTPUT: outputPath }),
      });

      await expect(readFile(outputPath, "utf8")).resolves.toContain("changed=false");
      await expect(readFile(join(dir, "package.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        version: "0.12.2",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("[P2] keeps the backport patch-equivalence gate whitespace-sensitive", async () => {
    const compactDiff = [
      "diff --git a/script.py b/script.py",
      "--- a/script.py",
      "+++ b/script.py",
      "@@ -1 +1 @@",
      "-print(1)",
      "+print(2)",
      "",
    ].join("\n");
    const whitespaceDiff = [
      "diff --git a/script.py b/script.py",
      "--- a/script.py",
      "+++ b/script.py",
      "@@ -1 +1 @@",
      "-print(1)",
      "+ print(2)",
      "",
    ].join("\n");

    const compactStable = await gitPatchId("--stable", compactDiff);
    const whitespaceStable = await gitPatchId("--stable", whitespaceDiff);
    const compactVerbatim = await gitPatchId("--verbatim", compactDiff);
    const whitespaceVerbatim = await gitPatchId("--verbatim", whitespaceDiff);

    expect(compactStable).toBe(whitespaceStable);
    expect(compactVerbatim).not.toBe(whitespaceVerbatim);
  });

  it("[P2] gates the plugin-preview manifest auto-merge as a trusted workflow_run consumer", async () => {
    const workflow = await readFile(bakePreviewsAutomergeWorkflowPath, "utf8");

    // Triggered only by ci completing, and only for a pull_request run on the rolling
    // chore/plugin-previews branch — never a push / manual dispatch, so a non-PR run can't reach
    // the App-token or merge steps.
    expect(workflow).toContain("workflows: [ci]");
    expect(workflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'chore/plugin-previews'");

    // It mints the privileged release App token, hence the identity + SHA gates below.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("secrets.RELEASE_BOT_APP_ID");

    // Only a non-draft, same-repo PR authored by the release bot, targeting main, is merged.
    expect(workflow).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(workflow).toContain("steps.pr.outputs.cross == 'false'");
    expect(workflow).toContain("steps.pr.outputs.draft == 'false'");
    expect(workflow).toContain('select(.base.ref == "main")');

    // A human commit pushed onto the rolling branch is unreviewed, so auto-approve/merge require
    // pristine == 'true': the PR's changed files are EXACTLY data/plugin-previews/manifest.json. A
    // commit's author/committer identity is a spoofable git header and the Git Data API does not
    // sign commits, so neither identity nor signature can prove bot provenance; instead the diff is
    // bounded to manifest-only so a pushed code change can never auto-merge. Paginated across all
    // files; any non-manifest file fails the count.
    expect(workflow).toContain("steps.pr.outputs.pristine == 'true'");
    expect(workflow).toContain("/files?per_page=100");
    expect(workflow).toContain(".[].filename");
    expect(workflow).toContain("--paginate");
    expect(workflow).toContain("grep -Fvxc 'data/plugin-previews/manifest.json'");

    // The PR is resolved from the run's authoritative workflow_run.pull_requests association
    // (filtered to the main base at exactly the run's SHA), not a branch-name guess, and the merge
    // is bound to that same SHA (no post-green commit merged untested). main has a merge queue, so
    // the merge is GitHub-native --auto (enqueue), not a direct squash.
    expect(workflow).toContain("github.event.workflow_run.pull_requests");
    expect(workflow).toContain("select(.head.sha == $sha)");
    expect(workflow).toContain("steps.pr.outputs.head_oid == github.event.workflow_run.head_sha");
    expect(workflow).toContain("--match-head-commit");
    expect(workflow).toContain("--squash");
    expect(workflow).toContain("--auto");

    // To satisfy main's one-approval rule, the bot's own clean manifest PR is auto-approved by
    // github-actions[bot] (pull-requests: write) — a different identity than the App author.
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("gh pr review");
    expect(workflow).toContain("--approve");
    const approveStep = sectionBetween(workflow, "Approve the clean manifest PR", "gh pr review");
    expect(approveStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(approveStep).toContain("steps.pr.outputs.pristine == 'true'");
    expect(approveStep).toContain("github.token");
    // Approve only when the run CI actually succeeded — dropping this predicate would approve a
    // PR whose CI failed.
    expect(approveStep).toContain("github.event.workflow_run.conclusion == 'success'");

    // The enqueue step carries the same identity + SHA + pristine + success gates as the approve,
    // and merges via the native --auto path bound to the validated SHA. Dropping the success
    // predicate here would enqueue a PR whose CI failed.
    const enqueueStep = sectionBetween(workflow, "Enqueue the clean manifest PR", "gh pr merge");
    expect(enqueueStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(enqueueStep).toContain("steps.pr.outputs.pristine == 'true'");
    expect(enqueueStep).toContain("steps.pr.outputs.head_oid == github.event.workflow_run.head_sha");
    expect(enqueueStep).toContain("github.event.workflow_run.conclusion == 'success'");
    // Base-freshness: main's merge queue does not require an up-to-date branch, so a bake rendered
    // against an older main must not be squashed in over a newer manifest. The enqueue requires the
    // rendered base (the PR head's first parent) to equal current main HEAD; a behind PR waits for
    // the next bake to refresh.
    expect(enqueueStep).toContain("steps.pr.outputs.base_fresh == 'true'");
    expect(workflow).toContain('.parents[0].sha // ""');
    expect(workflow).toContain("commits/heads/main");

    // The Feishu failure path carries the same identity gates, so a fork / non-bot PR can't spam
    // the release group, and fires only on a CI *failure* (not success).
    const feishuStep = sectionBetween(workflow, "Notify Feishu on failed manifest CI", "python3");
    expect(feishuStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(feishuStep).toContain("steps.pr.outputs.cross == 'false'");
    // Page on every terminal RED state that strands the PR — failure AND timed_out (ci.yml has
    // timeout-minutes jobs) — but NOT cancelled, which a routine force-push of the rolling branch
    // produces and would otherwise page on every refresh.
    expect(feishuStep).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(feishuStep).toContain("github.event.workflow_run.conclusion == 'timed_out'");
    expect(feishuStep).not.toContain("'cancelled'");
    // Bind the alert to the exact SHA that failed: the rolling branch is force-pushed, so a stale
    // failed run that finishes after the head advanced must not page about a SHA that is no longer
    // the PR head.
    expect(feishuStep).toContain("steps.pr.outputs.head_oid == github.event.workflow_run.head_sha");
    // Sign the release webhook with the SAME secret the rest of the repo pairs with
    // FEISHU_RELEASE_WEBHOOK (notify-release-feishu / notify-daily-feishu / backport-automerge),
    // not a stray secret that resolves empty and sends an unsigned, rejected request.
    expect(feishuStep).toContain("secrets.FEISHU_RELEASE_WEBHOOK");
    expect(feishuStep).toContain("secrets.FEISHU_RELEASE_SIGN_SECRET");
  });

  it("[P2] keeps the bake producer wired so the auto-merge pristine path works", async () => {
    // The downstream pristine/auto-merge gates only hold if the producer keeps authoring the
    // rolling manifest PR the right way. Lock the three producer invariants this PR depends on, so
    // regressing any of them fails here instead of silently breaking auto-merge.
    const workflow = await readFile(bakePreviewsWorkflowPath, "utf8");

    // 1. The rolling PR is pushed with the release-bot App token, not GITHUB_TOKEN — a
    //    GITHUB_TOKEN-authored push triggers no CI, so the PR could never clear main's required
    //    `Validate workspace` check or the merge queue.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("secrets.RELEASE_BOT_APP_ID");
    expect(workflow).toContain("x-access-token:${APP_TOKEN}");
    // 2. The manifest commit touches ONLY data/plugin-previews/manifest.json. The reactor's
    //    pristine gate trusts the PR file set (not a forgeable commit identity), so the producer
    //    must keep committing exactly that one file.
    expect(workflow).toContain("cp \"$NEW\" \"$OLD\"");
    expect(workflow).toContain('git add "$OLD"');
    // 3. The rolling branch is rebuilt from the checked-out HEAD (the revision the manifest was
    //    rendered against), NOT live main — the bake can run ~90min while main advances, and basing
    //    it on live main would publish a stale manifest on top of newer commits. Creating the branch
    //    with `git checkout -B` from HEAD parents the commit on the rendered revision; a regression
    //    to a live-main base (fetching refs/heads/main as the parent) fails here.
    expect(workflow).toContain('git checkout -B "$BRANCH"');
    expect(workflow).not.toContain("git/ref/heads/main");
  });

  it("[P2] keeps the release-cut bake pushing its manifest as a ruleset bypass bot", async () => {
    // release/** is guarded by the "Protected branches (preview/*, release/v*)" ruleset whose
    // pull_request rule rejects a direct push (GH013) unless the pusher is a bypass actor. The
    // release-cut bake writes the authoritative manifest straight onto the release branch, so it
    // must push as open-design-bot — a bypass actor on that ruleset — not github-actions[bot],
    // which is NOT and gets rejected (this stranded release/v0.14.2's manifest). These three auth
    // invariants only work together; a refactor that drops any one silently reintroduces the
    // GH013 regression, so lock them here rather than rely on YAML review.
    const workflow = await readFile(bakePreviewsReleaseWorkflowPath, "utf8");

    // 1. Checkout must NOT persist GITHUB_TOKEN: its http.extraheader would override the inline bot
    //    token on push and re-authenticate as github-actions[bot] (the same override fixed in the
    //    post-merge bake — #5357).
    expect(workflow).toContain("persist-credentials: false");
    // 2. The run mints an open-design-bot token via the BOT_APP_* creds — the App that IS a bypass
    //    actor on the release ruleset. RELEASE_BOT_APP_ID (used by the post-merge bake) is a
    //    different App and is NOT a bypass actor, so pin the correct credentials, not just the
    //    generic token action.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("secrets.BOT_APP_CLIENT_ID");
    expect(workflow).toContain("secrets.BOT_APP_PRIVATE_KEY");
    // 3. The manifest push goes through the explicit tokenized URL with that bot token, so it
    //    authenticates as the bypass actor rather than the checkout's default credential.
    expect(workflow).toContain("x-access-token:${BOT_TOKEN}");
  });

  it("[P2] keeps PR and merge queue CI separated by hot/full validation mode", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const plan = sectionBetween(workflow, "  plan:", "  static_gate:");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(workflow).toContain("ci_mode:");
    expect(plan).toContain("run: ${{ steps.convergence.outputs.run }}");
    expect(plan).toContain("scopes: ${{ steps.scopes.outputs.scopes }}");
    expect(workflow).toContain("fromJSON(needs.plan.outputs.run).ui_p0");
    expect(validate).toContain("[$run | to_entries[] | select(.value) | .key]");

    await expect(runScopesPrint("workflow_dispatch", { inputs: { ci_mode: "hot" } }, ["apps/web/src/app/page.tsx"])).resolves.toMatchObject({
      ci_mode: "hot",
      run_ui_p0: true,
      run_playwright_critical: false,
    });
    await expect(runScopesPrint("workflow_dispatch", { inputs: { ci_mode: "hot" } }, ["tools/dev/src/index.ts"])).resolves.toMatchObject({
      ci_mode: "hot",
      run_ui_p0: false,
      run_playwright_critical: true,
    });
    await expect(runScopesPrint("workflow_dispatch", { inputs: {} })).resolves.toMatchObject({
      ci_mode: "full",
      ui_p0_validation_required: true,
      run_playwright_critical: false,
      run_ui_p0: true,
      run_preflight: true,
    });
    await expect(runScopesPrint("merge_group", {})).resolves.toMatchObject({
      ci_mode: "full",
      ui_p0_validation_required: true,
      run_playwright_critical: false,
      run_ui_p0: true,
      run_preflight: true,
    });
    // Packaging (nix / docker) is no longer part of core scopes / Validate workspace.
    for (const plan of await Promise.all([
      runScopesPrint("merge_group", {}),
      runScopesPrint("workflow_dispatch", { inputs: {} }),
      runScopesPrint("pull_request", { pull_request: { number: 1 } }, ["apps/web/src/app/page.tsx"]),
    ])) {
      expect(plan).not.toHaveProperty("run_nix_validation");
      expect(plan).not.toHaveProperty("run_docker_build");
      expect(plan).not.toHaveProperty("nix_validation_required");
      expect(plan).not.toHaveProperty("docker_validation_required");
    }
  });

  it("[P2] closes packaged-leaf coverage without duplicating the broad E2E lane", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const workspaceUnit = sectionBetween(workflow, "  workspace_unit_tests:", "  daemon_unit_tests:");

    expect(workspaceUnit).toContain(`if [ "\${{ fromJSON(needs.plan.outputs.scopes).tools_pack_tests_required }}" = "true" ]; then
            pnpm --filter @open-design/desktop build
            pnpm --filter @open-design/desktop test
            pnpm --filter @open-design/packaged test
            pnpm --filter @open-design/tools-pack test
            if [ "\${{ fromJSON(needs.plan.outputs.run).e2e_vitest }}" != "true" ]; then
              pnpm --filter @open-design/e2e test tests/packaged-launcher-update-loop.test.ts
            fi
          fi`);
  });

  it("[P1] runs the complete daemon suite in four required shards", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const daemonTests = sectionBetween(workflow, "  daemon_unit_tests:", "  windows_tools_pack_payload_tests:");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(daemonTests).toContain("if: ${{ fromJSON(needs.plan.outputs.run).daemon_unit_tests }}");
    expect(daemonTests).toContain("fail-fast: false");
    expect(daemonTests).toContain("shard: [1, 2, 3, 4]");
    expect(daemonTests).toContain("pnpm --filter @open-design/daemon test --shard=${{ matrix.shard }}/4");
    expect(validate).toContain("- daemon_unit_tests");
    expect(validate).toContain("[$run | to_entries[] | select(.value) | .key]");
  });

  it("[P2] skips the critical fallback for pure packaged-leaf changes and stays fail-closed elsewhere", async () => {
    const hot = { inputs: { ci_mode: "hot" } };

    // Playwright never starts the desktop, packaged, or tools-pack
    // entrypoints, so a change confined to those leaf roots keeps its
    // package tests but must not pay the two-job critical fallback.
    for (const file of [
      "apps/desktop/src/main.ts",
      "apps/packaged/src/index.ts",
      "tools/pack/src/win/installer.ts",
    ]) {
      await expect(runScopesPrint("workflow_dispatch", hot, [file])).resolves.toMatchObject({
        run_playwright_critical: false,
        run_ui_p0: false,
        tools_dev_tests_required: true,
        tools_pack_tests_required: true,
        ui_critical_validation_required: false,
        workspace_validation_required: true,
      });
    }

    const mergeGroup = {
      merge_group: {
        base_sha: "1111111111111111111111111111111111111111",
        head_sha: "2222222222222222222222222222222222222222",
      },
    };
    await expect(runScopesPrint("merge_group", mergeGroup, ["apps/desktop/src/main.ts"])).resolves.toMatchObject({
      run_e2e_vitest: false,
      run_playwright_critical: false,
      run_playwright_visual: false,
      run_ui_p0: false,
      run_web_workspace_tests: false,
      run_windows_tools_pack_payload_tests: false,
      tools_dev_tests_required: true,
      tools_pack_tests_required: true,
      windows_tools_pack_payload_tests_required: false,
      workspace_validation_required: true,
    });

    await expect(runScopesPrint("merge_group", mergeGroup, ["tools/pack/src/mac/app.ts"])).resolves.toMatchObject({
      run_windows_tools_pack_payload_tests: false,
      tools_pack_tests_required: true,
      windows_tools_pack_payload_tests_required: false,
    });

    await expect(runScopesPrint("merge_group", mergeGroup, ["tools/pack/src/win/custom-installer.ts"])).resolves.toMatchObject({
      run_windows_tools_pack_payload_tests: true,
      tools_pack_tests_required: true,
      windows_tools_pack_payload_tests_required: true,
    });

    await expect(runScopesPrint("merge_group", mergeGroup, ["packages/launcher-proto/src/index.ts"])).resolves.toMatchObject({
      run_windows_tools_pack_payload_tests: true,
      windows_tools_pack_payload_tests_required: true,
    });

    await expect(runScopesPrint("merge_group", mergeGroup, ["apps/desktop/package.json"])).resolves.toMatchObject({
      run_e2e_vitest: true,
      run_playwright_visual: true,
      run_ui_p0: true,
      run_web_workspace_tests: true,
    });

    // Fail-closed: anything that can reach the Playwright runtime — tools-dev,
    // transitive packages (including the undeclared metatool edge), scripts,
    // runtime resources, or unknown roots — retains the fallback.
    for (const file of [
      "tools/dev/src/index.ts",
      "packages/metatool/src/index.ts",
      "packages/agui-adapter/src/adapter.ts",
      "packages/diagnostics/src/index.ts",
      "packages/plugin-runtime/src/index.ts",
      "packages/registry-protocol/src/index.ts",
      "scripts/guard.ts",
      "mocks/bin/opencode",
      "some-new-root/file.ts",
    ]) {
      await expect(runScopesPrint("workflow_dispatch", hot, [file])).resolves.toMatchObject({
        run_playwright_critical: true,
        ui_critical_validation_required: true,
      });
    }

    // A mixed leaf + runtime change retains the fallback.
    await expect(
      runScopesPrint("workflow_dispatch", hot, ["apps/desktop/src/main.ts", "tools/dev/src/index.ts"]),
    ).resolves.toMatchObject({
      run_playwright_critical: true,
      ui_critical_validation_required: true,
    });

    // Root manifest/lock/workspace files keep enabling P0, which retains the
    // existing critical/P0 mutual exclusion.
    for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      await expect(runScopesPrint("workflow_dispatch", hot, [file])).resolves.toMatchObject({
        run_ui_p0: true,
        run_playwright_critical: false,
      });
    }

    // Documentation-only changes stay exempt from both.
    await expect(runScopesPrint("workflow_dispatch", hot, ["docs/spec.md"])).resolves.toMatchObject({
      run_playwright_critical: false,
      ui_critical_validation_required: false,
      workspace_validation_required: false,
    });

    // merge_group/full behavior is unchanged: everything is required and the
    // matrix covers critical, so the fallback stays off.
    await expect(runScopesPrint("merge_group", {})).resolves.toMatchObject({
      ci_mode: "full",
      ui_critical_validation_required: true,
      run_playwright_critical: false,
      run_ui_p0: true,
    });
  }, T.medium);

  it("[P2] keeps packaging (nix/docker) off the core Validate workspace gate", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(workflow).not.toContain("nix_validation:");
    expect(workflow).not.toContain("docker_pr:");
    expect(validate).not.toContain("nix_validation");
    expect(validate).not.toContain("docker_pr");
    expect(validate).not.toContain("run_nix_validation");
    expect(validate).not.toContain("run_docker_build");
    expect(validate).toContain("Check workspace validation jobs");

    const baseRun = {
      static_gate: false,
      preflight: false,
      workspace_unit_tests: false,
      daemon_unit_tests: false,
      windows_tools_pack_payload_tests: false,
      web_workspace_tests: false,
      e2e_vitest: false,
      playwright_critical: false,
      ui_p0: false,
      playwright_visual: false,
    };
    // Core gate only cares about app jobs — unknown packaging keys are ignored.
    await expect(
      validateGatePasses(workflow, {
        plan: { result: "success", outputs: { run: JSON.stringify(baseRun) } },
        merge_policy: { result: "skipped" },
      }),
    ).resolves.toBe(true);

    await expect(
      validateGatePasses(workflow, {
        plan: { result: "success", outputs: { run: JSON.stringify(baseRun) } },
        merge_policy: { result: "success" },
      }),
    ).resolves.toBe(true);

    await expect(
      validateGatePasses(workflow, {
        plan: { result: "success", outputs: { run: JSON.stringify(baseRun) } },
        merge_policy: { result: "failure" },
      }),
    ).resolves.toBe(false);

    const needsWithFailedWeb = {
      plan: { result: "success", outputs: { run: JSON.stringify({ ...baseRun, web_workspace_tests: true }) } },
      web_workspace_tests: { result: "failure" },
    };
    await expect(validateGatePasses(workflow, needsWithFailedWeb)).resolves.toBe(false);
  });

  it("[P1] hands off convergence results only after the workspace gate succeeds", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const plan = sectionBetween(workflow, "  plan:", "  static_gate:");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(plan).toContain("Upload pending convergence plan");
    expect(plan).toContain(
      "convergence_plan_artifact: ci-convergence-plan-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(plan).not.toContain("actions/cache/save");
    expect(validate).toContain("Download pending convergence plan");
    expect(validate).toContain("name: ${{ needs.plan.outputs.convergence_plan_artifact }}");
    expect(validate).not.toContain("name: ci-convergence-plan-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(validate).toContain("Upload convergence handoff");
    expect(validate.indexOf("Upload convergence handoff")).toBeGreaterThan(
      validate.indexOf("Check workspace validation jobs"),
    );
    expect(validate).not.toContain("Block merge while a merge-blocking label is present");

    const run = {
      static_gate: false,
      preflight: false,
      workspace_unit_tests: false,
      daemon_unit_tests: false,
      windows_tools_pack_payload_tests: false,
      web_workspace_tests: false,
      e2e_vitest: true,
      playwright_critical: false,
      ui_p0: false,
      playwright_visual: false,
    };
    await expect(validateGatePasses(workflow, {
      plan: { result: "success", outputs: { run: JSON.stringify(run) } },
      e2e_vitest: { result: "failure" },
    })).resolves.toBe(false);
  });

  it("[P1] includes launcher protocol in the Nix daemon workspace build", async () => {
    const flake = await readFile(flakePath, "utf8");
    const daemonWorkspaces = sectionBetween(flake, "      daemonWorkspacePaths = [", "      ];");

    expect(daemonWorkspaces).toContain('"packages/launcher-proto"');
    expect(daemonWorkspaces.indexOf('"packages/launcher-proto"')).toBeLessThan(
      daemonWorkspaces.indexOf('"apps/daemon"'),
    );
  });

  it("[P2] routes trusted Linux CI through the Nexu runner fleet", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const runners = sectionBetween(workflow, "  runners:", "  plan:");
    const plan = sectionBetween(workflow, "  plan:", "  static_gate:");
    const staticGate = sectionBetween(workflow, "  static_gate:", "  preflight:");
    const workspaceUnitTests = sectionBetween(workflow, "  workspace_unit_tests:", "  daemon_unit_tests:");
    const daemonUnitTests = sectionBetween(workflow, "  daemon_unit_tests:", "  windows_tools_pack_payload_tests:");
    const webWorkspaceTests = sectionBetween(workflow, "  web_workspace_tests:", "  e2e_vitest:");
    const e2eVitest = sectionBetween(workflow, "  e2e_vitest:", "  playwright_critical:");
    const preflight = sectionBetween(workflow, "  preflight:", "  workspace_unit_tests:");
    const uiP0 = sectionBetween(workflow, "  ui_p0:", "  playwright_visual:");
    const visual = sectionBetween(workflow, "  playwright_visual:", "  merge_policy:");

    expect(runners).toContain("|| 'nexu-runners-small'");
    expect(runners).toContain("&& 'ubuntu-24.04'");
    expect(runners).toContain("runs_on: ${{ steps.runners.outputs.runs_on }}");
    expect(runners).toContain("decision: ${{ steps.runners.outputs.decision }}");
    expect(runners).toContain("python3 .github/scripts/runners.py");
    expect(plan).toContain("needs: [runners]");
    expect(plan).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(staticGate).toContain("needs: [plan, runners]");
    expect(staticGate).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(workspaceUnitTests).toContain("fromJSON(needs.runners.outputs.runs_on).workspace_unit");
    expect(workspaceUnitTests).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).workspace_unit)");
    expect(daemonUnitTests).toContain("fromJSON(needs.runners.outputs.runs_on).workspace_unit");
    expect(daemonUnitTests).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).workspace_unit)");
    expect(webWorkspaceTests).toContain("fromJSON(needs.runners.outputs.runs_on).js_hot");
    expect(webWorkspaceTests).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).js_hot)");
    expect(webWorkspaceTests).not.toContain('"od-persistent-ci"');
    // Pin two-way vitest sharding so a later YAML edit cannot collapse the split or restore the
    // monolithic `pnpm --filter @open-design/web test` command while this suite still passes.
    expect(webWorkspaceTests).toContain("fail-fast: false");
    expect(webWorkspaceTests).toContain("shard: [1, 2]");
    expect(webWorkspaceTests).toContain(
      "pnpm --filter @open-design/web exec vitest run -c vitest.config.ts --maxWorkers=2 --shard=${{ matrix.shard }}/2",
    );
    expect(e2eVitest).toContain("fromJSON(needs.runners.outputs.runs_on).js_hot");
    expect(e2eVitest).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).js_hot)");
    expect(e2eVitest).not.toContain('"od-persistent-ci"');
    expect(preflight).toContain("fromJSON(needs.runners.outputs.runs_on).general_medium");
    expect(preflight).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).general_medium)");
    expect(uiP0).toContain("fromJSON(needs.runners.outputs.runs_on).ui_p0");
    expect(uiP0).toContain("fromJSON(needs.runners.outputs.runs_on).ui_p0_heavy");
    expect(uiP0).toContain("matrix.shard == 'project-collab'");
    expect(uiP0).toContain(
      "toJSON(matrix.shard == 'project-collab' && fromJSON(needs.runners.outputs.runs_on).ui_p0_heavy || fromJSON(needs.runners.outputs.runs_on).ui_p0)",
    );
    expect(uiP0).toContain("include: ${{ fromJSON(needs.plan.outputs.ui_p0_matrix) }}");
    expect(uiP0CiMatrix.map((entry) => entry.name)).toEqual([
      "entry-settings",
      "project-workspace",
      "project-workspace-editor",
      "project-collab",
      "project-runtime",
      "workspace-restoration",
    ]);
    expect(uiP0Groups["project-workspace"].files).toEqual([
      "ui/app.test.ts",
      "ui/project-management-flows.test.ts",
      "ui/workspace-keyboard-flows.test.ts",
    ]);
    expect(uiP0Groups["project-workspace"].workers).toBe(1);
    expect(uiP0Groups["project-workspace-editor"]).toEqual({
      grep: String.raw`\[P0\]`,
      workers: 1,
      files: [
        "ui/app-design-files.test.ts",
        "ui/app-manual-edit.test.ts",
        "ui/workspace-team-design-system-picker.test.ts",
      ],
    });
    expect(uiP0Groups["project-collab"].files).toEqual([
      "ui/workspace-multi-client-collab.test.ts",
    ]);
    expect(uiP0Groups["project-collab"].workers).toBe(1);
    expect(uiP0Groups["critical-extras"]).toEqual({
      grep: "@merge-extra",
      workers: 1,
      files: ["ui/app.test.ts"],
    });
    expect(uiP0Groups["workspace-restoration"]).toEqual({
      fullyParallel: true,
      grep: String.raw`\[P0\]`,
      files: ["ui/app-restoration.test.ts", "ui/critical-smoke.test.ts"],
    });
    expect(uiP0Groups["entry-settings"].files).toContain("ui/home-hero-rail.test.ts");
    expect(workflow).not.toContain("  ui_p0_smoke:");
    expect(uiP0).toContain("run-ui-group critical-extras");
    expect(uiP0).toContain("Preserve project-runtime domain artifact");
    expect(visual).toContain("fromJSON(needs.runners.outputs.runs_on).visual_hot");
    expect(visual).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).visual_hot)");
    // visual-pr-capture-* is consumed by report.atom.yml; pin retain-on-failure traces so a
    // later YAML edit cannot drop e2e/ui/reports/visual-test-results while the suite still passes.
    expect(visual).toContain(
      "name: visual-pr-capture-${{ github.event.pull_request.number }}-${{ github.run_id }}-${{ matrix.name }}",
    );
    expect(visual).toContain("name: visual-ci-${{ github.run_id }}-${{ matrix.name }}");
    expect(visual).toContain("e2e/ui/reports/visual-test-results");
    // Both PR and manual upload path lists include retain-on-failure diagnostics.
    expect(visual.match(/e2e\/ui\/reports\/visual-test-results/g)?.length).toBe(2);
    // visual-baseline.yml shares playwright.visual.config.ts; pin its debug artifact so baseline
    // failures keep the same retain-on-failure path that ci.yml already uploads.
    const visualBaseline = await readFile(visualBaselineWorkflowPath, "utf8");
    const baselineDebugArtifact = sectionBetween(
      visualBaseline,
      "      - name: Upload baseline debug artifact",
      "          retention-days: 7",
    );
    expect(baselineDebugArtifact).toContain("if: ${{ always() }}");
    expect(baselineDebugArtifact).toContain("e2e/ui/reports/visual-test-results");
    expect(workflow).not.toContain("needs.runners.outputs.contabo_control");
    expect(workflow).not.toContain("needs.runners.outputs.hosted_or_blacksmith");
    expect(workflow).not.toContain("needs.runners.outputs.blacksmith_default");
  });

  it.each([
    {
      name: "workspace runner assertions",
      workflowPath: ciWorkflowPath,
      jobStart: "  workspace_unit_tests:",
      jobEnd: "  daemon_unit_tests:",
      marker: "fromJSON(needs.runners.outputs.runs_on).workspace_unit",
    },
    {
      name: "Functional E2E commit pin",
      workflowPath: releasePrereleaseWorkflowPath,
      jobStart: "  functional_e2e:",
      jobEnd: "  e2e_vitest:",
      marker: "ref: ${{ needs.metadata.outputs.commit }}",
    },
  ])("[P1] keeps $name bounded to its owning job", async ({
    workflowPath,
    jobStart,
    jobEnd,
    marker,
  }) => {
    const workflow = await readFile(workflowPath, "utf8");
    const owningJob = sectionBetween(workflow, jobStart, jobEnd);
    const mutated = workflow.replace(owningJob, owningJob.replaceAll(marker, "regressed-marker"));

    expect(sectionBetween(mutated, jobStart, jobEnd)).not.toContain(marker);
  });

  it("[P2] caps Playwright concurrency independently from build concurrency", async () => {
    const action = await readFile(configureCiParallelismActionPath, "utf8");

    expect(action).toContain('playwright_workers="$workers"');
    expect(action).toContain('if [ "$playwright_workers" -gt 2 ]; then');
    expect(action).toContain("playwright_workers=2");
    expect(action).toContain('echo "OD_PLAYWRIGHT_WORKERS=$playwright_workers"');
    expect(action).toContain('echo "OPEN_DESIGN_WORKSPACE_CONCURRENCY=$workers"');
  });

  it("[P1] routes external fork PRs through GitHub-hosted runner profiles", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const runners = sectionBetween(workflow, "  runners:", "  plan:");

    expect(runners).toContain("github.event_name == 'pull_request'");
    expect(runners).toContain("github.event.pull_request.head.repo.full_name != github.repository");
    expect(runners).toContain("|| vars.OD_CI_RUNNER_MODE == 'economic'");
    expect(runners).toContain("&& 'ubuntu-24.04'");
    expect(runners).toContain("&& 'economic'");
    expect(runners).toContain("|| vars.OD_CI_RUNNER_MODE");
  });

  it("[P1] pins ShellCheck for actionlint across runner profiles", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const staticGate = sectionBetween(workflow, "  static_gate:", "  preflight:");

    expect(staticGate).toContain("SHELLCHECK_VERSION: 0.11.0");
    expect(staticGate).toContain("shellcheck_arch=x86_64");
    expect(staticGate).toContain("shellcheck_arch=aarch64");
    expect(staticGate).toContain(
      'koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.${shellcheck_arch}.tar.gz',
    );
    expect(staticGate).toContain("sudo install -m 0755 shellcheck /usr/local/bin/shellcheck");
    expect(staticGate).toContain("run: actionlint -color");
  });

  it("[P2] keeps visual ownership and reusable full UI sharding explicit", async () => {
    const playwrightConfig = await readFile(playwrightConfigPath, "utf8");
    const benchmarkWorkflow = await readFile(uiExtendedMainWorkflowPath, "utf8");
    const extendedP0 = sectionBetween(benchmarkWorkflow, "  ui_p0:", "  ui_extended:");
    const extendedP0Matrix = sectionBetween(extendedP0, "        include:", "\n    steps:");
    const extendedP0Names = [...extendedP0Matrix.matchAll(/^\s+- name: (.+)$/gm)].map(
      ([, name]) => name,
    );
    const fullUi = benchmarkWorkflow.slice(benchmarkWorkflow.indexOf("  ui_full:"));
    const fullUiFiles = [...fullUi.matchAll(/ui\/[a-z0-9-]+\.test\.ts/g)]
      .map(([file]) => file)
      .sort();

    expect(playwrightConfig).toContain("testIgnore: 'visual-*.test.ts'");
    expect(benchmarkWorkflow).toContain("  workflow_call:");
    expect(benchmarkWorkflow).toContain('description: "Exact git ref to validate. Prerelease passes its resolved build commit."');
    expect(benchmarkWorkflow).toContain("ref: ${{ inputs.ref || github.sha }}");
    expect(benchmarkWorkflow).not.toContain("  schedule:");
    expect(benchmarkWorkflow).not.toContain("github.event_name == 'schedule'");
    expect(benchmarkWorkflow).not.toContain("layout:");
    expect(benchmarkWorkflow).toContain("run-ui-group critical-extras");
    expect(benchmarkWorkflow).toContain("Preserve project-runtime domain artifact");
    expect(benchmarkWorkflow).toContain("--grep-invert '@merge-extra'");
    expect(extendedP0Names).toEqual(uiP0CiMatrix.map((entry) => entry.name));
    expect(benchmarkWorkflow).toContain("fromJSON(needs.p0_runners.outputs.runs_on).ui_p0");
    expect(fullUi).toContain("fromJSON(needs.p0_runners.outputs.runs_on).ui_hot");
    expect(fullUi).toContain("inputs.suite == 'full'");
    expect(fullUi).toContain("shard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]");
    expect(fullUi).toContain('OD_PLAYWRIGHT_FULLY_PARALLEL: "1"');
    expect(fullUi).not.toContain("OD_PLAYWRIGHT_WORKERS");
    expect(fullUi).toContain("name: Run full UI shard");
    expect(fullUi).toContain("playwright test -c playwright.config.ts ui --shard=${{ matrix.shard }}/12");
    expect(fullUi).toContain("name: ui-full-${{ github.run_id }}-shard-${{ matrix.shard }}-of-12");
    expect(fullUi).not.toContain("matrix.files");
    expect(fullUi).not.toContain("--grep");
    expect(fullUiFiles).toEqual([]);
  });

  it("[P1] rejects unsupported reusable Functional E2E suite values before running suites", async () => {
    const workflow = await readFile(uiExtendedMainWorkflowPath, "utf8");
    const validation = sectionBetween(workflow, "  validate_inputs:", "  p0_runners:");
    const p0Runners = sectionBetween(workflow, "  p0_runners:", "  ui_p0:");
    const uiP0 = sectionBetween(workflow, "  ui_p0:", "  ui_extended:");
    const uiP1 = sectionBetween(workflow, "  ui_extended:", "  ui_full:");
    const uiFull = workflow.slice(workflow.indexOf("  ui_full:"));

    expect(validation).toContain('case "$SUITE" in');
    expect(validation).toContain("p0|p0p1|full) ;;");
    expect(validation).toContain("Unsupported suite:");
    expect(validation).toContain("exit 1");
    expect(p0Runners).toContain("needs: [validate_inputs]");
    expect(uiP0).toContain("needs: [validate_inputs, p0_runners]");
    expect(uiP1).toContain("needs: [validate_inputs]");
    expect(uiFull).toContain("needs: [validate_inputs, p0_runners]");
  });

  it("[P1] gates prerelease packaging on P0 Functional E2E at the resolved build commit", async () => {
    const [prerelease, functionalE2e] = await Promise.all([
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(uiExtendedMainWorkflowPath, "utf8"),
    ]);

    const gate = sectionBetween(prerelease, "  functional_e2e:", "  e2e_vitest:");
    expect(gate).toContain("needs: metadata");
    expect(gate).toContain("uses: ./.github/workflows/ui-extended-main.yml");
    expect(gate).toContain("ref: ${{ needs.metadata.outputs.commit }}");
    expect(gate).toContain("suite: p0");

    const e2eVitestGate = sectionBetween(prerelease, "  e2e_vitest:", "  daemon_unit_tests:");
    expect(e2eVitestGate).toContain("needs: metadata");
    expect(e2eVitestGate).toContain("ref: ${{ needs.metadata.outputs.commit }}");
    expect(e2eVitestGate).toContain("playwright install --with-deps chromium");
    expect(e2eVitestGate).toContain("Allow Chromium user namespaces on GitHub Ubuntu");
    expect(e2eVitestGate).toContain("kernel.apparmor_restrict_unprivileged_userns=0");
    expect(e2eVitestGate).not.toContain("--no-sandbox");
    expect(e2eVitestGate.indexOf("kernel.apparmor_restrict_unprivileged_userns=0"))
      .toBeLessThan(e2eVitestGate.indexOf("pnpm --filter @open-design/e2e test"));
    expect(e2eVitestGate).toContain("pnpm --filter @open-design/e2e test");

    const daemonGate = sectionBetween(prerelease, "  daemon_unit_tests:", "  verify:");
    expect(daemonGate).toContain("shard: [1, 2, 3, 4]");
    expect(daemonGate).toContain("ref: ${{ needs.metadata.outputs.commit }}");
    expect(daemonGate).toContain("pnpm --filter @open-design/daemon test --shard=${{ matrix.shard }}/4");

    expect(functionalE2e).toContain("workflow_call:");
    expect(functionalE2e).not.toContain("schedule:");
    expect(functionalE2e).toContain("ref: ${{ inputs.ref || github.sha }}");

    for (const [start, end] of [
      ["  build_mac:", "  build_mac_intel:"],
      ["  build_mac_intel:", "  build_win:"],
      ["  build_win:", "  build_linux:"],
      ["  build_linux:", "  publish:"],
    ] as const) {
      const buildJob = sectionBetween(prerelease, start, end);
      expect(buildJob).toContain("needs: [metadata, functional_e2e, e2e_vitest, daemon_unit_tests, verify]");
      expect(buildJob).toContain("ref: ${{ needs.metadata.outputs.commit }}");
    }

    const publish = sectionBetween(prerelease, "  publish:", "  cleanup_partial_release_assets:");
    expect(publish).toContain("- functional_e2e");
    expect(publish).toContain("- e2e_vitest");
    expect(publish).toContain("- daemon_unit_tests");
    expect(publish).toContain("needs.functional_e2e.result == 'success'");
    expect(publish).toContain("needs.e2e_vitest.result == 'success'");
    expect(publish).toContain("needs.daemon_unit_tests.result == 'success'");
    expect(publish).toContain("ref: ${{ needs.metadata.outputs.commit }}");
  });

  it("[P2] rejects duplicate file assignments across UI P0 shards", () => {
    const files = uiP0Groups["workspace-restoration"].files as unknown as string[];
    files.push("ui/app.test.ts");
    try {
      expect(validatePlaywrightSuiteTopology()).toContain(
        "UI P0 CI matrix covers ui/app.test.ts more than once",
      );
    } finally {
      files.pop();
    }
  });

  it("[P2] resolves CI runner profiles by mode", async () => {
    const defaultProfiles = await runRunners();
    const defaultRunsOn = runnerRunsOn(defaultProfiles);
    expect(runnerDecision(defaultProfiles)).toEqual({ schema_version: 1, mode: "default" });
    expect(Object.keys(defaultRunsOn).sort()).toEqual([
      "control",
      "general_medium",
      "js_hot",
      "ui_hot",
      "ui_p0",
      "ui_p0_heavy",
      "visual_hot",
      "windows_tools",
      "workspace_unit",
    ]);
    expect(defaultRunsOn.control).toEqual(["nexu-runners-small"]);
    expect(defaultRunsOn.general_medium).toEqual(["nexu-runners-medium"]);
    expect(defaultRunsOn.workspace_unit).toEqual(["nexu-runners-medium"]);
    expect(defaultRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(defaultRunsOn.js_hot).toEqual(["nexu-runners-medium"]);
    expect(defaultRunsOn.ui_hot).toEqual(["nexu-runners-large"]);
    expect(defaultRunsOn.ui_p0).toEqual(["nexu-runners-medium"]);
    expect(defaultRunsOn.ui_p0_heavy).toEqual(["nexu-runners-xlarge"]);
    expect(defaultRunsOn.visual_hot).toEqual(["nexu-runners-large"]);
    expect(defaultProfiles).not.toHaveProperty("contabo_control");
    expect(defaultProfiles).not.toHaveProperty("hosted_or_blacksmith");
    expect(defaultProfiles).not.toHaveProperty("blacksmith_default");

    const performanceProfiles = await runRunners("performance");
    const performanceRunsOn = runnerRunsOn(performanceProfiles);
    expect(runnerDecision(performanceProfiles)).toEqual({ schema_version: 1, mode: "default" });
    expect(performanceRunsOn.control).toEqual(["nexu-runners-small"]);
    expect(performanceRunsOn.general_medium).toEqual(["nexu-runners-medium"]);
    expect(performanceRunsOn.workspace_unit).toEqual(["nexu-runners-medium"]);
    expect(performanceRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(performanceRunsOn.js_hot).toEqual(["nexu-runners-medium"]);
    expect(performanceRunsOn.ui_hot).toEqual(["nexu-runners-large"]);
    expect(performanceRunsOn.ui_p0).toEqual(["nexu-runners-medium"]);
    expect(performanceRunsOn.ui_p0_heavy).toEqual(["nexu-runners-xlarge"]);
    expect(performanceRunsOn.visual_hot).toEqual(["nexu-runners-large"]);

    const blacksmithProfiles = await runRunners("blacksmith");
    const blacksmithRunsOn = runnerRunsOn(blacksmithProfiles);
    expect(runnerDecision(blacksmithProfiles)).toEqual({ schema_version: 1, mode: "blacksmith" });
    expect(blacksmithRunsOn.control).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.general_medium).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.workspace_unit).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(blacksmithRunsOn.js_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.ui_hot).toEqual(["blacksmith-8vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.ui_p0).toEqual(["blacksmith-8vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.ui_p0_heavy).toEqual(["blacksmith-8vcpu-ubuntu-2404"]);
    expect(blacksmithRunsOn.visual_hot).toEqual(["blacksmith-8vcpu-ubuntu-2404"]);

    const economicProfiles = await runRunners("economic");
    const economicRunsOn = runnerRunsOn(economicProfiles);
    expect(runnerDecision(economicProfiles)).toEqual({ schema_version: 1, mode: "economic" });
    expect(economicRunsOn.control).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.general_medium).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.workspace_unit).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(economicRunsOn.js_hot).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.ui_hot).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.ui_p0).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.ui_p0_heavy).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.visual_hot).toEqual(["ubuntu-24.04"]);

    for (const invalidMode of ["Economic", " economic "]) {
      await expect(runRunners(invalidMode)).rejects.toThrow("unknown runner mode");
    }
  });

  it("[P1] keeps infra-cancel rerun eligibility gates unit-tested", async () => {
    const { stdout, stderr } = await execFileAsync("python3", [rerunInfraCancelScriptPath, "self-check"], {
      cwd: workspaceRoot,
    });
    expect(stderr).toBe("");
    expect(stdout).toContain("rerun_infra_cancel self-check OK");
  });

  it("[P2] routes CI follow-ons through generic handoff workflows", async () => {
    const [ciWorkflow, commentWorkflow, autofixWorkflow, reportWorkflow, convergenceWorkflow, handoffScript] = await Promise.all([
      readFile(ciWorkflowPath, "utf8"),
      readFile(commentWorkflowPath, "utf8"),
      readFile(autofixWorkflowPath, "utf8"),
      readFile(reportWorkflowPath, "utf8"),
      readFile(convergenceWorkflowPath, "utf8"),
      readFile(handoffScriptPath, "utf8"),
    ]);

    // Core ci still produces comment + report handoffs (needs-validation, visual).
    // Packaging hash autofix left core ci with nix — no ci-produced autofix handoffs for now.
    expect(ciWorkflow).toContain("handoff.py dir comment");
    expect(ciWorkflow).toContain("handoff.py dir report");
    expect(ciWorkflow).toContain("convergence.py handoff");
    expect(ciWorkflow).toContain("handoff-comment-");
    expect(ciWorkflow).toContain("handoff-report-");
    expect(ciWorkflow).toContain("handoff-convergence-");
    expect(ciWorkflow).not.toContain("handoff.py dir autofix");
    expect(ciWorkflow).not.toContain("handoff-autofix-");
    expect(ciWorkflow).not.toContain("nix-hash-autofix");
    expect(ciWorkflow).not.toContain("visual-pr-comment");
    expect(commentWorkflow).toContain("artifact-pattern comment");
    expect(commentWorkflow).toContain("merge-multiple: false");
    expect(commentWorkflow).toContain("pull-requests: write");
    // Atom capability remains available for future producers; it is not required to be fed by ci.
    expect(autofixWorkflow).toContain("artifact-pattern autofix");
    expect(autofixWorkflow).toContain("allowed_paths");
    expect(reportWorkflow).toContain("artifact-pattern report");
    expect(reportWorkflow).toContain("scripts/visual-report.ts compare-pr");
    expect(reportWorkflow).toContain("R2_ACCESS_KEY_ID");
    expect(reportWorkflow).toContain("pull-requests: write");
    expect(reportWorkflow).toContain("Visual report comment creation failed");
    expect(reportWorkflow).toContain("jq -n --rawfile body");
    expect(reportWorkflow).toContain("--input");
    expect(reportWorkflow).not.toContain("handoff.py dir comment");
    expect(reportWorkflow).not.toContain("handoff-comment-");
    expect(handoffScript).toContain("def self_check()");
    expect(handoffScript).toContain('"report"');
    expect(handoffScript).toContain('"convergence"');
    expect(convergenceWorkflow).toContain("handoff.py resolve-run-artifact convergence ci-results");
    expect(convergenceWorkflow).toContain("Checkout trusted convergence code");
    expect(convergenceWorkflow).toContain("convergence.py admit");
    expect(convergenceWorkflow).toContain("python3 .github/scripts/convergence.py publish");
    expect(convergenceWorkflow).toContain("convergence.py stage-products");
    expect(convergenceWorkflow).toContain("convergence.py storage-status");
    expect(convergenceWorkflow).toContain("CLOUDFLARE_R2_WORKLOAD_RESULTS_AK");
    expect(convergenceWorkflow).not.toContain("gh api");
    expect(convergenceWorkflow).not.toContain("jq");
    expect(convergenceWorkflow).not.toContain("ci-v1");
    expect(ciWorkflow).not.toContain("convergence-provenance.json");
    expect(convergenceWorkflow).not.toContain("actions/checkout@v6.0.2\n        with:\n          ref: ${{ github.event.workflow_run.head_sha }}");

    for (const workflow of [commentWorkflow, autofixWorkflow]) {
      expect(workflow).toContain("python3 .github/scripts/handoff.py self-check");
      expect(workflow).toContain("github.event.workflow_run.event == 'pull_request'");
      expect(workflow).not.toContain("nix/pnpm-deps.nix");
      expect(workflow).not.toContain("visual-report");
    }
    expect(reportWorkflow).toContain("python3 .github/scripts/handoff.py self-check");
    expect(reportWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");

    expect(commentWorkflow).toContain("jq -n --rawfile body");
    expect(commentWorkflow).toContain("--input");
    for (const workflow of [commentWorkflow]) {
      expect(workflow).toContain("jq -n --rawfile body");
      expect(workflow).toContain("--input");
      expect(workflow).not.toContain("--field body=\"$(cat");
      expect(workflow).not.toContain("--field \"body=$(cat");
    }
  });

  it("[P1] keeps workload policy above the narrow Python R2 transport", async () => {
    const [workflow, convergence, r2] = await Promise.all([
      readFile(convergenceWorkflowPath, "utf8"),
      readFile(convergenceScriptPath, "utf8"),
      readFile(r2PythonLibPath, "utf8"),
    ]);
    expect(convergence).toContain("from lib.r2 import R2Client");
    expect(convergence).toContain("def publish_command");
    expect(r2).toContain("class R2Client");
    expect(r2).toContain('headers["if-none-match"] = "*"');
    expect(r2).not.toContain("workload result");
    expect(r2).not.toContain("handoff");
    expect(workflow).not.toContain("r2.ts");
    expect(workflow).not.toContain("publish-workload-results");
  });

  it("[P2] keeps pull-request plugin preview baking secretless and read-only", async () => {
    const [prWorkflow, postMergeWorkflow] = await Promise.all([
      readFile(bakePluginPreviewsPrWorkflowPath, "utf8"),
      readFile(bakePluginPreviewsWorkflowPath, "utf8"),
    ]);

    expect(prWorkflow).toContain("permissions:\n  contents: read");
    expect(prWorkflow).toContain("Checkout PR head");
    expect(prWorkflow).toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(prWorkflow).toContain("upload: 'false'");
    expect(prWorkflow).toContain("post-merge bake will publish clips and open the rolling manifest PR");
    expect(prWorkflow).not.toContain("contents: write");
    expect(prWorkflow).not.toContain("PREVIEW_BAKE_TOKEN");
    expect(prWorkflow).not.toContain("CLOUDFLARE_R2_REPOSITORY_ASSETS");
    expect(prWorkflow).not.toContain("git push");

    expect(postMergeWorkflow).toContain("permissions:\n  contents: write");
    expect(postMergeWorkflow).toContain("CLOUDFLARE_R2_REPOSITORY_ASSETS_AK");
    // The write-capable credential the PR path lacks lives here post-merge. The rolling manifest PR
    // is now authored with the release-bot App (so its push triggers CI and the auto-merge reactor
    // can act), replacing the never-configured PREVIEW_BAKE_TOKEN fallback.
    expect(postMergeWorkflow).toContain("secrets.RELEASE_BOT_APP_ID");
    expect(postMergeWorkflow).not.toContain("PREVIEW_BAKE_TOKEN");
  });

  it("[P2] preserves beta linux AppImage smoke reports for platform publication", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(/- name: Build beta linux_x64\r?\n(?:.+\r?\n)+?(?=\r?\n      - name: Write linux_x64 release report)/m);
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain("RELEASE_TARGET: linux_x64");
    expect(linuxBuildStep?.[0]).toContain("RELEASE_REPORT_DIR: ${{ runner.temp }}/release-report/linux_x64");
    expect(linuxBuildStep?.[0]).toContain("bash tools/release/scripts/build-platform.sh");
    expect(workflow).toContain("Write linux_x64 release report");
    expect(workflow).toContain("RELEASE_REPORT_JSON_PATH: ${{ runner.temp }}/release-report/linux_x64/report.json");
    expect(workflow).toContain("Prepare linux_x64 assets");
    expect(workflow).toContain("Publish linux_x64 platform");
    expect(workflow).toContain("Upload linux_x64 publish manifest");
    expect(workflow).toContain("open-design-beta-linux-x64-publish-manifest");
    expect(workflow).toContain("Download linux_x64 publish manifest");
    expect(workflow).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(workflow).not.toContain(".github/scripts/release/r2/publish-platform.ts");
  });

  it("[P2] preserves stable linux AppImage smoke reports for release publication", async () => {
    const workflow = await readFile(releaseStableWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(
      /- name: Build release linux artifacts\r?\n(?:.+\r?\n)+?(?=\r?\n      - name: Smoke release linux AppImage runtime)/m,
    );
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke release linux AppImage runtime");
    expect(workflow).toContain("manifest.json");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux e2e spec report");
    expect(workflow).toContain("open-design-release-linux-e2e-report");
    expect(workflow).toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(workflow, "Build release linux artifacts");
    expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow, "Smoke release linux AppImage runtime");
  });

  it("[P2] keeps release namespaces aligned with release channels", async () => {
    const [releaseStableWorkflow, releaseStableScript, releasePrereleaseWorkflow, releaseBetaWorkflow] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
    ]);

    expect(releaseStableScript).toContain('mac: releaseNamespace(channel, "mac"),');
    expect(releaseStableScript).toContain('setOutput("namespace", namespaces.mac);');
    expect(releaseStableScript).toContain('setOutput("mac_intel_namespace", namespaces.macIntel);');
    expect(releaseStableScript).toContain('setOutput("win_namespace", namespaces.win);');
    expect(releaseStableScript).toContain('setOutput("linux_namespace", namespaces.linux);');

    expect(releaseStableWorkflow).toContain("namespace: ${{ steps.stable.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("mac_intel_namespace: ${{ steps.stable.outputs.mac_intel_namespace }}");
    expect(releaseStableWorkflow).toContain("win_namespace: ${{ steps.stable.outputs.win_namespace }}");
    expect(releaseStableWorkflow).toContain("linux_namespace: ${{ steps.stable.outputs.linux_namespace }}");
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.namespace }}"');
    expect(releaseStableWorkflow).toContain("OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain('"--namespace", "${{ needs.metadata.outputs.win_namespace }}",');
    expect(releaseStableWorkflow).toContain('OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.win_namespace }}');
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.linux_namespace }}"');
    expect(releaseStableWorkflow).toContain('"namespace": "${{ needs.metadata.outputs.linux_namespace }}",');
    expect(releaseStableWorkflow).not.toMatch(/--namespace release-stable(?:-intel|-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/OD_PACKAGED_E2E_NAMESPACE: release-stable(?:-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/namespaces\/release-stable(?:-intel|-win|-linux)?\b/);

    expectChannelWorkflowNamespaces(releasePrereleaseWorkflow, "prerelease", { hasLinuxSmoke: true });
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-win");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-linux");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: win_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: linux_x64");
    expect(releaseBetaWorkflow).toContain("OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE: ${{ inputs.mac_arm64_smoke_mode == 'full' && inputs.mac_arm64_update_metadata_url == '' && inputs.mac_arm64_update_target_version == '' && 'tools-serve' || '' }}");
    const betaWinJob = sectionBetween(releaseBetaWorkflow, "  build_win_x64:", "  build_linux_x64:");
    expect(betaWinJob).not.toContain("tools\\release\\scripts\\build-platform.ps1");
    expect(betaWinJob).toContain("uses: actions/cache/restore@v5");
    expect(betaWinJob).toContain("uses: actions/cache/save@v5");
    expect(betaWinJob).toContain("tools-pack-win-v1-beta-$env:RUNNER_OS-");
    expect(betaWinJob).toContain('"tools-pack", "win", "build"');
    expect(betaWinJob).toContain("tools-pack win validate-payload");
    expect(betaWinJob).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    const betaBuildScript = await readFile(releaseBetaPosixBuildScriptPath, "utf8");
    expect(betaBuildScript).toContain("required RELEASE_CHANNEL");
    expect(betaBuildScript).toContain('release_channel="$RELEASE_CHANNEL"');
    expect(betaBuildScript).not.toContain('RELEASE_CHANNEL:-beta');
    expect(betaBuildScript).toContain('OD_PACKAGED_E2E_RELEASE_CHANNEL="$release_channel"');
    expect(betaBuildScript).toContain('OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION"');
    expect(betaBuildScript).toContain('OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE="${update_build_json_path:+tools-serve}"');
    const betaWindowsBuildScript = await readFile(releaseBetaWindowsBuildScriptPath, "utf8");
    expect(betaWindowsBuildScript).toContain('throw "RELEASE_CHANNEL is required"');
    expect(betaWindowsBuildScript).not.toContain('"beta" } else { $env:RELEASE_CHANNEL }');
    expect(betaWindowsBuildScript).toContain('Test-JsonString $manifest.channel "channel" $ReleaseChannel');
    expect(betaWindowsBuildScript).toContain('channel = $ReleaseChannel');
    expect(betaWindowsBuildScript).toContain('$env:OD_PACKAGED_E2E_RELEASE_CHANNEL = $ReleaseChannel');
    expect(betaWindowsBuildScript).toContain('$env:OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = "tools-serve"');

    expectWindowsUpdaterSmokeContract(releaseBetaWorkflow, "beta");
    expectWindowsUpdaterSmokeContract(releasePrereleaseWorkflow, "prerelease");
    expectWindowsUpdaterSmokeContract(releaseStableWorkflow, "stable");
  });

  it("[P2] prerelease publishes github.commit so its changelog has a baseline", async () => {
    // The Feishu release card computes its changelog as `git log <previous>..<current>`,
    // where <previous> is read from prerelease/latest/metadata.json's `.github.commit`
    // (notify-release-feishu.yml). That field is written by githubInfo() from the
    // RELEASE_COMMIT env. release-beta sets RELEASE_COMMIT on every build + publish job,
    // but release-prerelease historically set it on none, so every prerelease published an
    // empty github.commit and the card could never diff against the prior prerelease
    // ("首个 Prerelease 包"). Require RELEASE_COMMIT on the prerelease build + publish jobs
    // so the per-platform manifests and the final metadata.json carry the built commit and
    // stay mutually consistent (publish-metadata rejects a manifest whose commit disagrees).
    const [prereleaseWorkflow, betaWorkflow] = await Promise.all([
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
    ]);

    const releaseCommitEnv = "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}";
    // Beta is the working reference that already populates the commit.
    expect(betaWorkflow).toContain(releaseCommitEnv);

    const jobBounds: Array<[string, string]> = [
      ["  build_mac:", "  build_mac_intel:"],
      ["  build_mac_intel:", "  build_win:"],
      ["  build_win:", "  build_linux:"],
      ["  build_linux:", "  publish:"],
      ["  publish:", "  cleanup_partial_release_assets:"],
    ];
    for (const [start, end] of jobBounds) {
      expect(sectionBetween(prereleaseWorkflow, start, end)).toContain(releaseCommitEnv);
    }
  });

  it("[P2] keeps counted release workflow calls on a consistent ref and output contract", async () => {
    const prereleaseWorkflow = await readFile(releasePrereleaseWorkflowPath, "utf8");

    expectCountedReleaseWorkflowCallContract(prereleaseWorkflow, "prerelease");

    expect(prereleaseWorkflow).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");
    expect(prereleaseWorkflow).toContain("Required when ref is not release/vX.Y.Z");
  });

  it("[P2] retires dedicated betas and preview release entrypoints", () => {
    for (const path of [
      join(workspaceRoot, ".github", "workflows", "release-beta-s.yml"),
      join(workspaceRoot, ".github", "workflows", "release-preview.yml"),
      join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-betas.ts"),
      join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-preview.ts"),
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });

  it("[P2] makes a publish=false beta dispatch retrievable on both platforms without touching a channel", async () => {
    // A publish=false dispatch is the standing shape for dogfood/QA builds: they
    // must never enter the public beta feed. mac already handed back a DMG, but
    // the Windows job produced nothing retrievable at all, so a Windows dogfood
    // build was impossible without also publishing. Both platforms now emit a
    // GitHub artifact plus an R2 upload under the dogfood prefix.
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const macJob = sectionBetween(workflow, "  build_mac_arm64:", "  build_mac_x64:");
    const winJob = sectionBetween(workflow, "  build_win_x64:", "  build_linux_x64:");

    for (const [label, job] of [["mac_arm64", macJob], ["win_x64", winJob]] as const) {
      expect(job, label).toContain("run: pnpm exec tools-release publish-dogfood");
      expect(job, label).toContain("DOGFOOD_VERSION: ${{ needs.metadata.outputs.beta_version }}");
      expect(job, label).toContain("DOGFOOD_BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}");
      // Artifact paths come from the build's own --json output, so whichever
      // targets the parameterised --to actually produced are what get uploaded.
      expect(job, label).toContain("DOGFOOD_BUILD_JSON_PATH:");
      expect(job, label).toContain("DOGFOOD_BUILD_JSON_KEYS:");
    }

    // The Windows installer is retrievable as a GitHub artifact too, covering
    // every win_x64_target (nsis -> setup exe, zip -> portable zip, all -> both).
    expect(winJob).toContain("name: open-design-beta-win-x64-installer");
    expect(winJob).toContain("builder\\*-setup.exe");
    expect(winJob).toContain("builder\\*-portable.zip");

    // Every publish=false distribution step is gated on !inputs.publish, so the
    // publish=true release pipeline runs exactly as it did before.
    const dogfoodSteps = workflow.split("\n      - name: ").filter((step) =>
      /publish-dogfood|for manual distribution/.test(step)
    );
    expect(dogfoodSteps).toHaveLength(4);
    for (const step of dogfoodSteps) {
      expect(step, step.split("\n")[0]).toContain("if: ${{ !cancelled() && !inputs.publish }}");
    }

    // A dogfood step must never name a channel prefix, a latest pointer, or the
    // publishing commands; those stay exclusive to the inputs.publish lane.
    for (const step of dogfoodSteps) {
      const head = step.split("\n")[0] ?? "";
      for (const forbidden of ["publish-platform", "publish-metadata", "beta/latest", "prerelease/", "preview/", "stable/"]) {
        expect(step, `${head} / ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("[P2] publishes release notes through one channel-neutral tools-release pipeline", async () => {
    const workflows = await Promise.all([
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releaseStableWorkflowPath, "utf8"),
    ]);

    for (const workflow of workflows) {
      expect(workflow).toContain("tools-release prepare-release-note");
      expect(workflow).toContain("tools-release publish-release-note");
      expect(workflow).toContain("tools-release verify-release-note");
      expect(workflow).toContain("RELEASE_NOTE_MANIFEST_PATH:");
      expect(workflow.indexOf("tools-release prepare-release-note")).toBeLessThan(
        workflow.indexOf("tools-release publish-release-note"),
      );
      expect(workflow.indexOf("tools-release publish-release-note")).toBeLessThan(
        workflow.indexOf("tools-release verify-release-note"),
      );
      expect(workflow.indexOf("tools-release verify-release-note")).toBeLessThan(
        workflow.indexOf("tools-release publish-metadata"),
      );
    }

    const stableWorkflow = workflows[2] ?? "";
    expect(stableWorkflow).toContain("Validate stable release note policy");
    expect(stableWorkflow).toContain(
      "RELEASE_PUBLISH_SIDE_EFFECTS: ${{ needs.metadata.outputs.publish_side_effects_enabled }}",
    );
  });

  it("[P2] requires stable release dispatch to use the release version branch", async () => {
    const [workflow, script] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
    ]);

    expect(workflow).not.toContain("OPEN_DESIGN_STABLE_VERSION:");
    expect(workflow).not.toContain("inputs.release_version");
    expect(workflow).toContain("Stable release branch to build, for example release/v0.5.1.");

    expect(script).toContain("const stableReleaseBranchPattern = /^release\\/v(\\d+\\.\\d+\\.\\d+)$/;");
    expect(script).toContain("function resolveStableBaseVersion");
    expect(script).toContain("release-stable requires GITHUB_REF_NAME to be release/vX.Y.Z");
    expect(script).toContain("function resolvePrereleaseBaseVersion");
    expect(script).toContain(
      '${stableBaseVersion.source ?? "release base"} version ${stableBaseVersion.value} must match apps/packaged/package.json version',
    );
  });

  it("[P2] rejects stable release runs without the release version branch", async () => {
    const output = await runReleaseStableForFailure({
      GITHUB_REF_NAME: "main",
      OPEN_DESIGN_STABLE_VERSION: "",
    });

    expect(output).toContain("release-stable requires GITHUB_REF_NAME to be release/vX.Y.Z; got main");
  });

  it("[P2] ignores explicit stable version inputs in favor of the release branch gate", async () => {
    const output = await runReleaseStableForFailure({
      GITHUB_REF_NAME: "main",
      OPEN_DESIGN_STABLE_VERSION: "0.10.1",
    });

    expect(output).toContain("release-stable requires GITHUB_REF_NAME to be release/vX.Y.Z; got main");
  });

  it("[P2] reads beta metadata.json written with releaseVersion/releaseNumber field names", async () => {
    // The unified publisher refactor (.github/workflow/scripts/release/storage)
    // and the in-flight tools-release rewrite stamp beta/latest/metadata.json
    // with generic releaseVersion/releaseNumber fields instead of the legacy
    // betaVersion/betaNumber. tools-release's daily-beta reader must accept
    // those aliases or the scheduled build dies at metadata time.
    const packagedVersion = JSON.parse(
      await readFile(join(workspaceRoot, "apps", "packaged", "package.json"), "utf8"),
    ).version as string;

    const objects: Record<string, unknown> = {
      "stable/latest/metadata.json": { channel: "stable", stableVersion: "0.0.1" },
      "beta/latest/metadata.json": {
        baseVersion: packagedVersion,
        channel: "beta",
        releaseNumber: 4,
        releaseVersion: `${packagedVersion}-beta.4`,
      },
    };
    const fixture = await startStablePrereleaseMetadataServer(objects);
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-reader-"));
    const outputPath = join(runnerTemp, "outputs.txt");

    try {
      const result = await execFileAsync(process.execPath, ["--experimental-strip-types", releaseBetaScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputPath,
          GITHUB_REF_NAME: "main",
          GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          OPEN_DESIGN_BETA_METADATA_URL: `${fixture.origin}/beta/latest/metadata.json`,
          OPEN_DESIGN_STABLE_METADATA_URL: `${fixture.origin}/stable/latest/metadata.json`,
        },
        maxBuffer: 1024 * 1024,
      });

      expect(result.stdout).toContain(`[release-beta] beta version: ${packagedVersion}-beta.5`);
      const outputs = await readFile(outputPath, "utf8");
      expect(outputs).toContain(`beta_version=${packagedVersion}-beta.5`);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it.skip("[P1] lets the daily main build recover a shared beta advanced by a feature branch", async () => {
    const packagedVersion = "1.2.3";
    const foreignAheadBaseVersion = "1.3.0";
    const objects: Record<string, unknown> = {
      "beta/latest/metadata.json": {
        baseVersion: foreignAheadBaseVersion,
        channel: "beta",
        github: { branch: "feat/standalone-closure" },
        releaseNumber: 9,
        releaseVersion: `${foreignAheadBaseVersion}-beta.9`,
      },
    };
    const fixture = await startStablePrereleaseMetadataServer(objects);
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-foreign-recovery-"));
    const outputPath = join(runnerTemp, "outputs.txt");
    const baseEnv = {
      ...process.env,
      BUILD_REF: "main",
      GITHUB_OUTPUT: outputPath,
      GITHUB_RUN_NUMBER: "4242",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      OPEN_DESIGN_BETA_METADATA_URL: `${fixture.origin}/beta/latest/metadata.json`,
      PACKAGED_VERSION: packagedVersion,
    };

    try {
      const recovered = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", dailyBetaRecoveryScriptPath],
        {
          cwd: workspaceRoot,
          env: baseEnv,
          maxBuffer: 1024 * 1024,
        },
      );
      expect(recovered.stdout).toContain(
        "[daily-beta] recovering shared beta from foreign branch feat/standalone-closure",
      );
      const recoveryOutputs = await readFile(outputPath, "utf8");
      expect(recoveryOutputs).toContain("force=true");
      expect(recoveryOutputs).toContain("promote=false");
      expect(recoveryOutputs).toContain(`release_version=${packagedVersion}-beta.4242`);

      await writeFile(outputPath, "", "utf8");
      const featureBuild = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", dailyBetaRecoveryScriptPath],
        {
          cwd: workspaceRoot,
          env: { ...baseEnv, BUILD_REF: "feat/standalone-closure" },
          maxBuffer: 1024 * 1024,
        },
      );
      expect(featureBuild.stdout).toContain("[daily-beta] recovery disabled for non-main ref");
      const featureOutputs = await readFile(outputPath, "utf8");
      expect(featureOutputs).toContain("force=false");
      expect(featureOutputs).toContain("promote=true");
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("[P1] keeps shared beta publication main-owned while feature refs stay dogfood-only", async () => {
    const [betaWorkflow, dailyWorkflow] = await Promise.all([
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(notifyDailyFeishuWorkflowPath, "utf8"),
    ]);
    const metadataJob = sectionBetween(betaWorkflow, "  metadata:", "  build_mac_arm64:");
    const publisherGuard = sectionBetween(
      metadataJob,
      "- name: Validate shared beta publisher",
      "- name: Capture previous beta commit",
    );

    expect(betaWorkflow).toContain(
      "RELEASE_BRANCH: ${{ inputs.ref != '' && inputs.ref || github.ref_name }}",
    );
    expect(publisherGuard).toContain("if: ${{ inputs.publish }}");
    expect(publisherGuard).toContain('built_sha="$(git rev-parse HEAD)"');
    expect(publisherGuard).toContain(
      'main_sha="$(git ls-remote origin refs/heads/main | awk \'{print $1}\')"',
    );
    expect(publisherGuard).toContain('[ "$built_sha" != "$main_sha" ]');
    expect(publisherGuard).toContain("publish=false");
    expect(betaWorkflow).not.toContain("recover_foreign_beta");
    expect(betaWorkflow).not.toContain("OPEN_DESIGN_RECOVER_FOREIGN_BETA");
    expect(metadataJob).toContain("branch: ${{ steps.identity.outputs.branch }}");
    expect(metadataJob).toContain("commit: ${{ steps.identity.outputs.commit }}");
    expect(metadataJob).toContain("promote: ${{ inputs.promote }}");
    expect(betaWorkflow).toContain("value: ${{ jobs.build_mac_arm64.outputs.smoke_result }}");
    expect(betaWorkflow).toContain("value: ${{ jobs.build_win_x64.outputs.smoke_result }}");
    expect(betaWorkflow).toContain(
      "value: ${{ jobs.publish.outputs.mac_arm64_url || jobs.build_mac_arm64.outputs.mac_arm64_url }}",
    );
    expect(betaWorkflow).toContain(
      "value: ${{ jobs.publish.outputs.win_x64_url || jobs.build_win_x64.outputs.win_x64_url }}",
    );

    const macJob = sectionBetween(betaWorkflow, "  build_mac_arm64:", "  build_mac_x64:");
    expect(macJob).toContain("smoke_result: ${{ steps.mac_arm64_smoke.outcome }}");
    expect(macJob).toContain("mac_arm64_url: ${{ steps.mac_arm64_platform_outputs.outputs.dmg_url }}");
    expect(macJob).toContain("id: mac_arm64_smoke");
    expect(macJob).toContain("continue-on-error: true");
    expect(macJob).toContain("id: mac_arm64_platform_outputs");

    const winJob = sectionBetween(betaWorkflow, "  build_win_x64:", "  build_linux_x64:");
    expect(winJob).toContain("smoke_result: ${{ steps.win_x64_smoke.outcome }}");
    expect(winJob).toContain("win_x64_url: ${{ steps.win_x64_platform_outputs.outputs.installer_url }}");
    expect(winJob).toContain("id: win_x64_smoke");
    expect(winJob).toContain("continue-on-error: true");
    expect(winJob).toContain("id: win_x64_platform_outputs");

    const publishJob = betaWorkflow.slice(betaWorkflow.indexOf("  publish:"));
    expect(publishJob).toContain("inputs.promote");
    expect(dailyWorkflow).toContain("resolve-daily-beta-recovery.ts");
    expect(dailyWorkflow).toContain("force: ${{ needs.resolve.outputs.force == 'true' }}");
    expect(dailyWorkflow).toContain("promote: ${{ needs.resolve.outputs.promote == 'true' }}");
    expect(dailyWorkflow).toContain("release_version: ${{ needs.resolve.outputs.release_version }}");
    expect(dailyWorkflow).toContain(
      "MAC_ARM64_SMOKE_RESULT: ${{ needs.build.outputs.mac_arm64_smoke_result }}",
    );
    expect(dailyWorkflow).toContain("WIN_X64_SMOKE_RESULT: ${{ needs.build.outputs.win_x64_smoke_result }}");
    expect(dailyWorkflow).toContain("RELEASE_STATE: ${{ needs.build.outputs.release_state }}");
  });

  it("[P2] daily beta resolve defaults to main and preserves the ref override", async () => {
    // Beta is the daily R&D channel and must track the development tip (main).
    // Selecting the highest-semver release/vX.Y.Z branch stalls the build: once
    // that branch ships stable, its base version equals the latest stable and
    // release-beta's strictly-greater-than-stable guard rejects every run until
    // someone hand-bumps the retired branch. main always leads stable, so it
    // never hits that trap.
    //
    // Scope every assertion to the resolve job so a refactor elsewhere in the
    // workflow cannot keep this green while changing the build-ref control flow,
    // and prove both branches of that control flow: the empty-input default
    // builds main, and the workflow_dispatch override is still propagated.
    const workflow = await readFile(notifyDailyFeishuWorkflowPath, "utf8");
    const resolveJob = sectionBetween(workflow, "  resolve:", "\n  build:");
    expect(resolveJob).toContain("force: ${{ steps.recovery.outputs.force }}");
    expect(resolveJob).toContain("promote: ${{ steps.recovery.outputs.promote }}");
    expect(resolveJob).toContain("release_version: ${{ steps.recovery.outputs.release_version }}");
    // Override path: workflow_dispatch ref is wired in and forwarded verbatim.
    expect(resolveJob).toContain("OVERRIDE_REF: ${{ inputs.ref }}");
    expect(resolveJob).toContain('echo "ref=$OVERRIDE_REF" >> "$GITHUB_OUTPUT"');
    // Default path: an empty input builds main, never a release branch.
    expect(resolveJob).toContain('echo "ref=main" >> "$GITHUB_OUTPUT"');
    expect(resolveJob).not.toContain("refs/heads/release/v*");

    // Metadata failures happen before beta_version exists, so the normal
    // download-card job is skipped. Keep a separate failure-only notice or a
    // stale main version can fail silently every day without reaching smoke.
    expect(workflow).toContain("  notify_failure:");
    expect(workflow).toContain("if: ${{ always() && needs.build.result == 'failure' }}");
    expect(workflow).toContain("tools/release/src/notifications/feishu-notice.ts");
  });

  it("[P1] skips the scheduled minor cut until the highest release branch is published stable", async () => {
    const workflow = await readFile(cutReleaseWorkflowPath, "utf8");
    const gate = sectionBetween(
      workflow,
      "- name: Check the current release line is published",
      "- name: Bail out if the branch already exists",
    );

    expect(gate).toContain("GITHUB_EVENT_NAME: ${{ github.event_name }}");
    expect(gate).toContain("LATEST_RELEASE: ${{ steps.ver.outputs.latest_release }}");
    expect(gate).toContain('[ "$GITHUB_EVENT_NAME" != "schedule" ]');
    expect(gate).toContain('gh release view "open-design-v$LATEST_RELEASE"');
    expect(gate).toContain("--jq '(.isDraft or .isPrerelease) | not'");
    expect(gate).toContain('echo "ready=false" >> "$GITHUB_OUTPUT"');
    expect(gate).toContain('echo "ready=true" >> "$GITHUB_OUTPUT"');

    for (const step of [
      "Bail out if the branch already exists",
      "Create branch + bump version + push",
      "Create backport label",
      "Notify Feishu that the branch was cut",
    ]) {
      expect(workflow).toContain(`- name: ${step}\n        if: steps.gate.outputs.ready == 'true'`);
    }
  });

  it("[P1] keeps the metadata-independent prerelease Windows smoke advisory to release cuts", async () => {
    const [canary, minorCut, patchCut] = await Promise.all([
      readFile(mainPrereleaseWinSmokeWorkflowPath, "utf8"),
      readFile(cutReleaseWorkflowPath, "utf8"),
      readFile(cutPatchReleaseWorkflowPath, "utf8"),
    ]);

    const trigger = sectionBetween(canary, "on:", "\npermissions:");
    expect(trigger).toContain("schedule:");
    expect(trigger).toContain("workflow_dispatch:");
    expect(trigger).toContain("workflow_call:");
    expect(canary).toContain("ref: main");
    expect(canary).not.toContain("inputs.ref");
    expect(canary).toContain("runs-on: windows-latest");
    expect(canary).toContain("OPEN_DESIGN_AMR_PROFILE: prod");
    expect(canary).toContain("OD_VELA_WEB_URL: ${{ secrets.VELA_WEB_URL_PROD }}");
    expect(canary).toContain("--namespace release-prerelease-canary-win");
    expect(canary).toContain('OD_PACKAGED_E2E_RELEASE_CHANNEL: prerelease');
    expect(canary).toContain('OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: core');
    expect(canary).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(canary).toContain("tools-pack win validate-payload");
    expect(canary).toContain("tools/release/src/notifications/feishu-notice.ts");

    // This lane is a product canary, not a beta/prerelease publication. In
    // particular, a stale main package version must not prevent Windows from
    // reaching the packaged smoke as happened while main was 0.16.2 and stable
    // had already advanced to 0.18.1.
    expect(canary).not.toContain("tools-release prepare");
    expect(canary).not.toContain("tools-release check-storage");
    expect(canary).not.toContain("uses: ./.github/workflows/release-beta.yml");
    expect(canary).not.toContain("uses: ./.github/workflows/release-prerelease.yml");

    for (const [label, workflow] of [
      ["cut-release", minorCut],
      ["cut-patch-release", patchCut],
    ] as const) {
      const cutJob = workflow.slice(workflow.indexOf("  cut:"));
      expect(workflow, label).not.toContain("prerelease_win_smoke");
      expect(workflow, label).not.toContain("uses: ./.github/workflows/main-prerelease-win-smoke.yml");
      expect(workflow, label).toContain("permissions:\n  contents: read");
      expect(cutJob, label).not.toContain("needs:");
      expect(cutJob, label).toContain("ref: main");
    }

    expect(canary).toContain("该 smoke 是独立质量信号，不阻塞 release cut 或 prerelease 打包 / 发布。");
    expect(canary).not.toContain("release cut 会被阻止");
  });

  it("[P1] keeps prerelease smoke failures advisory and annotates the download card", async () => {
    const [prerelease, notify, feishuCard] = await Promise.all([
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(notifyReleaseFeishuWorkflowPath, "utf8"),
      readFile(feishuCardScriptPath, "utf8"),
    ]);

    const workflowCall = sectionBetween(prerelease, "  workflow_call:", "permissions:");
    expect(workflowCall).toContain("mac_arm64_smoke_result:");
    expect(workflowCall).toContain("value: ${{ jobs.build_mac.outputs.smoke_result }}");
    expect(workflowCall).toContain("win_x64_smoke_result:");
    expect(workflowCall).toContain("value: ${{ jobs.build_win.outputs.smoke_result }}");

    const macJob = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const macSmoke = sectionBetween(
      macJob,
      "      - name: Smoke prerelease mac packaged runtime",
      "      - name: Write mac_arm64 release report",
    );
    expect(macJob).toContain("outputs:\n      smoke_result: ${{ steps.mac_smoke.outcome }}");
    expect(macSmoke).toContain("id: mac_smoke");
    expect(macSmoke).toContain("continue-on-error: true");

    const macX64Job = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const macX64Smoke = sectionBetween(
      macX64Job,
      "      - name: Smoke prerelease mac_x64 packaged runtime",
      "      - name: Write mac_x64 release report",
    );
    expect(macX64Job).toContain("outputs:\n      smoke_result: ${{ steps.mac_x64_smoke.outcome }}");
    expect(macX64Smoke).toContain("id: mac_x64_smoke");
    expect(macX64Smoke).toContain("continue-on-error: true");
    expect(macX64Smoke).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(macX64Job).toContain("RELEASE_SMOKE_MODE: core");

    const winJob = sectionBetween(prerelease, "  build_win:", "  build_linux:");
    const winSmokeFixture = sectionBetween(
      winJob,
      "      - name: Build prerelease win_x64 update fixture",
      "      - name: Smoke prerelease windows packaged runtime",
    );
    const winSmoke = sectionBetween(
      winJob,
      "      - name: Smoke prerelease windows packaged runtime",
      "      - name: Write win_x64 release report",
    );
    expect(winJob).toContain("outputs:\n      smoke_result: ${{ steps.win_smoke.outcome }}");
    expect(winSmokeFixture).toContain("continue-on-error: true");
    expect(winSmoke).toContain("id: win_smoke");
    expect(winSmoke).toContain("continue-on-error: true");
    expect(winJob.indexOf("Smoke prerelease windows packaged runtime")).toBeLessThan(
      winJob.indexOf("Publish windows prerelease platform"),
    );

    const linuxJob = sectionBetween(prerelease, "  build_linux:", "  publish:");
    const linuxSmoke = sectionBetween(
      linuxJob,
      "      - name: Smoke prerelease linux AppImage runtime",
      "      - name: Upload linux e2e spec report",
    );
    expect(linuxJob).toContain("outputs:\n      smoke_result: ${{ steps.linux_smoke.outcome }}");
    expect(linuxSmoke).toContain("id: linux_smoke");
    expect(linuxSmoke).toContain("continue-on-error: true");
    expect(linuxSmoke).toContain('OD_PACKAGED_E2E_LINUX_APPIMAGE: "1"');
    expect(linuxSmoke).toContain("xvfb-run -a pnpm test specs/linux.spec.ts");
    expect(linuxJob.indexOf("Smoke prerelease linux AppImage runtime")).toBeLessThan(
      linuxJob.indexOf("Publish linux prerelease platform"),
    );

    const notifyJob = notify.slice(notify.indexOf("  notify:"));
    expect(notifyJob).toContain("MAC_ARM64_SMOKE_RESULT: ${{ needs.build.outputs.mac_arm64_smoke_result }}");
    expect(notifyJob).toContain("WIN_X64_SMOKE_RESULT: ${{ needs.build.outputs.win_x64_smoke_result }}");
    expect(notifyJob).toContain("MAC_ARM64_URL: ${{ needs.build.outputs.mac_arm64_url }}");
    expect(notifyJob).toContain("WIN_URL: ${{ needs.build.outputs.win_url }}");
    expect(notifyJob).toContain("tools/release/src/notifications/feishu.ts");
    expect(notifyJob).not.toContain("tools/release/src/notifications/feishu-notice.ts");

    expect(feishuCard).toContain('optional("MAC_ARM64_SMOKE_RESULT")');
    expect(feishuCard).toContain('optional("WIN_X64_SMOKE_RESULT")');
    expect(feishuCard).toContain("Windows x64 smoke 失败");
    expect(feishuCard).toContain("macOS arm64 smoke 失败");
    expect(feishuCard).toContain("产物已继续发布，可通过下方链接下载");
    expect(feishuCard).toContain(
      'template: smokeFailures.length > 0 || releaseState === "partial" ? "orange"',
    );
  });

  it("[P1] keeps download actions on a prerelease card with a failed Windows smoke", async () => {
    const payload = await renderFeishuBuildCard({
      MAC_ARM64_SMOKE_RESULT: "success",
      MAC_ARM64_URL: "https://releases.example/mac.dmg",
      WIN_X64_SMOKE_RESULT: "failure",
      WIN_URL: "https://releases.example/windows.exe",
    });
    const card = payload.card as {
      elements: Array<{ actions?: Array<{ url?: string }>; text?: { content?: string } }>;
      header: { template?: string; title?: { content?: string } };
    };

    expect(card.header).toMatchObject({
      template: "orange",
      title: { content: expect.stringContaining("Windows x64 smoke 失败") },
    });
    expect(card.elements.map((element) => element.text?.content).filter(Boolean)).toContain(
      "**Smoke 告警**\n- Windows x64 smoke 失败\n\n产物已继续发布，可通过下方链接下载。",
    );
    expect(card.elements.flatMap((element) => element.actions ?? []).map((action) => action.url)).toEqual([
      "https://releases.example/mac.dmg",
      "https://releases.example/windows.exe",
    ]);
  });

  it("[P1] keeps download actions on a partial beta card without claiming latest promotion", async () => {
    const payload = await renderFeishuBuildCard({
      CHANNEL_LABEL: "Beta",
      MAC_ARM64_URL: "https://releases.example/beta-mac.dmg",
      RELEASE_NOTE: "共享 beta/latest 版本高于 main，本次仅发布版本化快照。",
      RELEASE_STATE: "partial",
      VERSION: "0.18.2-beta.4242",
      WIN_URL: "https://releases.example/beta-windows.exe",
    });
    const card = payload.card as {
      elements: Array<{ actions?: Array<{ url?: string }>; text?: { content?: string } }>;
      header: { template?: string; title?: { content?: string } };
    };

    expect(card.header).toMatchObject({
      template: "orange",
      title: { content: expect.stringContaining("未更新 Beta latest") },
    });
    expect(card.elements.map((element) => element.text?.content).filter(Boolean)).toContain(
      "**渠道状态**\n产物已发布并可下载，但未更新 Beta latest。\n\n共享 beta/latest 版本高于 main，本次仅发布版本化快照。",
    );
    expect(card.elements.flatMap((element) => element.actions ?? []).map((action) => action.url)).toEqual([
      "https://releases.example/beta-mac.dmg",
      "https://releases.example/beta-windows.exe",
    ]);
  });

  it("[P2] gates the Thursday patch cut on the Tuesday minor being published", async () => {
    // cut-patch-release is the Tuesday cut-release flow, one weekday later, with a
    // PATCH bump and a publish guard. Lock the three properties that make it safe:
    //   1. It fires Thursday and bumps patch (not minor) from the highest release branch.
    //   2. It only cuts when this line's minor base X.Y.0 is a PUBLISHED stable
    //      GitHub Release (non-draft, non-prerelease) — otherwise it must NOT create
    //      a branch or launch the prerelease publication; it posts a notice and stops.
    //   3. The happy path still cuts from main and pushes with the App token, so the
    //      existing notify-release-feishu push trigger produces the prerelease + card.
    const [workflow, notice] = await Promise.all([
      readFile(cutPatchReleaseWorkflowPath, "utf8"),
      readFile(feishuNoticeScriptPath, "utf8"),
    ]);

    // Thursday cron, and a patch (not minor) bump.
    const trigger = sectionBetween(workflow, "on:", "\npermissions:");
    expect(trigger).toContain("cron: '0 1 * * 4'");
    expect(workflow).toContain('V="${major}.${minor}.$((patch+1))"');
    expect(workflow).not.toContain("minor+1");

    // The guard target (MINOR_BASE) must derive from the FINAL version V, not from
    // the highest branch — otherwise a manual `version=` on another line is gated
    // against the wrong minor (e.g. version=0.15.1 while latest is 0.14.0 would
    // wrongly check open-design-v0.14.0). Assert V's own major/minor drive it.
    expect(workflow).toContain('vmajor=${V%%.*}; vrest=${V#*.}; vminor=${vrest%%.*}');
    expect(workflow).toContain('MINOR_BASE="${vmajor}.${vminor}.0"');
    expect(workflow).not.toContain('MINOR_BASE="${major}.${minor}.0"');

    // The guard reads the minor base's stable release and requires it published
    // (neither draft nor prerelease); a missing release falls back to not published.
    const guard = sectionBetween(workflow, "- name: Check the Tuesday minor is published", "# ---- Skip path");
    expect(guard).toContain('gh release view "$MINOR_TAG"');
    expect(guard).toContain("--jq '(.isDraft or .isPrerelease) | not'");
    expect(guard).toContain("|| published=false");
    expect(workflow).toContain('echo "minor_tag=open-design-v$MINOR_BASE"');

    // Skip path: no branch, no build — only the Feishu notice runs, gated on !published.
    const noticeStep = sectionBetween(workflow, "- name: Notify Feishu that the patch cut was skipped", "- name: Stop here when skipping");
    expect(noticeStep).toContain("if: steps.guard.outputs.published != 'true'");
    expect(noticeStep).toContain("tools/release/src/notifications/feishu-notice.ts");
    // Every branch-cutting step must be gated on the guard passing: assert the
    // guard `if:` is the line immediately after each step name.
    for (const step of ["Bail out if the branch already exists", "Create branch + bump version + push", "Create backport label"]) {
      expect(workflow).toContain(`- name: ${step}\n        if: steps.guard.outputs.published == 'true'`);
    }

    // Happy path keeps cut-release's mechanics: cut current main independently
    // from the advisory Windows canary, then push with the App token.
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("token: ${{ steps.app.outputs.token }}");
    expect(workflow).toContain('git push origin "$BRANCH"');
    // The version bump is a no-op whenever main already leads stable by this exact
    // patch (apps/packaged == $VERSION), so the release commit MUST tolerate an empty
    // tree — otherwise `git commit` dies on "nothing to commit" and no branch is cut.
    expect(workflow).toContain('git commit --allow-empty -am "chore(release): v$VERSION"');

    // The notice card is a standalone poster with the same signed-webhook contract.
    expect(notice).toContain("msg_type: \"interactive\"");
    expect(notice).toContain('required("NOTICE_TITLE")');
    expect(notice).toContain('required("NOTICE_BODY")');
  });

  it("[P2] posts an immediate branch-cut Feishu card naming the backport label on both cut workflows", async () => {
    // Cutting a release branch triggers a ~20-40 min prerelease build before the
    // download card lands, so both cut workflows post an eager "branch cut" notice
    // the moment the branch exists. Each must: reuse feishu-notice.ts, run AFTER the
    // branch push + label creation, and name the exact backport label so the team
    // knows which label to apply for backports.
    const [minorCut, patchCut] = await Promise.all([
      readFile(cutReleaseWorkflowPath, "utf8"),
      readFile(cutPatchReleaseWorkflowPath, "utf8"),
    ]);

    for (const [label, workflow, kind] of [
      ["cut-release (minor)", minorCut, "大版本 minor"],
      ["cut-patch-release (patch)", patchCut, "小版本 patch"],
    ] as const) {
      const step = sectionBetween(workflow, "- name: Notify Feishu that the branch was cut", "\n        run:");
      // Same standalone notifier + the shared release webhook/secret.
      expect(workflow, label).toContain("run: node --experimental-strip-types tools/release/src/notifications/feishu-notice.ts");
      expect(step, label).toContain("FEISHU_WEBHOOK: ${{ secrets.FEISHU_RELEASE_WEBHOOK }}");
      // Names the version's backport label in the card body.
      expect(step, label).toContain("backport release/v${{ steps.ver.outputs.version }}");
      // Distinguishes major vs minor cut.
      expect(step, label).toContain(kind);
      // The eager card must come AFTER the branch is actually cut + pushed.
      expect(workflow.indexOf("- name: Notify Feishu that the branch was cut"), label)
        .toBeGreaterThan(workflow.indexOf('git push origin "$BRANCH"'));
    }
    // The patch workflow's eager card only fires on the happy (published) path.
    const patchNotice = sectionBetween(patchCut, "- name: Notify Feishu that the branch was cut", "\n        run:");
    expect(patchNotice).toContain("if: steps.guard.outputs.published == 'true'");
  });

  it("[P2] sends the daily landing PR summary to Feishu with staging deployment status", async () => {
    const [workflow, ciWorkflow, stagingWorkflow, productionWorkflow, script] = await Promise.all([
      readFile(landingPageDailyFeishuWorkflowPath, "utf8"),
      readFile(landingPageCiWorkflowPath, "utf8"),
      readFile(landingPageStagingWorkflowPath, "utf8"),
      readFile(landingPageProductionWorkflowPath, "utf8"),
      readFile(landingPageDailyFeishuScriptPath, "utf8"),
    ]);
    const trigger = sectionBetween(workflow, "on:", "\npermissions:");
    const productionCheckout = sectionBetween(productionWorkflow, "- name: Checkout", "- name: Setup pnpm");

    expect(trigger).toContain('cron: "0 1 * * *"');
    expect(trigger).not.toContain("lookback_hours:");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("FEISHU_WEBHOOK: ${{ secrets.FEISHU_LANDING_WEBHOOK || secrets.FEISHU_RELEASE_WEBHOOK }}");
    expect(workflow).toContain("FEISHU_SIGN_SECRET: ${{ secrets.FEISHU_LANDING_SIGN_SECRET || secrets.FEISHU_RELEASE_SIGN_SECRET }}");
    expect(workflow).toContain("node --experimental-strip-types .github/scripts/landing-page-daily-feishu.ts self-check");
    expect(workflow).toContain("node --experimental-strip-types .github/scripts/landing-page-daily-feishu.ts");
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("fetch-depth: 0");
    expect(productionCheckout).toContain("ref: ${{ github.sha }}");
    expect(productionCheckout).not.toContain("ref: main");
    expect(productionCheckout).toContain("Verify production checkout commit");
    expect(productionCheckout).toContain('deployed_sha="$(git rev-parse HEAD)"');
    expect(productionCheckout).toContain('$deployed_sha" != "$GITHUB_SHA');
    expect(productionCheckout).toContain('main_sha="$(git ls-remote origin refs/heads/main');
    expect(productionCheckout).toContain('$GITHUB_SHA" != "$main_sha');
    expect(productionCheckout).toContain("refusing production deploy for stale workflow SHA");

    // Wrangler Pages ignores custom --config paths. Before every staging
    // migration/deploy, replace the default config with staging's isolated
    // bindings so preview/staging traffic can never touch production KV/D1.
    for (const stagingDeployWorkflow of [ciWorkflow, stagingWorkflow]) {
      expect(stagingDeployWorkflow).toContain("Prepare staging Pages configuration");
      expect(stagingDeployWorkflow).toContain("cp apps/landing-page/wrangler.staging.toml apps/landing-page/wrangler.toml");
      expect(stagingDeployWorkflow).toContain('wranglerVersion: "4.110.0"');
      expect(stagingDeployWorkflow).toContain("d1 migrations apply open-design-landing-staging-attribution --remote");
      expect(stagingDeployWorkflow).not.toContain("--config wrangler.staging.toml");
    }
    expect(productionWorkflow).toContain('wranglerVersion: "4.110.0"');
    expect(productionWorkflow).toContain("d1 migrations apply open-design-landing-attribution --remote");
    expect(productionWorkflow).toContain("Publish immutable DeepSeek Harness bootstrap installers to R2");
    expect(productionWorkflow).toContain("id: dsh_bootstrap");
    // The bootstrap version follows the installer bytes. Pinning it in the
    // workflow is what turned a copy edit inside install-dsh.ps1 into a hard
    // production deploy failure, so the promotion must read the version the
    // publisher resolved instead of naming one.
    expect(productionWorkflow).not.toMatch(/DSH_BOOTSTRAP_VERSION: v\d/);
    expect(productionWorkflow).toContain("DSH_BOOTSTRAP_VERSION: ${{ steps.dsh_bootstrap.outputs.version }}");
    expect(productionWorkflow).toContain('"$RELEASE_PUBLIC_ORIGIN/bootstrap/dsh/$DSH_BOOTSTRAP_VERSION/$name"');
    expect(productionWorkflow).toContain("DSH_BOOTSTRAP_SOURCE_DIR: apps/landing-page/public");
    expect(productionWorkflow).toContain("RELEASE_PUBLIC_ORIGIN: ${{ vars.CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN }}");
    expect(productionWorkflow).toContain("RELEASE_STORAGE_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_RELEASES_AK }}");
    expect(productionWorkflow).toContain("RELEASE_STORAGE_BUCKET: ${{ secrets.CLOUDFLARE_R2_RELEASES_BUCKET }}");
    expect(productionWorkflow).toContain("RELEASE_STORAGE_ENDPOINT: ${{ secrets.CLOUDFLARE_R2_RELEASES_URL }}");
    expect(productionWorkflow).toContain("pnpm exec tools-release publish-dsh-bootstrap");
    expect(productionWorkflow.indexOf("pnpm exec tools-release publish-dsh-bootstrap")).toBeLessThan(
      productionWorkflow.indexOf("pages deploy out"),
    );

    expect(script).toContain('const STAGING_URL = "https://staging.open-design.ai"');
    expect(script).toContain('const STAGING_WORKFLOW = "landing-page-staging.yml"');
    expect(script).toContain('const PRODUCTION_WORKFLOW = "landing-page-production.yml"');
    expect(script).toContain("type StagingSnapshot");
    expect(script).toContain("createStagingSnapshot");
    expect(script).toContain("run_started_at");
    expect(script).toContain("run_attempt");
    expect(script).toContain("runOperationalTime");
    expect(script).toContain("staging: StagingSnapshot");
    expect(script).toContain("historical staging success not to count as current staging deployment");
    expect(script).toContain("rerun historical staging success to become current staging deployment");
    expect(script).toContain("rerun staging header to use the rerun historical deployment");
    expect(script).toContain("No successful ${PRODUCTION_WORKFLOW} run found on main");
    expect(script).toContain("正式环境基线");
    expect(script).toContain("待 QA 验收");
    expect(script).toContain("git\", [\"merge-base\", \"--is-ancestor\"");
    expect(script).toContain("已自动部署到当前 staging.open-design.ai");
    expect(script).toContain("正在部署到 staging.open-design.ai");
    expect(script).toContain("apps/landing-page/");
    expect(script).toContain(".github/workflows/landing-page-staging.yml");
  });

  it("[P2] supports stable metadata, prepublish, and publish dispatch modes", async () => {
    const [workflow, script] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain(
      "Release mode. metadata stops after promotion metadata; prepublish runs build/smoke/report/plan without publishing; publish performs the stable release.",
    );
    expect(workflow).toContain("group: open-design-release-stable-${{ inputs.dry_run }}");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("- metadata");
    expect(workflow).toContain("- prepublish");
    expect(workflow).toContain("- publish");
    expect(workflow).toContain("default: metadata");
    expect(workflow).not.toContain("inputs.channel");
    expect(workflow).toContain("OPEN_DESIGN_RELEASE_DRY_RUN: ${{ inputs.dry_run == 'publish' && 'false' || inputs.dry_run }}");
    expect(workflow).toContain("RELEASE_PUBLIC_ORIGIN: ${{ vars.CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN }}");
    expect(workflow).toContain("run: bash .github/scripts/release/github/stable-notes.sh");
    expect(workflow).toContain("dry_run: ${{ steps.stable.outputs.dry_run }}");
    expect(workflow).toContain("dry_run_mode: ${{ steps.stable.outputs.dry_run_mode }}");
    expect(workflow).toContain("if: ${{ needs.metadata.outputs.run_prepublish_jobs == 'true' }}");
    expect(workflow).toContain("RELEASE_PUBLISH_SIDE_EFFECTS: ${{ needs.metadata.outputs.publish_side_effects_enabled }}");

    expect(script).toContain("function parseStableDryRunMode");
    expect(script).toContain("OPEN_DESIGN_RELEASE_DRY_RUN must be metadata, prepublish, true, or false");
    expect(script).toContain('setOutput("dry_run", dryRun ? "true" : "false");');
    expect(script).toContain('setOutput("dry_run_mode", stableDryRunMode);');
    expect(script).toContain('setOutput("run_prepublish_jobs", runPrepublishJobs ? "true" : "false");');
    expect(script).toContain('setOutput("publish_side_effects_enabled", publishSideEffectsEnabled ? "true" : "false");');
  });

  it("[P2] writes stable release notes from the release public origin variable", async () => {
    for (const [envName, origin] of [
      ["RELEASE_PUBLIC_ORIGIN", "https://releases.open-design.ai/current/"],
      ["CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN", "https://releases.open-design.ai/legacy/"],
    ] as const) {
      const runnerTemp = await mkdtemp(join(tmpdir(), "od-stable-notes-"));
      const outputPath = join(runnerTemp, "github-output.txt");

      try {
        await execFileAsync("bash", [releaseStableNotesScriptPath], {
          cwd: workspaceRoot,
          env: workflowFixtureEnv({
            BRANCH_NAME: "release/v0.13.0",
            CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN: envName === "CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN" ? origin : "",
            GITHUB_OUTPUT: outputPath,
            GITHUB_REPOSITORY: "nexu-io/open-design",
            GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
            RELEASE_CHANNEL: "stable",
            RELEASE_PUBLIC_ORIGIN: envName === "RELEASE_PUBLIC_ORIGIN" ? origin : "",
            RELEASE_SIGNED: "true",
            RELEASE_VERSION: "0.13.0",
            RUNNER_TEMP: runnerTemp,
            VERSION_TAG: "open-design-v0.13.0",
          }),
        });

        const outputs = parseGithubOutput(await readFile(outputPath, "utf8"));
        const notes = await readFile(outputs.notes_file ?? "", "utf8");
        expect(notes).toContain(`R2 metadata: ${origin.replace(/\/+$/, "")}/stable/latest/metadata.json`);
        expect(notes).toContain(`E2E report: ${origin.replace(/\/+$/, "")}/stable/versions/0.13.0/report.zip`);
      } finally {
        await rm(runnerTemp, { force: true, recursive: true });
      }
    }
  });

  it("[P2] validates stable dry-run prerelease metadata from a release branch", async () => {
    const baseVersion = await readPackagedVersion();
    const prereleaseVersion = `${baseVersion}-prerelease.12`;
    const objects: Record<string, unknown> = {};
    const fixture = await startStablePrereleaseMetadataServer(objects);
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = stablePrereleaseMetadataFixture(
      baseVersion,
      prereleaseVersion,
      fixture.origin,
    );
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-stable-dry-run-"));

    try {
      await mkdir(join(runnerTemp, "bin"), { recursive: true });
      await writeFakeGhBin(join(runnerTemp, "bin"), []);
      const result = await execFileAsync(process.execPath, ["--experimental-strip-types", releaseStableScriptPath], {
        cwd: workspaceRoot,
        env: workflowFixtureEnv({
          GITHUB_REF_NAME: `release/v${baseVersion}`,
          GITHUB_REPOSITORY: "nexu-io/open-design",
          GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          OPEN_DESIGN_RELEASE_CHANNEL: "stable",
          OPEN_DESIGN_RELEASE_DRY_RUN: "true",
          OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: fixture.origin,
          OPEN_DESIGN_GH_NODE_SCRIPT: join(runnerTemp, "bin", "gh"),
          OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
        }, join(runnerTemp, "bin")),
      });

      expect(result.stdout).toContain(`[release-stable] validated prerelease: ${prereleaseVersion}`);
      expect(result.stdout).toContain("[release-stable] channel: stable");
      expect(result.stdout).toContain("[release-stable] dry run: true");
      expect(result.stdout).toContain(`[release-stable] version tag: open-design-v${baseVersion}`);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("[P2] rejects invalid release dry-run values before remote checks", async () => {
    const output = await runReleaseStableForFailure({
      GITHUB_REF_NAME: "release/v0.10.0",
      OPEN_DESIGN_RELEASE_DRY_RUN: "maybe",
      OPEN_DESIGN_STABLE_VERSION: "",
    });

    expect(output).toContain("OPEN_DESIGN_RELEASE_DRY_RUN must be metadata, prepublish, true, or false");
  });

  it("keeps beta on the shared payload-aware metadata surface", async () => {
    const [releaseBetaWorkflow, platformPublishScript, publishMetadataScript] = await Promise.all([
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(releaseBetaPlatformPublishScriptPath, "utf8"),
      readFile(releasePublishMetadataScriptPath, "utf8"),
    ]);

    expect(releaseBetaWorkflow).toContain("RELEASE_ARTIFACT_MODE: dmg-and-payload");
    expect(releaseBetaWorkflow).toContain("tools-release publish-platform");
    expect(releaseBetaWorkflow).toContain("tools-release publish-metadata");
    expect(releaseBetaWorkflow).toContain("RELEASE_MANIFEST_DIR:");
    expect(releaseBetaWorkflow).toContain("RELEASE_ASSET_SUFFIX: ${{ needs.metadata.outputs.asset_version_suffix }}");
    expect(platformPublishScript).toContain("artifacts.payload");
    expect(platformPublishScript).toContain("open-design-${releaseVersion}${assetSuffix}-mac-${arch}-payload.zip");
    expect(platformPublishScript).toContain("open-design-${releaseVersion}${assetSuffix}-win-x64-payload.7z");
    expect(publishMetadataScript).toContain("for (const [artifactName, artifact] of Object.entries(manifest.artifacts ?? {}))");
    expect(publishMetadataScript).toContain("outputs[`${target}_${artifactName}_url`] = artifact.url");
  });

  it("publishes release-betas mac_x64 payloads while preserving the zip feed", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const macX64Job = sectionBetween(workflow, "  build_mac_x64:", "  build_win_x64:");
    const prepareStep = sectionBetween(macX64Job, "      - name: Prepare mac_x64 assets", "      - name: Publish mac_x64 platform");
    const publishStep = sectionBetween(macX64Job, "      - name: Publish mac_x64 platform", "      - name: Upload mac_x64 publish manifest");
    const artifactMode = "RELEASE_ARTIFACT_MODE: ${{ inputs.mac_x64_target == 'all' && 'all' || 'dmg-and-payload' }}";

    expect(prepareStep).toContain(artifactMode);
    expect(publishStep).toContain(artifactMode);
  });

  it("rejects stale latest platform manifests from a previous beta version", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-betas-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.3.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "current-sha",
          runAttempt: 2,
          runId: 222222222,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.3.unsigned",
        },
        releaseVersion: "1.2.3-beta.3",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      const result = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", releasePublishMetadataScriptPath],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            BASE_VERSION: "1.2.3",
            ENABLE_LINUX_X64: "false",
            ENABLE_MAC_ARM64: "true",
            ENABLE_MAC_X64: "false",
            ENABLE_WIN_X64: "false",
            RELEASE_RUN_ATTEMPT: "2",
            RELEASE_RUN_ID: "222222222",
            RELEASE_COMMIT: "current-sha",
            MAC_ARM64_RESULT: "success",
            RELEASE_CHANNEL: "beta",
            RELEASE_MANIFEST_DIR: platformManifestRoot,
            RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
            RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
            RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
            RELEASE_SIGNED: "false",
            RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
            RELEASE_STORAGE_BUCKET: fixture.bucket,
            RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
            RELEASE_STORAGE_REGION: "auto",
            RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
            RELEASE_VERSION: "1.2.3-beta.4",
            STATE_SOURCE: "test",
          },
          maxBuffer: 1024 * 1024,
        },
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      );

      expect(result.status).toBe("rejected");
      expect(String(result.status === "rejected" ? result.reason : "")).toContain(
        "refusing stale mac_arm64 platform manifest for 1.2.3-beta.4: releaseVersion=1.2.3-beta.3",
      );
      expect(fixture.uploadedObjectKeys()).toEqual([]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("rejects stale latest platform manifests from a previous same-version beta workflow run", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-betas-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "previous-sha",
          runAttempt: 1,
          runId: 111111111,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
        },
        releaseVersion: "1.2.3-beta.4",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      const result = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", releasePublishMetadataScriptPath],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            BASE_VERSION: "1.2.3",
            ENABLE_LINUX_X64: "false",
            ENABLE_MAC_ARM64: "true",
            ENABLE_MAC_X64: "false",
            ENABLE_WIN_X64: "false",
            RELEASE_RUN_ATTEMPT: "2",
            RELEASE_RUN_ID: "222222222",
            RELEASE_COMMIT: "current-sha",
            MAC_ARM64_RESULT: "success",
            RELEASE_CHANNEL: "beta",
            RELEASE_MANIFEST_DIR: platformManifestRoot,
            RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
            RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
            RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
            RELEASE_SIGNED: "false",
            RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
            RELEASE_STORAGE_BUCKET: fixture.bucket,
            RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
            RELEASE_STORAGE_REGION: "auto",
            RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
            RELEASE_VERSION: "1.2.3-beta.4",
            STATE_SOURCE: "test",
          },
          maxBuffer: 1024 * 1024,
        },
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      );

      expect(result.status).toBe("rejected");
      expect(String(result.status === "rejected" ? result.reason : "")).toContain(
        "refusing stale mac_arm64 platform manifest for 1.2.3-beta.4: github.runId=111111111",
      );
      expect(fixture.uploadedObjectKeys()).toEqual([]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("accepts same-run latest platform manifests from an older workflow attempt", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-betas-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "current-sha",
          runAttempt: 1,
          runId: 222222222,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
        },
        releaseVersion: "1.2.3-beta.4",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      await execFileAsync(process.execPath, ["--experimental-strip-types", releasePublishMetadataScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "false",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          MAC_ARM64_RESULT: "success",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
          RELEASE_SIGNED: "false",
          RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
          RELEASE_STORAGE_BUCKET: fixture.bucket,
          RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
          RELEASE_VERSION: "1.2.3-beta.4",
          STATE_SOURCE: "test",
        },
        maxBuffer: 1024 * 1024,
      });

      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4/metadata.json",
        "beta/latest/metadata.json",
        "beta/latest/platforms/mac_arm64.json",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("resolves auto asset suffix from target-first win_x64 platform manifests in beta metadata publish", async () => {
    const fixture = await startReleaseMetadataObjectStore({
      "beta/versions/1.2.3-beta.4.unsigned/latest.yml": "versioned updater feed",
    });
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-betas-win-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "win_x64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
              },
            },
            channel: "beta",
            github: {
              commit: "current-sha",
              runAttempt: 2,
              runId: 222222222,
            },
            legacyPlatformKey: "win",
            feed: {
              name: "latest.yml",
              url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/latest.yml",
            },
            platform: "win",
            platformKey: "win_x64",
            releaseTarget: "win_x64",
            releaseVersion: "1.2.3-beta.4",
            r2: {
              versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
            },
            signed: false,
            status: "published",
          },
          null,
          2,
        )}\n`,
      );

      await execFileAsync(process.execPath, ["--experimental-strip-types", releasePublishMetadataScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "false",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          RELEASE_ASSET_SUFFIX: "auto",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
          RELEASE_SIGNED: "false",
          RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
          RELEASE_STORAGE_BUCKET: fixture.bucket,
          RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
          RELEASE_VERSION: "1.2.3-beta.4",
          STATE_SOURCE: "test",
          WIN_X64_RESULT: "success",
        },
        maxBuffer: 1024 * 1024,
      });

      const metadata = JSON.parse(await readFile(join(runnerTemp, "release-metadata", "metadata.json"), "utf8"));
      expect(metadata.assetVersionSuffix).toBe(".unsigned");
      expect(metadata.readyTargets).toEqual(["win_x64"]);
      expect(metadata.platforms.win.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4.unsigned");
      expect(metadata.releaseTargets.win_x64.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4.unsigned");
      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4.unsigned/metadata.json",
        "beta/latest/metadata.json",
        "beta/latest/platforms/win_x64.json",
        "beta/latest/latest.yml",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("preserves launcher payload artifacts in beta latest metadata and action outputs", async () => {
    const fixture = await startReleaseMetadataObjectStore({
      "beta/versions/1.2.3-beta.4.unsigned/latest.yml": "versioned updater feed",
    });
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-betas-payload-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              dmg: {
                url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64.dmg",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip.sha256",
                url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip",
              },
            },
            channel: "beta",
            github: {
              commit: "current-sha",
              runAttempt: 2,
              runId: 222222222,
            },
            legacyPlatformKey: "mac",
            platform: "mac",
            platformKey: "mac_arm64",
            releaseTarget: "mac_arm64",
            releaseVersion: "1.2.3-beta.4",
            r2: {
              versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
            },
            signed: false,
            status: "published",
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        join(platformManifestRoot, "win_x64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z.sha256",
                url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z",
              },
            },
            channel: "beta",
            feed: {
              name: "latest.yml",
              url: "https://releases.open-design.ai/betas/versions/1.2.3-beta.4.unsigned/latest.yml",
            },
            github: {
              commit: "current-sha",
              runAttempt: 2,
              runId: 222222222,
            },
            legacyPlatformKey: "win",
            platform: "win",
            platformKey: "win_x64",
            releaseTarget: "win_x64",
            releaseVersion: "1.2.3-beta.4",
            r2: {
              versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
            },
            signed: false,
            status: "published",
          },
          null,
          2,
        )}\n`,
      );

      await execFileAsync(process.execPath, ["--experimental-strip-types", releasePublishMetadataScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          RELEASE_ASSET_SUFFIX: "auto",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
          RELEASE_SIGNED: "false",
          RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
          RELEASE_STORAGE_BUCKET: fixture.bucket,
          RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
          RELEASE_VERSION: "1.2.3-beta.4",
          STATE_SOURCE: "test",
          MAC_ARM64_RESULT: "success",
          WIN_X64_RESULT: "success",
        },
        maxBuffer: 1024 * 1024,
      });

      const metadata = JSON.parse(await readFile(join(runnerTemp, "release-metadata", "metadata.json"), "utf8")) as {
        platforms: {
          mac: { artifacts?: { payload?: { sha256Url?: string; url?: string } } };
          win: { artifacts?: { payload?: { sha256Url?: string; url?: string } } };
        };
        releaseTargets: {
          mac_arm64: { artifacts?: { payload?: { sha256Url?: string; url?: string } } };
          win_x64: { artifacts?: { payload?: { sha256Url?: string; url?: string } } };
        };
      };
      const outputs = JSON.parse(await readFile(join(runnerTemp, "release-metadata", "outputs.json"), "utf8")) as Record<string, string>;

      expect(metadata.platforms.mac.artifacts?.payload?.url).toContain("mac-arm64-payload.zip");
      expect(metadata.platforms.mac.artifacts?.payload?.sha256Url).toContain("mac-arm64-payload.zip.sha256");
      expect(metadata.platforms.win.artifacts?.payload?.url).toContain("win-x64-payload.7z");
      expect(metadata.platforms.win.artifacts?.payload?.sha256Url).toContain("win-x64-payload.7z.sha256");
      expect(metadata.releaseTargets.mac_arm64.artifacts?.payload?.url).toBe(metadata.platforms.mac.artifacts?.payload?.url);
      expect(metadata.releaseTargets.win_x64.artifacts?.payload?.url).toBe(metadata.platforms.win.artifacts?.payload?.url);
      expect(outputs.mac_arm64_payload_url).toBe(metadata.platforms.mac.artifacts?.payload?.url);
      expect(outputs.win_x64_payload_url).toBe(metadata.platforms.win.artifacts?.payload?.url);
      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4.unsigned/metadata.json",
        "beta/latest/metadata.json",
        "beta/latest/platforms/mac_arm64.json",
        "beta/latest/platforms/win_x64.json",
        "beta/latest/latest.yml",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("resolves the generated Windows update fixture outside the measured build child scope", async () => {
    const winBuildScript = await readFile(releaseBetaWindowsBuildScriptPath, "utf8");

    expect(winBuildScript).toMatch(
      /Measure-Step "tools-pack win build update fixture" \{[\s\S]*?\r?\n    \}\r?\n    \$updateBuild = Get-Content -LiteralPath \$fixtureJsonPath -Raw \| ConvertFrom-Json\r?\n    \$localUpdateArtifactPath = \[string\]\$updateBuild\.installerPath/,
    );
    expect(winBuildScript).toContain('$env:OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = "tools-serve"');
    expect(winBuildScript).toContain("$env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH = $localUpdateArtifactPath");
  });
});

function expectChannelWorkflowNamespaces(
  workflow: string,
  channel: "beta" | "prerelease",
  options: { hasLinuxSmoke: boolean },
): void {
  const namespace = `release-${channel}`;
  expect(workflow).toContain(`--namespace ${namespace}`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}`);
  expect(workflow).toContain(`--namespace ${namespace}-intel`);
  expect(workflow).toContain(`"--namespace", "${namespace}-win",`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-win`);
  expect(workflow).toContain(`--namespace ${namespace}-linux`);

  if (options.hasLinuxSmoke) {
    expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-linux`);
  }
}

function expectWindowsUpdaterSmokeContract(workflow: string, channel: "beta" | "preview" | "prerelease" | "stable"): void {
  expect(workflow).toContain("win_x64_smoke_mode:");
  expect(workflow).toContain("win_x64_update_metadata_url:");
  expect(workflow).toContain("win_x64_update_target_version:");
  expect(workflow).toMatch(/win_x64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: ${{ inputs.win_x64_smoke_mode }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE: ${{ inputs.win_x64_smoke_mode == 'full' && inputs.win_x64_update_metadata_url == '' && inputs.win_x64_update_target_version == '' && 'tools-serve' || '' }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_VERSION: ${{ inputs.win_x64_update_target_version }}");
  if (channel === "stable") {
    expect(workflow).toContain("Build stable win_x64 update fixture");
    expect(workflow).toContain('full Windows stable smoke requires stable version x.y.z');
    expect(workflow).toContain('pnpm.cmd exec tools-pack win cleanup --dir $toolsPackDir --namespace "${{ needs.metadata.outputs.win_namespace }}" --json');
    expect(workflow).toContain("--cache-dir $cacheDir `");
    expect(workflow).toContain('pnpm.cmd exec tools-pack win validate-payload --namespace "${{ needs.metadata.outputs.win_namespace }}" --payload-path $build.payloadPath --expected-version "${{ needs.metadata.outputs.release_version }}" --json');
  } else {
    expect(workflow).toContain(`Build ${channel} win_x64 update fixture`);
    expect(workflow).toContain(`full Windows smoke requires a counted ${channel} version`);
  }
  expect(workflow).not.toContain("OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: core");
}

function expectCountedReleaseWorkflowCallContract(workflow: string, channel: "preview" | "prerelease"): void {
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("workflow_call:");
  expect(workflow).toContain("ref:");
  expect(workflow).toContain("release_version:");
  expect(workflow).toContain("description: \"Optional git ref to build.");
  expect(workflow).toContain("ref: ${{ inputs.ref != '' && inputs.ref || github.ref }}");
  expect(workflow).toContain("Resolve built commit");
  expect(workflow).toContain("GITHUB_SHA: ${{ env.BUILT_SHA }}");
  expect(workflow).toContain("GITHUB_REF_NAME: ${{ inputs.ref != '' && inputs.ref || github.ref_name }}");
  expect(workflow).toContain(`Capture previous ${channel} commit`);
  expect(workflow).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
  expect(workflow).toContain("version_metadata_url:");
  expect(workflow).toContain("mac_arm64_url:");
  expect(workflow).toContain("mac_intel_url:");
  expect(workflow).toContain("win_url:");
  expect(workflow).toContain("linux_url:");
  expect(workflow).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
  expect(workflow).toContain("version_metadata_url: ${{ steps.outputs.outputs.version_metadata_url }}");
  expect(workflow).toContain("mac_arm64_url: ${{ steps.outputs.outputs.mac_arm64_dmg_url }}");
  expect(workflow).toContain("mac_intel_url: ${{ steps.outputs.outputs.mac_x64_dmg_url }}");
  expect(workflow).toContain("win_url: ${{ steps.outputs.outputs.win_x64_installer_url }}");
  expect(workflow).toContain("linux_url: ${{ steps.outputs.outputs.linux_x64_appImage_url }}");
}

function expectReleaseLinuxBuildPreservesEvidence(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\r?\\n(?:.+\\r?\\n)+?(?=\\r?\\n      - name: Smoke .+ linux AppImage runtime)`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain('report_dir="$RUNNER_TEMP/release-report/linux"');
  expect(step).toContain('mkdir -p "$report_dir"');
  expect(step).toContain('build_json_path="$report_dir/tools-pack.json"');
  expect(step).toContain('build_log_path="$report_dir/tools-pack.log"');
  expect(step).toContain('printf \'%s\\n\' "$build_output" | tee "$build_json_path"');
}

function expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\r?\\n(?:.+\\r?\\n)+?(?=\\r?\\n      - name: Upload linux e2e spec report)`, "m"))?.[0];
  expect(step).toBeDefined();
  const aptIndex = step?.indexOf("sudo apt-get update") ?? -1;
  const reportDirIndex = step?.indexOf('report_dir="$RUNNER_TEMP/release-report/linux"') ?? -1;

  expect(aptIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeLessThan(aptIndex);
}

async function startStablePrereleaseMetadataServer(objects: Record<string, unknown>): Promise<{
  close: () => Promise<void>;
  origin: string;
}> {
  const server = createHttpsServer(
    {
      cert: stablePrereleaseMetadataCert,
      key: stablePrereleaseMetadataKey,
    },
    (request, response) => {
      const objectKey = decodeURIComponent(new URL(request.url ?? "/", "https://127.0.0.1").pathname.replace(/^\/+/, ""));
      if (request.method !== "GET" || !(objectKey in objects)) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }

      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify(objects[objectKey]));
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("stable prerelease metadata server did not bind to a TCP port");
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      }),
    origin: `https://127.0.0.1:${address.port}`,
  };
}

function stablePrereleaseMetadataFixture(baseVersion: string, prereleaseVersion: string, publicOrigin: string): Record<string, unknown> {
  const versionPrefix = `prerelease/versions/${prereleaseVersion}`;
  const versionUrl = `${publicOrigin}/${versionPrefix}`;
  const artifact = (name: string) => ({
    sha256Url: `${versionUrl}/${name}.sha256`,
    url: `${versionUrl}/${name}`,
  });

  return {
    baseVersion,
    channel: "prerelease",
    github: {
      branch: `release/v${baseVersion}`,
      commit: "0123456789abcdef0123456789abcdef01234567",
      repository: "nexu-io/open-design",
      workflow: "release-prerelease",
    },
    prereleaseNumber: 12,
    prereleaseVersion,
    platforms: {
      mac: {
        arch: "arm64",
        artifacts: {
          dmg: artifact("Open Design.dmg"),
          zip: artifact("Open Design-mac-arm64.zip"),
        },
        enabled: true,
        signed: true,
      },
      macIntel: {
        arch: "x64",
        artifacts: {
          dmg: artifact("Open Design Intel.dmg"),
          zip: artifact("Open Design-mac-x64.zip"),
        },
        enabled: true,
        signed: true,
      },
      win: {
        arch: "x64",
        artifacts: {
          installer: artifact("Open Design Setup.exe"),
        },
        enabled: true,
      },
    },
    r2: {
      report: {
        type: "zip",
        url: `${versionUrl}/report.zip`,
      },
      reportZipUrl: `${versionUrl}/report.zip`,
      versionMetadataUrl: `${versionUrl}/metadata.json`,
      versionPrefix,
    },
    releaseVersion: prereleaseVersion,
    signed: true,
  };
}

async function startReleaseMetadataObjectStore(objects: Record<string, unknown>): Promise<{
  bucket: string;
  close: () => Promise<void>;
  endpointUrl: string;
  uploadedObjectKeys: () => string[];
}> {
  const bucket = "release-bucket";
  const uploadedObjectKeys: string[] = [];
  const server = createServer((request, response) => {
    void handleReleaseMetadataObjectStoreRequest(request, response, bucket, objects, uploadedObjectKeys);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("release metadata object store did not bind to a TCP port");
  }

  return {
    bucket,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      }),
    endpointUrl: `http://127.0.0.1:${address.port}`,
    uploadedObjectKeys: () => [...uploadedObjectKeys],
  };
}

async function handleReleaseMetadataObjectStoreRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bucket: string,
  objects: Record<string, unknown>,
  uploadedObjectKeys: string[],
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const bucketPrefix = `/${bucket}/`;
  if (!path.startsWith(bucketPrefix)) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }

  const objectKey = decodeURIComponent(path.slice(bucketPrefix.length));
  if (request.method === "GET") {
    if (!(objectKey in objects)) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const body = JSON.stringify(objects[objectKey]);
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(body);
    return;
  }

  if (request.method === "PUT") {
    uploadedObjectKeys.push(objectKey);
    for await (const _chunk of request) {
      // Drain the request body so the client can complete cleanly.
    }
    response.statusCode = 200;
    response.end("ok");
    return;
  }

  response.statusCode = 405;
  response.end("method not allowed");
}

const stablePrereleaseMetadataKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1hoV1GwxqTYdO
Zs0pY5hnp8BtTwdF6dWsXoFWYw9IPpBTmyNeleRcLtrht/oc5oRS05tC97qmb5eL
RigyXUmwrpt/VjJ7ursDa3qGnljkqVxqBkRAUdXBMCVPkMogKWvJy/S61Vthvf7K
K5HhofwcuPPvRBdhdZgtw/7nZY49HYutd7wP/U7iqCYBMpWr0I29jSs1S2xY9fH8
ih/exDGe3PHm8yQao4pHUUFVXoAI5w6tYsmNep6b+5NYPHnHSaXd7h5gaF+nIJE4
78jgRQHKjQ2iNf/53/o/d5SAMb/9lZ7stNT8RIFOJUz1IP8Zsz3VKwAvXKXZDObr
0MS4JrPdAgMBAAECggEATcF0HD/8VvKjsU0ut3pud4QvVINEGcn6mY2XuFHRY4BN
IUr0YRkyytvVLVe5vrRtXO9Ac/Sakp19XA6uvDgijxiUCfz5ve80GVhqEQz2BeiX
6eCKTsTfG5QMf2MFebZUcgm36Gno7VrNr3rvT6erzv/YmZZgr4IIMB5i62qgfYOY
ABSg6b223RSVeZXNvWxovKycBUUa26lrzRu5jpuexjAccmgbiE86exhzW7FK2zjZ
XH8rOxSDJ49+ipPOGsJ+rZMdtvHq6BO/QU4O9IkBLNuHAIbr/WcjBgnAPskQTrOM
i3vWqPNVw3tPjBWCOtzy0UllG0L5Sxnx5cceFvL9HwKBgQDieIaM89In+VETI+x4
aUmQXxVcisZR0FWQytl+XbWe4T1zxEj4fFjd/phgv0M60599/mwCCGrImxKM8cnb
mjxv2FX+or9+2IFpaSOi+Qj6/IxcTTWoMU0t4AQjOgbRf3iBpVz6JysnKKpqqukT
GGOnzGWz0gFmDAqKm0zkGy7czwKBgQDNMb6hrSGobMRlCndgx//w/SdDq/IqAbIS
QyAvYgNuOXV3J4sD2Z1TwYxZM2Oq5rhOPfZr8SnqM7d+LknLPiGMKV7z6vL/BOu8
ZB5+EmMZwqNmSOMaFZM+77OC/zxDCznqTm4N5vDdg+6SByCtuyCm+Jraj0PtHtkD
krdWqBfHkwKBgDpTzluZJGQ1OyNR2kJ843xycL7/4uoJXTBIflGkcvVzj280e5K7
++tY+gfY2sjY3jgGAe1YG6CFB/cTAukzRSONNUC6y9Uwj8wFTy9XMm/qAYB4RjyG
Thllm8sy07S7Pt8tJtAqrFuOhq2oTRUk7+20n/D7Qm705PYj317UfXJTAoGABdYM
XfzWoDu3ukf57T7DAM+ydjJFyPwTXIGcQLzA7DmmJaVyRsHBv8gZfdAAXbQCOfd5
MsjBMHAYH/ahEq7JtXrXwIhGMQqqycjvNRbAytLGYvpfuzYx4fBfYrJvvFhtZUSl
zK9s2mAOQQkC3O4dl6IqhVzdybi+42Mg484UHxECgYEAht1ef0Gc6RKZpmqttlZJ
1G4lsR1Aws3dintACs8lza5aaufrY07gF8z3rkW6tPGEWfol3CYOT2U5UiUw+iKG
F/Pa3L5wCxuRKKWx0ip0PFhDPrpWfVCm2CLlUlZLEjpmF2iUZgmkaScjYqG8R16a
C8cywTs1ku5aYIaN8YcAigI=
-----END PRIVATE KEY-----`;

const stablePrereleaseMetadataCert = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUbNGmwcWmZP5tw6gm8s2RXzWJv+IwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDYwODA0MDczNVoXDTI2MDYw
OTA0MDczNVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAtYaFdRsMak2HTmbNKWOYZ6fAbU8HRenVrF6BVmMPSD6Q
U5sjXpXkXC7a4bf6HOaEUtObQve6pm+Xi0YoMl1JsK6bf1Yye7q7A2t6hp5Y5Klc
agZEQFHVwTAlT5DKIClrycv0utVbYb3+yiuR4aH8HLjz70QXYXWYLcP+52WOPR2L
rXe8D/1O4qgmATKVq9CNvY0rNUtsWPXx/Iof3sQxntzx5vMkGqOKR1FBVV6ACOcO
rWLJjXqem/uTWDx5x0ml3e4eYGhfpyCROO/I4EUByo0NojX/+d/6P3eUgDG//ZWe
7LTU/ESBTiVM9SD/GbM91SsAL1yl2Qzm69DEuCaz3QIDAQABo1MwUTAdBgNVHQ4E
FgQU8Z0Oy/q8fAqp9005cn2sW4K6oB4wHwYDVR0jBBgwFoAU8Z0Oy/q8fAqp9005
cn2sW4K6oB4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAlJTb
7zi4FKJqYuXZ9YWmV96Ri+vBcNfO2dwKBxFtJXm0Ai2Q4ruutuFPYwY6UYGTN5gC
HJ0/WxuPK5ftAE6UU+Mghu0dJlH+gWmOq5cDyhYdnEi8R6z5AsPtPEYlkkIvhUO1
k1BtCP0h4Kh8fuaILGuXQNOaKizIWF2lEEHfCmvKhgOF6dKWs38zdetFQCLRIaHg
ZyGlUhPCUbKdTiBJuCGaDKzeEAlC8dsar2zjg9CVue7w3CaamQpjnV0d2IHJiVAH
QONQvdtLnZ6GeNPe06oBrq7R9SL5/tkqgSq8lCrDE6jFZnfXNMdDmZY3wTcFcdyG
yW/DsIUs5ZzcHza5rw==
-----END CERTIFICATE-----`;
