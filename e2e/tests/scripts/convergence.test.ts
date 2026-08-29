import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const convergenceScript = path.join(repoRoot, ".github/scripts/convergence.py");
const temporaryRoots: string[] = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "convergence-contract-"));
  temporaryRoots.push(root);
  for (const [name, content] of [["control.txt", "control"], ["a.txt", "a"], ["b.txt", "b"]] as const) {
    writeFileSync(path.join(root, name), content);
  }
  const configPath = path.join(root, "convergence.json");
  writeFileSync(configPath, JSON.stringify({
    schema: { version: 1 },
    suites: { "convergence-control": ["control.txt"], web: ["a.txt"] },
    workflows: {
      ci: {
        policy: "test-v1",
        workloads: {
          a: { inputs: ["suite://web"], runnerClass: "worker", products: "none", reusable: true },
          b: { inputs: ["suite://web", "b.txt"], runnerClass: "worker", products: "none", reusable: true },
        },
      },
    },
  }));
  const scopePlanPath = path.join(root, "scope-plan.json");
  writeFileSync(scopePlanPath, JSON.stringify({ enabled: { a: true, b: true } }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: root });
  return { root, configPath, scopePlanPath, pendingPath: path.join(root, "pending.json") };
}

function runPlan(fixture: ReturnType<typeof createRepository>, runner = ["ubuntu-24.04"]) {
  const outputPath = path.join(fixture.root, "github-output.txt");
  writeFileSync(outputPath, "");
  const stdout = execFileSync("python3", [
    convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
    "github-output", "--workflow", "ci", "--scope-plan", fixture.scopePlanPath,
    "--runner-plan-json", JSON.stringify({ worker: runner }), "--repository-id", "42",
    "--repository", "example/repo", "--mode", "shadow", "--pending", fixture.pendingPath,
  ], { cwd: fixture.root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outputPath } });
  return {
    decision: JSON.parse(stdout) as { run: Record<string, boolean>; hit: Record<string, boolean> },
    pending: JSON.parse(readFileSync(fixture.pendingPath, "utf8")) as {
      workloads: Record<string, { digest: string; wouldRun: boolean }>;
    },
  };
}

function workload(
  plan: ReturnType<typeof runPlan>["pending"]["workloads"],
  name: string,
) {
  const result = plan[name];
  if (!result) throw new Error(`missing workload ${name}`);
  return result;
}

function candidate(products: Record<string, unknown>) {
  const digest = "d".repeat(64);
  const provenance = {
    event: "pull_request", runId: 12, runAttempt: 1,
    headSha: "a".repeat(40), baseSha: "b".repeat(40), treeSha: "c".repeat(40),
    validatedAt: "2026-08-21T00:00:00Z",
  };
  return {
    schemaVersion: 1,
    protocol: "nexu-workload-result-v1",
    repositoryId: 42,
    repository: "example/repo",
    workflow: "ci",
    policy: "test-v1",
    provenance,
    results: [{
      key: `workload-results/v1/repos/42/workflows/ci/policies/test-v1/workloads/a/digests/${digest}.json`,
      receipt: {
        schemaVersion: 1, protocol: "nexu-workload-result-v1", repositoryId: 42,
        workflow: "ci", policy: "test-v1", workload: "a", digest,
        executionClass: { runnerClass: "worker", labels: ["ubuntu-24.04"] }, products, validated: provenance,
      },
    }],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workload convergence", () => {
  test("keeps shadow coverage while calculating stable workload identities", () => {
    const fixture = createRepository();
    const first = runPlan(fixture);
    const second = runPlan(fixture);
    expect(first.decision.run).toEqual({ a: true, b: true });
    expect(first.decision.hit).toEqual({ a: false, b: false });
    expect(workload(second.pending.workloads, "a").digest).toBe(workload(first.pending.workloads, "a").digest);
    expect(workload(second.pending.workloads, "b").digest).toBe(workload(first.pending.workloads, "b").digest);
  });

  test("composes suites without coupling unrelated workload inputs", () => {
    const fixture = createRepository();
    const before = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "b.txt"), "b2");
    execFileSync("git", ["add", "b.txt"], { cwd: fixture.root });
    const afterB = runPlan(fixture).pending.workloads;
    expect(workload(afterB, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(afterB, "b").digest).not.toBe(workload(before, "b").digest);

    writeFileSync(path.join(fixture.root, "a.txt"), "a2");
    execFileSync("git", ["add", "a.txt"], { cwd: fixture.root });
    const afterA = runPlan(fixture).pending.workloads;
    expect(workload(afterA, "a").digest).not.toBe(workload(afterB, "a").digest);
    expect(workload(afterA, "b").digest).not.toBe(workload(afterB, "b").digest);
  });

  test("includes the execution class in the reusable-result digest", () => {
    const fixture = createRepository();
    const hostedPlan = runPlan(fixture, ["ubuntu-24.04"]).pending.workloads;
    const arcPlan = runPlan(fixture, ["nexu-runners-medium"]).pending.workloads;
    const hosted = workload(hostedPlan, "a").digest;
    const arc = workload(arcPlan, "a").digest;
    expect(arc).not.toBe(hosted);
  });

  test("keeps broad test workloads on tracked-tree inputs until their closure is proven", () => {
    const config = JSON.parse(readFileSync(
      path.join(repoRoot, ".github", "config", "convergence.json"),
      "utf8",
    )) as any;

    expect(config.workflows.ci.workloads.daemon_unit_tests.inputs).toEqual(["*"]);
    expect(config.workflows.ci.workloads.e2e_vitest.inputs).toEqual(["*"]);
  });

  test("materializes the convergence handoff from the GitHub event context", () => {
    const fixture = createRepository();
    runPlan(fixture);
    const eventPath = path.join(fixture.root, "event.json");
    const outputPath = path.join(fixture.root, "handoff-output.txt");
    const handoffRoot = path.join(fixture.root, "handoff-root");
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture.root, encoding: "utf8" }).trim();
    writeFileSync(eventPath, JSON.stringify({
      repository: { id: 42, full_name: "example/repo" },
      pull_request: { head: { sha: headSha }, base: { sha: headSha } },
    }));
    writeFileSync(outputPath, "");
    execFileSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
      "handoff", "--pending", fixture.pendingPath,
      "--products-root", path.join(fixture.root, "products"),
      "--handoff-root", handoffRoot,
    ], {
      cwd: fixture.root,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "example/repo",
        GITHUB_REPOSITORY_ID: "42",
        GITHUB_RUN_ID: "12",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_OUTPUT: outputPath,
      },
    });
    const metadata = JSON.parse(readFileSync(
      path.join(handoffRoot, "handoff", "convergence", "ci-results", "metadata.json"),
      "utf8",
    )) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      repository_id: 42, repository: "example/repo", workflow: "ci", policy: "test-v1",
      event: "pull_request", run_id: 12, run_attempt: 1, head_sha: headSha,
    });
    expect(readFileSync(outputPath, "utf8")).toContain("name=handoff-convergence-ci-results");

    writeFileSync(eventPath, JSON.stringify({
      repository: { id: 42, full_name: "example/repo" },
      workflow_run: {
        id: 12, run_attempt: 1, name: "ci", event: "pull_request", head_sha: headSha,
        head_repository: { full_name: "example/repo" },
      },
    }));
    writeFileSync(outputPath, "");
    execFileSync("git", ["remote", "add", "origin", fixture.root], { cwd: fixture.root });
    execFileSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
      "admit", "--handoff-root", handoffRoot,
    ], {
      cwd: fixture.root,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    });
    expect(readFileSync(outputPath, "utf8")).toContain("publish=true");
  });

  test("rejects dependency cycles and dangling suites before planning", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8")) as any;
    config.suites.web = ["suite://web"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const cycle = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath, "validate",
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(cycle.status).toBe(2);
    expect(cycle.stderr).toContain("convergence dependency cycle");

    config.suites.web = ["suite://missing"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const dangling = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath, "validate",
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(dangling.status).toBe(2);
    expect(dangling.stderr).toContain("references unknown suite://missing");
  });

  test("publishes a multi-product manifest atomically only after every product is a URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "convergence-products-"));
    temporaryRoots.push(root);
    const candidatePath = path.join(root, "candidate.json");
    writeFileSync(candidatePath, JSON.stringify(candidate({
      bundle: { type: "url", source: "https://results.example/bundle.zip", data: { sha256: "a".repeat(64) } },
      report: { type: "url", source: "https://results.example/report.json" },
    })));
    execFileSync("python3", [
      convergenceScript, "prepare-publication", "--candidate", candidatePath,
      "--output-dir", path.join(root, "receipts"),
    ], { cwd: repoRoot });

    writeFileSync(candidatePath, JSON.stringify(candidate({
      bundle: { type: "job", source: "build-products" },
      report: { type: "url", source: "https://results.example/report.json" },
    })));
    const rejected = spawnSync("python3", [
      convergenceScript, "prepare-publication", "--candidate", candidatePath,
      "--output-dir", path.join(root, "rejected"),
    ], { cwd: repoRoot, encoding: "utf8" });
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain("must be promoted to url before publication");
  });
});
