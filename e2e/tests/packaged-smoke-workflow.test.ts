import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { STANDALONE_PROTOCOL_VERSION } from "@open-design/standalone/protocol";
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
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const distributionBetaWorkflowPath = releaseBetaWorkflowPath;
const betaMacDistributionActionPath = join(
  workspaceRoot,
  ".github",
  "actions",
  "release",
  "platform",
  "mac",
  "exact",
  "action.yml",
);
const betaWinDistributionActionPath = join(
  workspaceRoot,
  ".github",
  "actions",
  "release",
  "platform",
  "win",
  "exact",
  "action.yml",
);
const macDistributionActionPath = join(
  workspaceRoot,
  ".github",
  "actions",
  "release",
  "platform",
  "mac",
  "action.yml",
);
const winDistributionActionPath = join(
  workspaceRoot,
  ".github",
  "actions",
  "release",
  "platform",
  "win",
  "action.yml",
);
const packagedMacSpecPath = join(e2eRoot, "specs", "mac.spec.ts");
const releasePrereleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-prerelease.yml");
const distributionCountedWorkflowPath = join(workspaceRoot, ".github", "workflows", "distribution-counted.yml");
const distributionPrereleaseWorkflowPath = distributionCountedWorkflowPath;
const mainPrereleaseWinSmokeWorkflowPath = join(
  workspaceRoot,
  ".github",
  "workflows",
  "main-prerelease-win-smoke.yml",
);
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const distributionStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "distribution-stable.yml");
const releaseStableNotesScriptPath = join(workspaceRoot, ".github", "scripts", "release", "github", "stable-notes.sh");
const releaseStableScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-stable.ts");
const releaseBetaScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-exact.ts");
const shellPackageJsonPath = join(workspaceRoot, "shells", "electron", "package.json");
const scopesScriptPath = join(workspaceRoot, "scripts", "scopes.ts");
const runnersScriptPath = join(workspaceRoot, ".github", "scripts", "runners.py");
const notifyDailyFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "notify-daily-feishu.yml");
const notifyReleaseFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "notify-release-feishu.yml");
const releaseNotifyWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-notify.yml");
const cutReleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "cut-release.yml");
const cutPatchReleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "cut-patch-release.yml");
const feishuCardScriptPath = join(workspaceRoot, "tools", "release", "src", "notifications", "feishu.ts");
const feishuClientScriptPath = join(workspaceRoot, "tools", "release", "src", "notifications", "feishu-client.ts");
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
const releaseLatestPublicationScriptPath = join(
  workspaceRoot,
  "tools",
  "release",
  "src",
  "storage",
  "latest-publication.ts",
);

async function readReleaseWorkflow(ritualPath: string, distributionPath: string): Promise<string> {
  if (ritualPath === distributionPath) {
    const [workflow, acceptance] = await Promise.all([
      readFile(ritualPath, "utf8"),
      readFile(join(workspaceRoot, ".github", "workflows", "distribution-exact-accept.yml"), "utf8"),
    ]);
    return `${workflow}\n${acceptance}`;
  }
  const [ritual, distribution, acceptance] = await Promise.all([
    readFile(ritualPath, "utf8"),
    readFile(distributionPath, "utf8"),
    Promise.resolve(""),
  ]);
  return `${ritual}\n${distribution}\n${acceptance}`;
}

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
    "      - name: Block merge while a merge-blocking label is present",
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
  const packageJson = JSON.parse(await readFile(shellPackageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("shells/electron/package.json must define a version");
  }
  return packageJson.version;
}

async function runScopesPrint(eventName: string, eventPayload: unknown, changedFiles: string[] = []): Promise<Record<string, unknown>> {
  const tempDir = await mkdtemp(join(tmpdir(), "od-scopes-"));
  const eventPath = join(tempDir, "event.json");
  const ghPath = join(tempDir, "gh");
  const ghCmdPath = join(tempDir, "gh.cmd");
  await writeFile(eventPath, JSON.stringify(eventPayload));
  const script = `#!/usr/bin/env node
const changedFiles = ${JSON.stringify(changedFiles)};
if (process.argv.includes("--jq")) {
  process.stdout.write(changedFiles.join("\\n"));
  if (changedFiles.length > 0) process.stdout.write("\\n");
} else {
  process.stdout.write(JSON.stringify({ files: changedFiles.map((filename) => ({ filename })) }));
}
`;
  await writeFile(ghPath, script);
  await chmod(ghPath, 0o755);
  await writeFile(ghCmdPath, `@echo off\r\n"${process.execPath}" "${ghPath}" %*\r\n`);

  try {
    const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", scopesScriptPath, "print"], {
      cwd: workspaceRoot,
      env: workflowFixtureEnv({
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: ghPath,
      }, tempDir),
    });
    return JSON.parse(stdout) as Record<string, unknown>;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
        RELEASE_CHANNEL: (env.CHANNEL_LABEL ?? "Prerelease").toLowerCase(),
        RELEASE_FEISHU_BOT: JSON.stringify(["v1", `http://127.0.0.1:${address.port}`, ""]),
        RELEASE_MAC_ARM64_SMOKE: env.MAC_ARM64_SMOKE_RESULT ?? "",
        RELEASE_MAC_ARM64_URL: env.MAC_ARM64_URL ?? "",
        RELEASE_MAC_X64_SMOKE: env.MAC_X64_SMOKE_RESULT ?? "",
        RELEASE_MAC_X64_URL: env.MAC_INTEL_URL ?? "",
        RELEASE_RESULT: env.BUILD_STATE ?? "success",
        RELEASE_STATE: env.RELEASE_STATE ?? "complete",
        RELEASE_VERSION: env.VERSION ?? "0.19.0-prerelease.1",
        RELEASE_WIN_X64_SMOKE: env.WIN_X64_SMOKE_RESULT ?? "",
        RELEASE_WIN_X64_URL: env.WIN_URL ?? "",
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
    expect(workflow).not.toContain("actions/cache/save");
  });

  it("[P2] runs Windows launcher payload archive validation when tools-pack is touched", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const job = sectionBetween(workflow, "  windows_tools_pack_payload_tests:", "  web_workspace_tests:");
    const validate = sectionBetween(workflow, "  validate:", "          if [ -n \"$failures\" ]; then");

    expect(job).toContain("fromJSON(needs.runners.outputs.runs_on).windows_tools");
    expect(job).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).windows_tools)");
    expect(job).toContain("needs.scopes.outputs.run_windows_tools_pack_payload_tests == 'true'");
    expect(job).toContain("pnpm --filter @open-design/tools-pack exec vitest run tests/launcher-payload.test.ts");
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

    // Producer: the merge_group gate emits a handoff/comment artifact for the labeled PR when
    // it blocks, and uploads it on the failure path (the gate exits 1 exactly when it produces).
    expect(ciWorkflow).toContain("<!-- merge-queue-needs-validation -->");
    expect(ciWorkflow).toContain("emit_ejection_notice");
    expect(ciWorkflow).toContain(
      "if: ${{ failure() && steps.merge_blocking_label_gate.outputs.comment_created == 'true' }}",
    );

    // Consumer: a merge_group run's head_sha is the queue's synthetic merge commit, so the atom
    // binds merge_group artifacts to their producing run by run_id and skips the base-freshness
    // check (PRs ahead in the queue move the base while the run completes).
    expect(commentWorkflow).toContain('"$RUN_EVENT" = "merge_group"');
    expect(commentWorkflow).toContain('"$artifact_run_id" != "$RUN_ID"');
    expect(commentWorkflow).toContain('[ "$RUN_EVENT" != "merge_group" ] && [ "$current_base" != "$base_sha" ]');
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
    const scopes = sectionBetween(workflow, "  scopes:", "  static_gate:");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(workflow).toContain("ci_mode:");
    expect(scopes).toContain("ci_mode: ${{ steps.detect.outputs.ci_mode }}");
    expect(scopes).toContain("ui_p0_validation_required: ${{ steps.detect.outputs.ui_p0_validation_required }}");
    expect(scopes).toContain("run_ui_p0: ${{ steps.detect.outputs.run_ui_p0 }}");
    expect(workflow).toContain("needs.scopes.outputs.run_ui_p0 == 'true'");
    expect(validate).toContain('when($out.run_ui_p0 == "true"; ["ui_p0"])');

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

    expect(workspaceUnit).toContain(`if [ "\${{ needs.scopes.outputs.tools_pack_tests_required }}" = "true" ]; then
            pnpm --filter @open-design/shell-electron build
            pnpm --filter @open-design/shell-electron test
            pnpm --filter @open-design/tools-pack test
            if [ "\${{ needs.scopes.outputs.run_e2e_vitest }}" != "true" ]; then
              pnpm --filter @open-design/e2e test tests/packaged-launcher-update-loop.test.ts
            fi
          fi`);
  });

  it("[P1] runs the complete daemon suite in four required shards", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const daemonTests = sectionBetween(workflow, "  daemon_unit_tests:", "  windows_tools_pack_payload_tests:");
    const validate = sectionBetween(workflow, "  validate:", "  runtime_summary:");

    expect(daemonTests).toContain("if: ${{ needs.scopes.outputs.daemon_tests_required == 'true' }}");
    expect(daemonTests).toContain("fail-fast: false");
    expect(daemonTests).toContain("shard: [1, 2, 3, 4]");
    expect(daemonTests).toContain("pnpm --filter @open-design/daemon test --shard=${{ matrix.shard }}/4");
    expect(validate).toContain("- daemon_unit_tests");
    expect(validate).toContain('when($out.daemon_tests_required == "true"; ["daemon_unit_tests"])');
  });

  it("[P2] skips the critical fallback for pure packaged-leaf changes and stays fail-closed elsewhere", async () => {
    const hot = { inputs: { ci_mode: "hot" } };

    // Playwright never starts the Electron Shell or tools-pack
    // entrypoints, so a change confined to those leaf roots keeps its
    // package tests but must not pay the two-job critical fallback.
    for (const file of [
      "shells/electron/src/index.ts",
      "shells/electron/src/main/index.ts",
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
    await expect(runScopesPrint("merge_group", mergeGroup, ["shells/electron/src/index.ts"])).resolves.toMatchObject({
      run_e2e_vitest: false,
      run_playwright_critical: false,
      run_playwright_visual: false,
      run_ui_p0: false,
      run_web_workspace_tests: false,
      run_windows_tools_pack_payload_tests: true,
      tools_dev_tests_required: true,
      tools_pack_tests_required: true,
      workspace_validation_required: true,
    });

    await expect(runScopesPrint("merge_group", mergeGroup, ["shells/electron/package.json"])).resolves.toMatchObject({
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
      runScopesPrint("workflow_dispatch", hot, ["shells/electron/src/index.ts", "tools/dev/src/index.ts"]),
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

    const baseOutputs = {
      run_preflight: "false",
      run_workspace_unit_tests: "false",
      run_windows_tools_pack_payload_tests: "false",
      run_web_workspace_tests: "false",
      run_e2e_vitest: "false",
      run_playwright_critical: "false",
      run_ui_p0: "false",
      run_playwright_visual: "false",
    };
    // Core gate only cares about app jobs — unknown packaging keys are ignored.
    await expect(
      validateGatePasses(workflow, {
        scopes: { result: "success", outputs: baseOutputs },
        static_gate: { result: "success" },
      }),
    ).resolves.toBe(true);

    const needsWithFailedWeb = {
      scopes: { result: "success", outputs: { ...baseOutputs, run_web_workspace_tests: "true" } },
      static_gate: { result: "success" },
      web_workspace_tests: { result: "failure" },
    };
    await expect(validateGatePasses(workflow, needsWithFailedWeb)).resolves.toBe(false);
  });

  it("[P1] keeps the renderer host contract out of the Nix daemon workspace build", async () => {
    const flake = await readFile(flakePath, "utf8");
    const daemonWorkspaces = sectionBetween(flake, "      daemonWorkspacePaths = [", "      ];");

    expect(daemonWorkspaces).not.toContain('"packages/host"');
    expect(daemonWorkspaces).toContain('"packages/sidecar"');
  });

  it("[P2] routes trusted Linux CI through the Nexu runner fleet", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const runners = sectionBetween(workflow, "  runners:", "  scopes:");
    const scopes = sectionBetween(workflow, "  scopes:", "  static_gate:");
    const staticGate = sectionBetween(workflow, "  static_gate:", "  preflight:");
    const workspaceUnitTests = sectionBetween(workflow, "  workspace_unit_tests:", "  daemon_unit_tests:");
    const daemonUnitTests = sectionBetween(workflow, "  daemon_unit_tests:", "  windows_tools_pack_payload_tests:");
    const webWorkspaceTests = sectionBetween(workflow, "  web_workspace_tests:", "  e2e_vitest:");
    const e2eVitest = sectionBetween(workflow, "  e2e_vitest:", "  playwright_critical:");
    const preflight = sectionBetween(workflow, "  preflight:", "  workspace_unit_tests:");
    const uiP0 = sectionBetween(workflow, "  ui_p0:", "  playwright_visual:");
    const visual = sectionBetween(workflow, "  playwright_visual:", "  validate:");

    expect(runners).toContain("|| 'nexu-runners-small'");
    expect(runners).toContain("&& 'ubuntu-24.04'");
    expect(runners).toContain("runs_on: ${{ steps.runners.outputs.runs_on }}");
    expect(runners).toContain("decision: ${{ steps.runners.outputs.decision }}");
    expect(runners).toContain("python3 .github/scripts/runners.py");
    expect(scopes).toContain("needs: [runners]");
    expect(scopes).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(staticGate).toContain("needs: [runners]");
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
    expect(uiP0).toContain("include: ${{ fromJSON(needs.scopes.outputs.ui_p0_matrix) }}");
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
      workflowPath: distributionPrereleaseWorkflowPath,
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
    const runners = sectionBetween(workflow, "  runners:", "  scopes:");

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
      readReleaseWorkflow(releasePrereleaseWorkflowPath, distributionPrereleaseWorkflowPath),
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
      ["  build_win:", "  publish:"],
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
    expect(runnerDecision(performanceProfiles)).toEqual({ schema_version: 1, mode: "performance" });
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
      const fallbackProfiles = await runRunners(invalidMode);
      expect(runnerDecision(fallbackProfiles)).toEqual({ schema_version: 1, mode: "default" });
      expect(runnerRunsOn(fallbackProfiles).control).toEqual(["nexu-runners-small"]);
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
    const [ciWorkflow, commentWorkflow, autofixWorkflow, reportWorkflow, handoffScript] = await Promise.all([
      readFile(ciWorkflowPath, "utf8"),
      readFile(commentWorkflowPath, "utf8"),
      readFile(autofixWorkflowPath, "utf8"),
      readFile(reportWorkflowPath, "utf8"),
      readFile(handoffScriptPath, "utf8"),
    ]);

    // Core ci still produces comment + report handoffs (needs-validation, visual).
    // Packaging hash autofix left core ci with nix — no ci-produced autofix handoffs for now.
    expect(ciWorkflow).toContain("handoff.py dir comment");
    expect(ciWorkflow).toContain("handoff.py dir report");
    expect(ciWorkflow).toContain("handoff-comment-");
    expect(ciWorkflow).toContain("handoff-report-");
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

  it("[P0] keeps each release entry within its caller permission ceiling", async () => {
    const [exactWorkflow, ...writeCapableWorkflows] = await Promise.all([
      releaseBetaWorkflowPath,
      releasePrereleaseWorkflowPath,
      releaseStableWorkflowPath,
    ].map(async (path) => await readFile(path, "utf8")));
    const stableDistribution = await readFile(distributionStableWorkflowPath, "utf8");

    const exactPermissions = sectionBetween(exactWorkflow!, "permissions:", "concurrency:");
    expect(exactPermissions).toContain("actions: write");
    expect(exactPermissions).toContain("contents: read");
    expect(exactPermissions).not.toContain("id-token: write");
    expect(exactPermissions).not.toContain("packages: write");

    for (const workflow of writeCapableWorkflows) {
      const permissions = sectionBetween(workflow, "permissions:", "concurrency:");
      expect(permissions).toContain("actions: write");
      expect(permissions).toContain("contents: write");
      expect(permissions).toContain("id-token: write");
      expect(permissions).toContain("packages: write");
    }

    const stablePermissions = sectionBetween(stableDistribution, "permissions:", "env:");
    expect(stablePermissions).toContain("id-token: write");
  });

  it("[P2] keeps release namespaces aligned with release channels", async () => {
    const [
      releaseStableWorkflow,
      releaseStableScript,
      releasePrereleaseWorkflow,
      releaseBetaWorkflow,
      macAction,
      winAction,
      betaMacAction,
      betaWinAction,
    ] = await Promise.all([
      readReleaseWorkflow(releaseStableWorkflowPath, distributionStableWorkflowPath),
      readFile(releaseStableScriptPath, "utf8"),
      readReleaseWorkflow(releasePrereleaseWorkflowPath, distributionPrereleaseWorkflowPath),
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(macDistributionActionPath, "utf8"),
      readFile(winDistributionActionPath, "utf8"),
      readFile(betaMacDistributionActionPath, "utf8"),
      readFile(betaWinDistributionActionPath, "utf8"),
    ]);

    expect(releaseStableScript).toContain('mac: releaseNamespace(channel, "mac"),');
    expect(releaseStableScript).toContain('setOutput("namespace", namespaces.mac);');
    expect(releaseStableScript).toContain('setOutput("mac_intel_namespace", namespaces.macIntel);');
    expect(releaseStableScript).toContain('setOutput("win_namespace", namespaces.win);');
    expect(releaseStableWorkflow).toContain("namespace: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("namespace: ${{ needs.metadata.outputs.mac_intel_namespace }}");
    expect(releaseStableWorkflow).toContain("namespace: ${{ needs.metadata.outputs.win_namespace }}");
    expect(macAction).toContain("namespace: ${{ inputs.namespace }}");
    expect(macAction).toContain("OD_PACKAGED_E2E_NAMESPACE: ${{ inputs.namespace }}");
    expect(winAction).toContain('"--namespace", "${{ inputs.namespace }}",');
    expect(winAction).toContain("OD_PACKAGED_E2E_NAMESPACE: ${{ inputs.namespace }}");
    expect(releaseStableWorkflow).not.toMatch(/--namespace release-stable(?:-intel|-win)?\b/);

    for (const [channel, workflow] of [["prerelease", releasePrereleaseWorkflow]] as const) {
      expect(workflow).toContain(`channel: ${channel}`);
      expect(workflow).toContain("namespace: release-${{ inputs.channel }}");
      expect(workflow).toContain("namespace: release-${{ inputs.channel }}-intel");
      expect(workflow).toContain("namespace: release-${{ inputs.channel }}-win");
    }

    const betaDispatch = sectionBetween(releaseBetaWorkflow, "  workflow_dispatch:", "  workflow_call:");
    expect([...betaDispatch.matchAll(/^      [a-z0-9_]+:$/gmu)].length).toBeLessThanOrEqual(25);
    expect(releaseBetaWorkflow).toContain("namespace: ${{ matrix.target == 'mac_arm64' && format('release-{0}', inputs.exact_name) || format('release-{0}-x64', inputs.exact_name) }}");
    expect(betaMacAction).toContain("RELEASE_NAMESPACE: ${{ inputs.namespace }}");
    expect(betaMacAction).toContain("RELEASE_TARGET: ${{ inputs.target }}");
    expect(betaMacAction).not.toMatch(/^\s+description:.*\$\{\{/mu);
    expect(betaWinAction).toContain("RELEASE_NAMESPACE: release-${{ inputs.channel }}-win");
    expect(betaWinAction).toContain("RELEASE_TARGET: win_x64");

    expect(releaseBetaWorkflow).toContain("shell-smoke-matrix: ${{ matrix.target == 'mac_arm64' && 'mac-shell-v3' || 'mac-shell-v2' }}");
    expect(betaMacAction).toContain("Resolve ${{ inputs.target }} Shell smoke acceptance identity");
    expect(betaMacAction).toContain("RELEASE_STANDALONE_PROTOCOL_VERSION: \"1\"");
    expect(betaMacAction).toContain("Register ${{ inputs.target }} Electron Shell full-smoke proof");
    expect(betaWinAction).toContain("RELEASE_SHELL_SMOKE_MATRIX: win-shell-v2");
    expect(betaWinAction).toContain("Register win_x64 Electron Shell full-smoke proof");

    expectWindowsUpdaterSmokeContract(`${releaseBetaWorkflow}\n${betaWinAction}`, "beta");
    expectWindowsUpdaterSmokeContract(`${releasePrereleaseWorkflow}\n${winAction}`, "prerelease");
    expectWindowsUpdaterSmokeContract(`${releaseStableWorkflow}\n${winAction}`, "stable");
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
      readReleaseWorkflow(releasePrereleaseWorkflowPath, distributionPrereleaseWorkflowPath),
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
    ]);

    const releaseCommitEnv = "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}";
    // Beta is the working reference that already populates the commit.
    expect(betaWorkflow).toContain(releaseCommitEnv);

    const jobBounds: Array<[string, string]> = [
      ["  build_mac:", "  build_mac_intel:"],
      ["  build_mac_intel:", "  build_win:"],
      ["  build_win:", "  publish:"],
      ["  publish:", "  cleanup_partial_release_assets:"],
    ];
    for (const [start, end] of jobBounds) {
      expect(sectionBetween(prereleaseWorkflow, start, end)).toContain(releaseCommitEnv);
    }
  });

  it("[P2] keeps the prerelease workflow call on a consistent ref and output contract", async () => {
    const prereleaseWorkflow = await readReleaseWorkflow(
      releasePrereleaseWorkflowPath,
      distributionPrereleaseWorkflowPath,
    );

    expectCountedReleaseWorkflowCallContract(prereleaseWorkflow, "prerelease");

    expect(prereleaseWorkflow).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");
    expect(prereleaseWorkflow).toContain("Required when ref is not release/vX.Y.Z");
  });

  it("[P2] makes a publish=false beta dispatch retrievable on both platforms without touching a channel", async () => {
    const [workflow, macAction, winAction] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(betaMacDistributionActionPath, "utf8"),
      readFile(betaWinDistributionActionPath, "utf8"),
    ]);

    expect(workflow).toContain("dogfood-enabled: ${{ matrix.target == 'mac_arm64' && 'true' || 'false' }}");
    expect(workflow).toContain("publish: ${{ inputs.publish }}");
    expect(workflow).toContain("publish: ${{ inputs.publish }}");

    const macDogfood = sectionBetween(
      macAction,
      "    - name: Upload ${{ inputs.target }} dogfood build to release storage",
      "    - name: Delete failed ${{ inputs.target }} tools-pack cache",
    );
    const winDogfood = sectionBetween(
      winAction,
      "    - name: Upload win_x64 dogfood build to release storage",
      "    - name: Delete failed Windows tools-pack cache",
    );
    for (const [label, step] of [["mac", macDogfood], ["win", winDogfood]] as const) {
      expect(step, label).toContain("run: pnpm exec tools-release publish-dogfood");
      expect(step, label).toContain("DOGFOOD_BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}");
      expect(step, label).toContain("DOGFOOD_BUILD_JSON_PATH:");
      expect(step, label).toContain("DOGFOOD_BUILD_JSON_KEYS:");
      for (const forbidden of ["publish-platform", "publish-metadata", "beta/latest"]) {
        expect(step, `${label} / ${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(macDogfood).toContain("inputs.publish != 'true'");
    expect(winDogfood).toContain("inputs.publish != 'true'");
    expect(workflow).not.toContain("open-design-beta-mac-arm64-dmg");
    expect(workflow).not.toContain("open-design-beta-win-x64-installer");
  });
  it("[P2] publishes release notes through one channel-neutral tools-release pipeline", async () => {
    const [betaWorkflow, prereleaseWorkflow, stableWorkflow, countedDistribution, metadataDistribution] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readReleaseWorkflow(releasePrereleaseWorkflowPath, distributionPrereleaseWorkflowPath),
      readReleaseWorkflow(releaseStableWorkflowPath, distributionStableWorkflowPath),
      readFile(join(workspaceRoot, ".github", "actions", "release", "publish-counted", "action.yml"), "utf8"),
      readFile(join(workspaceRoot, ".github", "actions", "release", "publish-metadata", "action.yml"), "utf8"),
    ]);

    for (const workflow of [betaWorkflow, stableWorkflow, countedDistribution]) {
      expect(workflow).toContain("uses: ./.github/actions/release/publish-metadata");
    }
    expect(metadataDistribution).toContain("RELEASE_NOTE_MANIFEST_PATH:");
    expect(metadataDistribution.indexOf("tools-release prepare-release-note")).toBeLessThan(
      metadataDistribution.indexOf("tools-release publish-release-note"),
    );
    expect(metadataDistribution.indexOf("tools-release publish-release-note")).toBeLessThan(
      metadataDistribution.indexOf("tools-release verify-release-note"),
    );
    expect(metadataDistribution.indexOf("tools-release verify-release-note")).toBeLessThan(
      metadataDistribution.indexOf("tools-release publish-metadata"),
    );
    expect(prereleaseWorkflow).toContain("uses: ./.github/actions/release/publish-counted");

    expect(stableWorkflow).toContain("Validate stable release note policy");
    expect(stableWorkflow).toContain(
      "RELEASE_PUBLISH_SIDE_EFFECTS: ${{ needs.metadata.outputs.publish_side_effects_enabled }}",
    );
  });

  it("[P2] requires stable release dispatch to use the release version branch", async () => {
    const [workflow, script] = await Promise.all([
      readReleaseWorkflow(releaseStableWorkflowPath, distributionStableWorkflowPath),
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
      '${stableBaseVersion.source ?? "release base"} version ${stableBaseVersion.value} must match shells/electron/package.json version',
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
      await readFile(join(workspaceRoot, "shells", "electron", "package.json"), "utf8"),
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
          OPEN_DESIGN_EXACT_METADATA_URL: `${fixture.origin}/beta/latest/metadata.json`,
          OPEN_DESIGN_STABLE_METADATA_URL: `${fixture.origin}/stable/latest/metadata.json`,
          RELEASE_CHANNEL: "beta",
        },
        maxBuffer: 1024 * 1024,
      });

      expect(result.stdout).toContain(`[release-exact] version: ${packagedVersion}-beta.5`);
      const outputs = await readFile(outputPath, "utf8");
      expect(outputs).toContain(`release_version=${packagedVersion}-beta.5`);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("[P1] binds beta publication to the exact requested ref", async () => {
    const [betaWorkflow, dailyWorkflow, betaMacAction, betaWinAction] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(notifyDailyFeishuWorkflowPath, "utf8"),
      readFile(betaMacDistributionActionPath, "utf8"),
      readFile(betaWinDistributionActionPath, "utf8"),
    ]);
    const metadataJob = sectionBetween(betaWorkflow, "  metadata:", "  build:");
    const publisherGuard = sectionBetween(
      metadataJob,
      "- name: Validate exact publisher inputs and ref",
      "- name: Capture previous exact commit",
    );

    expect(betaWorkflow).toContain(
      "RELEASE_BRANCH: ${{ inputs.ref != '' && inputs.ref || github.ref_name }}",
    );
    expect(publisherGuard).toContain("if: ${{ inputs.publish }}");
    expect(publisherGuard).toContain("REQUESTED_REF:");
    expect(publisherGuard).toContain('built_sha="$(git rev-parse HEAD)"');
    expect(publisherGuard).toContain('expected_sha="${REQUESTED_REF,,}"');
    expect(publisherGuard).toContain("git ls-remote origin");
    expect(publisherGuard).toContain('[ "$built_sha" != "$expected_sha" ]');
    expect(publisherGuard).not.toContain("refs/heads/main");
    expect(betaWorkflow).not.toContain("recover_foreign_beta");
    expect(betaWorkflow).not.toContain("OPEN_DESIGN_RECOVER_FOREIGN_BETA");
    expect(metadataJob).toContain("branch: ${{ steps.identity.outputs.branch }}");
    expect(metadataJob).toContain("commit: ${{ steps.identity.outputs.commit }}");
    expect(metadataJob).toContain("promote: ${{ inputs.promote }}");
    const manualDispatch = sectionBetween(betaWorkflow, "  workflow_dispatch:", "  workflow_call:");
    expect(manualDispatch).toContain("      promote:");
    expect(manualDispatch).toContain("        default: true");
    const buildJob = sectionBetween(betaWorkflow, "  build:", "  stage:");
    expect(buildJob).toContain("target: mac_arm64");
    expect(buildJob).toContain("target: mac_x64");
    expect(buildJob).toContain("target: win_x64");
    expect(buildJob).toContain("id: mac");
    expect(buildJob).toContain("id: win");
    expect(buildJob).toContain("open-design-${{ inputs.exact_name }}-${{ matrix.target }}-build-result");
    expect(betaMacAction).toContain("value: ${{ steps.smoke.outcome }}");
    expect(betaMacAction).toContain("value: ${{ steps.platform_outputs.outputs.dmg_url }}");
    expect(betaMacAction).toContain("id: smoke");
    expect(betaMacAction).toContain("continue-on-error: true");
    expect(betaMacAction).toContain("id: platform_outputs");

    expect(betaWinAction).toContain("value: ${{ steps.win_x64_smoke.outcome }}");
    expect(betaWinAction).toContain("value: ${{ steps.win_x64_platform_outputs.outputs.installer_url }}");
    expect(betaWinAction).toContain("id: win_x64_smoke");
    expect(betaWinAction).toContain("continue-on-error: true");
    expect(betaWinAction).toContain("id: win_x64_platform_outputs");

    const stageJob = betaWorkflow.slice(betaWorkflow.indexOf("  stage:"));
    expect(stageJob).toContain("inputs.promote");
    expect(dailyWorkflow).not.toContain("enable_mac_x64:");
    expect(dailyWorkflow).toContain("notification_stream: daily");
    expect(dailyWorkflow).not.toContain("force:");
    expect(dailyWorkflow).not.toContain("release_version:");
    expect(dailyWorkflow).not.toContain("tools/release/src/notifications/");
  });

  it("[P1] keeps exact flat while stable and prerelease use their shared distributions", async () => {
    const [exact, prerelease, stable] = await Promise.all([
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releaseStableWorkflowPath, "utf8"),
    ]);

    expect(exact).toContain("  metadata:");
    expect(exact).toContain("uses: ./.github/workflows/distribution-exact-accept.yml");
    expect(exact).not.toContain("uses: ./.github/workflows/distribution-exact.yml");
    expect(prerelease).toContain("uses: ./.github/workflows/distribution-counted.yml");
    expect(stable).toContain("uses: ./.github/workflows/distribution-stable.yml");
    for (const workflow of [exact, prerelease, stable]) {
      expect(workflow).not.toContain("uses: ./.github/workflows/distribution.yml");
    }
    expect(existsSync(join(workspaceRoot, ".github", "workflows", "distribution.yml"))).toBe(false);
    expect(existsSync(join(workspaceRoot, ".github", "workflows", "distribution-exact.yml"))).toBe(false);
    expect(existsSync(join(workspaceRoot, ".github", "workflows", "release-preview.yml"))).toBe(false);
    expect(existsSync(join(workspaceRoot, ".github", "workflows", "release-exact.yml"))).toBe(false);
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
    expect(resolveJob).toContain("ref: ${{ steps.pick.outputs.ref }}");
    // Override path: workflow_dispatch ref is wired in and forwarded verbatim.
    expect(resolveJob).toContain("OVERRIDE_REF: ${{ inputs.ref }}");
    expect(resolveJob).toContain('echo "ref=$OVERRIDE_REF" >> "$GITHUB_OUTPUT"');
    // Default path: an empty input builds main, never a release branch.
    expect(resolveJob).toContain('echo "ref=main" >> "$GITHUB_OUTPUT"');
    expect(resolveJob).not.toContain("refs/heads/release/v*");

    // The release entry owns the sole terminal card, including failures before
    // a version is allocated. The schedule only selects the stream and ref.
    expect(workflow).toContain("notification_stream: daily");
    expect(workflow).not.toContain("  notify:");
    expect(workflow).not.toContain("  notify_failure:");
  });

  it("[P1] gives every release channel one explicit non-gating Feishu terminal report", async () => {
    const [notifyCapability, exact, prerelease, stable, daily, releaseBranch] = await Promise.all([
      readFile(releaseNotifyWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(notifyDailyFeishuWorkflowPath, "utf8"),
      readFile(notifyReleaseFeishuWorkflowPath, "utf8"),
    ]);
    const entries = [
      ["exact", exact, "RELEASE_FEISHU_BETA"],
      ["prerelease", prerelease, "RELEASE_FEISHU_PRERELEASE"],
      ["stable", stable, "RELEASE_FEISHU_STABLE"],
    ] as const;
    for (const [channel, workflow, secret] of entries) {
      const notifyJob = workflow.slice(workflow.indexOf("  notify:"));
      expect(notifyJob, channel).toContain("uses: ./.github/workflows/release-notify.yml");
      expect(notifyJob, channel).toContain("if: ${{ always() && !cancelled() }}");
      expect(notifyJob, channel).toContain(channel === "exact" ? "channel: ${{ inputs.exact_name }}" : `channel: ${channel}`);
      expect(notifyJob, channel).toContain(`secrets.${secret}`);
      for (const [, , otherSecret] of entries) {
        if (otherSecret !== secret) expect(notifyJob, channel).not.toContain(otherSecret);
      }
    }
    expect(notifyCapability).toContain("RELEASE_FEISHU_BOT: ${{ secrets.bot }}");
    expect(notifyCapability).toContain("continue-on-error: true");
    expect(notifyCapability).toContain("Feishu release notification failed after notifier retries");
    expect(notifyCapability).toContain("tools/release/src/notifications/feishu.ts");
    expect(daily).toContain("notification_stream: daily");
    expect(releaseBranch).toContain("notification_stream: release-branch");
    expect(daily).not.toContain("tools/release/src/notifications/");
    expect(releaseBranch).not.toContain("tools/release/src/notifications/");
  });

  it("[P1] keeps macOS and Windows public Closure binding and cold-start evidence symmetric", async () => {
    const [mac, win, distribution] = await Promise.all([
      readFile(packagedMacSpecPath, "utf8"),
      readFile(join(e2eRoot, "specs", "win.spec.ts"), "utf8"),
      readFile(join(workspaceRoot, ".github", "workflows", "distribution-exact-accept.yml"), "utf8"),
    ]);
    for (const [platform, spec] of [["mac", mac], ["win", win]] as const) {
      expect(spec, platform).toContain("readPackagedClosureBinding");
      expect(spec, platform).toContain("createPackagedColdStartObservation");
      expect(spec, platform).toContain("...(coldStart == null ? {} : { coldStart })");
      expect(spec, platform).toContain("expected:");
    }
    expect(mac).toContain("root: join(toolsPackDir, 'runtime', 'mac')");
    expect(mac).not.toContain("root: join(homedir(), 'Library', 'Application Support'");
    expect(distribution).toContain("target: mac_arm64");
    expect(distribution).toContain("target: mac_x64");
    expect(distribution).toContain("target: win_x64");
    expect(distribution).toContain("Issue public ${{ matrix.target }} acceptance credential");
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
    const [prerelease, notify, releaseNotify, feishuCard, macAction, winAction] = await Promise.all([
      readReleaseWorkflow(releasePrereleaseWorkflowPath, distributionPrereleaseWorkflowPath),
      readFile(notifyReleaseFeishuWorkflowPath, "utf8"),
      readFile(releaseNotifyWorkflowPath, "utf8"),
      readFile(feishuCardScriptPath, "utf8"),
      readFile(macDistributionActionPath, "utf8"),
      readFile(winDistributionActionPath, "utf8"),
    ]);

    const workflowCall = sectionBetween(prerelease, "  workflow_call:", "permissions:");
    expect(workflowCall).toContain("mac_arm64_smoke_result:");
    expect(workflowCall).toContain("value: ${{ jobs.distribute.outputs.mac_arm64_smoke_result }}");
    expect(workflowCall).toContain("win_x64_smoke_result:");
    expect(workflowCall).toContain("value: ${{ jobs.distribute.outputs.win_x64_smoke_result }}");

    const macJob = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const macX64Job = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const winJob = sectionBetween(prerelease, "  build_win:", "  publish:");
    for (const job of [macJob, macX64Job, winJob]) {
      expect(job).toContain("smoke_result: ${{ steps.platform.outputs.smoke_result }}");
      expect(job).toContain("smoke-advisory: ${{ inputs.smoke_advisory }}");
    }
    expect(prerelease).toContain("smoke_advisory: true");

    const macSmoke = sectionBetween(
      macAction,
      "    - name: Smoke packaged runtime",
      "    - name: Write release report",
    );
    expect(macAction).toContain("value: ${{ steps.smoke.outcome }}");
    expect(macSmoke).toContain("id: smoke");
    expect(macSmoke).toContain("continue-on-error: ${{ inputs.smoke-advisory == 'true' }}");
    expect(macSmoke).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(macAction).toContain("RELEASE_SMOKE_MODE: core");

    const winSmokeFixture = sectionBetween(
      winAction,
      "    - name: Build updater fixture",
      "    - name: Smoke packaged runtime",
    );
    const winSmoke = sectionBetween(
      winAction,
      "    - name: Smoke packaged runtime",
      "    - name: Write release report",
    );
    expect(winAction).toContain("value: ${{ steps.smoke.outcome }}");
    expect(winSmokeFixture).toContain("continue-on-error: true");
    expect(winSmoke).toContain("id: smoke");
    expect(winSmoke).toContain("continue-on-error: ${{ inputs.smoke-advisory == 'true' }}");
    expect(winAction.indexOf("Smoke packaged runtime")).toBeLessThan(
      winAction.indexOf("Publish platform"),
    );
    expect(notify).toContain("notification_stream: release-branch");
    expect(notify).not.toContain("tools/release/src/notifications/");
    expect(releaseNotify).toContain("RELEASE_MAC_ARM64_SMOKE: ${{ inputs.mac_arm64_smoke }}");
    expect(releaseNotify).toContain("RELEASE_WIN_X64_SMOKE: ${{ inputs.win_x64_smoke }}");
    expect(releaseNotify).toContain("tools/release/src/notifications/feishu.ts");
    expect(releaseNotify).not.toContain("tools/release/src/notifications/feishu-notice.ts");
    expect(feishuCard).toContain('optionalEnv("RELEASE_MAC_ARM64_SMOKE")');
    expect(feishuCard).toContain('optionalEnv("RELEASE_WIN_X64_SMOKE")');
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
      title: { content: expect.stringContaining("Prerelease") },
    });
    expect(card.elements.map((element) => element.text?.content).filter(Boolean)).toContain(
      "**告警**\n- Windows x64 smoke 失败",
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
      title: { content: expect.stringContaining("部分完成") },
    });
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
    const [workflow, notice, client] = await Promise.all([
      readFile(cutPatchReleaseWorkflowPath, "utf8"),
      readFile(feishuNoticeScriptPath, "utf8"),
      readFile(feishuClientScriptPath, "utf8"),
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
    // patch (shells/electron == $VERSION), so the release commit MUST tolerate an empty
    // tree — otherwise `git commit` dies on "nothing to commit" and no branch is cut.
    expect(workflow).toContain('git commit --allow-empty -am "chore(release): v$VERSION"');

    // The notice card is a standalone poster with the same signed-webhook contract.
    expect(notice).toContain("createFeishuSignedEnvelope(buildCard(), signSecret)");
    expect(client).toContain("msg_type: \"interactive\"");
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
      readReleaseWorkflow(releaseStableWorkflowPath, distributionStableWorkflowPath),
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
            RELEASE_MAC_ARM64_SIGN_MODE: "notarized",
            RELEASE_MAC_X64_SIGN_MODE: "notarized",
            RELEASE_WIN_X64_SIGN_MODE: "unsigned",
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
    const metadata = stablePrereleaseMetadataFixture(
      baseVersion,
      prereleaseVersion,
      fixture.origin,
    );
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = metadata;
    objects[`prerelease/versions/${prereleaseVersion}/qualification.json`] = stableQualificationFixture(metadata, fixture.origin);
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
    const [releaseBetaWorkflow, platformPublishScript, publishMetadataScript, metadataDistribution, betaMacAction, betaWinAction] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(releaseBetaPlatformPublishScriptPath, "utf8"),
      readFile(releasePublishMetadataScriptPath, "utf8"),
      readFile(join(workspaceRoot, ".github", "actions", "release", "publish-metadata", "action.yml"), "utf8"),
      readFile(betaMacDistributionActionPath, "utf8"),
      readFile(betaWinDistributionActionPath, "utf8"),
    ]);

    expect(betaMacAction).toContain("dmg-and-payload");
    expect(betaMacAction).toContain("tools-release publish-platform");
    expect(betaWinAction).toContain("tools-release publish-platform");
    expect(releaseBetaWorkflow).toContain("uses: ./.github/actions/release/publish-metadata");
    expect(metadataDistribution).toContain("tools-release publish-metadata");
    expect(releaseBetaWorkflow).toContain("RELEASE_MANIFEST_DIR:");
    expect(releaseBetaWorkflow).not.toContain("RELEASE_ASSET_SUFFIX: ${{ needs.metadata.outputs.asset_version_suffix }}");
    expect(platformPublishScript).toContain("artifacts.payload");
    expect(platformPublishScript).toContain("open-design-${releaseVersion}${assetSuffix}-mac-${arch}-payload.zip");
    expect(platformPublishScript).toContain("open-design-${releaseVersion}${assetSuffix}-win-x64-payload.7z");
    expect(publishMetadataScript).toContain("for (const [artifactName, artifact] of Object.entries(manifest.artifacts ?? {}))");
    expect(publishMetadataScript).toContain("outputs[`${target}_${artifactName}_url`] = artifact.url");
  });

  it("publishes one shared-plus-target Standalone graph in release-beta", async () => {
    const [workflow, betaMacAction, betaWinAction, sharedClosureAction] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(betaMacDistributionActionPath, "utf8"),
      readFile(betaWinDistributionActionPath, "utf8"),
      readFile(join(workspaceRoot, ".github", "actions", "release", "closure", "shared", "action.yml"), "utf8"),
    ]);
    const sharedJob = sectionBetween(workflow, "  metadata:", "  build:");
    const buildJob = sectionBetween(workflow, "  build:", "  stage:");
    const stageJob = sectionBetween(workflow, "  stage:", "  public_acceptance:");
    const publicAcceptanceJob = sectionBetween(
      workflow,
      "  public_acceptance:",
      "  activate:",
    );
    const activationJob = workflow.slice(workflow.indexOf("\n  activate:"));

    expect(workflow).not.toContain("CLOSURE_MIN_SHELL_VERSION: ${{ inputs.exact_name == 'beta'");
    expect(sharedJob).toContain("closure_min_shell_version: ${{ steps.exact.outputs.closure_min_shell_version }}");
    expect(sharedJob).toContain("min-shell-version: ${{ steps.exact.outputs.closure_min_shell_version }}");
    expect(buildJob).toContain("CLOSURE_MIN_SHELL_VERSION: ${{ needs.metadata.outputs.closure_min_shell_version }}");
    expect(workflow).toContain("OPEN_DESIGN_POSTINSTALL_CONCURRENCY: 2");
    expect(workflow).not.toContain("  closure_shared:");
    expect(workflow).not.toContain("needs.closure_shared");
    expect(sharedJob.match(/      - name: Checkout/g)?.length ?? 0).toBe(1);
    expect(sharedJob.match(/      - name: Install dependencies/g)?.length ?? 0).toBe(1);
    expect(sharedJob).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-prepare");
    expect(sharedJob).toContain("fetch-depth: 1");
    expect(sharedJob).toContain("cache: pnpm");
    expect(betaMacAction).toContain("Materialize legacy ${{ inputs.target }} migration fixture");
    expect(workflow).toContain("LEGACY_MAC_ARM64_VERSION: 0.16.2-beta.155");
    expect(workflow).toContain('RELEASE_INSTALLATION_VERSION_MIN_BETA: ${{ vars.RELEASE_LAUNCHER_VERSION_MIN_BETA }}');
    expect(workflow).not.toContain('RELEASE_LAUNCHER_VERSION_MIN_BETA" != "$CLOSURE_MIN_SHELL_VERSION');
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_MAC_LEGACY_DMG_PATH:");
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_MAC_MIN_SHELL_VERSION: ${{ env.CLOSURE_MIN_SHELL_VERSION }}");
    expect(workflow).toContain("POSTHOG_KEY: ${{ secrets.POSTHOG_KEY }}");
    expect(workflow).not.toContain("POSTHOG_KEY: ${{ inputs.publish");
    expect(workflow).toContain("shell_version:");
    expect(workflow).toContain("shell_version: ${{ steps.reservation.outputs.release_version");
    expect(workflow).toContain("closure_version:");
    expect(workflow).toContain("closure_version: ${{ steps.reservation.outputs.release_version");
    expect(sharedJob).toContain("Build shared Standalone Closure");
    expect(sharedJob).toContain("uses: ./.github/actions/release/closure/shared");
    expect(sharedClosureAction).toContain("Build shared Closure components");
    expect(sharedClosureAction).toContain("tools-pack closure build-distribution-shared");
    expect(sharedClosureAction).toContain("tools-release publish-closure-contribution");
    expect(sharedClosureAction).toContain("RELEASE_CLOSURE_CONTRIBUTION_KIND: shared");
    expect(sharedClosureAction).toContain('cp -R "$blob_root"');
    expect(buildJob).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(buildJob).toContain("target: mac_arm64");
    expect(buildJob).toContain("runner: macos-14");
    expect(buildJob).toContain("target: mac_x64");
    expect(buildJob).toContain("runner: macos-15-intel");
    expect(buildJob).toContain("target: win_x64");
    expect(buildJob).toContain("runner: windows-latest");
    for (const targetContributionStep of [
      sectionBetween(
        betaMacAction,
        "    - name: Build exact ${{ inputs.target }} Standalone target contribution",
        "    - name: Prepare ${{ inputs.target }} Standalone smoke graph",
      ),
      sectionBetween(
        betaWinAction,
        "    - name: Build exact win_x64 Standalone target contribution",
        "    - name: Prepare win_x64 Standalone smoke graph",
      ),
    ]) {
      expect(targetContributionStep).toContain("tools-pack closure build-distribution-target");
      expect(targetContributionStep).toContain("contribution.resources");
    }
    expect(betaMacAction).toContain("Build exact ${{ inputs.target }} Standalone target contribution");
    expect(betaMacAction).toContain("Resolve immutable ${{ inputs.target }} Electron Shell");
    expect(betaMacAction).toContain("tools-pack mac identity");
    expect(betaMacAction).toContain("tools-release resolve-shell-build");
    expect(betaMacAction).toContain("Register verified immutable ${{ inputs.target }} Electron Shell");
    expect(betaMacAction).toContain("tools-release register-shell-build");
    expect(betaMacAction).toContain("tools-pack closure build-distribution-target");
    expect(betaMacAction).toContain("--platform ${{ inputs.platform }}");
    expect(betaMacAction).toContain("Prepare ${{ inputs.target }} Standalone smoke graph");
    expect(betaMacAction).toContain("tools-release merge-closure-distribution");
    expect(betaMacAction).toContain("Publish verified ${{ inputs.target }} Standalone target blobs");
    expect(betaMacAction).toContain("tools-release publish-closure-contribution");
    expect(betaMacAction).toContain("RELEASE_CLOSURE_CONTRIBUTION_KIND: target");
    expect(buildJob).toContain("needs.metadata.outputs.closure_version");
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH:");
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON:");
    expect(betaMacAction).toContain('RELEASE_CLOSURE_ENABLED: "false"');
    expect(betaMacAction).toContain('RELEASE_SHELL_ENABLED: "true"');
    expect(betaMacAction).toContain("RELEASE_SHELL_BUILD_JSON_PATH:");
    expect(betaMacAction).toContain("DOGFOOD_BUILD_JSON_KEYS: dmgPath");
    expect(betaWinAction).toContain("Build exact win_x64 Standalone target contribution");
    expect(betaWinAction).toContain("Resolve immutable win_x64 Electron Shell");
    expect(betaWinAction).toContain('"tools-pack", "win", "identity"');
    expect(betaWinAction).toContain("tools-release resolve-shell-build");
    expect(betaWinAction).toContain("Register verified immutable win_x64 Electron Shell");
    expect(betaWinAction).toContain("tools-release register-shell-build");
    expect(betaWinAction).toContain("tools-pack closure build-distribution-target");
    expect(betaWinAction).toContain("--platform win32-x64");
    expect(betaWinAction).toContain("Prepare win_x64 Standalone smoke graph");
    expect(betaWinAction).toContain("tools-release merge-closure-distribution");
    expect(betaWinAction).toContain("Publish verified win_x64 Standalone target blobs");
    expect(betaWinAction).toContain("tools-release publish-closure-contribution");
    expect(betaWinAction).toContain("RELEASE_CLOSURE_CONTRIBUTION_KIND: target");
    expect(buildJob).toContain("closure-version: ${{ needs.metadata.outputs.closure_version }}");
    expect(betaWinAction).toContain("OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH:");
    expect(betaWinAction).toContain("$env:OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON = @(");
    expect(betaWinAction).toContain(") | ConvertTo-Json -Compress");
    expect(betaWinAction).toContain('RELEASE_CLOSURE_ENABLED: "false"');
    expect(betaWinAction).toContain('RELEASE_SHELL_ENABLED: "true"');
    expect(betaWinAction).toContain("RELEASE_SHELL_BUILD_JSON_PATH:");
    expect(stageJob).toContain("Merge the sole version-wide Standalone graph");
    expect(stageJob).toContain("tools-release merge-closure-distribution");
    expect(stageJob).toContain("RELEASE_CLOSURE_DISTRIBUTION_MANIFEST_PATH:");
    expect(stageJob).toContain('RELEASE_CLOSURE_DISTRIBUTION_REQUIRED: "true"');
    expect(stageJob).not.toContain("RELEASE_CLOSURE_REQUIRED:");
    expect(stageJob).toContain('RELEASE_SHELL_REQUIRED: "true"');
    expect(workflow).not.toContain("/beta/closure/");
    expect(workflow).not.toContain("OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH:");
    expect(workflow).toContain("Validate checkout ref shape");
    expect(workflow).toContain("full 40-character commit SHA; abbreviated SHA");
    expect(stageJob).toContain('RELEASE_ACTIVATE_LATEST: "false"');
    expect(stageJob).toContain('RELEASE_LATEST_CAS_REQUIRED: "true"');
    expect(workflow).toContain("RELEASE_WIN_X64_SIGN_MODE: unsigned");
    expect(stageJob).not.toContain("Observe directly activated beta public feed");
    expect(publicAcceptanceJob).toContain("runs-on: ${{ matrix.runner }}");
    expect(publicAcceptanceJob).toContain("target: mac_arm64");
    expect(publicAcceptanceJob).toContain("target: mac_x64");
    expect(publicAcceptanceJob).toContain("target: win_x64");
    expect(publicAcceptanceJob).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(publicAcceptanceJob).toContain("tools-release prepare-public-acceptance");
    expect(publicAcceptanceJob).toContain("tools-release issue-public-acceptance");
    expect(publicAcceptanceJob).toContain("OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: core");
    expect(publicAcceptanceJob).toContain("OD_PACKAGED_E2E_WIN_SMOKE_LANES: shell");
    expect(publicAcceptanceJob).toContain('OD_TOOLS_PACK_EMBEDDED_CONFIG_ONLY: "1"');
    expect(publicAcceptanceJob).toContain("OD_STANDALONE_METADATA_URL: ${{ inputs.metadata_url }}");
    expect(publicAcceptanceJob).not.toContain("OD_PACKAGED_CONFIG_PATH:");
    expect(publicAcceptanceJob).not.toContain("OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH");
    expect(publicAcceptanceJob).not.toContain("RELEASE_STORAGE_SECRET_ACCESS_KEY");
    expect(activationJob).toContain("needs.public_acceptance.result == 'success'");
    expect(activationJob).toContain("tools-release activate-public-release");
    expect(activationJob).toContain("Activate accepted immutable exact metadata with CAS");
    expect(activationJob).toContain("Read back activated exact public feed");
    expect(activationJob).toContain("tools-release observe-public-feed");
    expect(activationJob).not.toContain("continue-on-error");
  });

  it("publishes release-beta mac_x64 payloads while preserving the zip feed", async () => {
    const [workflow, macSpec, betaMacAction] = await Promise.all([
      readReleaseWorkflow(releaseBetaWorkflowPath, distributionBetaWorkflowPath),
      readFile(packagedMacSpecPath, "utf8"),
      readFile(betaMacDistributionActionPath, "utf8"),
    ]);
    const buildJob = sectionBetween(workflow, "  build:", "  stage:");
    const prepareStep = sectionBetween(betaMacAction, "    - name: Prepare ${{ inputs.target }} assets", "    - name: Publish ${{ inputs.target }} platform");
    const publishStep = sectionBetween(betaMacAction, "    - name: Publish ${{ inputs.target }} platform", "    - name: Upload ${{ inputs.target }} publish manifest");
    const artifactMode = "RELEASE_ARTIFACT_MODE: ${{ inputs.build-target == 'all' && 'all' || 'dmg-and-payload' }}";

    expect(buildJob).toContain("build-target: ${{ matrix.target == 'mac_arm64' && 'dmg' || 'all' }}");
    expect(prepareStep).toContain(artifactMode);
    expect(publishStep).toContain(artifactMode);
    expect(macSpec).toContain("const packagedMacClosureTarget = process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';");
    expect(macSpec).toContain("expectedPlatform: packagedMacClosureTarget");
    expect(macSpec).not.toContain("expectedPlatform: 'darwin-arm64'");
    expect(macSpec).toContain("launchMacAppWithLaunchServices(install.installedAppPath)");
    expect(macSpec).toContain("'--stdout', stdoutPath");
    expect(macSpec).toContain("'--stderr', stderrPath");
    expect(macSpec).toContain("'launch-services-witness.json'");
    expect(macSpec).toContain("observeMacLaunchProcesses(executablePath)");
    expect(macSpec).toContain("collectMacLaunchServicesLog({ bundleId, executableName })");
    expect(macSpec).toContain("...(packagedHeadless ? ['-g'] : [])");
    expect(macSpec).toContain("installedAppPath,\n    packagedInviteDeeplink");
  });

  it("keeps local macOS saturation complete through a package-level background agent", async () => {
    const [runner, macSpec, builder, shellEntry] = await Promise.all([
      readFile(join(e2eRoot, "scripts/release-smoke.ts"), "utf8"),
      readFile(packagedMacSpecPath, "utf8"),
      readFile(join(workspaceRoot, "tools/pack/src/mac/builder.ts"), "utf8"),
      readFile(join(workspaceRoot, "shells/electron/src/index.ts"), "utf8"),
    ]);

    expect(runner).toContain("assertMacBackgroundAgentBuild");
    expect(runner).toContain("build.backgroundAgent !== true");
    expect(runner).not.toContain("mac-launch-services:release-beta");
    expect(runner).toContain("await stopPackagedRuntime(platform, namespace)");
    expect(runner).toContain("const terminationSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const");
    expect(builder).toContain("extendInfo: config.macBackgroundAgent === true ? { LSUIElement: true } : undefined");
    expect(shellEntry).not.toContain("setActivationPolicy");
    expect(macSpec).toContain("new MacFocusWitness(toolsPackDir)");
    expect(macSpec).toContain("await macFocusWitness.track");
    expect(macSpec).toContain("await invokeMacInviteDeeplink(install.installedAppPath)");
    expect(macSpec).toContain("await launchMacAppWithLaunchServices(install.installedAppPath)");
  });

  it("rejects stale latest platform manifests from a previous beta version", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        amrProfile: "",
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.3.unsigned/Open Design Beta.dmg",
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
        signMode: "notarized",
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        amrProfile: "",
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/mac_arm64/Open Design Beta.dmg",
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
          versionPrefix: "beta/versions/1.2.3-beta.4",
        },
        releaseVersion: "1.2.3-beta.4",
        signMode: "notarized",
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        amrProfile: "",
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/mac_arm64/Open Design Beta.dmg",
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
          versionPrefix: "beta/versions/1.2.3-beta.4",
        },
        releaseVersion: "1.2.3-beta.4",
        signMode: "notarized",
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
        "beta/latest/platforms/mac_arm64.json",
        "beta/latest/metadata.json",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("keeps sign suffixes in filenames while metadata owns one unsuffixed version root", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-win-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "win_x64.json"),
        `${JSON.stringify(
          {
            amrProfile: "",
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
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
              url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/latest.yml",
            },
            platform: "win",
            platformKey: "win_x64",
            releaseTarget: "win_x64",
            releaseVersion: "1.2.3-beta.4",
            r2: {
              versionPrefix: "beta/versions/1.2.3-beta.4",
            },
            signMode: "unsigned",
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
          ENABLE_MAC_ARM64: "false",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
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
      expect(metadata.assetVersionSuffix).toBeUndefined();
      expect(metadata.readyTargets).toEqual(["win_x64"]);
      expect(metadata.platforms.win.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4");
      expect(metadata.releaseTargets.win_x64.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4");
      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4/metadata.json",
        "beta/latest/platforms/win_x64.json",
        "beta/latest/metadata.json",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("preserves launcher payload artifacts in beta latest metadata and action outputs", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-payload-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
            amrProfile: "",
            artifacts: {
              dmg: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/mac_arm64/open-design-1.2.3-beta.4.unsigned-mac-arm64.dmg",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/mac_arm64/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip.sha256",
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/mac_arm64/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip",
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
              versionPrefix: "beta/versions/1.2.3-beta.4",
            },
            signMode: "notarized",
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
            amrProfile: "",
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z.sha256",
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z",
              },
            },
            channel: "beta",
            feed: {
              name: "latest.yml",
              url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4/shells/electron/win_x64/latest.yml",
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
              versionPrefix: "beta/versions/1.2.3-beta.4",
            },
            signMode: "unsigned",
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
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
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
        "beta/versions/1.2.3-beta.4/metadata.json",
        "beta/latest/platforms/mac_arm64.json",
        "beta/latest/platforms/win_x64.json",
        "beta/latest/metadata.json",
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

function expectWindowsUpdaterSmokeContract(workflow: string, channel: "beta" | "preview" | "prerelease" | "stable"): void {
  if (channel === "beta") {
    expect(workflow).not.toContain("win_x64_smoke_mode:");
    expect(workflow).toContain("smoke-mode: core");
  } else {
    expect(workflow).toContain("win_x64_smoke_mode:");
    expect(workflow).toContain("win_x64_update_metadata_url:");
    expect(workflow).toContain("win_x64_update_target_version:");
    expect(workflow).toMatch(/win_x64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
  }
  const smokeMode = "inputs.smoke-mode";
  const metadataUrl = "inputs.update-metadata-url";
  const targetVersion = "inputs.update-target-version";
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: ${{ " + smokeMode + " }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE: ${{ " + smokeMode + " == 'full' && " + metadataUrl + " == '' && " + targetVersion + " == '' && 'tools-serve' || '' }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ " + metadataUrl + " }}");
  expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_VERSION: ${{ " + targetVersion + " }}");
  if (channel === "stable") {
    expect(workflow).toContain("Build updater fixture");
    expect(workflow).toContain('full Windows stable smoke requires stable version x.y.z');
    expect(workflow).toContain('namespace: ${{ needs.metadata.outputs.win_namespace }}');
    expect(workflow).toContain('--namespace "${{ inputs.namespace }}"');
    expect(workflow).toContain('"--cache-dir", "${{ runner.temp }}\\tools-pack-cache",');
    expect(workflow).toContain('tools-pack win validate-payload --namespace "${{ inputs.namespace }}"');
  } else {
    expect(workflow).toContain(channel === "beta" ? "Build win_x64 exact update fixture" : "Build updater fixture");
    expect(workflow).toContain(channel === "beta"
      ? "full Windows smoke requires a counted exact version"
      : "full Windows smoke requires a counted ${{ inputs.channel }} version");
  }
  if (channel === "beta") {
    expect(workflow.match(/OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: core/gu)).toHaveLength(1);
  } else {
    expect(workflow).not.toContain("OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: core");
  }
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
  expect(workflow).toContain("Capture previous counted release commit");
  expect(workflow).toContain("previous ${{ inputs.channel }} commit:");
  expect(workflow).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
  expect(workflow).toContain("version_metadata_url:");
  expect(workflow).toContain("mac_arm64_url:");
  expect(workflow).toContain("mac_intel_url:");
  expect(workflow).toContain("win_url:");
  expect(workflow).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
  expect(workflow).toContain("version_metadata_url: ${{ steps.distribute.outputs.version_metadata_url }}");
  expect(workflow).toContain("mac_arm64_url: ${{ steps.distribute.outputs.mac_arm64_url }}");
  expect(workflow).toContain("mac_intel_url: ${{ steps.distribute.outputs.mac_x64_url }}");
  expect(workflow).toContain("win_url: ${{ steps.distribute.outputs.win_x64_url }}");
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
    digest: `sha256:${createHash("sha256").update(name).digest("hex")}`,
    sha256Url: `${versionUrl}/${name}.sha256`,
    url: `${versionUrl}/${name}`,
  });

  const github = {
    branch: `release/v${baseVersion}`,
    commit: "0123456789abcdef0123456789abcdef01234567",
    repository: "nexu-io/open-design",
    workflow: "release-prerelease",
  };
  const mac = {
    arch: "arm64",
    artifacts: {
      dmg: artifact("Open Design.dmg"),
      zip: artifact("Open Design-mac-arm64.zip"),
    },
    enabled: true,
    r2: { versionManifestUrl: `${versionUrl}/platforms/mac_arm64.json` },
    signMode: "notarized",
  };
  const macIntel = {
    arch: "x64",
    artifacts: {
      dmg: artifact("Open Design Intel.dmg"),
      zip: artifact("Open Design-mac-x64.zip"),
    },
    enabled: true,
    r2: { versionManifestUrl: `${versionUrl}/platforms/mac_x64.json` },
    signMode: "notarized",
  };
  const win = {
    arch: "x64",
    artifacts: { installer: artifact("Open Design Setup.exe") },
    enabled: true,
    r2: { versionManifestUrl: `${versionUrl}/platforms/win_x64.json` },
    signMode: "unsigned",
  };
  return {
    amrProfile: "prod",
    baseVersion,
    channel: "prerelease",
    generatedAt: "2026-08-13T00:00:00.000Z",
    github,
    parameterMatrix: {
      mac_arm64: { signMode: "notarized" },
      mac_x64: { signMode: "notarized" },
      win_x64: { signMode: "unsigned" },
    },
    prereleaseNumber: 12,
    prereleaseVersion,
    platforms: {
      mac,
      macIntel,
      win,
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
    releaseState: "complete",
    releaseTargets: { mac_arm64: mac, mac_x64: macIntel, win_x64: win },
    releaseVersion: prereleaseVersion,
  };
}

function stableQualificationFixture(metadata: Record<string, unknown>, publicOrigin: string): Record<string, unknown> {
  const releaseVersion = String(metadata.releaseVersion);
  const releaseTargets = metadata.releaseTargets as Record<string, { artifacts: Record<string, { digest: string }> }>;
  const target = (name: string) => ({
    artifacts: Object.fromEntries(Object.entries(releaseTargets[name]!.artifacts).map(([artifactName, value]) => [artifactName, value.digest])),
    manifest: {
      digest: `sha256:${"0".repeat(64)}`,
      url: `${publicOrigin}/prerelease/versions/${releaseVersion}/platforms/${name}.json`,
    },
  });
  return {
    amrProfile: "prod",
    baseVersion: metadata.baseVersion,
    channel: "prerelease",
    github: metadata.github,
    metadata: {
      digest: `sha256:${createHash("sha256").update(JSON.stringify(metadata)).digest("hex")}`,
      url: `${publicOrigin}/prerelease/versions/${releaseVersion}/metadata.json`,
    },
    parameterMatrix: metadata.parameterMatrix,
    policy: "stable-promotion-v1",
    qualifiedAt: metadata.generatedAt,
    releaseVersion,
    schemaVersion: 1,
    smoke: {
      profile: "core",
      targets: {
        mac_arm64: { result: "success" },
        mac_x64: { result: "success" },
        win_x64: { result: "success" },
      },
    },
    status: "qualified",
    targets: {
      mac_arm64: target("mac_arm64"),
      mac_x64: target("mac_x64"),
      win_x64: target("win_x64"),
    },
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
