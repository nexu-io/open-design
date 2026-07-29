import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const releaseBetaSelfHostedWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta-s.yml");
const releasePreviewWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-preview.yml");
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const releaseStableScriptPath = join(workspaceRoot, "scripts", "release-stable.ts");
const releasePublishMetadataScriptPath = join(
  workspaceRoot,
  ".github",
  "workflow",
  "scripts",
  "release",
  "storage",
  "publish-metadata.ts",
);
const releaseBetaPosixBuildScriptPath = join(workspaceRoot, ".github", "workflow", "scripts", "release", "build-platform.sh");
const releaseBetaWindowsBuildScriptPath = join(workspaceRoot, ".github", "workflow", "scripts", "release", "build-platform.ps1");
const releaseBetaPlatformPublishScriptPath = join(
  workspaceRoot,
  ".github",
  "workflow",
  "scripts",
  "release",
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

async function writeFakeGhBin(binDir: string, releases: unknown[]): Promise<void> {
  const ghPath = join(binDir, "gh");
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
    const job = sectionBetween(workflow, "  windows_tools_pack_payload_tests:", "  daemon_workspace_tests:");
    const validate = sectionBetween(workflow, "  validate:", "          if [ -n \"$failures\" ]; then");

    expect(job).toContain("runs-on: windows-latest");
    expect(job).toContain("needs.change_scopes.outputs.tools_pack_tests_required == 'true'");
    expect(job).toContain("pnpm --filter @open-design/tools-pack exec vitest run tests/launcher-payload.test.ts");
    expect(validate).toContain("windows_tools_pack_payload_tests");
  });

  it("[P2] limits manual blob guard checks to changed files against main", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const blobGuard = sectionBetween(workflow, "  blob_guard:", "  nix_validation:");

    expect(blobGuard).toContain('${{ github.event_name }}" = "workflow_dispatch"');
<<<<<<< HEAD
    expect(blobGuard).toContain("git merge-base origin/main HEAD");
    expect(blobGuard).toContain('git diff --name-only --diff-filter=AMR "$base" HEAD');
=======
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
      "if: ${{ failure() && steps.needs_validation_gate.outputs.comment_created == 'true' }}",
    );

    // Consumer: a merge_group run's head_sha is the queue's synthetic merge commit, so the atom
    // binds merge_group artifacts to their producing run by run_id and skips the base-freshness
    // check (PRs ahead in the queue move the base while the run completes).
    expect(commentWorkflow).toContain('"$RUN_EVENT" = "merge_group"');
    expect(commentWorkflow).toContain('"$artifact_run_id" != "$RUN_ID"');
    expect(commentWorkflow).toContain('[ "$RUN_EVENT" != "merge_group" ] && [ "$current_base" != "$base_sha" ]');
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
          env: {
            ...process.env,
            EVENT: args.event,
            INPUT_TAG: args.inputTag ?? "",
            GITHUB_OUTPUT: outputPath,
            PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
            FAKE_GH_LOG: ghLogPath,
            FAKE_GH_STATE: args.state ?? "",
            FAKE_GH_EXIT: args.ghExit ? "1" : "0",
          },
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
        env: { ...process.env, NEXT: "0.12.1", GITHUB_OUTPUT: outputPath },
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
        env: { ...process.env, NEXT: "0.12.1", GITHUB_OUTPUT: outputPath },
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
    const workspaceUnit = sectionBetween(workflow, "  workspace_unit_tests:", "  windows_tools_pack_payload_tests:");

    expect(workspaceUnit).toContain(`if [ "\${{ needs.scopes.outputs.tools_pack_tests_required }}" = "true" ]; then
            pnpm --filter @open-design/desktop build
            pnpm --filter @open-design/desktop test
            pnpm --filter @open-design/packaged test
            pnpm --filter @open-design/tools-pack test
            if [ "\${{ needs.scopes.outputs.run_e2e_vitest }}" != "true" ]; then
              pnpm --filter @open-design/e2e test tests/packaged-launcher-update-loop.test.ts
            fi
          fi`);
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
      run_windows_tools_pack_payload_tests: true,
      tools_dev_tests_required: true,
      tools_pack_tests_required: true,
      workspace_validation_required: true,
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
  });

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

  it("[P1] includes launcher protocol in the Nix daemon workspace build", async () => {
    const flake = await readFile(flakePath, "utf8");
    const daemonWorkspaces = sectionBetween(flake, "      daemonWorkspacePaths = [", "      ];");

    expect(daemonWorkspaces).toContain('"packages/launcher-proto"');
    expect(daemonWorkspaces.indexOf('"packages/launcher-proto"')).toBeLessThan(
      daemonWorkspaces.indexOf('"apps/daemon"'),
    );
  });

  it("[P2] routes default CI through cost-sensitive runner tiers", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const runners = sectionBetween(workflow, "  runners:", "  scopes:");
    const scopes = sectionBetween(workflow, "  scopes:", "  static_gate:");
    const staticGate = sectionBetween(workflow, "  static_gate:", "  preflight:");
    const workspaceUnitTests = sectionBetween(workflow, "  workspace_unit_tests:", "  windows_tools_pack_payload_tests:");
    const webWorkspaceTests = sectionBetween(workflow, "  web_workspace_tests:", "  e2e_vitest:");
    const e2eVitest = sectionBetween(workflow, "  e2e_vitest:", "  playwright_critical:");
    const preflight = sectionBetween(workflow, "  preflight:", "  workspace_unit_tests:");
    const uiP0 = sectionBetween(workflow, "  ui_p0:", "  playwright_visual:");
    const visual = sectionBetween(workflow, "  playwright_visual:", "  validate:");

    expect(runners).toContain("runs-on: ubuntu-24.04");
    expect(runners).toContain("runs_on: ${{ steps.runners.outputs.runs_on }}");
    expect(runners).toContain("decision: ${{ steps.runners.outputs.decision }}");
    expect(runners).toContain("python3 .github/scripts/runners.py");
    expect(scopes).toContain("needs: [runners]");
    expect(scopes).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(staticGate).toContain("needs: [runners]");
    expect(staticGate).toContain("fromJSON(needs.runners.outputs.runs_on).control");
    expect(workspaceUnitTests).toContain("fromJSON(needs.runners.outputs.runs_on).workspace_unit");
    expect(workspaceUnitTests).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).workspace_unit)");
    expect(webWorkspaceTests).toContain("fromJSON(needs.runners.outputs.runs_on).js_hot");
    expect(webWorkspaceTests).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).js_hot)");
    expect(webWorkspaceTests).not.toContain('"od-persistent-ci"');
    expect(e2eVitest).toContain("fromJSON(needs.runners.outputs.runs_on).js_hot");
    expect(e2eVitest).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).js_hot)");
    expect(e2eVitest).not.toContain('"od-persistent-ci"');
    expect(preflight).toContain("fromJSON(needs.runners.outputs.runs_on).general_medium");
    expect(preflight).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).general_medium)");
    expect(uiP0).toContain("fromJSON(needs.runners.outputs.runs_on).ui_hot");
    expect(uiP0).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).ui_hot)");
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
    expect(uiP0Groups["project-workspace"].workers).toBe(1);
    expect(uiP0Groups["critical-extras"]).toEqual({
      grep: "@merge-extra",
      workers: 1,
      files: ["ui/app.test.ts"],
    });
    expect(uiP0Groups["workspace-restoration"]).toEqual({
      grep: String.raw`\[P0\]`,
      files: ["ui/app-restoration.test.ts", "ui/critical-smoke.test.ts"],
    });
    expect(workflow).not.toContain("  ui_p0_smoke:");
    expect(uiP0).toContain("run-ui-group critical-extras");
    expect(uiP0).toContain("Preserve project-runtime domain artifact");
    expect(visual).toContain("fromJSON(needs.runners.outputs.runs_on).visual_hot");
    expect(visual).toContain("toJSON(fromJSON(needs.runners.outputs.runs_on).visual_hot)");
    expect(workflow).not.toContain("needs.runners.outputs.contabo_control");
    expect(workflow).not.toContain("needs.runners.outputs.hosted_or_blacksmith");
    expect(workflow).not.toContain("needs.runners.outputs.blacksmith_default");
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

  it("[P2] keeps visual ownership and generic full UI sharding explicit", async () => {
    const playwrightConfig = await readFile(playwrightConfigPath, "utf8");
    const benchmarkWorkflow = await readFile(uiExtendedMainWorkflowPath, "utf8");
    const fullUi = benchmarkWorkflow.slice(benchmarkWorkflow.indexOf("  ui_full:"));
    const fullUiFiles = [...fullUi.matchAll(/ui\/[a-z0-9-]+\.test\.ts/g)]
      .map(([file]) => file)
      .sort();

    expect(playwrightConfig).toContain("testIgnore: 'visual-*.test.ts'");
    expect(benchmarkWorkflow).not.toContain("\n  schedule:");
    expect(benchmarkWorkflow).not.toContain("layout:");
    expect(benchmarkWorkflow).toContain("run-ui-group critical-extras");
    expect(benchmarkWorkflow).toContain("Preserve project-runtime domain artifact");
    expect(benchmarkWorkflow).toContain("--grep-invert '@merge-extra'");
    expect(benchmarkWorkflow).toContain("name: project-workspace");
    expect(fullUi).toContain("fromJSON(needs.p0_runners.outputs.runs_on).ui_hot");
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

  it("[P2] resolves CI runner profiles by mode", async () => {
    const defaultProfiles = await runRunners();
    const defaultRunsOn = runnerRunsOn(defaultProfiles);
    expect(runnerDecision(defaultProfiles)).toEqual({ schema_version: 1, mode: "default" });
    expect(Object.keys(defaultRunsOn).sort()).toEqual([
      "control",
      "general_medium",
      "js_hot",
      "ui_hot",
      "visual_hot",
      "windows_tools",
      "workspace_unit",
    ]);
    expect(defaultRunsOn.control).toEqual([
      "self-hosted",
      "Linux",
      "X64",
      "od-persistent-ci",
      "od-ci-hot-poc",
    ]);
    expect(defaultRunsOn.general_medium).toEqual(["ubuntu-24.04"]);
    expect(defaultRunsOn.workspace_unit).toEqual(["ubuntu-24.04"]);
    expect(defaultRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(defaultRunsOn.js_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(defaultRunsOn.ui_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(defaultRunsOn.visual_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(defaultProfiles).not.toHaveProperty("contabo_control");
    expect(defaultProfiles).not.toHaveProperty("hosted_or_blacksmith");
    expect(defaultProfiles).not.toHaveProperty("blacksmith_default");

    const performanceProfiles = await runRunners("performance");
    const performanceRunsOn = runnerRunsOn(performanceProfiles);
    expect(runnerDecision(performanceProfiles)).toEqual({ schema_version: 1, mode: "performance" });
    expect(performanceRunsOn.control).toEqual(["ubuntu-24.04"]);
    expect(performanceRunsOn.general_medium).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(performanceRunsOn.workspace_unit).toEqual(["ubuntu-24.04"]);
    expect(performanceRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(performanceRunsOn.js_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(performanceRunsOn.ui_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);
    expect(performanceRunsOn.visual_hot).toEqual(["blacksmith-4vcpu-ubuntu-2404"]);

    const economicProfiles = await runRunners("economic");
    const economicRunsOn = runnerRunsOn(economicProfiles);
    expect(runnerDecision(economicProfiles)).toEqual({ schema_version: 1, mode: "economic" });
    expect(economicRunsOn.control).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.general_medium).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.workspace_unit).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.windows_tools).toEqual(["windows-latest"]);
    expect(economicRunsOn.js_hot).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.ui_hot).toEqual(["ubuntu-24.04"]);
    expect(economicRunsOn.visual_hot).toEqual(["ubuntu-24.04"]);
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
>>>>>>> upstream/main
  });

  it("[P2] preserves beta linux AppImage smoke reports for platform publication", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(/- name: Build beta linux_x64\n(?:.+\n)+?(?=\n      - name: Write linux_x64 release report)/m);
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain("RELEASE_TARGET: linux_x64");
    expect(linuxBuildStep?.[0]).toContain("RELEASE_REPORT_DIR: ${{ runner.temp }}/release-report/linux_x64");
    expect(linuxBuildStep?.[0]).toContain("bash .github/workflow/scripts/release/build-platform.sh");
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
      /- name: Build release linux artifacts\n(?:.+\n)+?(?=\n      - name: Smoke release linux AppImage runtime)/m,
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
    const [releaseStableWorkflow, releaseStableScript, releasePreviewWorkflow, releaseBetaWorkflow] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
      readFile(releasePreviewWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
    ]);

    expect(releaseStableScript).toContain('const mac = channel === "nightly" ? "release-nightly" : "release-stable";');
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
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-win");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-linux");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: win_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: linux_x64");
    const betaBuildScript = await readFile(releaseBetaPosixBuildScriptPath, "utf8");
    expect(betaBuildScript).toContain("OD_PACKAGED_E2E_RELEASE_CHANNEL=beta");
    expect(betaBuildScript).toContain('OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION"');
  });

  it("[P2] lets stable release dispatch use an explicit version when ref is not a release branch", async () => {
    const [workflow, script] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("release_version:");
    expect(workflow).toContain("Required when ref is not release/vX.Y.Z");
    expect(workflow).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");

    expect(script).toContain("const stableReleaseBranchPattern = /^release\\/v(\\d+\\.\\d+\\.\\d+)$/;");
    expect(script).toContain("function resolveStableBaseVersion");
    expect(script).toContain("release-stable requires either a release/vX.Y.Z branch or OPEN_DESIGN_STABLE_VERSION");
    expect(script).toContain("OPEN_DESIGN_STABLE_VERSION ${inputVersion.value} must match release branch version");
    expect(script).toContain(
      '${stableBaseVersion.source ?? "release base"} version ${stableBaseVersion.value} must match apps/packaged/package.json version',
    );
    expect(script).not.toContain("release-stable can only run from release/vX.Y.Z branches");
  });

  it("[P2] rejects stable release runs without a release branch or explicit version", async () => {
    const output = await runReleaseStableForFailure({
      GITHUB_REF_NAME: "main",
      OPEN_DESIGN_STABLE_VERSION: "",
    });

    expect(output).toContain("release-stable requires either a release/vX.Y.Z branch or OPEN_DESIGN_STABLE_VERSION");
  });

  it("[P2] rejects conflicting stable release branch and explicit version inputs", async () => {
    const output = await runReleaseStableForFailure({
      GITHUB_REF_NAME: "release/v0.10.0",
      OPEN_DESIGN_STABLE_VERSION: "0.10.1",
    });

    expect(output).toContain("OPEN_DESIGN_STABLE_VERSION 0.10.1 must match release branch version 0.10.0");
  });

  it("[P2] supports release dry-run preflight without build or publish side effects", async () => {
    const [workflow, script] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("Validate release inputs and read-only remote gates without building or publishing.");
    expect(workflow).toContain(
      "group: open-design-release-stable-${{ inputs.channel }}-${{ inputs.dry_run && 'dry-run' || 'publish' }}",
    );
    expect(workflow).toContain("OPEN_DESIGN_RELEASE_DRY_RUN: ${{ inputs.dry_run }}");
    expect(workflow).toContain("dry_run: ${{ steps.stable.outputs.dry_run }}");
    expect(workflow).toContain("if: ${{ steps.stable.outputs.dry_run != 'true' }}");
    expect(workflow).toContain("if: ${{ needs.metadata.outputs.dry_run != 'true' }}");
    expect(workflow).toContain("needs.metadata.outputs.dry_run != 'true' &&");

    expect(script).toContain("function parseBooleanInput");
    expect(script).toContain('parseBooleanInput(process.env.OPEN_DESIGN_RELEASE_DRY_RUN, "OPEN_DESIGN_RELEASE_DRY_RUN")');
    expect(script).toContain('setOutput("dry_run", dryRun ? "true" : "false");');
  });

  it("[P2] validates stable dry-run nightly metadata from a non-release ref", async () => {
    const objects: Record<string, unknown> = {};
    const fixture = await startStableNightlyMetadataServer(objects);
    objects["nightly/versions/0.10.0.nightly.12/metadata.json"] = stableNightlyMetadataFixture(
      "0.10.0",
      "0.10.0.nightly.12",
      fixture.origin,
    );
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-stable-dry-run-"));

    try {
      await mkdir(join(runnerTemp, "bin"), { recursive: true });
      await writeFakeGhBin(join(runnerTemp, "bin"), []);

      const result = await execFileAsync(process.execPath, ["--experimental-strip-types", releaseStableScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          GITHUB_REF_NAME: "main",
          GITHUB_REPOSITORY: "nexu-io/open-design",
          GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          OPEN_DESIGN_RELEASE_CHANNEL: "stable",
          OPEN_DESIGN_RELEASE_DRY_RUN: "true",
          OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: fixture.origin,
          OPEN_DESIGN_STABLE_NIGHTLY_VERSION: "0.10.0.nightly.12",
          OPEN_DESIGN_STABLE_VERSION: "0.10.0",
          PATH: `${join(runnerTemp, "bin")}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.stdout).toContain("[release-stable] validated nightly: 0.10.0.nightly.12");
      expect(result.stdout).toContain("[release-stable] channel: stable");
      expect(result.stdout).toContain("[release-stable] dry run: true");
      expect(result.stdout).toContain("[release-stable] version tag: open-design-v0.10.0");
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

    expect(output).toContain("OPEN_DESIGN_RELEASE_DRY_RUN must be true or false; got maybe");
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
      expect(workflow).toContain(".github/workflow/scripts/release/storage/publish-platform.ts");
      expect(workflow).toContain(".github/workflow/scripts/release/storage/publish-metadata.ts");
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

  it("publishes release-beta mac_x64 payloads while preserving the zip feed", async () => {
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
    expect(workflow).toContain("name: Prepare beta metadata");
    expect(workflow).toContain("OPEN_DESIGN_BETA_METADATA_URL: ${{ inputs.release_public_origin }}/beta/latest/metadata.json");
    expect(workflow).toContain("OPEN_DESIGN_STABLE_METADATA_URL: https://releases.open-design.ai/stable/latest/metadata.json");
    expect(workflow).toContain('repo_dir="$PWD/_release-metadata"');
    expect(workflow).toContain("--filter=blob:none --depth=1");
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain("working-directory: _release-metadata");
    expect(workflow).toContain("apps/packaged/package.json");
    expect(workflow).toContain("scripts/release-beta.ts");
    expect(workflow).not.toContain('git fetch --force --depth=1 origin "+refs/tags/open-design-v*:refs/tags/open-design-v*"');
    expect(workflow).toContain("release-beta-s requires at least one target to be enabled");
    expect(workflow).toContain("beta_version: ${{ inputs.publish && steps.reserve.outputs.beta_version || inputs.release_version != '' && inputs.release_version || steps.beta.outputs.beta_version }}");
    expect(workflow).toContain("if: ${{ inputs.publish }}");
    expect(workflow).toContain("Reject unsupported self-hosted mac_x64");
    expect(workflow).toContain("Reject unsupported self-hosted linux_x64");
    expect(workflow).toContain("name: Probe Windows signing capability");
    expect(workflow).toContain("probe-win-signing.ps1");
    expect(workflow).toContain("needs: metadata");
    expect(workflow).toContain('-ReleaseTarget win_x64');
    expect(workflow).toContain('-ReleaseVersion "${{ needs.metadata.outputs.beta_version }}"');
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
    expect(workflow).toContain(".github\\workflow\\scripts\\release\\storage\\publish-platform.ts");
    expect(workflow).toContain("Write win_x64 release report");
    expect(workflow).toContain("RELEASE_REPORT_DIR: C:\\.tmp\\runner\\od-beta\\win_x64\\release-report\\win_x64");
    expect(posixBuildScript).toContain('OD_PACKAGED_E2E_MAC_SMOKE_PROFILE="$RELEASE_SMOKE_MODE"');
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64, nexu-mac, release-beta]");
    expect(workflow).toContain("path: _release-build");
    expect(workflow).toContain("working-directory: _release-build");
    expect(workflow).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(workflow).toContain("MAC_TOOLS_PACK_CACHE_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack-cache");
    expect(workflow).toContain("MAC_TOOLS_PACK_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack");
    expect(workflow).toContain("TOOLS_PACK_CACHE_DIR: ${{ env.MAC_TOOLS_PACK_CACHE_DIR }}");
    expect(workflow).toContain("TOOLS_PACK_DIR: ${{ env.MAC_TOOLS_PACK_DIR }}");
    expect(workflow).toContain("Write mac_arm64 release report");
    expect(workflow).toContain("fnm exec --using=24 -- node --experimental-strip-types .github/workflow/scripts/release/report/write-report.ts");
    expect(workflow).toContain("Prepare mac_arm64 assets");
    expect(workflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(workflow).toContain("RELEASE_SIGNED: ${{ (inputs.mac_arm64_delivery_mode == 'internal-updater' || inputs.mac_arm64_sign_mode != 'no') && 'true' || 'false' }}");
    expect(workflow).toContain("RELEASE_REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac_arm64-report.zip");
    expect(workflow).toContain("name: Publish beta metadata to Nexu S3");
    expect(workflow).toContain("Download mac_arm64 platform manifest");
    expect(workflow).toContain("Download win_x64 platform manifest");
    expect(workflow).toContain('manifest_url="${RELEASE_PUBLIC_ORIGIN%/}/beta/versions/${RELEASE_VERSION}${RELEASE_ASSET_SUFFIX}/platforms/${RELEASE_TARGET}.json"');
    expect(workflow).toContain('curl -fsSL "$manifest_url" -o "$RELEASE_MANIFEST_DIR/$RELEASE_TARGET.json"');
    expect(workflow).toContain(".github/workflow/scripts/release/storage/publish-metadata.ts");
    expect(workflow).toContain("RELEASE_ASSET_SUFFIX: auto");
    expect(workflow).toContain("RELEASE_MANIFEST_DIR: ${{ runner.temp }}/release-platform-manifests");
    expect(workflow).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(workflow).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(workflow).not.toContain("open-design-beta-s-win-x64-publish-manifest");
    expect(workflow).not.toContain("open-design-beta-s-mac-arm64-publish-manifest");
    expect(workflow).toContain('STATE_SOURCE: ${{ needs.metadata.outputs.state_source }}');
    expect(workflow).toContain("Verify beta metadata");
    expect(workflow).toContain(".github/workflow/scripts/release/storage/verify-metadata.ts");
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-win-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "win_x64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
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
              url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/latest.yml",
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
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-payload-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              dmg: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64.dmg",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip.sha256",
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-mac-arm64-payload.zip",
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
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
              },
              payload: {
                sha256Url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z.sha256",
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-payload.7z",
              },
            },
            channel: "beta",
            feed: {
              name: "latest.yml",
              url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/latest.yml",
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

    expect(workflow).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(workflow).toContain('& "C:\\Users\\runner\\.cargo\\bin\\fnm.exe" exec --using=24 -- pwsh -NoProfile -File .\\.github\\workflow\\scripts\\release\\build-platform.ps1');
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
  channel: "beta" | "preview",
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

function expectReleaseLinuxBuildPreservesEvidence(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Smoke .+ linux AppImage runtime)`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain('report_dir="$RUNNER_TEMP/release-report/linux"');
  expect(step).toContain('mkdir -p "$report_dir"');
  expect(step).toContain('build_json_path="$report_dir/tools-pack.json"');
  expect(step).toContain('build_log_path="$report_dir/tools-pack.log"');
  expect(step).toContain('printf \'%s\\n\' "$build_output" | tee "$build_json_path"');
}

function expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Upload linux e2e spec report)`, "m"))?.[0];
  expect(step).toBeDefined();
  const aptIndex = step?.indexOf("sudo apt-get update") ?? -1;
  const reportDirIndex = step?.indexOf('report_dir="$RUNNER_TEMP/release-report/linux"') ?? -1;

  expect(aptIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeLessThan(aptIndex);
}

async function startStableNightlyMetadataServer(objects: Record<string, unknown>): Promise<{
  close: () => Promise<void>;
  origin: string;
}> {
  const server = createHttpsServer(
    {
      cert: stableNightlyMetadataCert,
      key: stableNightlyMetadataKey,
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
    throw new Error("stable nightly metadata server did not bind to a TCP port");
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      }),
    origin: `https://127.0.0.1:${address.port}`,
  };
}

function stableNightlyMetadataFixture(baseVersion: string, nightlyVersion: string, publicOrigin: string): Record<string, unknown> {
  const versionPrefix = `nightly/versions/${nightlyVersion}`;
  const versionUrl = `${publicOrigin}/${versionPrefix}`;
  const artifact = (name: string) => ({
    sha256Url: `${versionUrl}/${name}.sha256`,
    url: `${versionUrl}/${name}`,
  });

  return {
    baseVersion,
    channel: "nightly",
    github: {
      branch: `release/v${baseVersion}`,
      commit: "0123456789abcdef0123456789abcdef01234567",
      repository: "nexu-io/open-design",
      workflow: "release-stable",
    },
    nightlyNumber: 12,
    nightlyVersion,
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
    releaseVersion: nightlyVersion,
    signed: true,
    stableVersion: baseVersion,
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

const stableNightlyMetadataKey = `-----BEGIN PRIVATE KEY-----
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

const stableNightlyMetadataCert = `-----BEGIN CERTIFICATE-----
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
