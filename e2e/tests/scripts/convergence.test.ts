import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    schema: { version: 9 },
    suites: { "convergence-control": ["control.txt"], web: ["a.txt"] },
    workflows: {
      ci: {
        policy: "test-v1",
        workloads: {
          a: { inputs: ["suite://web"], runnerClass: "worker", products: "none", reusable: true, success: { "Job a": ["Execute"] } },
          b: { inputs: ["suite://web", "b.txt"], runnerClass: "worker", products: "none", reusable: true, success: { "Job b": ["Execute"] } },
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
  test("uses identical normalization for local products and transported artifacts", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import sys, zipfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
source = root / 'local'
(source / 'web/product').mkdir(parents=True)
(source / 'web/product/workspace.tar.gz').write_bytes(b'payload')
(source / 'web/product/outputs.json').write_text('scratch metadata, already inside the tar')
archive = root / 'transport.zip'
with zipfile.ZipFile(archive, 'w') as out:
    out.writestr('web/product/workspace.tar.gz', b'payload')
c.normalize_product_archive(source, root / 'local.zip', 'web/product', local_pattern='**/workspace.tar.gz')
c.normalize_product_archive(archive, root / 'remote.zip', 'web/product')
assert (root / 'local.zip').read_bytes() == (root / 'remote.zip').read_bytes()
for prefix in ('../escape', 'absent'):
    try: c.normalize_product_archive(source, root / 'bad.zip', prefix)
    except c.ConfigError: pass
    else: raise AssertionError('accepted unsafe or empty selection')
(source / 'link').symlink_to(root / 'a.txt')
try: c.normalize_product_archive(source, root / 'bad.zip')
except c.ConfigError: pass
else: raise AssertionError('accepted symlink')
`, path.dirname(convergenceScript), fixture.root], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("restricts local execution evidence to the authorized release checkout", () => {
    const result = spawnSync("python3", ["-c", `
import argparse, json, os, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
context = {'provenance': {'headSha': 'a' * 40}}
args = argparse.Namespace(current_job='Native')
env = {'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REPOSITORY':'nexu-io/open-design',
       'GITHUB_REF':'refs/heads/feat/plan-foundation','GITHUB_WORKFLOW':'release-beta',
       'GITHUB_SHA':'a' * 40,'CONVERGENCE_STEP_RESULTS':json.dumps({'Build':'success'})}
with patch.dict(os.environ, env, clear=True):
    assert c.local_execution_evidence(args, context) == {'job':'Native','steps':{'Build':'success'}}
    assert c.local_execution_evidence(argparse.Namespace(), context) is None
for key, value in [('GITHUB_EVENT_NAME','pull_request'), ('GITHUB_WORKFLOW','ci'),
                   ('GITHUB_REF','refs/heads/foreign'), ('GITHUB_SHA','b'*40),
                   ('GITHUB_REPOSITORY','foreign/repo'), ('CONVERGENCE_STEP_RESULTS','{}')]:
    with patch.dict(os.environ, {**env,key:value}, clear=True):
        try: c.local_execution_evidence(args, context)
        except c.ConfigError: pass
        else: raise AssertionError('accepted unauthorized local evidence: ' + key)
`, path.dirname(convergenceScript)], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("collects only the explicitly completed workload without publishing siblings twice", () => {
    const result = spawnSync("python3", ["-c", `
import argparse, copy, sys
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, '.github/scripts')
import convergence as c
candidate={'repositoryId':42,'repository':'example/repo','results':[{'receipt':{'workload':i}} for i in ['a','b']]}
context={'repositoryId':42,'repository':'example/repo','provenance':{'runId':12,'runAttempt':1}}
contract=SimpleNamespace(workflow=lambda _:SimpleNamespace(workloads={'a':{},'b':{}}))
args=argparse.Namespace(pending='pending',products_root='products',products='none',workloads=['a'],batches=[],handoff_root='handoff',id='a')
with patch.object(c,'event_payload',return_value={}), patch.object(c,'producer_context',return_value=context), patch.object(c,'run_jobs',return_value=[]), patch.object(c,'finalize_candidate',side_effect=lambda *a,**k:copy.deepcopy(candidate)), patch.object(c,'load_json',return_value={'workflow':'ci'}), patch.object(c,'append_outputs'), patch.object(c.handoff_contract,'write_convergence') as write:
    c.handoff_command(args,contract)
    assert [i['receipt']['workload'] for i in write.call_args.args[2]['results']]==['a']
    for selected in [['a','a'],['unknown'],'a']:
        args.workloads=selected
        try: c.handoff_command(args,contract)
        except c.ConfigError: pass
        else: raise AssertionError('accepted invalid selection')
`, ], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("passes only keys between jobs and resolves cold, hot and mixed references locally", () => {
    const result = spawnSync("python3", ["-c", `
import argparse, json, os, sys, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, '.github/scripts')
import convergence as c
origin='https://public.example/workloads'
units=['packages','daemon','shell']
hot={'source_javascript': {u: {'unit':u,'operation':'restore','retain':False,'artifact':{'url':origin+'/'+u+'.zip','sha256':'a'*64}} for u in units}}
wire=c.key_requests(hot, origin)
assert origin not in json.dumps(wire) and '"url"' not in json.dumps(wire)
assert hot['source_javascript']['packages']['artifact']['url'].startswith(origin)
with tempfile.TemporaryDirectory() as directory:
    envfile=Path(directory)/'env'
    base={'OD_WORKLOAD_RESULTS_BASE_URL':origin,'GITHUB_ENV':str(envfile)}
    for source in [hot, json.loads(json.dumps(hot))]:
        # The same projection serves newly published receipts and frozen hits.
        wire=c.key_requests(source, origin)
        envfile.write_text('')
        with patch.dict(os.environ,{**base,'SHARED_SOURCES':json.dumps(c.consumer_sources(wire)['source_javascript'])},clear=True):
            c.resolve_references(argparse.Namespace(shared=','.join(units),batch=None))
        assert {s['unit']:s['url'] for s in json.loads(envfile.read_text().split('=',1)[1])}=={u:origin+'/'+u+'.zip' for u in units}
    mixed=json.loads(json.dumps(hot))
    mixed['source_javascript']['daemon']={'unit':'daemon','operation':'build','retain':True,'buildId':'b'*64}
    wire=c.key_requests(mixed,origin)
    assert c.consumer_sources(wire)['source_javascript'] is None
    envfile.write_text('')
    with patch.dict(os.environ,{**base,'SOURCE_REQUESTS':json.dumps(wire)},clear=True):
        c.resolve_references(argparse.Namespace(shared=None,batch='source_javascript'))
    assert 'SOURCE_DAEMON_URL=\\n' in envfile.read_text()
    assert 'SOURCE_DAEMON_BUILD_ID='+'b'*64 in envfile.read_text()
    for invalid in [None, '', '../x', 'a'*63, 'a'*64+'\\nINJECT=1']:
        wire['source_javascript']['daemon']['buildId']=invalid
        envfile.write_text('')
        with patch.dict(os.environ,{**base,'SOURCE_REQUESTS':json.dumps(wire)},clear=True):
            try:c.resolve_references(argparse.Namespace(shared=None,batch='source_javascript'))
            except c.ConfigError:pass
            else:raise AssertionError('accepted invalid build identity')
        assert envfile.read_text()==''
    for key in ['../x','/x','a//b','https://evil/x','a/%2e%2e/b','a?query','a\\\\b']:
        try:c.reference_key(key)
        except c.ConfigError:pass
        else:raise AssertionError(key)
    for bad in [None,[],[{'unit':'packages','key':'x','sha256':'a'*64}]]:
        envfile.write_text('')
        with patch.dict(os.environ,{**base,'SHARED_SOURCES':json.dumps(bad)},clear=True):
            try:c.resolve_references(argparse.Namespace(shared=','.join(units),batch=None))
            except c.ConfigError:pass
            else:raise AssertionError('accepted incomplete sources')
        assert envfile.read_text()==''
    try:c.key_requests(hot,'https://different.example')
    except c.ConfigError:pass
    else:raise AssertionError('accepted foreign origin')
`], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
  test("projects configured matrices independently and rejects incomplete execution declarations", () => {
    const result = spawnSync("python3", ["-c", `
import copy, json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
contract = c.ConvergenceContract(Path(sys.argv[2]) / ".github/config/convergence/release-beta.json")
w = contract.workflow("release-beta")
ids = [key for key in w.workloads if key.startswith("test_")]
runners = {x.runner_class: ["test-runner"] for x in w.workloads.values()}
for mask in range(1 << len(ids)):
    run = {key: False for key in w.workloads}
    run.update({key: bool(mask & (1 << i)) for i, key in enumerate(ids)})
    projected = c.project_matrices(w, run, runners, {})
    tests = json.loads(projected["test_matrix"])["include"]
    assert "build_matrix" not in projected
    assert len(tests) == int(projected["test_count"])
    assert sorted(r["name"] for r in tests) == sorted(name for key in ids if run[key] for name in w.workloads[key].success)
    assert all(r["runner"] == ["test-runner"] for r in tests)
    for identity in ids:
        shards = json.loads(projected[identity + "_matrix"])["include"]
        assert shards == [row for row in tests if row["workload"] == identity]
        assert {row["name"] for row in shards} == (set(w.workloads[identity].success) if run[identity] else set())
    assert projected["common_count"] == "0"
    for key in w.matrices["common"][0]["workloads"]:
        partial = c.project_matrices(w, {**run, key: True}, runners, {})
        assert partial["common_count"] == "1"
raw = json.loads((Path(sys.argv[2]) / ".github/config/convergence/release-beta.json").read_text())["workflows"]["release-beta"]
for mutation in ("duplicate", "unknown", "runner", "missing-shard"):
    value = copy.deepcopy(raw)
    rows = value["matrices"]["test"]
    if mutation == "duplicate": rows.append(copy.deepcopy(rows[0]))
    if mutation == "unknown": rows[0]["workload"] = "unknown"
    if mutation == "runner": rows[0]["runner"] = "other"
    if mutation == "missing-shard": rows.pop()
    try: c.WorkflowContract("release-beta", value)
    except c.ConfigError: pass
    else: raise AssertionError("accepted invalid matrix: " + mutation)
`, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("beta test identities follow source, fixtures and their own execution instead of publication", () => {
    // Exercise the real declarations against an isolated Git fixture, not the
    // entire checkout on every mutation (which scales with repository size).
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import copy, os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(Path(sys.argv[3]) / ".github/config/convergence/release-beta.json")
ids = {"test_web_workspace_tests", "test_daemon_unit_tests", "test_functional_e2e", "source_js_daemon"}
runners = {"release_tests": ["ubuntu-latest"], "ui_p0": ["ui-runner"], "source_javascript": ["ubuntu-latest"]}
with tempfile.TemporaryDirectory(prefix="beta-test-identity-") as scratch:
    index = Path(scratch) / "index"
    env = {**os.environ, "GIT_INDEX_FILE": str(index)}
    def git(*args, content=None):
        return subprocess.check_output(["git", *args], cwd=root, env=env, input=content, text=True).strip()
    def keys(config=contract):
        return {key: value["digest"] for key, value in c.calculate(config, root, "release-beta", runners, index=index, identities=ids).items()}
    git("read-tree", "HEAD")
    # Seed one tracked witness per declared path; missing selectors still fail
    # in the production evaluator, and no business source needs to be copied.
    oid = git("hash-object", "-w", "--stdin", content="baseline witness")
    names = set()
    for suite in ("web-tests", "daemon-tests", "ui-tests", "source-daemon"):
        for token in contract.suite_paths(suite):
            names.add(token + "fixture.ts" if token.endswith("/") else token)
    for resource in contract.resources.values():
        for token in resource.get("exclude", []):
            names.add(token.replace("**", "fixture").replace("*", "fixture"))
    git("update-index", "--index-info", content="".join("100644 " + oid + "\\t" + name + "\\n" for name in sorted(names)))
    plan_paths = [".github/config/postinstall.json", "scripts/postinstall.config.json"]
    target_config = (Path(sys.argv[3]) / "scripts/postinstall.config.json").read_text()
    import json
    for target in json.loads(target_config)["localDevelopment"]["targets"]:
        plan_paths.append(target + "/package.json")
    for name in plan_paths:
        content = (Path(sys.argv[3]) / name).read_text()
        plan_oid = git("hash-object", "-w", "--stdin", content=content)
        git("update-index", "--add", "--cacheinfo", "100644," + plan_oid + "," + name)
    baseline_tree = git("write-tree")
    baseline = keys()
    cases = {
      ".github/workflows/release-beta.yml": set(),
      ".github/scripts/release/test_unit.py": {"test_web_workspace_tests", "test_daemon_unit_tests", "test_functional_e2e"},
      "apps/daemon/src/plan-witness.ts": {"test_daemon_unit_tests", "test_functional_e2e", "source_js_daemon"},
      "apps/daemon/tests/plan-witness.test.ts": {"test_daemon_unit_tests"},
      "apps/web/src/plan-witness.ts": {"test_web_workspace_tests", "test_functional_e2e"},
      "apps/web/tests/plan-witness.test.ts": {"test_web_workspace_tests"},
      "plugins/registry/plan-witness.json": {"test_daemon_unit_tests", "test_functional_e2e"},
      "packages/contracts/src/plan-witness.ts": ids,
      "packages/contracts/tests/plan-witness.test.ts": set(),
    }
    for path, expected in cases.items():
        git("read-tree", baseline_tree)
        oid = git("hash-object", "-w", "--stdin", content="identity witness")
        git("update-index", "--add", "--cacheinfo", "100644," + oid + "," + path)
        changed = {key for key, value in keys().items() if value != baseline[key]}
        assert changed == expected, (path, changed, expected)
    git("read-tree", baseline_tree)
    changed = copy.deepcopy(contract)
    row = next(r for r in changed.workflow("release-beta").matrices["test"] if r["kind"] == "daemon")
    row["shard"] = 4
    assert {key for key, value in keys(changed).items() if value != baseline[key]} == {"test_daemon_unit_tests"}
`, path.dirname(convergenceScript), fixture.root, repoRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("projects execution batches and independently admits products from one transport", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import argparse, copy, json, subprocess, sys, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
config_path = root / "convergence.json"
config = json.loads(config_path.read_text())
w = config["workflows"]["ci"]
w["batches"] = {"source": {"artifact": "source-products", "entries": {
    name: {"workload": name, "request": {"units": [name]}, "product": "bundle"} for name in ("a", "b")}}}
for name, unit in w["workloads"].items():
    unit.update(products="manifest", successBoundary="steps", success={"Native": ["Build " + name, "Retain"]})
config_path.write_text(json.dumps(config))
contract = c.ConvergenceContract(config_path)
workflow = contract.workflow("ci")
calculated = c.calculate(contract, root, "ci", {"worker": ["ubuntu-24.04"]})
pending = {"schemaVersion": 1, "protocol": c.PROTOCOL, "repositoryId": 42, "repository": "example/repo",
           "workflow": "ci", "policy": "test-v1", "mode": "enforce", "workloads": {
    name: {**value, "scopeEnabled": True, "run": True, "resultHit": False} for name, value in calculated.items()}}
c.project_batches(workflow, pending, root / "requests")
assert json.loads((root / "requests/source/a.json").read_text()) == {"units": ["a"], "operation": "build", "retain": True, "buildId": calculated["a"]["digest"]}
hot = copy.deepcopy(pending)
hot["workloads"]["a"].update(run=False, resultHit=True, result={"products": {"bundle": {
    "type": "url", "source": "https://cache.example/a.zip", "data": {"sha256": "a" * 64}}}})
c.project_batches(workflow, hot, root / "requests")
assert json.loads((root / "requests/source/a.json").read_text()) == {
    "units": ["a"], "operation": "restore", "retain": False,
    "artifact": {"url": "https://cache.example/a.zip", "sha256": "a" * 64}}
shadow = copy.deepcopy(pending)
shadow["mode"] = "shadow"
c.project_batches(workflow, shadow, root / "requests")
assert not json.loads((root / "requests/source/a.json").read_text())["retain"]
# Transport grouping does not change identity; execution request changes do.
w["batches"]["source"]["artifact"] = "renamed-transport"
config_path.write_text(json.dumps(config))
assert c.calculate(c.ConvergenceContract(config_path), root, "ci", {"worker": ["ubuntu-24.04"]}) == calculated
w["batches"]["source"]["entries"]["a"]["request"]["units"] = ["changed"]
config_path.write_text(json.dumps(config))
changed = c.calculate(c.ConvergenceContract(config_path), root, "ci", {"worker": ["ubuntu-24.04"]})
assert changed["a"]["digest"] != calculated["a"]["digest"] and changed["b"] == calculated["b"]
c.write_json_atomic(root / "pending.json", pending)
c.contribute_batches_command(argparse.Namespace(pending=root / "pending.json", output_dir=root / "products"), contract)
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=root, text=True).strip()
provenance = {"event": "workflow_dispatch", "runId": 12, "runAttempt": 1, "headSha": head,
              "baseSha": head, "treeSha": tree, "validatedAt": "2026-09-16T00:00:00Z"}
jobs = [{"id": 1, "name": "Native", "run_id": 12, "run_attempt": 1, "head_sha": head,
         "status": "completed", "conclusion": "failure", "labels": ["ubuntu-24.04"], "steps": [
         {"name": name, "status": "completed", "conclusion": result} for name, result in
         (("Build a", "success"), ("Build b", "failure"), ("Retain", "success"))]}]
candidate = c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, jobs)
assert [entry["receipt"]["workload"] for entry in candidate["results"]] == ["a"]
# The same finalizer/admission accepts trusted local step outcomes, never
# treating a running job as success in the default CI transport.
running = copy.deepcopy(jobs)
running[0].update(status="in_progress", conclusion=None, steps=[])
local = {"job": "Native", "steps": {"Build a": "success", "Build b": "failure", "Retain": "success"}}
assert c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, running)["results"] == []
assert c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, running,
                            local_steps=local) == candidate
with patch("convergence.run_jobs", return_value=running):
    c.validate_admitted_plan(candidate, contract, root, tree, local_steps=local)
    try: c.validate_admitted_plan(candidate, contract, root, tree)
    except c.ConfigError: pass
    else: raise AssertionError("CI accepted unfinished job")
for outcome in ("failure", "skipped", "cancelled"):
    bad_local = copy.deepcopy(local)
    bad_local["steps"]["Build a"] = outcome
    assert c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, running,
                                local_steps=bad_local)["results"] == []
try: c.successful_workload_jobs(running, {"Native": ["Build a"]}, provenance,
                                calculated["a"]["executionClass"], local_steps=local)
except c.ConfigError: pass
else: raise AssertionError("local publication bypassed job-wide boundary")
assert c.successful_workload_jobs(running, {"Native": ["Build a"], "Missing shard": ["Build a"]},
    provenance, calculated["a"]["executionClass"], boundary="steps", local_steps=local) is None
# A newly admitted receipt can complete a mixed hot/cold consumer batch without
# asking tools-pack to refresh or compute an identity.
promoted = copy.deepcopy(candidate["results"][0]["receipt"])
promoted["products"] = {"bundle": {"type": "url", "source": "https://cache.example/a.zip", "data": {"sha256": "a" * 64}}}
requests = c.published_requests(workflow, pending, [promoted])
assert requests["source"]["a"]["operation"] == "restore" and c.consumer_sources(requests)["source"] is None
mixed = copy.deepcopy(pending)
mixed["workloads"]["b"].update(run=False, resultHit=True, result={"products": {"bundle": {
    "type": "url", "source": "https://cache.example/b.zip", "data": {"sha256": "b" * 64}}}})
sources = c.consumer_sources(c.published_requests(workflow, mixed, [promoted]))["source"]
assert sources == [{"units": [name], "url": "https://cache.example/" + name + ".zip", "sha256": name * 64} for name in ("a", "b")]
for receipts in ([promoted, promoted], [{**promoted, "digest": "0" * 64}]):
    try: c.published_requests(workflow, pending, receipts)
    except c.ConfigError: pass
    else: raise AssertionError("accepted duplicated or foreign identity receipt")
assert c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, jobs,
                            products_mode="manifest") == candidate
assert c.finalize_candidate(root / "pending.json", provenance, root / "absent", contract, jobs,
                            products_mode="none")["results"] == []
try: c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, jobs,
                          products_mode="unknown")
except c.ConfigError: pass
else: raise AssertionError("accepted unknown result lane")
with patch("convergence.run_jobs", return_value=jobs):
    c.validate_admitted_plan(candidate, contract, root, tree)
    bad = copy.deepcopy(candidate)
    bad["results"][0]["receipt"]["products"]["bundle"]["path"] = "b/product"
    try: c.validate_admitted_plan(bad, contract, root, tree)
    except c.ConfigError: pass
    else: raise AssertionError("writer admitted swapped batch member")
archive = root / "batch.zip"
with zipfile.ZipFile(archive, "w") as z:
    z.writestr("a/product/workspace.tar.gz", "a")
    z.writestr("b/product/workspace.tar.gz", "b")
c.normalize_product_archive(archive, root / "a.zip", "a/product")
with zipfile.ZipFile(root / "a.zip") as z:
    assert z.namelist() == ["workspace.tar.gz"] and z.read("workspace.tar.gz") == b"a"
try: c.normalize_product_archive(archive, root / "missing.zip", "missing/product")
except c.ConfigError: pass
else: raise AssertionError("accepted absent batch member")
with zipfile.ZipFile(archive, "a") as z: z.writestr("../escape", "unsafe")
try: c.normalize_product_archive(archive, root / "unsafe.zip", "a/product")
except c.ConfigError: pass
else: raise AssertionError("ignored unsafe sibling")
`, path.dirname(convergenceScript), fixture.root], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("beta source identity follows its canonical plan, not release transport or cache mechanics", () => {
    const result = spawnSync("python3", ["-c", `
import os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(root / ".github/config/convergence/release-beta.json")
with tempfile.TemporaryDirectory(prefix="beta-source-identity-") as scratch:
    index = Path(scratch) / "index"
    env = {**os.environ, "GIT_INDEX_FILE": str(index)}
    def git(*args, content=None):
        return subprocess.check_output(["git", *args], cwd=root, env=env, input=content, text=True).strip()
    def identity():
        return c.calculate(contract, root, "release-beta", {"source_mac_arm64": ["macos-14"]},
                           index=index, identities={"source_mac_arm64_web"})["source_mac_arm64_web"]["digest"]
    def change(path):
        original = git("show", "HEAD:" + path)
        oid = git("hash-object", "-w", "--stdin", content=original + "\\n# witness change\\n")
        git("update-index", "--add", "--cacheinfo", "100644," + oid + "," + path)
    git("read-tree", "HEAD")
    baseline = identity()
    change(".github/workflows/release-beta.yml")
    assert identity() == baseline, "release transport invalidated source products"
    git("read-tree", "HEAD")
    change(".github/actions/setup-workspace/action.yml")
    assert identity() == baseline, "cache mechanics invalidated canonical source delivery"
`, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("isolates beta source units while retaining shared inputs and version materialization", () => {
    const result = spawnSync("python3", ["-c", `
import json, os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(root / ".github/config/convergence/release-beta.json")
units = {"source_" + ("mac_arm64_" if unit == "web" else "js_") + unit: unit for unit in ("packages", "daemon", "web", "shell")}
ids = set(units)
with tempfile.TemporaryDirectory(prefix="source-unit-identity-") as scratch:
    index = Path(scratch) / "index"
    env = {**os.environ, "GIT_INDEX_FILE": str(index)}
    def git(*args, content=None):
        return subprocess.check_output(["git", *args], cwd=root, env=env, input=content, text=True).strip()
    def identities():
        return {key: value["digest"] for key, value in c.calculate(contract, root, "release-beta", {"source_mac_arm64": ["macos-14"], "source_javascript": ["ubuntu-latest"]}, index=index, identities=ids).items()}
    git("read-tree", "HEAD")
    baseline = identities()
    for path, expected in (("apps/web/src/plan-witness.ts", {"web"}), ("apps/daemon/src/plan-witness.ts", {"daemon"}),
                           ("apps/desktop/src/plan-witness.ts", {"shell"}), ("packages/platform/src/plan-witness.ts", {"packages", "daemon", "web", "shell"}),
                           ("apps/web/tests/plan-witness.test.ts", set()),
                           ("tools/pack/src/workspace/plan-witness.ts", {"packages", "daemon", "web", "shell"}),
                           ("tools/pack/src/mac/report.ts", set()),
                           ("scripts/postinstall.mjs", set()),
                           (".github/scripts/postinstall.py", set()),
                           ("packages/download/src/archive.ts", {"packages", "daemon", "web", "shell"})):
        git("read-tree", "HEAD")
        oid = git("hash-object", "-w", "--stdin", content="// identity witness")
        git("update-index", "--add", "--cacheinfo", "100644," + oid + "," + path)
        changed = {units[key] for key, digest in identities().items() if digest != baseline[key]}
        assert changed == expected, (path, changed, expected)
    for intent, expected in (("shared-javascript", {"packages", "daemon", "shell"}), ("source-web", {"web"})):
        git("read-tree", "HEAD")
        path = ".github/config/postinstall.json"
        config = json.loads(git("show", "HEAD:" + path))
        config["intents"][intent]["requestedTargets"] = ["tools/release"]
        oid = git("hash-object", "-w", "--stdin", content=json.dumps(config))
        git("update-index", "--cacheinfo", "100644," + oid + "," + path)
        changed = {units[key] for key, digest in identities().items() if digest != baseline[key]}
        assert changed == expected, (intent, changed, expected)
    git("read-tree", "HEAD")
    path = "apps/packaged/package.json"
    manifest = json.loads(git("show", "HEAD:" + path))
    manifest["version"] = "0.22.3-beta.999"
    oid = git("hash-object", "-w", "--stdin", content=json.dumps(manifest))
    git("update-index", "--cacheinfo", "100644," + oid + "," + path)
    assert identities() == baseline
`, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("keys the mac x64 release executor by its exact workspace closure", () => {
    const result = spawnSync("python3", ["-c", `
import os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(root / ".github/config/convergence/release-beta.json")
with tempfile.TemporaryDirectory(prefix="platform-executor-identity-") as scratch:
    index = Path(scratch) / "index"
    env = {**os.environ, "GIT_INDEX_FILE": str(index)}
    def git(*args, content=None):
        return subprocess.check_output(["git", *args], cwd=root, env=env, input=content, text=True).strip()
    def identity():
        return c.calculate(contract, root, "release-beta", {"source_mac_x64": ["macos-15-intel"]},
                           index=index, identities={"source_mac_x64_executor"})["source_mac_x64_executor"]["digest"]
    def changed(path):
        git("read-tree", "HEAD")
        oid = git("hash-object", "-w", "--stdin", content="// executor identity witness")
        git("update-index", "--add", "--cacheinfo", "100644," + oid + "," + path)
        return identity()
    git("read-tree", "HEAD")
    baseline = identity()
    for path in ("packages/download/src/plan-witness.ts", "packages/sidecar/src/plan-witness.ts",
                 "tools/pack/src/plan-witness.ts", "tools/release/src/plan-witness.ts"):
        assert changed(path) != baseline, path + " reused a stale executor"
    for path in ("packages/diagnostics/src/plan-witness.ts", "apps/web/src/plan-witness.ts",
                 ".github/actions/setup-workspace/plan-witness.yml",
                 "tools/pack/tests/plan-witness.test.ts"):
        assert changed(path) == baseline, path + " invalidated the executor"
`, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("projects declared JSON fields from Git without coupling product code to Plan", () => {
    const fixture = createRepository();
    const resourcePath = path.join(fixture.root, "release.json");
    const raw = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    raw.resources = {
      source: { paths: ["a.txt", "release.json"], exclude: ["release.json"] },
      execution: { json: "release.json", omit: ["version"] },
      publication: { json: "release.json", omit: [] },
    };
    raw.workflows.ci.workloads.a.inputs = ["resource://source", "resource://execution"];
    raw.workflows.ci.workloads.b.inputs = ["resource://publication"];
    writeFileSync(fixture.configPath, JSON.stringify(raw));
    const stage = (value: object) => {
      writeFileSync(resourcePath, JSON.stringify(value));
      execFileSync("git", ["add", "release.json"], { cwd: fixture.root });
    };
    stage({ version: "0.22.1", channel: "beta", scripts: { build: "build" } });
    const before = runPlan(fixture).pending.workloads;
    stage({ version: "0.22.3", channel: "beta", scripts: { build: "build" } });
    const version = runPlan(fixture).pending.workloads;
    expect(workload(version, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(version, "b").digest).not.toBe(workload(before, "b").digest);
    // An unstaged edit must not affect the authenticated Git input snapshot.
    writeFileSync(resourcePath, '{"version":"bad","channel":"stable"}');
    expect(runPlan(fixture).pending.workloads).toEqual(version);
    for (const value of [
      { version: "0.22.3", channel: "stable", scripts: { build: "build" } },
      { version: "0.22.3", channel: "beta", scripts: { build: "different" } },
      { version: "0.22.3", channel: "beta", scripts: { build: "build" }, newDependency: "x" },
    ]) {
      stage(value);
      expect(workload(runPlan(fixture).pending.workloads, "a").digest).not.toBe(workload(version, "a").digest);
    }
    stage({ channel: "beta" });
    expect(() => runPlan(fixture)).toThrow(/lacks omitted field version/);
  });

  test("selects the declared release workloads without manufacturing a parallel scope config", () => {
    const fixture = createRepository();
    const output = execFileSync("python3", [convergenceScript, "--root", fixture.root,
      "--config", fixture.configPath, "github-output", "--workflow", "ci", "--all-workloads",
      "--runner-plan-json", '{"worker":["ubuntu-24.04"]}', "--repository-id", "42",
      "--repository", "example/repo", "--mode", "enforce", "--pending", fixture.pendingPath],
    { cwd: fixture.root, encoding: "utf8", env: { ...process.env, OD_WORKLOAD_RESULTS_BASE_URL: "",
      GITHUB_OUTPUT: path.join(fixture.root, "outputs"), GITHUB_STEP_SUMMARY: path.join(fixture.root, "summary") } });
    expect(JSON.parse(output).run).toEqual({ a: true, b: true });
    expect(readFileSync(path.join(fixture.root, "outputs"), "utf8")).toContain("expects_contributions=true");
  });

  test("does not collect receipts for all-hit or out-of-scope workloads", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import os, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
args = ["convergence", "--root", str(root), "--config", str(root / "convergence.json"),
        "github-output", "--workflow", "ci", "--all-workloads",
        "--runner-plan-json", '{"worker":["ubuntu-24.04"]}', "--repository-id", "42",
        "--repository", "example/repo", "--mode", "enforce", "--pending", str(root / "pending.json")]
for mode in ("enforce", "shadow"):
    args[args.index("--mode") + 1] = mode
    with patch.object(sys, "argv", args), patch("convergence.resolve_results", return_value=(
            {"a": True, "b": True}, {"a": "result-hit", "b": "result-hit"}, {})), \\
            patch("convergence.append_outputs") as outputs:
        assert c.main() == 0
        assert outputs.call_args.args[0]["expects_contributions"] == "false"
`, path.dirname(convergenceScript), fixture.root], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    writeFileSync(fixture.scopePlanPath, JSON.stringify({ enabled: { a: false, b: false } }));
    runPlan(fixture);
    expect(readFileSync(path.join(fixture.root, "github-output.txt"), "utf8")).toContain("expects_contributions=false");
  });

  test("admits only named policies from their authorized manual branches", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import copy, os, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
with patch.dict(os.environ, {"GITHUB_EVENT_NAME":"workflow_dispatch", "GITHUB_REPOSITORY":"nexu-io/open-design", "GITHUB_REF":"refs/heads/feat/plan-foundation", "GITHUB_REPOSITORY_ID":"42", "GITHUB_RUN_ID":"12", "GITHUB_RUN_ATTEMPT":"1"}):
    with patch("convergence.event_payload", return_value={"repository":{"id":42,"default_branch":"main"}}):
        context = c.producer_context(c.event_payload())
        candidate = {**context, "workflow":"release-beta", "policy":"beta-isolated-v1"}
        with patch("convergence.prepare_publication") as validation:
            c.require_isolated_candidate(candidate)
            validation.assert_called_once()
            with patch.dict(os.environ, {"GITHUB_REF":"refs/heads/feat/release-timing-ledger"}):
                try: c.require_isolated_candidate(candidate)
                except c.ConfigError: pass
                else: raise AssertionError("accepted unregistered timing branch")
            for mutation in ("policy", "workflow", "headSha", "runAttempt"):
                forged = copy.deepcopy(candidate)
                if mutation == "policy": forged[mutation] = "production-v1"
                elif mutation == "workflow": forged[mutation] = "release-stable"
                elif mutation == "headSha": forged["provenance"][mutation] = "f" * 40
                else: forged["provenance"][mutation] = 2
                try: c.require_isolated_candidate(forged)
                except c.ConfigError: pass
                else: raise AssertionError("accepted " + mutation)
        ci_candidate = {**context, "workflow":"ci", "policy":"ci-v2"}
        with patch.dict(os.environ, {"GITHUB_REF":"refs/heads/main"}), patch("convergence.prepare_publication") as validation:
            c.require_isolated_candidate(ci_candidate)
            validation.assert_called_once()
        try: c.require_isolated_candidate(ci_candidate)
        except c.ConfigError: pass
        else: raise AssertionError("accepted CI publication outside the default branch")
`, path.dirname(convergenceScript)], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("admits formal release-local publication only on release branches and named policies", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import copy, os, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
release = {"GITHUB_EVENT_NAME":"workflow_dispatch", "GITHUB_REPOSITORY":"nexu-io/open-design", "GITHUB_REF":"refs/heads/release/v0.22.3", "GITHUB_REPOSITORY_ID":"42", "GITHUB_RUN_ID":"12", "GITHUB_RUN_ATTEMPT":"1"}
with patch.dict(os.environ, release, clear=False):
    with patch("convergence.event_payload", return_value={"repository":{"id":42}}):
        context = c.producer_context(c.event_payload())
        for workflow, policy in (("release-prerelease", "prerelease-v1"), ("release-stable", "stable-v1")):
            candidate = {**context, "workflow":workflow, "policy":policy}
            with patch("convergence.prepare_publication") as validation:
                c.require_release_local_candidate(candidate)
                validation.assert_called_once()
                forged = copy.deepcopy(candidate)
                forged["policy"] = "beta-isolated-v1"
                try: c.require_release_local_candidate(forged)
                except c.ConfigError: pass
                else: raise AssertionError("accepted a non-formal policy")
        with patch.dict(os.environ, {"GITHUB_REF":"refs/heads/main"}):
            try: c.require_release_local_candidate(candidate)
            except c.ConfigError: pass
            else: raise AssertionError("accepted a non-release branch")
`, path.dirname(convergenceScript)], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("shares only explicit identical recipes from declared producers, preserving isolation otherwise", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import copy, json, sys, urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
path = root / "convergence.json"
raw = json.loads(path.read_text())
raw["workflows"]["release-stable"] = copy.deepcopy(raw["workflows"]["ci"])
raw["workflows"]["release-stable"]["policy"] = "stable-v1"
path.write_text(json.dumps(raw))
contract = c.ConvergenceContract(path)
runners = {"worker": ["ubuntu-24.04"]}
assert c.calculate(contract, root, "ci", runners)["a"]["digest"] != c.calculate(contract, root, "release-stable", runners)["a"]["digest"]
source = {"workflow": "ci", "policy": "test-v1", "workload": "a"}
for workflow in raw["workflows"].values():
    workflow["workloads"]["a"]["recipe"] = "shared-test"
raw["workflows"]["release-stable"]["workloads"]["a"]["trustedSources"] = [source]
path.write_text(json.dumps(raw))
contract = c.ConvergenceContract(path)
producer = c.calculate(contract, root, "ci", runners)["a"]
consumer = c.calculate(contract, root, "release-stable", runners)["a"]
assert producer["digest"] == consumer["digest"]
receipt = json.loads(sys.argv[3])["results"][0]["receipt"]
receipt["digest"] = producer["digest"]
workflow = contract.workflow("release-stable")
c.validate_result(receipt, repository_id=42, workflow=workflow, identity="a", expected=consumer)
urls = []
def fetch(url, timeout):
    urls.append(url)
    if "/workflows/release-stable/" in url: raise urllib.error.HTTPError(url, 404, "missing", {}, None)
    return receipt
with patch("convergence.fetch_result", side_effect=fetch):
    hits, _, results = c.resolve_results("https://results.example", 42, workflow, {"a": consumer}, 1)
    assert hits == {"a": True} and len(urls) == 2
    assert results["a"]["workflow"] == "ci", "producer provenance was relabelled"
for mutation in ("no-trust", "policy", "recipe", "runner", "steps", "input"):
    changed = copy.deepcopy(consumer)
    value = copy.deepcopy(receipt)
    if mutation == "no-trust": changed["trustedSources"] = []
    if mutation == "policy": value["policy"] = "untrusted-v1"
    if mutation == "recipe": changed["digest"] = "f" * 64
    if mutation == "runner": value["executionClass"]["labels"] = ["other-os"]
    if mutation in ("steps", "input"):
        edited = copy.deepcopy(raw)
        declaration = edited["workflows"]["release-stable"]["workloads"]["a"]
        if mutation == "steps": declaration["success"]["Job a"].append("Additional coverage")
        else: declaration["inputs"].append("b.txt")
        path.write_text(json.dumps(edited))
        changed = c.calculate(c.ConvergenceContract(path), root, "release-stable", runners)["a"]
    try: c.validate_result(value, repository_id=42, workflow=workflow, identity="a", expected=changed)
    except c.ConfigError: pass
    else: raise AssertionError("accepted " + mutation)
# Shared recipe names cannot alias different declared inputs in one calculate call.
edited = copy.deepcopy(raw)
edited["workflows"]["ci"]["workloads"]["b"] = copy.deepcopy(edited["workflows"]["ci"]["workloads"]["a"])
edited["workflows"]["ci"]["workloads"]["b"]["inputs"].append("b.txt")
path.write_text(json.dumps(edited))
calculated = c.calculate(c.ConvergenceContract(path), root, "ci", runners)
assert calculated["a"]["digest"] != calculated["b"]["digest"]
`, path.dirname(convergenceScript), fixture.root, JSON.stringify(candidate({}))], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("repeated publication preserves the verified winner and rejects partial or corrupt results", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import argparse, copy, hashlib, json, sys, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
candidate = json.loads(sys.argv[3])
source = root / "build.zip"
with zipfile.ZipFile(source, "w") as archive: archive.writestr("entry.txt", "original")
path = root / "candidate.json"
path.write_text(json.dumps(candidate))
args = argparse.Namespace(isolated=False, candidate=path, products_root=root, output_dir=root / "out", timeout=1)
storage = {"endpoint": "https://r2.example", "bucket": "test", "access_key_id": "test", "secret_access_key": "test", "public_origin": "https://results.example"}
objects = {}
writes = []
def put(*, key, file, **kwargs):
    writes.append(key)
    if key in objects: raise c.R2PreconditionFailed(key)
    objects[key] = file.read_bytes()
def get(url, timeout):
    body = objects.get(url.removeprefix("https://results.example/"))
    return json.loads(body) if body is not None else None
def checksum(url, timeout):
    return hashlib.sha256(objects[url.removeprefix("https://results.example/")]).hexdigest()
with patch("convergence.storage_config", return_value=storage), patch.object(c.R2Client, "put_file", side_effect=put), patch("convergence.existing_receipt", side_effect=get), patch.object(c, "sha256_url", side_effect=checksum), patch.object(c, "append_outputs") as output:
    c.publish_command(args)
    assert len(writes) == 2 and writes[0].startswith("workload-products/") and writes[1].startswith("workload-results/")
    product_key, receipt_key = writes
    winner = json.loads(objects[receipt_key])
    original_objects = dict(objects)
    writes.clear()
    candidate["provenance"]["runId"] = 13
    candidate["results"][0]["receipt"]["validated"]["runId"] = 13
    path.write_text(json.dumps(candidate))
    c.publish_command(args)
    assert writes == [], "repeated result reuploaded a product"
    # Initial read misses an already completed publication; identical bytes
    # reach the receipt CAS and must still return the first producer's receipt.
    with patch.object(c, "existing_receipt", side_effect=[None, winner]):
        c.publish_command(args)
    assert json.loads(output.call_args.args[0]['receipts']) == [winner]
    assert objects == original_objects
    writes.clear()
    with zipfile.ZipFile(source, "w") as archive: archive.writestr("entry.txt", "different")
    c.publish_command(args)
    assert writes == [], "losing build uploaded different bytes"
    assert json.loads(output.call_args.args[0]['receipts']) == [winner]
    # Different concurrent product bytes also converge only on a complete receipt.
    with patch.object(c, "existing_receipt", side_effect=[None, winner]):
        c.publish_command(args)
    assert json.loads(output.call_args.args[0]['receipts']) == [winner]
    assert objects == original_objects
    writes.clear()
    output.reset_mock()
    with patch.object(c, "existing_receipt", return_value=None):
        try: c.publish_command(args)
        except c.ConfigError as error: assert "incomplete immutable publication" in str(error)
        else: raise AssertionError("accepted a product without its receipt")
    assert not output.called and objects == original_objects
    writes.clear()
    objects[product_key] = b'corrupt'
    try: c.publish_command(args)
    except c.ConfigError as error: assert "integrity mismatch" in str(error)
    else: raise AssertionError("accepted corrupt winner bytes")
    assert writes == []
    objects.update(original_objects)
    mismatched = copy.deepcopy(winner)
    mismatched['executionClass']['labels'] = ['other-runner']
    with patch.object(c, "existing_receipt", return_value=mismatched):
        try: c.publish_command(args)
        except c.ConfigError as error: assert "contract collision" in str(error)
        else: raise AssertionError("accepted a different execution contract")
    assert writes == []
`, path.dirname(convergenceScript), fixture.root, JSON.stringify(candidate({ bundle: { type: "job", source: "build" } }))], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"uploadedProductBytes": 0');
  });

  test("reads all jobs from the exact attempt and rejects malformed API responses", () => {
    const result = spawnSync("python3", ["-c", `
import sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from lib import github as g
with patch.object(g, "api_json", side_effect=[{"jobs": [{"id": i} for i in range(100)]}, {"jobs": [{"id": 100}]}]) as api:
    assert len(g.run_jobs("example/repo", 12, 2)) == 101
    assert [call.args[0] for call in api.call_args_list] == [
        f"/repos/example/repo/actions/runs/12/attempts/2/jobs?per_page=100&page={page}" for page in (1, 2)]
for response in ({}, {"jobs": None}, {"jobs": [None]}):
    with patch.object(g, "api_json", return_value=response):
        try: g.run_jobs("example/repo", 12, 2)
        except g.GitHubError: pass
        else: raise AssertionError("accepted invalid jobs response")
`, path.dirname(convergenceScript)], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("selects the newest same-name artifact after a failed-job rerun", () => {
    const result = spawnSync("python3", ["-c", `
import sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from lib import github as g
older = {"id": 20, "name": "handoff-convergence-ci-results", "expired": False, "created_at": "2026-09-21T08:16:09Z"}
newer = {"id": 10, "name": "handoff-convergence-ci-results", "expired": False, "created_at": "2026-09-21T08:22:11Z"}
with patch("lib.github.run_artifacts", return_value=[older, newer]):
    assert g.latest_run_artifact("example/repo", 12, newer["name"])["id"] == 10
with patch("lib.github.run_artifacts", return_value=[older, {**newer, "created_at": ""}]):
    try: g.latest_run_artifact("example/repo", 12, newer["name"])
    except g.GitHubError: pass
    else: raise AssertionError("accepted artifact without creation time")
`, path.dirname(convergenceScript)], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test.each(["job", "steps"])("contributes independent %s successes but rejects forged successful-step evidence", (boundary) => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.a.successBoundary = boundary;
    writeFileSync(fixture.configPath, JSON.stringify(config));
    runPlan(fixture);
    const result = spawnSync("python3", ["-c", `
import copy, json, subprocess, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(root / "convergence.json")
head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
provenance = {"event": "workflow_dispatch", "runId": 12, "runAttempt": 1, "headSha": head,
              "baseSha": head, "treeSha": tree, "validatedAt": "2026-09-15T00:00:00Z"}
jobs = [{"id": i, "name": f"Job {name}", "run_id": 12, "run_attempt": 1, "head_sha": head,
         "status": "completed", "conclusion": "success" if name == "a" else "failure",
         "labels": ["ubuntu-24.04"],
         "steps": [{"name": "Execute", "status": "completed", "conclusion": "success"}]}
        for i, name in enumerate(("a", "b"), 1)]
if contract.workflow("ci").workloads["a"].success_boundary == "steps":
    jobs[0]["conclusion"] = "failure"
    jobs[0]["steps"].append({"name": "Native package", "status": "completed", "conclusion": "failure"})
# Failed b has no manifest. Its absence must not suppress successful a.
contract.workflow("ci").workloads["b"].products = "manifest"
candidate = c.finalize_candidate(root / "pending.json", provenance, root / "products", contract, jobs)
assert [item["receipt"]["workload"] for item in candidate["results"]] == ["a"]
with patch("convergence.run_jobs", return_value=jobs):
    c.validate_admitted_plan(candidate, contract, root, tree)
for mutation in ("step", "attempt", "missing", "duplicate"):
    bad = copy.deepcopy(jobs)
    if mutation == "step": bad[0]["steps"][0]["conclusion"] = "skipped"
    if mutation == "attempt": bad[0]["run_attempt"] = 2
    if mutation == "missing": bad = bad[1:]
    if mutation == "duplicate": bad.append(copy.deepcopy(bad[0]))
    with patch("convergence.run_jobs", return_value=bad):
        try: c.validate_admitted_plan(candidate, contract, root, tree)
        except c.ConfigError: pass
        else: raise AssertionError("accepted false success: " + mutation)
before = c.calculate(contract, root, "ci", {"worker": ["ubuntu-24.04"]})["a"]["digest"]
contract.workflow("ci").workloads["a"].success["Job a"].append("Additional validation")
assert c.calculate(contract, root, "ci", {"worker": ["ubuntu-24.04"]})["a"]["digest"] != before
contract.workflow("ci").workloads["a"].success["Job a"].pop()
contract.workflow("ci").workloads["a"].success_boundary = "steps" if contract.workflow("ci").workloads["a"].success_boundary == "job" else "job"
assert c.calculate(contract, root, "ci", {"worker": ["ubuntu-24.04"]})["a"]["digest"] != before
`, path.dirname(convergenceScript), fixture.root], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("authenticates PR merge trees and exact parents without changing the trusted checkout", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import subprocess, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
def git(*args):
    return subprocess.check_output(["git", "-c", "user.name=test", "-c", "user.email=test@example.com", *args], text=True).strip()
initial = git("rev-parse", "HEAD")
git("checkout", "-qb", "feature")
(root / "a.txt").write_text("feature change")
git("commit", "-qam", "feature")
head = git("rev-parse", "HEAD")
head_tree = git("rev-parse", "HEAD^{tree}")
git("checkout", "-qb", "base", initial)
(root / "b.txt").write_text("base change")
git("commit", "-qam", "base")
base = git("rev-parse", "HEAD")
git("merge", "--no-ff", "--no-edit", "feature")
merge = git("rev-parse", "HEAD")
tree = git("rev-parse", "HEAD^{tree}")
assert tree != head_tree
git("update-ref", "refs/pull/17/merge", merge)
git("remote", "add", "origin", str(root))
git("checkout", "-q", "--detach", base)
index = git("ls-files", "-s")
entry = {"event": "pull_request", "base_sha": base, "head_sha": head, "tree_sha": tree}
payload = {"workflow_run": {"pull_requests": [{"number": 17}]}}
assert c.authenticated_source_tree(entry, payload) == tree
assert git("rev-parse", "HEAD") == base
assert git("ls-files", "-s") == index
for bad in ({**entry, "tree_sha": head_tree}, {**entry, "base_sha": initial}):
    try: c.authenticated_source_tree(bad, payload)
    except c.ConfigError: pass
    else: raise AssertionError("accepted wrong PR snapshot")
for pulls in ([], [{"number": 17}, {"number": 18}], [{"number": "17;echo unsafe"}]):
    try: c.authenticated_source_tree(entry, {"workflow_run": {"pull_requests": pulls}})
    except c.ConfigError: pass
    else: raise AssertionError("accepted ambiguous PR source")
`, path.dirname(convergenceScript), fixture.root], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
  test("requires all workload shards and execution steps from the exact producing attempt", () => {
    const result = spawnSync("python3", ["-c", `
import copy, sys
sys.path.insert(0, sys.argv[1])
import convergence as c
provenance = {"runId": 12, "runAttempt": 2, "headSha": "a" * 40}
execution = {"runnerClass": "js_hot", "labels": ["blacksmith-4vcpu-ubuntu-2404"]}
required = {f"Web workspace tests ({i}/2)": ["Prebuild web sidecar declarations", "Web workspace tests"] for i in (1, 2)}
jobs = [{"id": i, "name": name, "run_id": 12, "run_attempt": 2, "head_sha": "a" * 40,
         "status": "completed", "conclusion": "success", "labels": execution["labels"],
         "steps": [{"name": step, "status": "completed", "conclusion": "success"} for step in steps]}
        for i, (name, steps) in enumerate(required.items(), 1)]
assert c.successful_workload_jobs(jobs, required, provenance, execution) == [1, 2]
assert c.successful_workload_jobs(jobs[:1], required, provenance, execution) is None
failed_native = copy.deepcopy(jobs)
failed_native[1]["conclusion"] = "failure"
failed_native[1]["steps"].append({"name": "Unrelated native packaging", "status": "completed", "conclusion": "failure"})
assert c.successful_workload_jobs(failed_native, required, provenance, execution, boundary="steps") == [1, 2]
for state in ("cancelled", "skipped", None):
    bad = copy.deepcopy(failed_native)
    bad[1]["conclusion"] = state
    assert c.successful_workload_jobs(bad, required, provenance, execution, boundary="steps") is None
for state in ("failure", "cancelled", "skipped", None):
    bad = copy.deepcopy(failed_native)
    bad[1]["steps"][1]["conclusion"] = state
    assert c.successful_workload_jobs(bad, required, provenance, execution, boundary="steps") is None
try: c.successful_workload_jobs(jobs, required, provenance, execution, boundary="anything")
except c.ConfigError: pass
else: raise AssertionError("accepted unknown success boundary")
for state in ("failure", "cancelled", "skipped", None):
    bad = copy.deepcopy(jobs)
    bad[1]["conclusion"] = state
    assert c.successful_workload_jobs(bad, required, provenance, execution) is None
    bad = copy.deepcopy(jobs)
    bad[1]["steps"][1]["conclusion"] = state
    assert c.successful_workload_jobs(bad, required, provenance, execution) is None
for field, value in (("run_id", 13), ("run_attempt", 1), ("head_sha", "b" * 40), ("labels", ["other"]), ("id", 1)):
    bad = copy.deepcopy(jobs)
    bad[1][field] = value
    try: c.successful_workload_jobs(bad, required, provenance, execution)
    except c.ConfigError: pass
    else: raise AssertionError("accepted " + field)
try: c.successful_workload_jobs(jobs + [jobs[1]], required, provenance, execution)
except c.ConfigError: pass
else: raise AssertionError("accepted ambiguous jobs")
print("workload execution boundary passed")
`, path.dirname(convergenceScript)], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
  test("binds candidates to trusted snapshot identities without checking out producer code", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", ["-c", `
import copy, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
contract = c.ConvergenceContract(root / "convergence.json")
runners = {"worker": ["ubuntu-24.04"]}
expected = c.calculate(contract, root, "ci", runners)
tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=root, text=True).strip()
(root / "a.txt").write_text("changed trusted checkout")
subprocess.run(["git", "add", "a.txt"], cwd=root, check=True)
index_before = subprocess.check_output(["git", "diff", "--cached"], cwd=root)
snapshot = c.calculate_snapshot(contract, root, "ci", runners, tree)
assert snapshot == expected
assert c.calculate(contract, root, "ci", runners) != expected
assert subprocess.check_output(["git", "diff", "--cached"], cwd=root) == index_before
candidate = json.loads(sys.argv[3])
receipt = candidate["results"][0]["receipt"]
receipt["digest"] = expected["a"]["digest"]
candidate["results"][0]["key"] = c.result_key(42, "ci", "test-v1", "a", receipt["digest"])
c.validate_candidate_plan(candidate, contract, snapshot)
for mutation in ("digest", "workload", "executionClass", "products", "duplicate"):
    forged = copy.deepcopy(candidate)
    item = forged["results"][0]
    value = item["receipt"]
    if mutation == "digest": value["digest"] = "e" * 64
    if mutation == "workload": value["workload"] = "undeclared"
    if mutation == "executionClass": value["executionClass"]["labels"] = ["forged-runner"]
    if mutation == "products": value["products"] = {"bundle": {"type": "job", "source": "forged"}}
    if mutation == "duplicate": forged["results"].append(copy.deepcopy(item))
    item["key"] = c.result_key(42, "ci", "test-v1", value["workload"], value["digest"])
    try: c.validate_candidate_plan(forged, contract, snapshot)
    except c.ConfigError: pass
    else: raise AssertionError("accepted " + mutation)
print("snapshot and candidate binding passed")
`, path.dirname(convergenceScript), fixture.root, JSON.stringify(candidate({}))], {
      cwd: fixture.root, encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("snapshot and candidate binding passed");
  });
  test("rejects isolated writes from unauthorized branches before loading storage credentials", () => {
    const fixture = createRepository();
    const candidatePath = path.join(fixture.root, "candidate.json");
    const eventPath = path.join(fixture.root, "event.json");
    writeFileSync(candidatePath, JSON.stringify(candidate({})));
    writeFileSync(eventPath, JSON.stringify({ repository: { id: 42, default_branch: "main" } }));
    const result = spawnSync("python3", [convergenceScript, "publish", "--isolated",
      "--candidate", candidatePath, "--output-dir", path.join(fixture.root, "published"),
      "--products-root", path.join(fixture.root, "products")], {
      cwd: fixture.root, encoding: "utf8", env: { ...process.env,
        GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_REF: "refs/heads/topic", GITHUB_EVENT_PATH: eventPath },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("authorized manual source");
    expect(result.stderr).not.toContain("storage is missing");
  });
  test("isolates local declarations from admission controls and rejects stale identity schemas", () => {
    const fixture = createRepository();
    const before = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "control.txt"), "new admission code");
    execFileSync("git", ["add", "control.txt"], { cwd: fixture.root });
    expect(runPlan(fixture).pending.workloads).toEqual(before);
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.inputs = ["b.txt"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const after = runPlan(fixture).pending.workloads;
    expect(workload(after, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(after, "b").digest).not.toBe(workload(before, "b").digest);
    config.schema.version = 1;
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const stale = spawnSync("python3", [convergenceScript, "--root", fixture.root,
      "--config", fixture.configPath, "validate"], { encoding: "utf8" });
    expect(stale.status).toBe(2);
    expect(stale.stderr).toContain("requires schema.version in [9, 10]");
  });
  test("rejects restoring a miss instead of manufacturing successful output", () => {
    const fixture = createRepository();
    runPlan(fixture);
    const result = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
      "restore", "--pending", fixture.pendingPath, "--workload", "a",
      "--output-dir", path.join(fixture.root, "restored"),
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("restore requires a selected reusable-result hit");
  });

  test("checks complete product restoration and failed-set isolation without network", () => {
    const fixture = createRepository();
    const result = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath, "validate",
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("convergence configuration is valid");
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

  test("keeps independently reusable test shards on their proven suite closures", () => {
    const config = JSON.parse(readFileSync(
      path.join(repoRoot, ".github", "config", "convergence.json"),
      "utf8",
    )) as any;

    expect(config.suites["workspace-install"]).toContain(".github/workflows/ci.yml");
    expect(config.suites["workspace-install"]).toEqual(expect.arrayContaining([
      "scripts/postinstall.mjs",
      "scripts/postinstall.config.json",
      ".github/config/postinstall.json",
      ".github/scripts/postinstall.py",
    ]));
    for (const shard of [1, 2, 3, 4]) {
      expect(config.workflows.ci.workloads[`daemon_unit_${shard}`].inputs).toEqual(["suite://daemon"]);
    }
    for (const shard of [1, 2]) {
      expect(config.workflows.ci.workloads[`web_workspace_${shard}`].inputs).toEqual(["suite://web"]);
    }
    expect(config.workflows.ci.workloads.e2e_vitest.inputs).toEqual(["suite://e2e-runtime"]);
    expect(config.suites["e2e-runtime"]).toEqual(expect.arrayContaining([
      ".github/scripts/template.py",
      ".github/templates/",
    ]));
    expect(config.workflows.ci.matrices.daemon).toEqual(
      [1, 2, 3, 4].map((shard) => ({
        name: `Daemon tests (${shard}/4)`, workload: `daemon_unit_${shard}`, shard,
      })),
    );
    expect(config.workflows.ci.matrices.web).toEqual(
      [1, 2].map((shard) => ({
        name: `Web workspace tests (${shard}/2)`, workload: `web_workspace_${shard}`, shard,
      })),
    );
    expect(config.workflows.ci.matrices.ui_p0.map((entry: any) => entry.workload)).toEqual([
      "ui_p0_entry_settings",
      "ui_p0_project_workspace",
      "ui_p0_project_workspace_editor",
      "ui_p0_project_collab",
      "ui_p0_project_runtime",
      "ui_p0_workspace_restoration",
    ]);
    for (const entry of config.workflows.ci.matrices.ui_p0) {
      expect(config.workflows.ci.workloads[entry.workload].inputs).toEqual(["suite://ui-runtime"]);
      expect(config.workflows.ci.workloads[entry.workload].reusable).toBe(true);
    }
  });

  test("pins one entry from each balanced real-server suite to every daemon shard", () => {
    const daemonRoot = path.join(repoRoot, "apps", "daemon");
    const testsRoot = path.join(daemonRoot, "tests");
    const entries = [
      ["chat-route", "registerChatRouteTests"],
      ["od-next-automatic-simple-server", "registerOdNextAutomaticSimpleServerTests"],
    ] as const;
    for (const [family, registrar] of entries) {
      const partitionFiles = readdirSync(testsRoot)
        .filter((file) => new RegExp(`^${family}-partition-\\d+\\.test\\.ts$`).test(file))
        .sort();
      expect(partitionFiles).toEqual(Array.from({ length: 4 }, (_, index) =>
        `${family}-partition-${index + 1}.test.ts`));
      for (const [index, file] of partitionFiles.entries()) {
        expect(readFileSync(path.join(testsRoot, file), "utf8"))
          .toContain(`${registrar}(${index + 1});`);
      }
    }

    const vitestConfig = readFileSync(path.join(daemonRoot, "vitest.config.ts"), "utf8");
    const sequencer = readFileSync(path.join(daemonRoot, "vitest.sequencer.ts"), "utf8");
    expect(vitestConfig).toContain("sequencer: DaemonTestSequencer");
    expect(sequencer).toContain("if (shard.count !== PARTITION_COUNT)");
    expect(sequencer).toContain("const ordinaryShard = await super.shard(ordinaryFiles)");
    expect(sequencer).toContain("partitionsByFamily.get(family)!.get(shard.index)!");
  });

  test("binds beta workloads to canonical postinstall plans without cache implementation inputs", () => {
    const config = JSON.parse(readFileSync(
      path.join(repoRoot, ".github", "config", "convergence", "release-beta.json"),
      "utf8",
    )) as any;
    const expectedIntents: Record<string, string> = {
      source_js_packages: "shared-javascript",
      source_js_daemon: "shared-javascript",
      source_js_shell: "shared-javascript",
      source_mac_arm64_web: "source-web",
      source_mac_x64_web: "source-web",
      source_mac_x64_executor: "release-executor",
      source_mac_x64_runtime: "mac-runtime",
      source_win_x64_web: "source-web",
      source_win_x64_executor: "release-executor",
      test_web_workspace_tests: "test-web",
      test_e2e_vitest: "test-e2e",
      test_daemon_unit_tests: "test-daemon",
      test_verify: "test-verify",
      test_functional_e2e: "test-ui",
    };
    expect(Object.fromEntries(Object.entries(config.workflows["release-beta"].workloads)
      .map(([name, workload]: [string, any]) => [name, workload.postinstallIntent])))
      .toEqual(expectedIntents);
    expect(config.resources["source-postinstall"]).toBeUndefined();
    for (const resource of ["source-common", "platform-executor", "platform-mac-runtime", "test-environment"]) {
      expect(config.resources[resource].paths).not.toContain(".github/actions/setup-workspace/");
    }
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
    const jobs = ["a", "b"].map((name, index) => ({
      id: index + 1, name: `Job ${name}`, run_id: 12, run_attempt: 1, head_sha: headSha,
      status: "completed", conclusion: "success", labels: ["ubuntu-24.04"],
      steps: [{ name: "Execute", status: "completed", conclusion: "success" }],
    }));
    const jobsPath = path.join(fixture.root, "jobs.json");
    writeFileSync(jobsPath, JSON.stringify(jobs));
    execFileSync("python3", ["-c", `
import json, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv.pop(1))
jobs = json.loads(open(sys.argv.pop(1)).read())
import convergence as c
with patch("convergence.run_jobs", return_value=jobs):
    raise SystemExit(c.main())
`, path.dirname(convergenceScript), jobsPath, "--root", fixture.root, "--config", fixture.configPath,
      "handoff", "--pending", fixture.pendingPath,
      "--products-root", path.join(fixture.root, "products"),
      "--handoff-root", handoffRoot,
    ], {
      cwd: fixture.root,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "workflow_dispatch",
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
      event: "workflow_dispatch", run_id: 12, run_attempt: 1, head_sha: headSha,
    });
    expect(readFileSync(outputPath, "utf8")).toContain("name=handoff-convergence-ci-results");

    writeFileSync(eventPath, JSON.stringify({
      repository: { id: 42, full_name: "example/repo" },
      workflow_run: {
        id: 12, run_attempt: 1, name: "ci", event: "workflow_dispatch", head_sha: headSha,
        head_repository: { full_name: "example/repo" },
      },
    }));
    writeFileSync(outputPath, "");
    execFileSync("git", ["remote", "add", "origin", fixture.root], { cwd: fixture.root });
    const admission = spawnSync("python3", ["-c", `
import argparse, copy, json, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
args = argparse.Namespace(root=root, isolated=False, handoff_root=Path(sys.argv[3]))
contract = c.ConvergenceContract(root / "convergence.json")
candidate_path = args.handoff_root / "handoff/convergence/ci-results/candidate.json"
metadata_path = candidate_path.parent / "metadata.json"
original = json.loads(candidate_path.read_text())
with patch("convergence.run_jobs", return_value=json.loads((root / "jobs.json").read_text())):
    assert c.admit_command(args, contract) == 0
    metadata = json.loads(metadata_path.read_text())
    metadata["policy"] = "next-v1"
    metadata_path.write_text(json.dumps(metadata))
    next_candidate = copy.deepcopy(original)
    next_candidate["policy"] = "next-v1"
    candidate_path.write_text(json.dumps(next_candidate))
    with patch("convergence.git_differs", return_value=True):
        assert c.admit_command(args, contract) == 0
    with patch("convergence.git_differs", return_value=False):
        try: c.admit_command(args, contract)
        except c.ConfigError: pass
        else: raise AssertionError("admission accepted a policy mismatch without a control-plane change")
    metadata["policy"] = "test-v1"
    metadata_path.write_text(json.dumps(metadata))
    candidate_path.write_text(json.dumps(original))
    for field in ("digest", "executionClass", "treeSha", "workload"):
        forged = copy.deepcopy(original)
        receipt = forged["results"][0]["receipt"]
        if field == "digest": receipt["digest"] = "e" * 64
        if field == "executionClass": receipt["executionClass"]["labels"] = ["invented-runner"]
        if field == "workload": receipt["workload"] = "undeclared"
        if field == "treeSha":
            forged["provenance"]["treeSha"] = "f" * 40
            for result in forged["results"]: result["receipt"]["validated"]["treeSha"] = "f" * 40
        forged["results"][0]["key"] = c.result_key(42, "ci", "test-v1", receipt["workload"], receipt["digest"])
        candidate_path.write_text(json.dumps(forged))
        metadata = json.loads(metadata_path.read_text())
        metadata["tree_sha"] = forged["provenance"]["treeSha"]
        metadata_path.write_text(json.dumps(metadata))
        try: c.admit_command(args, contract)
        except c.ConfigError: pass
        else: raise AssertionError("admission accepted forged " + field)
`, path.dirname(convergenceScript), fixture.root, handoffRoot], {
      cwd: fixture.root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    });
    expect(admission.status, admission.stderr).toBe(0);
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
