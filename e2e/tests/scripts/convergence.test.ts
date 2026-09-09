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
    schema: { version: 2 },
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
  test("pins the schema 2 identity algorithm independently of Git and platform", () => {
    const digest = execFileSync("python3", ["-c", [
      "import sys", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, WorkflowContract, GitFingerprinter, calculate",
      "c=ConvergenceContract.__new__(ConvergenceContract)",
      "c.schema_version=2",
      "c.suites={'source':['a.txt']}",
      "c.workflows={'example':WorkflowContract('example',{'policy':'v1','workloads':{'unit':{'inputs':['suite://source'],'runnerClass':'worker','products':'none','reusable':True}}})}",
      "with patch.object(GitFingerprinter,'records',return_value=[('a.txt','100644','a'*40,'0')]):",
      " before=calculate(c,Path('.'),'example',{'worker':['ubuntu-24.04']})['unit']['digest']",
      " c.schema_version=3",
      " assert calculate(c,Path('.'),'example',{'worker':['ubuntu-24.04']})['unit']['digest'] != before",
      " print(before)",
    ].join("\n"), path.dirname(convergenceScript)], { encoding: "utf8" }).trim();
    expect(digest).toBe("2e88f86aa13f43b0036a6f5c30d95becb0388d205f4ae51189bba9096c5cf28e");
  });

  test("isolates admission files and unrelated config while retaining versioned execution semantics", () => {
    const fixture = createRepository();
    const before = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "control.txt"), "notification-only workflow change");
    execFileSync("git", ["add", "control.txt"], { cwd: fixture.root });
    expect(runPlan(fixture).pending.workloads).toEqual(before);
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.parameters = { command: "test:new" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const changed = runPlan(fixture).pending.workloads;
    expect(workload(changed, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(changed, "b").digest).not.toBe(workload(before, "b").digest);
    config.workflows.ci.workloads.b.inputs.reverse();
    writeFileSync(fixture.configPath, JSON.stringify(config, null, 4));
    expect(runPlan(fixture).pending.workloads).toEqual(changed);
    for (const version of [1, 3, true]) {
      config.schema.version = version;
      writeFileSync(fixture.configPath, JSON.stringify(config));
      const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("schema.version 2");
    }
  });

  test("admits manual bootstrap only for the pinned successful same-repository exact run", () => {
    const code = `
import copy, os, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
sha = 'a' * 40
branch = 'feat/electron-shell-exact-delivery'
payload = {'repository': {'id': 42, 'full_name': 'nexu-io/open-design'},
           'inputs': {'trusted_sha': sha, 'producer_run_id': '12'}}
run = {'id': 12, 'name': 'release-exact', 'event': 'workflow_dispatch',
       'path': '.github/workflows/release-exact.yml', 'status': 'completed',
       'conclusion': 'success', 'head_branch': branch, 'head_sha': sha,
       'head_repository': {'full_name': 'nexu-io/open-design'}}
env = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/' + branch, 'GITHUB_SHA': sha}
with patch.dict(os.environ, env), patch.object(c, 'event_payload', return_value=payload), patch.object(c.subprocess, 'check_output', return_value=sha):
    with patch.object(c, 'api_json', return_value=run) as api:
        assert c.admitted_source()['workflow_run'] == run
        api.assert_called_once_with('/repos/nexu-io/open-design/actions/runs/12')
    for key, value in [('id', 13), ('name', 'release-stable'), ('event', 'pull_request'),
                       ('path', '.github/workflows/other.yml'), ('status', 'in_progress'),
                       ('conclusion', 'failure'), ('head_branch', 'main'), ('head_sha', 'b' * 40),
                       ('head_repository', {'full_name': 'fork/open-design'})]:
        invalid = copy.deepcopy(run)
        invalid[key] = value
        with patch.object(c, 'api_json', return_value=invalid):
            try: c.admitted_source()
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid ' + key)
    for key, value in [('GITHUB_REF', 'refs/heads/main'), ('GITHUB_SHA', 'b' * 40)]:
        with patch.dict(os.environ, {key: value}), patch.object(c, 'api_json') as api:
            try: c.admitted_source()
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid ' + key)
            api.assert_not_called()
    with patch.object(c.subprocess, 'check_output', return_value='b' * 40):
        try: c.admitted_source()
        except c.ConfigError: pass
        else: raise AssertionError('accepted mismatched checkout')
print('manual admission verified')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript)], { encoding: "utf8" }))
      .toContain("manual admission verified");
  });

  test("projects a mixed batch without leaking identities or changing independent decisions", () => {
    const fixture = createRepository();
    const code = `
import json, sys
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
from convergence import batch_inputs, ConfigError
workflow = SimpleNamespace(execution={
  'matrices': {'items': {'include': [{'workload': 'a', 'name': 'first'}, {'workload': 'b', 'name': 'second'}]}},
  'batches': {'data': {'matrix': 'items', 'fields': {'id': 'name'}, 'product': 'resource'}}})
pending = {'workloads': {
  'a': {'scopeEnabled': True, 'run': True, 'resultHit': False},
  'b': {'scopeEnabled': True, 'run': False, 'resultHit': True, 'result': {'products': {
    'resource': {'type': 'url', 'source': 'https://cache.example/blob.zip', 'data': {'sha256': 'a' * 64}}}}}}}
print(json.dumps(batch_inputs(workflow, pending)))
pending['workloads']['b']['resultHit'] = False
try:
  batch_inputs(workflow, pending)
except ConfigError:
  pass
else:
  raise AssertionError('missing artifact must not fall back to undeclared execution')
`;
    const result = execFileSync("python3", ["-c", code, path.dirname(convergenceScript)], { encoding: "utf8" });
    expect(JSON.parse(result)).toEqual({ data: [{ id: "first" }, { id: "second", artifact: { url: "https://cache.example/blob.zip", sha256: "a".repeat(64) } }] });
  });

  test("bootstraps a tool from a verified blob without Node or workspace dependencies", () => {
    const fixture = createRepository();
    const script = `
import argparse, hashlib, io, json, sys, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from convergence import acquire_command, ConfigError
root = Path(sys.argv[2])
for scenario in ('valid', 'digest', 'traversal', 'symlink', 'duplicate', 'existing', 'http'):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        name = '../escape' if scenario == 'traversal' else 'tools-release'
        info = zipfile.ZipInfo(name)
        info.external_attr = (0o120777 if scenario == 'symlink' else 0o100755) << 16
        archive.writestr(info, b'portable tool')
        if scenario == 'duplicate': archive.writestr('TOOLS-RELEASE', b'duplicate')
    body = buffer.getvalue()
    descriptor = root / (scenario + '.json')
    descriptor.write_text(json.dumps({'url': ('http' if scenario == 'http' else 'https') + '://cache.example/tool.zip',
        'sha256': '0' * 64 if scenario == 'digest' else hashlib.sha256(body).hexdigest()}))
    output = root / scenario
    if scenario == 'existing':
        output.mkdir()
        (output / 'keep').write_text('preserved')
    response = io.BytesIO(body)
    response.status = 200
    with patch('convergence.urllib.request.build_opener') as opener:
        opener.return_value.open.return_value = response
        if scenario == 'valid':
            assert acquire_command(argparse.Namespace(descriptor=descriptor, output=output)) == 0
            assert (output / 'tools-release').read_bytes() == b'portable tool'
        else:
            try: acquire_command(argparse.Namespace(descriptor=descriptor, output=output))
            except ConfigError: pass
            else: raise AssertionError('accepted ' + scenario)
            if scenario == 'existing': assert (output / 'keep').read_text() == 'preserved'
            else: assert not output.exists()
    assert not list(root.glob('.tool-artifact-*'))
assert not (root / 'escape').exists()
`;
    execFileSync("python3", ["-c", script, path.dirname(convergenceScript), fixture.root]);
  });

  test("projects execution declarations using only Python and the workflow JSON", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    const execution = {
      enabled: ["a"], runners: { worker: ["ubuntu-24.04"] },
      matrices: { tool_matrix: { include: [{ workload: "a", target: "neutral", runs_on: "ubuntu-24.04" }] } },
      inputs: { shells: { shells: [{ shell: "electron", target: "darwin-arm64" }] } },
    };
    config.workflows.ci.execution = execution;
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const output = path.join(fixture.root, "execution"), githubOutput = path.join(fixture.root, "outputs");
    const args = [convergenceScript, "--config", fixture.configPath, "execution", "--workflow", "ci",
      "--output", output, "--github-output", githubOutput];
    execFileSync("python3", args, { cwd: fixture.root });
    expect(JSON.parse(readFileSync(path.join(output, "scope.json"), "utf8"))).toEqual({ enabled: { a: true, b: false } });
    expect(JSON.parse(readFileSync(path.join(output, "runners.json"), "utf8"))).toEqual(execution.runners);
    expect(JSON.parse(readFileSync(path.join(output, "matrices.json"), "utf8"))).toEqual(execution.matrices);
    expect(JSON.parse(readFileSync(path.join(output, "inputs/shells.json"), "utf8"))).toEqual(execution.inputs.shells);
    expect(readFileSync(githubOutput, "utf8")).toBe(`tool_matrix=${JSON.stringify(execution.matrices.tool_matrix)}\n`);
    config.workflows.ci.workloads.a.parameters = { target: "neutral", postinstall_level: "fixture" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    execFileSync("python3", args, { cwd: fixture.root });
    expect(JSON.parse(readFileSync(path.join(output, "matrices.json"), "utf8")).tool_matrix.include[0])
      .toMatchObject({ target: "neutral", postinstall_level: "fixture" });
    for (const mutate of [
      (value: any) => { value.enabled.push("unknown"); },
      (value: any) => { value.runners.worker = []; },
      (value: any) => { value.matrices["invalid\noutput"] = { include: [] }; },
      (value: any) => { value.matrices.tool_matrix.include = [null]; },
      (value: any) => { value.matrices.tool_matrix.include[0].target = "drift"; },
    ]) {
      const invalid = structuredClone(config);
      mutate(invalid.workflows.ci.execution);
      writeFileSync(fixture.configPath, JSON.stringify(invalid));
      expect(spawnSync("python3", args).status).not.toBe(0);
    }
    config.workflows.ci.workloads.a.dependsOn = ["b"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("disabled workload");
  });

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

  test("owns dependency identity and target parameters in Python without executor hashes", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.inputs = ["b.txt"];
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    config.workflows.ci.workloads.a.parameters = { target: "darwin-arm64" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const first = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "a.txt"), "changed producer");
    execFileSync("git", ["add", "a.txt"], { cwd: fixture.root });
    const changedSource = runPlan(fixture).pending.workloads;
    expect(workload(changedSource, "a").digest).not.toBe(workload(first, "a").digest);
    expect(workload(changedSource, "b").digest).not.toBe(workload(first, "b").digest);
    config.workflows.ci.workloads.a.parameters.target = "win32-x64";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const changedTarget = runPlan(fixture).pending.workloads;
    expect(workload(changedTarget, "b").digest).not.toBe(workload(changedSource, "b").digest);
    config.workflows.ci.workloads = Object.fromEntries(Object.entries(config.workflows.ci.workloads).reverse());
    writeFileSync(fixture.configPath, JSON.stringify(config));
    expect(runPlan(fixture).pending.workloads).toEqual(changedTarget);
  });

  test("rejects invalid dependency graphs before scheduling work", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    for (const dependencies of [["missing"], ["a"], ["b", "b"]]) {
      config.workflows.ci.workloads.a.dependsOn = dependencies;
      writeFileSync(fixture.configPath, JSON.stringify(config));
      const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/unknown dependency|dependency cycle|duplicates/u);
    }
    config.workflows.ci.workloads.a.dependsOn = ["b"];
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dependency cycle");
  });

  test("requires missing producer inputs without rebuilding dependencies of a cached consumer", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const decisions = JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "from pathlib import Path", "sys.path.insert(0, sys.argv[1])",
      "from convergence import ConvergenceContract, required_workloads, execution_decisions",
      "workflow = ConvergenceContract(Path(sys.argv[2])).workflow('ci')",
      "enabled = {'a': False, 'b': True}",
      "def resolve(hits, mode):",
      "    required = required_workloads(workflow, enabled, hits, mode)",
      "    return {'required': required, 'run': execution_decisions(required, hits, mode)[0]}",
      "print(json.dumps([resolve({'a': a, 'b': b}, mode) for a, b, mode in [(False, False, 'enforce'), (True, False, 'enforce'), (False, True, 'enforce'), (True, True, 'shadow')]]))",
    ].join("\n"), path.dirname(convergenceScript), fixture.configPath], { encoding: "utf8" }));
    expect(decisions).toEqual([
      { required: { a: true, b: true }, run: { a: true, b: true } },
      { required: { a: true, b: true }, run: { a: false, b: true } },
      { required: { a: false, b: true }, run: { a: false, b: false } },
      { required: { a: true, b: true }, run: { a: true, b: true } },
    ]);
  });

  test("binds opaque job artifacts without asking the executor to handle plan metadata", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.a.products = "manifest";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const plan = runPlan(fixture);
    const output = path.join(fixture.root, "products");
    const args = [convergenceScript, "--config", fixture.configPath, "contribute",
      "--pending", fixture.pendingPath, "--workload", "a", "--product", "capsule",
      "--artifact", "capsule-output", "--output", output];
    execFileSync("python3", args, { encoding: "utf8" });
    expect(JSON.parse(readFileSync(path.join(output, "a/product-manifest.json"), "utf8"))).toEqual({
      workload: "a", digest: workload(plan.pending.workloads, "a").digest,
      executionClass: { runnerClass: "worker", labels: ["ubuntu-24.04"] },
      products: { capsule: { type: "job", source: "capsule-output" } },
    });
    const pending = JSON.parse(readFileSync(fixture.pendingPath, "utf8"));
    pending.workloads.a.run = false;
    pending.workloads.a.resultHit = true;
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("selected execution");
  });

  test("binds declared artifacts in one control-plane batch and excludes cache hits", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    for (const id of ["a", "b"]) {
      config.workflows.ci.workloads[id].products = "manifest";
      config.workflows.ci.workloads[id].artifact = { product: "tool", prefix: `tool-${id}` };
    }
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const first = runPlan(fixture);
    config.workflows.ci.workloads.a.artifact.prefix = "renamed-tool";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const second = runPlan(fixture);
    expect(second.pending.workloads.a!.digest).not.toBe(first.pending.workloads.a!.digest);
    expect(second.pending.workloads.b!.digest).toBe(first.pending.workloads.b!.digest);
    const pending = JSON.parse(readFileSync(fixture.pendingPath, "utf8"));
    pending.workloads.b.run = false;
    pending.workloads.b.resultHit = true;
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const output = path.join(fixture.root, "products");
    const args = [convergenceScript, "--config", fixture.configPath, "contribute-all",
      "--pending", fixture.pendingPath, "--source-commit", "a".repeat(40), "--output", output];
    execFileSync("python3", args);
    expect(JSON.parse(readFileSync(path.join(output, "a/product-manifest.json"), "utf8")).products)
      .toEqual({ tool: { type: "job", source: "renamed-tool-" + "a".repeat(40) } });
    expect(() => readFileSync(path.join(output, "b/product-manifest.json"))).toThrow();
    expect(spawnSync("python3", args.map(arg => arg === "a".repeat(40) ? "short" : arg)).status).not.toBe(0);
    pending.workloads.a.run = false;
    pending.policy = "stale";
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("contract differs");
  });

  test("projects only exact artifact bindings to consumers, never cache decisions or workload identities", () => {
    const result = JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "sys.path.insert(0, sys.argv[1])",
      "from convergence import product_inputs",
      "entry = {'scopeEnabled': True, 'run': False, 'resultHit': True, 'digest': 'planner-only', 'result': {'products': {'capsule': {'type': 'url', 'source': 'https://cache.invalid/capsule.zip', 'data': {'sha256': 'a' * 64}}}}}",
      "pending = {'workloads': {'capsule': entry, 'disabled': {**entry, 'scopeEnabled': False}, 'executing': {**entry, 'run': True}}}",
      "print(json.dumps(product_inputs(pending)))",
    ].join("\n"), path.dirname(convergenceScript)], { encoding: "utf8" }));
    expect(result).toEqual({ "capsule/capsule": { url: "https://cache.invalid/capsule.zip", sha256: "a".repeat(64) } });
  });

  test("isolates atomic workflow policy changes through the actual calculator", () => {
    const fixture = createRepository();
    const original = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    const lanes = ["release-exact", "release-prerelease", "release-stable"];
    for (const name of lanes) {
      const declaration = {
        schema: original.schema,
        suites: { ...original.suites, "convergence-control": ["control.txt", `${name}.json`] },
        workflows: { [name]: original.workflows.ci },
      };
      writeFileSync(path.join(fixture.root, `${name}.json`), JSON.stringify(declaration));
    }
    execFileSync("git", ["add", "."], { cwd: fixture.root });
    const calculate = () => JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "from pathlib import Path", "sys.path.insert(0, sys.argv[1])",
      "from convergence import ConvergenceContract, calculate",
      "root = Path(sys.argv[2])",
      "print(json.dumps({name: calculate(ConvergenceContract(root / (name + '.json')), root, name, {'worker': ['fixture']}) for name in sys.argv[3:]}))",
    ].join("\n"), path.dirname(convergenceScript), fixture.root, ...lanes], { encoding: "utf8" }));
    const before = calculate();
    const changedPath = path.join(fixture.root, "release-exact.json");
    const changed = JSON.parse(readFileSync(changedPath, "utf8"));
    changed.workflows["release-exact"].policy = "test-v2";
    writeFileSync(changedPath, JSON.stringify(changed));
    execFileSync("git", ["add", "release-exact.json"], { cwd: fixture.root });
    const after = calculate();
    expect(after["release-exact"]).not.toEqual(before["release-exact"]);
    expect(after["release-prerelease"]).toEqual(before["release-prerelease"]);
    expect(after["release-stable"]).toEqual(before["release-stable"]);
    expect(before["release-exact"].a.digest).not.toBe(before["release-stable"].a.digest);
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
