import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { uiP0CiMatrix, uiP0Groups } from "../lib/playwright/suites.ts";

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const commentWorkflowPath = join(workspaceRoot, ".github", "workflows", "comment.atom.yml");
const autofixWorkflowPath = join(workspaceRoot, ".github", "workflows", "autofix.atom.yml");
const reportWorkflowPath = join(workspaceRoot, ".github", "workflows", "report.atom.yml");
const dockerImageWorkflowPath = join(workspaceRoot, ".github", "workflows", "docker-image.yml");
const backportAutomergeWorkflowPath = join(workspaceRoot, ".github", "workflows", "backport-automerge.yml");
const handoffScriptPath = join(workspaceRoot, ".github", "scripts", "handoff.py");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const releaseBetaSelfHostedWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta-s.yml");
const releasePreviewWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-preview.yml");
const releasePrereleaseWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-prerelease.yml");
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const releasePreviewScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-preview.ts");
const releaseStableScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-stable.ts");
const releaseBetaScriptPath = join(workspaceRoot, "tools", "release", "src", "metadata", "prepare-beta.ts");
const packagedPackageJsonPath = join(workspaceRoot, "apps", "packaged", "package.json");
const scopesScriptPath = join(workspaceRoot, "scripts", "scopes.ts");
const notifyDailyFeishuWorkflowPath = join(workspaceRoot, ".github", "workflows", "notify-daily-feishu.yml");
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

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
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
  const tempDir = await mkdtemp(join(tmpdir(), "od-scopes-"));
  const eventPath = join(tempDir, "event.json");
  const ghPath = join(tempDir, "gh");
  const ghCmdPath = join(tempDir, "gh.cmd");
  await writeFile(eventPath, JSON.stringify(eventPayload));
  const script = `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(changedFiles.join("\n"))});
if (${JSON.stringify(changedFiles.length > 0)}) process.stdout.write("\\n");
`;
  await writeFile(ghPath, script);
  await chmod(ghPath, 0o755);
  await writeFile(ghCmdPath, `@echo off\r\n"${process.execPath}" "${ghPath}" %*\r\n`);

  try {
    const fakePath = `${tempDir}${delimiter}${process.env.PATH ?? ""}`;
    const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", scopesScriptPath, "print"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: ghPath,
        Path: fakePath,
        PATH: fakePath,
      },
    });
    return JSON.parse(stdout) as Record<string, unknown>;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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

    expect(job).toContain("runs-on: windows-latest");
    expect(job).toContain("needs.scopes.outputs.run_windows_tools_pack_payload_tests == 'true'");
    expect(job).toContain("pnpm --filter @open-design/tools-pack exec vitest run tests/launcher-payload.test.ts");
    expect(validate).toContain("windows_tools_pack_payload_tests");
  });

  it("[P2] limits manual blob guard checks to changed files against main", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const blobGuard = sectionBetween(workflow, "  static_gate:", "  nix_validation:");

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
    const ciBlobGuard = sectionBetween(ciWorkflow, "  static_gate:", "  nix_validation:");
    const dockerTrigger = sectionBetween(dockerWorkflow, "on:", "\njobs:");

    expect(ciTrigger).toContain("pull_request:");
    expect(ciTrigger).toContain("merge_group:");
    expect(ciTrigger).toContain("workflow_dispatch:");
    expect(ciTrigger).not.toContain("push:");
    expect(ciBlobGuard).not.toContain('${{ github.event_name }}" = "push"');
    expect(dockerTrigger).toContain("workflow_call:");
    expect(dockerTrigger).toContain("tags: ['v*.*.*']");
    expect(dockerTrigger).not.toContain("branches: [main]");
    expect(dockerTrigger).not.toContain("- main");
    expect(commentWorkflow).toContain("workflows: [ci]");
    expect(commentWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(autofixWorkflow).toContain("workflows: [ci]");
    expect(autofixWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(autofixWorkflow).not.toContain("ci-nix");
    expect(reportWorkflow).toContain("workflows: [ci]");
    expect(reportWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
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
    // reviewed, so auto-approve/merge require pristine == 'true': every commit's committer is
    // github-actions[bot]. The committers are paginated across all commits and any non-bot one
    // fails the count. Otherwise the PR falls back to human review.
    expect(workflow).toContain("steps.pr.outputs.pristine == 'true'");
    expect(workflow).toContain('.[].committer.login // "none"');
    expect(workflow).toContain("--paginate");
    expect(workflow).toContain("grep -Fvxc 'github-actions[bot]'");

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

    // The Feishu failure path carries the same identity gates, so a fork / non-bot backport-*
    // PR can't spam the release group.
    const feishuStep = sectionBetween(workflow, "Notify Feishu on failed backport CI", "FEISHU_WEBHOOK");
    expect(feishuStep).toContain("steps.pr.outputs.author == 'app/open-design-release-bot'");
    expect(feishuStep).toContain("steps.pr.outputs.cross == 'false'");
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
    expect(validate).toContain('when($out.run_ui_p0 == "true"; ["ui_p0_smoke", "ui_p0"])');

    await expect(runScopesPrint("workflow_dispatch", { inputs: { ci_mode: "hot" } }, ["apps/web/src/app/page.tsx"])).resolves.toMatchObject({
      ci_mode: "hot",
      run_ui_p0: true,
      run_nix_validation: false,
    });
    await expect(runScopesPrint("workflow_dispatch", { inputs: {} })).resolves.toMatchObject({
      ci_mode: "full",
      ui_p0_validation_required: true,
      run_docker_build: true,
      run_nix_validation: true,
      run_ui_p0: true,
    });
    await expect(runScopesPrint("merge_group", {})).resolves.toMatchObject({
      ci_mode: "full",
      ui_p0_validation_required: true,
      run_docker_build: true,
      run_nix_validation: true,
      run_ui_p0: true,
    });
  });

  it("[P2] keeps the lightweight unit workspace check on GitHub hosted runners", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const workspaceUnitTests = sectionBetween(workflow, "  workspace_unit_tests:", "  windows_tools_pack_payload_tests:");
    const webWorkspaceTests = sectionBetween(workflow, "  web_workspace_tests:", "  e2e_vitest:");
    const uiP0 = sectionBetween(workflow, "  ui_p0:", "  playwright_visual:");
    const visual = sectionBetween(workflow, "  playwright_visual:", "  docker_pr:");

    expect(workspaceUnitTests).toContain("runs-on: ubuntu-24.04");
    expect(webWorkspaceTests).toContain("runs-on: blacksmith-4vcpu-ubuntu-2404");
    expect(uiP0).toContain("runs-on: blacksmith-8vcpu-ubuntu-2404");
    expect(uiP0).toContain("include: ${{ fromJSON(needs.scopes.outputs.ui_p0_matrix) }}");
    expect(uiP0CiMatrix.map((entry) => entry.name)).toEqual([
      "entry-settings",
      "project-workspace",
      "project-runtime",
      "workspace-restoration",
    ]);
    expect(uiP0Groups["project-workspace"].files).toEqual([
      "ui/app.test.ts",
      "ui/app-design-files.test.ts",
      "ui/app-manual-edit.test.ts",
      "ui/project-management-flows.test.ts",
      "ui/workspace-keyboard-flows.test.ts",
    ]);
    expect(visual).toContain("runs-on: blacksmith-8vcpu-ubuntu-2404");
  });

  it("[P2] routes CI follow-ons through generic handoff workflows", async () => {
    const [ciWorkflow, commentWorkflow, autofixWorkflow, reportWorkflow, handoffScript] = await Promise.all([
      readFile(ciWorkflowPath, "utf8"),
      readFile(commentWorkflowPath, "utf8"),
      readFile(autofixWorkflowPath, "utf8"),
      readFile(reportWorkflowPath, "utf8"),
      readFile(handoffScriptPath, "utf8"),
    ]);

    expect(ciWorkflow).toContain("handoff.py dir comment");
    expect(ciWorkflow).toContain("handoff.py dir autofix");
    expect(ciWorkflow).toContain("handoff.py dir report");
    expect(ciWorkflow).toContain("handoff-comment-");
    expect(ciWorkflow).toContain("handoff-autofix-");
    expect(ciWorkflow).toContain("handoff-report-");
    expect(ciWorkflow).not.toContain("nix-hash-autofix");
    expect(ciWorkflow).not.toContain("visual-pr-comment");
    expect(commentWorkflow).toContain("artifact-pattern comment");
    expect(commentWorkflow).toContain("merge-multiple: false");
    expect(commentWorkflow).toContain("pull-requests: write");
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
    const [releaseStableWorkflow, releaseStableScript, releasePreviewWorkflow, releasePrereleaseWorkflow, releaseBetaWorkflow] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
      readFile(releasePreviewWorkflowPath, "utf8"),
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

    expectChannelWorkflowNamespaces(releasePreviewWorkflow, "preview", { hasLinuxSmoke: false });
    expectChannelWorkflowNamespaces(releasePrereleaseWorkflow, "prerelease", { hasLinuxSmoke: false });
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-win");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-linux");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: win_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: linux_x64");
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
    expectWindowsUpdaterSmokeContract(releasePreviewWorkflow, "preview");
    expectWindowsUpdaterSmokeContract(releasePrereleaseWorkflow, "prerelease");
    expectWindowsUpdaterSmokeContract(releaseStableWorkflow, "stable");
  });

  it("[P2] keeps counted release workflow calls on a consistent ref and output contract", async () => {
    const [previewWorkflow, prereleaseWorkflow, previewScript] = await Promise.all([
      readFile(releasePreviewWorkflowPath, "utf8"),
      readFile(releasePrereleaseWorkflowPath, "utf8"),
      readFile(releasePreviewScriptPath, "utf8"),
    ]);

    expectCountedReleaseWorkflowCallContract(previewWorkflow, "preview");
    expectCountedReleaseWorkflowCallContract(prereleaseWorkflow, "prerelease");

    expect(previewWorkflow).toContain("OPEN_DESIGN_PREVIEW_VERSION: ${{ inputs.release_version }}");
    expect(previewWorkflow).toContain("Empty uses preview/vX.Y.Z when present, otherwise apps/packaged/package.json.");
    expect(previewScript).toContain("function resolvePreviewBaseVersion");
    expect(previewScript).toContain('source: "apps/packaged/package.json"');
    expect(previewScript).not.toContain("release-preview can only run from preview/vX.Y.Z branches");

    expect(prereleaseWorkflow).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");
    expect(prereleaseWorkflow).toContain("Required when ref is not release/vX.Y.Z");
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
    // Override path: workflow_dispatch ref is wired in and forwarded verbatim.
    expect(resolveJob).toContain("OVERRIDE_REF: ${{ inputs.ref }}");
    expect(resolveJob).toContain('echo "ref=$OVERRIDE_REF" >> "$GITHUB_OUTPUT"');
    // Default path: an empty input builds main, never a release branch.
    expect(resolveJob).toContain('echo "ref=main" >> "$GITHUB_OUTPUT"');
    expect(resolveJob).not.toContain("refs/heads/release/v*");
  });

  it("[P2] supports stable dry-run metadata and prepublish boundaries", async () => {
    const [workflow, script] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("Dry-run boundary to validate. metadata stops after promotion metadata; prepublish runs build/smoke/report/plan without publishing.");
    expect(workflow).toContain("group: open-design-release-stable-${{ inputs.dry_run }}");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("- metadata");
    expect(workflow).toContain("- prepublish");
    expect(workflow).toContain("default: metadata");
    expect(workflow).not.toContain("inputs.channel");
    expect(workflow).toContain("OPEN_DESIGN_RELEASE_DRY_RUN: ${{ inputs.dry_run }}");
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
      const fakePath = `${join(runnerTemp, "bin")}${delimiter}${process.env.PATH ?? ""}`;

      const result = await execFileAsync(process.execPath, ["--experimental-strip-types", releaseStableScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          GITHUB_REF_NAME: `release/v${baseVersion}`,
          GITHUB_REPOSITORY: "nexu-io/open-design",
          GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          OPEN_DESIGN_RELEASE_CHANNEL: "stable",
          OPEN_DESIGN_RELEASE_DRY_RUN: "true",
          OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: fixture.origin,
          OPEN_DESIGN_GH_NODE_SCRIPT: join(runnerTemp, "bin", "gh"),
          OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
          Path: fakePath,
          PATH: fakePath,
        },
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

  it("keeps both beta release lanes on the shared payload-aware metadata surface", async () => {
    const [releaseBetaWorkflow, releaseBetaSelfHostedWorkflow, platformPublishScript, publishMetadataScript] = await Promise.all([
      readFile(releaseBetaWorkflowPath, "utf8"),
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseBetaPlatformPublishScriptPath, "utf8"),
      readFile(releasePublishMetadataScriptPath, "utf8"),
    ]);

    for (const workflow of [releaseBetaWorkflow, releaseBetaSelfHostedWorkflow]) {
      expect(workflow).toContain("RELEASE_ARTIFACT_MODE: dmg-and-payload");
      expect(workflow).toContain("tools-release publish-platform");
      expect(workflow).toContain("tools-release publish-metadata");
      expect(workflow).toContain("RELEASE_MANIFEST_DIR:");
    }
    expect(releaseBetaWorkflow).toContain("RELEASE_ASSET_SUFFIX: ${{ needs.metadata.outputs.asset_version_suffix }}");
    expect(releaseBetaSelfHostedWorkflow).toContain("RELEASE_ASSET_SUFFIX: auto");
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

  it("keeps the self-hosted beta lane metadata-driven with reusable platform publish scripts", async () => {
    const [workflow, posixBuildScript, windowsBuildScript, platformPublishScript, publishMetadataScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseBetaPosixBuildScriptPath, "utf8"),
      readFile(releaseBetaWindowsBuildScriptPath, "utf8"),
      readFile(releaseBetaPlatformPublishScriptPath, "utf8"),
      readFile(releasePublishMetadataScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("enable_win_x64:");
    expect(workflow).toContain("enable_mac_arm64:");
    expect(workflow).toContain("enable_mac_x64:");
    expect(workflow).toContain("enable_linux_x64:");
    expect(workflow).toMatch(/enable_win_x64:[\s\S]*?default: true/);
    expect(workflow).toMatch(/enable_mac_arm64:[\s\S]*?default: true/);
    expect(workflow).toMatch(/publish:[\s\S]*?default: true/);
    expect(workflow).toMatch(/release_public_origin:[\s\S]*?default: "https:\/\/s3\.nexu\.space\/od-releases"/);
    expect(workflow).toContain("win_x64_smoke_mode:");
    expect(workflow).toContain("win_x64_target:");
    expect(workflow).toContain("win_x64_update_metadata_url:");
    expect(workflow).toContain("win_x64_update_target_version:");
    expect(workflow).toContain("mac_arm64_sign_mode:");
    expect(workflow).toContain("mac_arm64_smoke_mode:");
    expect(workflow).toMatch(/win_x64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/mac_arm64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/win_x64_sign_mode:[\s\S]*?options:[\s\S]*?- "off"[\s\S]*?- "on"[\s\S]*?default: "off"/);
    expect(workflow).toMatch(/mac_arm64_sign_mode:[\s\S]*?options:[\s\S]*?- "no"[\s\S]*?- "sign-only"[\s\S]*?- "notarize"[\s\S]*?default: "sign-only"/);
    expect(workflow).not.toContain("win_enable:");
    expect(workflow).not.toContain("mac_enable:");
    expect(workflow).not.toMatch(/^      enable_win:/m);
    expect(workflow).not.toMatch(/^      enable_mac:/m);
    expect(workflow).not.toMatch(/^      sign_mode:/m);
    expect(workflow).not.toMatch(/^      smoke_mode:/m);
    expect(workflow).not.toMatch(/^      update_metadata_url:/m);
    expect(workflow).not.toMatch(/^      update_target_version:/m);
    expect(workflow).toContain("name: Prepare betas metadata");
    expect(workflow).toContain("OPEN_DESIGN_BETAS_METADATA_URL: ${{ inputs.release_public_origin }}/betas/latest/metadata.json");
    expect(workflow).toContain("OPEN_DESIGN_STABLE_METADATA_URL: https://releases.open-design.ai/stable/latest/metadata.json");
    expect(workflow).toContain('repo_dir="$PWD/_release-metadata"');
    expect(workflow).toContain("--filter=blob:none --depth=1");
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain("working-directory: _release-metadata");
    expect(workflow).toContain("Install metadata toolchain");
    expect(workflow).toContain("pnpm install --frozen-lockfile --prefer-offline");
    expect(workflow).toContain("tools-release prepare betas");
    expect(workflow).not.toContain('git fetch --force --depth=1 origin "+refs/tags/open-design-v*:refs/tags/open-design-v*"');
    expect(workflow).toContain("release-beta-s requires at least one target to be enabled");
    expect(workflow).toContain("release_version: ${{ inputs.publish && steps.reserve.outputs.release_version || inputs.release_version != '' && inputs.release_version || steps.betas.outputs.release_version }}");
    expect(workflow).toContain("if: ${{ inputs.publish }}");
    expect(workflow).toContain("Reject unsupported self-hosted mac_x64");
    expect(workflow).toContain("Reject unsupported self-hosted linux_x64");
    expect(workflow).toContain("name: Probe Windows signing capability");
    expect(workflow).toContain("probe-win-signing.ps1");
    expect(workflow).toContain("needs: metadata");
    expect(workflow).toContain('-ReleaseTarget win_x64');
    expect(workflow).toContain('-ReleaseVersion "${{ needs.metadata.outputs.release_version }}"');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_ENABLED: ${{ steps.sign_probe.outputs.enabled }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_PROBED: ${{ steps.sign_probe.outputs.probed }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNTOOL_PATH: ${{ steps.sign_probe.outputs.signtool_path }}');
    expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_VERSION: ${{ inputs.win_x64_update_target_version }}");
    expect(windowsBuildScript).toContain('"pnpm.cmd", "exec", "tools-pack", "win", "build"');
    expect(windowsBuildScript).toContain('if ($SmokeMode -eq "full" -and -not $hasExternalUpdateMetadata -and -not $hasExternalUpdateArtifactPair)');
    expect(windowsBuildScript).not.toContain("fnm");
    expect(windowsBuildScript).not.toContain("RUNNER_TEMP");
    expect(windowsBuildScript).not.toContain("GITHUB_OUTPUT");
    expect(windowsBuildScript).not.toContain("GITHUB_STEP_SUMMARY");
    expect(posixBuildScript).toContain("RELEASE_TARGET");
    expect(posixBuildScript).toContain("REQUIRE_VELA_CLI");
    expect(posixBuildScript).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(posixBuildScript).not.toContain("OPEN_DESIGN_RELEASE_PROFILE");
    expect(posixBuildScript).not.toContain("corepack prepare");
    expect(posixBuildScript).not.toContain("RUNNER_TEMP");
    expect(workflow).toContain("Publish win_x64 platform");
    expect(workflow).toContain("tools-release publish-platform");
    expect(workflow).toContain("Write win_x64 release report");
    expect(workflow).toContain("RELEASE_REPORT_DIR: C:\\.tmp\\runner\\od-beta\\win_x64\\release-report\\win_x64");
    expect(posixBuildScript).toContain('OD_PACKAGED_E2E_MAC_SMOKE_PROFILE="$RELEASE_SMOKE_MODE"');
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64, nexu-mac, release-beta]");
    expect(workflow).toContain("path: _release-build");
    expect(workflow).toContain("working-directory: _release-build");
    expect(workflow).toContain("fnm exec --using=24 -- bash tools/release/scripts/build-platform.sh");
    expect(workflow).toContain("MAC_TOOLS_PACK_CACHE_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack-cache");
    expect(workflow).toContain("MAC_TOOLS_PACK_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack");
    expect(workflow).toContain("TOOLS_PACK_CACHE_DIR: ${{ env.MAC_TOOLS_PACK_CACHE_DIR }}");
    expect(workflow).toContain("TOOLS_PACK_DIR: ${{ env.MAC_TOOLS_PACK_DIR }}");
    expect(workflow).toContain("Write mac_arm64 release report");
    expect(workflow).toContain("fnm exec --using=24 -- pnpm exec tools-release write-report");
    expect(workflow).toContain("fnm.exe\" exec --using=24 -- pnpm.cmd exec tools-release write-report");
    expect(workflow).toContain("fnm.exe\" exec --using=24 -- pnpm.cmd exec tools-release publish-platform");
    expect(workflow).toContain("Prepare mac_arm64 assets");
    expect(workflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(workflow).toContain("RELEASE_SIGNED: ${{ (inputs.mac_arm64_delivery_mode == 'internal-updater' || inputs.mac_arm64_sign_mode != 'no') && 'true' || 'false' }}");
    expect(workflow).toContain("RELEASE_REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac_arm64-report.zip");
    expect(workflow).toContain("name: Publish betas metadata to Nexu S3");
    expect(workflow).toContain("Upload mac_arm64 publish manifest fallback");
    expect(workflow).toContain("Upload win_x64 publish manifest fallback");
    expect(workflow).toContain("Download mac_arm64 publish manifest fallback");
    expect(workflow).toContain("Download win_x64 publish manifest fallback");
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("Download mac_arm64 platform manifest");
    expect(workflow).toContain("Download win_x64 platform manifest");
    expect(workflow).not.toContain('manifest_url="${RELEASE_PUBLIC_ORIGIN%/}/betas/versions/${RELEASE_VERSION}${RELEASE_ASSET_SUFFIX}/platforms/${RELEASE_TARGET}.json"');
    expect(workflow).not.toContain('curl -fsSL "$manifest_url" -o "$RELEASE_MANIFEST_DIR/$RELEASE_TARGET.json"');
    expect(workflow).not.toContain('fallback_manifest="$RELEASE_FALLBACK_MANIFEST_DIR/$RELEASE_TARGET.json"');
    expect(workflow).toContain("tools-release download-platform-manifest");
    expect(workflow).toContain("RELEASE_STORAGE_ENDPOINT: ${{ secrets.NEXU_S3_ENDPOINT }}");
    expect(workflow).toContain("tools-release publish-metadata");
    expect(workflow).toContain("RELEASE_ASSET_SUFFIX: auto");
    expect(workflow).toContain("RELEASE_MANIFEST_DIR: ${{ runner.temp }}/release-platform-manifests");
    expect(workflow).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(workflow).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(workflow).toContain("open-design-betas-win-x64-publish-manifest");
    expect(workflow).toContain("open-design-betas-mac-arm64-publish-manifest");
    expect(workflow).toContain('STATE_SOURCE: ${{ needs.metadata.outputs.state_source }}');
    expect(workflow).not.toContain("Verify betas metadata");
    expect(workflow).not.toContain("tools-release verify-metadata");
    expect(workflow).not.toContain("tools-release summary-metadata");
    expect(workflow).toContain("release-beta-s publishes to an internal S3 namespace; public metadata fetch verification is intentionally skipped.");
    expect(publishMetadataScript).toContain("validateManifest");
    expect(publishMetadataScript).toContain("manifest.releaseVersion !== releaseVersion");
    expect(publishMetadataScript).toContain("manifest.github?.runId !== currentRunId");
    expect(publishMetadataScript).not.toContain("manifest.github?.runAttempt !== currentRunAttempt");
    expect(publishMetadataScript).toContain("manifest.github?.commit !== currentCommit");
    expect(publishMetadataScript).toContain("manifest.platformKey !== target");
    expect(publishMetadataScript).toContain("manifest.r2.versionPrefix.includes(`/versions/${releaseVersion}`)");
    expect(publishMetadataScript).toContain('if (assetVersionSuffix === "auto")');
    expect(publishMetadataScript).toContain('assetVersionSuffix = allReadyTargetsSigned ? ".signed" : ".unsigned";');
    expect(publishMetadataScript).toContain("const feedVersionPrefix = manifest.r2?.versionPrefix;");
    expect(publishMetadataScript).toContain("refusing stale ${def.target} platform manifest");
    expect(publishMetadataScript).toContain("publishLatestPlatformObjects");
    expect(platformPublishScript).not.toContain("await upload(join(releaseAssetsDir, name), `${latestPrefix}/${name}`");
    expect(platformPublishScript).not.toContain("await upload(manifestPath, `${latestPrefix}/platforms/${target}.json`");
    expect(platformPublishScript).toContain('const target = requiredTarget();');
    expect(platformPublishScript).toContain("legacyPlatformKey");
    expect(workflow).not.toContain("win_enable:");
    expect(workflow).not.toContain("mac_enable:");
    expect(workflow).not.toContain(".github/scripts/release/build-mac.sh");
    expect(workflow).not.toContain(".github/scripts/release/r2/publish-platform.ts");
    expect(workflow).not.toContain("publish-beta-metadata.ps1");
    expect(workflow).not.toContain("probe-beta-public-read.ps1");
    expect(workflow).not.toContain("publish-beta.ps1 -IndexPath");
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

  it("keeps beta runner bootstrap in workflows instead of release scripts", async () => {
    const [workflow, posixBuildScript, winBuildScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseBetaPosixBuildScriptPath, "utf8"),
      readFile(releaseBetaWindowsBuildScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("fnm exec --using=24 -- bash tools/release/scripts/build-platform.sh");
    expect(workflow).toContain('& "C:\\Users\\runner\\.cargo\\bin\\fnm.exe" exec --using=24 -- pwsh -NoProfile -File tools\\release\\scripts\\build-platform.ps1');
    expect(workflow).toContain("corepack prepare pnpm@10.33.2 --activate");
    expect(workflow).toContain('pnpm.cmd install --frozen-lockfile --prefer-offline');
    expect(workflow).toContain("sudo -n \"$OPEN_DESIGN_MAC_SIGNING_HELPER\" \"$cert_path\" \"$password_path\"");
    expect(workflow).not.toContain("PATH: /usr/local/libexec/open-design/wrappers:${{ env.PATH }}");
    expect(posixBuildScript).not.toContain("fnm");
    expect(posixBuildScript).not.toContain("corepack");
    expect(posixBuildScript).not.toContain("pnpm install");
    expect(winBuildScript).not.toContain("fnm");
    expect(winBuildScript).not.toContain("corepack");
    expect(winBuildScript).not.toContain("pnpm install");
  });
});

function expectChannelWorkflowNamespaces(
  workflow: string,
  channel: "beta" | "preview" | "prerelease",
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
