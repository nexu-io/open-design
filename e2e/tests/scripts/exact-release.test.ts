import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createPackage } from "@electron/asar";

import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = resolve("..");
const run = promisify(execFile);
const roots: string[] = [];
const dataIds = ["skills", "design-templates", "design-systems", "craft", "plugins", "frames", "community-pets", "prompt-templates", "plugin-previews"];

afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

describe("exact Electron release topology", () => {
  it.each(["release-exact", "release-prerelease", "release-stable"])("isolates static data from Standalone lifecycle changes in %s", async lane => {
    const result = await run("python3", ["-c", [
      "import json,sys", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, GitFingerprinter, calculate",
      "root=Path(sys.argv[2]); lane=sys.argv[3]",
      "contract=ConvergenceContract(root/('.github/config/plan/'+lane+'.json'))",
      "workflow=contract.workflow(lane)",
      "def compute(): return calculate(contract,root,lane,workflow.execution['runners'])",
      "before=compute(); original=GitFingerprinter.records",
      "def changed(path):",
      " def records(self,token):",
      "  return [(p,m,('f'*40 if p==path else o),s) for p,m,o,s in original(self,token)]",
      " with patch.object(GitFingerprinter,'records',records): after=compute()",
      " return sorted(name for name in before if before[name]['digest']!=after[name]['digest'])",
      "result={path:changed('packages/standalone/src/'+path) for path in ['store.ts','preparation-queue.ts','tree.ts','protocol.ts']}",
      "result['archive-tests']=changed('packages/archive/tests/archive.test.ts')",
      "print(json.dumps(result))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), workspaceRoot, lane]);
    const changed = JSON.parse(result.stdout) as Record<string, string[]>;
    expect(changed["archive-tests"]).toEqual(["release_tools", "validation_closure_darwin_arm64"]);
    for (const path of ["store.ts", "preparation-queue.ts"]) {
      expect(changed[path]).toContain("electron_capsule_darwin_arm64");
      expect(changed[path]!.filter(name => name.startsWith("closure_data_"))).toEqual([]);
    }
    for (const path of ["tree.ts", "protocol.ts"]) {
      expect(changed[path]!.filter(name => name.startsWith("closure_data_"))).toHaveLength(9);
    }
  });
  it("reports candidate baseline evidence without claiming channel activation", async () => {
    const result = await run("python3", ["-c", [
      "import sys,json", "sys.path.insert(0,sys.argv[1])", "from feishu import build_report",
      "binding={'channel':'betahyx','releaseVersion':'0.1.0-betahyx.15','sourceCommit':'a'*40}",
      "evidence={'publish-receipt.json':dict(binding,operation='exact.publish'),'activate-receipt.json':dict(binding,operation='exact.activation.deferred')}",
      "context={'branch':'experiment','actor':'fixture','attempt':1,'run_url':'https://example.invalid/run'}",
      "print(json.dumps(build_report('betahyx',binding['releaseVersion'],binding['sourceCommit'],evidence,[],{},context,[])))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts")]);
    const report = JSON.parse(result.stdout);
    expect(report.state).toBe("candidate");
    expect(report.card.header.template).toBe("orange");
  });
  it.each(["release-exact", "release-prerelease", "release-stable"])("keeps Shell test-only edits out of build identities in %s", async lane => {
    const result = await run("python3", ["-c", [
      "import json,sys", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, GitFingerprinter, calculate",
      "root=Path(sys.argv[2]); lane=sys.argv[3]",
      "contract=ConvergenceContract(root/('.github/config/plan/'+lane+'.json'))",
      "workflow=contract.workflow(lane)",
      "def compute(): return calculate(contract,root,lane,workflow.execution['runners'])",
      "before=compute(); original=GitFingerprinter.records",
      "def changed(path):",
      " def records(self,token):",
      "  return [(p,m,('f'*40 if p==path else o),s) for p,m,o,s in original(self,token)]",
      " with patch.object(GitFingerprinter,'records',records): after=compute()",
      " return sorted(name for name in before if before[name]['digest']!=after[name]['digest'])",
      "print(json.dumps({path:changed('shells/electron/'+path) for path in ['tests/main.test.ts','tsconfig.tests.json','src/main.ts']}))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), workspaceRoot, lane]);
    const changed = JSON.parse(result.stdout);
    expect(changed["tests/main.test.ts"]).toEqual(["validation_shell_darwin_arm64"]);
    expect(changed["tsconfig.tests.json"]).toEqual(["validation_shell_darwin_arm64"]);
    expect(changed["src/main.ts"]).toEqual(expect.arrayContaining([
      "electron_base_darwin_arm64", "electron_capsule_darwin_arm64", "electron_scene_darwin_arm64", "release_tools", "validation_shell_darwin_arm64",
    ]));
  });
  it.each(["release-exact", "release-prerelease", "release-stable"])("isolates CLI registration from product recipes in %s", async lane => {
    const result = await run("python3", ["-c", [
      "import json,sys", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, GitFingerprinter, calculate",
      "root=Path(sys.argv[2]); lane=sys.argv[3]",
      "contract=ConvergenceContract(root/('.github/config/plan/'+lane+'.json'))",
      "workflow=contract.workflow(lane)",
      "def compute(): return calculate(contract,root,lane,workflow.execution['runners'])",
      "before=compute(); original=GitFingerprinter.records",
      "def changed(path):",
      " def records(self,token):",
      "  return [(p,m,('f'*40 if p==path else o),s) for p,m,o,s in original(self,token)]",
      " with patch.object(GitFingerprinter,'records',records): after=compute()",
      " return sorted(name for name in before if before[name]['digest']!=after[name]['digest'])",
      "print(json.dumps({path:changed('tools/release/src/'+path) for path in ['index.ts','exact/commands.ts','exact/build-commands.ts','exact/resource-commands.ts']}))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), workspaceRoot, lane]);
    const changed: Record<string, string[]> = JSON.parse(result.stdout);
    const control = ["release_tools", "validation_closure_darwin_arm64", "validation_contract_darwin_arm64", "validation_shell_darwin_arm64"];
    expect(changed["index.ts"]).toEqual(control);
    expect(changed["exact/commands.ts"]).toEqual(control);
    expect(changed["exact/resource-commands.ts"]).toEqual([
      ...dataIds.map(id => `closure_data_${id.replaceAll("-", "_")}_darwin_arm64`), "release_tools",
    ].sort());
    expect(changed["exact/build-commands.ts"]).toEqual(expect.arrayContaining([
      "electron_base_darwin_arm64", "electron_capsule_darwin_arm64", "electron_platform_darwin_arm64",
      "electron_scene_darwin_arm64", "terminal_scene_darwin_arm64", "closure_data_skills_darwin_arm64",
    ]));
  });

  it("keeps notification edits out of product identities and scopes declaration changes", async () => {
    const result = await run("python3", ["-c", [
      "import json,sys,copy", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, GitFingerprinter, calculate",
      "root=Path(sys.argv[2])",
      "contract=ConvergenceContract(root/'.github/config/plan/release-exact.json')",
      "workflow=contract.workflow('release-exact')",
      "runners=workflow.execution['runners']",
      "def compute(): return calculate(contract,root,'release-exact',runners)",
      "before=compute()",
      "original=GitFingerprinter.records",
      "def notify_changed(self,token):",
      " return [(p,m,('f'*40 if p=='.github/workflows/release-exact.yml' else o),s) for p,m,o,s in original(self,token)]",
      "with patch.object(GitFingerprinter,'records',notify_changed): assert compute()==before",
      "selected='closure_data_skills_darwin_arm64'",
      "workflow.workloads[selected].parameters['fixture']='changed'",
      "after=compute()",
      "changed=[name for name in before if before[name]['digest']!=after[name]['digest']]",
      "assert changed==[selected], changed",
      "print(json.dumps({'notificationChanged':0,'declarationChanged':changed}))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), workspaceRoot]);
    expect(JSON.parse(result.stdout)).toEqual({ notificationChanged: 0, declarationChanged: ["closure_data_skills_darwin_arm64"] });
  });

  it.each([
    { suite: "electron-scene", nodes: ["electron.contract.build", "electron.shell.build", "closure.build"] },
    { suite: "electron-platform", nodes: ["electron.platform.build"] },
    ...dataIds.map(id => ({ suite: `closure-data-${id}`, nodes: [`closure.data.${id}.build`] })),
  ])("covers $suite production inputs in the convergence cache key", async ({ suite }) => {
    const result = await run("python3", ["-c", [
      "import json, sys",
      "from pathlib import Path",
      "sys.path.insert(0, sys.argv[1])",
      "from convergence import ConvergenceContract",
      "contract = ConvergenceContract(Path(sys.argv[2]))",
      "print(json.dumps(contract.suite_paths(sys.argv[3])))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), resolve(workspaceRoot, ".github/config/plan/release-exact.json"), suite]);
    const inputs: string[] = JSON.parse(result.stdout);
    const paths = new Set(suite === "electron-scene" ? ["packages/electron-kit/", "shells/electron/src/", "shells/electron/config/", "shells/electron/resources/", "apps/closure/"]
      : suite === "electron-platform" ? ["shells/electron/config/carriers/node-lock.json", "packages/platform/"]
      : ({ "closure-data-plugins": ["plugins/_official/", "plugins/registry/"], "closure-data-frames": ["assets/frames/"],
        "closure-data-community-pets": ["assets/community-pets/"], "closure-data-plugin-previews": ["data/plugin-previews/"] } as Record<string, string[]>)[suite]
        ?? [suite.slice("closure-data-".length) + "/"]);
    const uncovered = [...paths].filter(path => !inputs.some(input => input === "*" || input.replace(/\/$/u, "") === path || (input.endsWith("/") && path.startsWith(input))));
    expect(uncovered).toEqual([]);
    if (suite === "electron-platform") {
      expect(inputs.some(input => input.startsWith("apps/daemon/") || input.startsWith("apps/web/") || input.startsWith("packages/electron-capsule/"))).toBe(false);
    }
  });

  it("changes only the matching data workload digest through the real Git convergence calculator", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-data-digest-")); roots.push(root);
    const config = JSON.parse(await readFile(join(workspaceRoot, ".github/config/plan/release-exact.json"), "utf8"));
    const tokens = new Set<string>((Object.values(config.suites) as string[][]).flat().filter(token => !token.startsWith("suite://")));
    for (const token of tokens) {
      const directory = (await stat(join(workspaceRoot, token))).isDirectory();
      const path = join(root, token, ...(directory ? ["fixture"] : []));
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, "baseline");
    }
    await run("git", ["init", "-q", root]); await run("git", ["-C", root, "add", "."]);
    const calculate = async () => JSON.parse((await run("python3", ["-c", [
      "import json, sys", "from pathlib import Path", "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, calculate",
      "contract=ConvergenceContract(Path(sys.argv[2]))",
      "runners={w.runner_class:['fixture'] for w in contract.workflow('release-exact').workloads.values()}",
      "print(json.dumps(calculate(contract,Path(sys.argv[3]),'release-exact',runners)))",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), resolve(workspaceRoot, ".github/config/plan/release-exact.json"), root])).stdout) as Record<string, { digest: string }>;
    const before = await calculate();
    for (const id of dataIds) {
      const token = config.suites[`closure-data-${id}`].find((value: string) => !value.startsWith("suite://"));
      const path = join(root, token, "fixture");
      await writeFile(path, "changed data"); await run("git", ["-C", root, "add", path]);
      const after = await calculate();
      expect(Object.keys(after).filter(key => after[key]!.digest !== before[key]!.digest), id)
        .toEqual([`closure_data_${id.replaceAll("-", "_")}_darwin_arm64`]);
      await writeFile(path, "baseline"); await run("git", ["-C", root, "add", path]);
    }
  }, 15_000);

  it("passes projected workloads and scene identities through the real convergence planner and handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-convergence-contract-")); roots.push(root);
    const cli = resolve(workspaceRoot, "tools/release/dist/tools-release");
    const products = join(root, "products"), pending = join(root, "pending.json");
    const common = [resolve(workspaceRoot, ".github/scripts/convergence.py"), "--root", workspaceRoot,
      "--config", resolve(workspaceRoot, ".github/config/plan/release-exact.json")];
    await run("python3", [...common, "execution", "--workflow", "release-exact", "--output", root, "--github-output", join(root, "outputs")]);
    const outputLine = (await readFile(join(root, "outputs"), "utf8")).split("\n").find(line => line.startsWith("validation_matrix="))!;
    expect(JSON.parse(outputLine.slice("validation_matrix=".length)).include.map((entry: { shell: string; target: string }) => [entry.shell, entry.target]))
      .toEqual([["electron", "darwin-arm64"]]);
    const runners = await readFile(join(root, "runners.json"), "utf8");
    const env = { ...process.env, GITHUB_OUTPUT: join(root, "outputs"), GITHUB_STEP_SUMMARY: join(root, "summary") };
    await run("python3", [...common, "github-output", "--workflow", "release-exact", "--scope-plan", join(root, "scope.json"),
      "--runner-plan-json", runners, "--repository-id", "1", "--repository", "local/fixture", "--base-url", "http://invalid.local",
      "--mode", "enforce", "--pending", pending], { env });
    const planned = JSON.parse(await readFile(pending, "utf8"));
    expect(planned.workloads.electron_scene_win32_x64.run).toBe(false);
    expect(planned.workloads.electron_platform_win32_x64.run).toBe(false);
    expect(planned.workloads.electron_platform_darwin_arm64.run).toBe(true);
    for (const shell of ["terminal", "electron"]) {
      const workload = `${shell}_scene_darwin_arm64`, scene = join(root, shell);
      expect(planned.workloads[workload].run).toBe(true);
      await mkdir(scene);
      await writeFile(join(scene, "scene.json"), JSON.stringify({ target: "darwin-arm64", shellBuildHash: "a".repeat(64) }));
      await run(process.execPath, [cli, "scene", "verify", "--scene", scene, "--target", "darwin-arm64"]);
    }
    const platformRoot = join(root, "platform"); await mkdir(platformRoot);
    const archivePath = join(platformRoot, "platform.zip"), resourcePath = join(platformRoot, "platform-resource.json");
    const resource = { schemaVersion: 1, target: "darwin-arm64", blob: {
      sha256: createHash("sha256").update("platform").digest("hex"), size: 8, mediaType: "application/zip", sources: [] },
      treeSha256: "b".repeat(64), executables: ["bin/node"] };
    await writeFile(archivePath, "platform"); await writeFile(resourcePath, JSON.stringify(resource));
    const buildReceipt = join(platformRoot, "build.json");
    await writeFile(buildReceipt, JSON.stringify({ schemaVersion: 1, operation: "electron.platform.build", target: "darwin-arm64",
      resource, archivePath, resourcePath }));
    await run(process.execPath, [cli, "platform", "export", "--target", "darwin-arm64", "--build-receipt", buildReceipt,
      "--output", join(root, "platform-contribution")]);
    for (const id of dataIds) {
      const workload = `closure_data_${id.replaceAll("-", "_")}_darwin_arm64`;
      expect(planned.workloads[workload].run).toBe(true);
      const directory = join(root, "data", id); await mkdir(directory, { recursive: true });
      const sha256 = createHash("sha256").update(id).digest("hex"), file = `${id}-${sha256}.zip`;
      await writeFile(join(directory, file), id);
      const receipt = join(directory, "resource-receipt.json");
      await writeFile(receipt, JSON.stringify({ schemaVersion: 1, operation: "closure.data-resource.build",
        resource: { id, file, sha256, size: id.length, treeSha256: "b".repeat(64), entrypoint: "resource.json", sync: true } }));
      const output = join(root, `data-contribution-${id}`);
      await run(process.execPath, [cli, "resource", "export", "--resource-id", id, "--resource-receipt", receipt, "--output", output]);
    }
    const capsuleWorkload = "electron_capsule_darwin_arm64";
    expect(planned.workloads[capsuleWorkload].run).toBe(true);
    expect(planned.workloads.electron_capsule_win32_x64.run).toBe(false);
    const event = join(root, "event.json");
    const baseWorkload = "electron_base_darwin_arm64";
    expect(planned.workloads[baseWorkload].run).toBe(true);
    expect(planned.workloads.electron_base_win32_x64.run).toBe(false);
    await run("python3", [...common, "contribute-all", "--pending", pending, "--source-commit", "a".repeat(40), "--output", products]);
    const config = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/plan/release-exact.json"), "utf8"));
    for (const [id, workload] of Object.entries(config.workflows["release-exact"].workloads) as [string, { artifact?: { product: string; prefix: string } }][]) {
      if (!planned.workloads[id].run || !workload.artifact) continue;
      const binding = JSON.parse(await readFile(join(products, id, "product-manifest.json"), "utf8"));
      expect(binding.products).toEqual({ [workload.artifact.product]: { type: "job", source: workload.artifact.prefix + "-" + "a".repeat(40) } });
    }
    await writeFile(event, JSON.stringify({ repository: { id: 1 } }));
    const handoff = await run("python3", [...common, "handoff", "--pending", pending, "--products-root", products,
      "--handoff-root", join(root, "handoff")], { cwd: workspaceRoot, env: { ...env,
      GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_EVENT_PATH: event, GITHUB_REPOSITORY_ID: "1",
      GITHUB_REPOSITORY: "local/fixture", GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1",
    } });
    const candidate = JSON.parse(handoff.stdout);
    expect(candidate.results).toHaveLength(18);
    for (const { receipt } of candidate.results) {
      expect(receipt.executionClass).toEqual(planned.workloads[receipt.workload].executionClass);
      expect(receipt.digest).toBe(planned.workloads[receipt.workload].digest);
    }
  });

  it("keeps independent platform cache restore free of workspace setup and passes target directories to prepare", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const platform = workflow.split("\n  platform:")[1]!.split("\n  prepare:")[0]!;
    expect(platform).toContain("matrix: ${{ fromJSON(needs.plan.outputs.platform_matrix) }}");
    expect(platform.indexOf("Restore converged platform")).toBeLessThan(platform.indexOf("actions/checkout"));
    for (const command of ["platform import", "build platform", "platform export"]) expect(platform).toContain(`tools-release ${command}`);
    expect(platform).not.toContain("build:resources");
    expect(platform).not.toContain("matrix.mode");
    expect(platform).toContain("path: ${{ runner.temp }}/platform-contribution/artifact");
    const prepare = workflow.split("\n  prepare:")[1]!.split("\n  distribution:")[0]!;
    expect(prepare).toContain(' --platforms "$RUNNER_TEMP/platforms"');
    expect(prepare).toContain("pattern: exact-platform-product-*-${{ inputs.source_sha }}");
    expect(prepare).toContain("merge-multiple: true");
    const capsule = workflow.split("\n  capsule:")[1]!.split("\n  data:")[0]!;
    expect(capsule).toContain("matrix: ${{ fromJSON(needs.plan.outputs.capsule_matrix) }}");
    expect(capsule.indexOf("Restore converged capsule")).toBeLessThan(capsule.indexOf("actions/checkout"));
    for (const command of ["capsule import", "build capsule", "capsule export"]) expect(capsule).toContain(`tools-release ${command}`);
    expect(capsule).not.toMatch(/--plan|--pending|--workload|convergence\.py/u);
    expect(workflow).toContain('--products-output "$RUNNER_TEMP/exact-plan/artifacts"');
    expect(workflow).toContain('convergence.py --config .github/config/plan/release-exact.json contribute');
    expect(prepare).toContain('--capsules "$RUNNER_TEMP/capsules"');
    const scene = workflow.split("\n  scene:")[1]!.split("\n  platform:")[0]!;
    expect(scene).toContain("needs: [tools, plan, capsule]");
    expect(scene).toContain('--capsule-directory "$RUNNER_TEMP/capsules"');
    expect(scene).not.toContain("capsule_args");
    for (const command of ["artifact acquire", "build base", "base export"]) expect(scene).toContain(`tools-release ${command}`);
    expect(scene).not.toContain("tools-release base pack");
    expect(scene).toContain("fromJSON(needs.plan.outputs.run)[matrix.base_workload]");
    expect(scene).toContain("path: ${{ runner.temp }}/base-contribution/artifact");
    expect(scene).not.toContain("path: ${{ runner.temp }}/base-contribution/products");
    const distribution = workflow.split("\n  distribution:")[1]!.split("\n  publish:")[0]!;
    expect(distribution).toContain('tools-release base unpack');
    expect(distribution).toContain('--base-directory "$RUNNER_TEMP/base"');
    expect(distribution).toContain("name: exact-base-product-${{ matrix.target }}-${{ inputs.source_sha }}");
  });

  it("builds or restores each data group without bundling app runtimes and passes the complete directory to prepare", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const data = workflow.split("\n  data:")[1]!.split("\n  prepare:")[0]!;
    expect(data).toContain("runs-on: ubuntu-24.04");
    expect(data).toContain("uses: ./.github/actions/release-data");
    expect(data).not.toMatch(/matrix:|pnpm|install --frozen-lockfile/u);
    const action = await readFile(resolve(workspaceRoot, ".github/actions/release-data/action.yml"), "utf8");
    expect(action).toContain("resource materialize");
    expect(action).toContain("artifacts/batches/data.json");
    for (const id of dataIds) expect(action).toContain(`name: exact-data-cache-${id}-`);
    expect(data).not.toContain("build:resources");
    expect(data).not.toContain("@open-design/daemon");
    expect(data).not.toContain("@open-design/web");
    const prepare = workflow.split("\n  prepare:")[1]!.split("\n  distribution:")[0]!;
    expect(prepare).toContain('--data-resources "$RUNNER_TEMP/data-products"');
    expect(prepare).toContain("pattern: exact-data-product-*-${{ inputs.source_sha }}");
  });

  it("requires native validation independently of scene cache reuse and transports its receipt to baseline staging", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const scene = workflow.split("\n  scene:")[1]!.split("\n  prepare:")[0]!;
    const validation = workflow.split("\n  validation:")[1]?.split("\n  scene:")[0];
    expect(validation).toBeDefined();
    expect(validation).toContain("needs: [tools, plan]");
    expect(validation).toContain("matrix: ${{ fromJSON(needs.plan.outputs.validation_matrix) }}");
    expect(validation).not.toContain("outputs.run).electron_scene");
    expect(validation).toContain('tools-release validation materialize');
    expect(validation).toContain('batches/validation.json');
    expect(validation).not.toContain('--coverage business');
    expect(validation).not.toContain("scene-artifact");
    expect(scene).not.toContain('tools-release validate');
    expect(scene).not.toContain("matrix.shell == 'electron' ||");
    expect(workflow.split("\n  prepare:")[1]!.split("\n  distribution:")[0]).toContain("needs: [tools, plan, scene, terminal_scene, platform, capsule, data, validation]");
    const terminal = workflow.split("\n  terminal_scene:")[1]!.split("\n  platform:")[0]!;
    expect(terminal).toContain("needs: [tools, plan]");
    expect(terminal).not.toContain("capsule");
    expect(terminal).toContain("needs.plan.outputs.terminal_matrix");
    const plan = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/plan/release-exact.json"), "utf8"));
    for (const [id, node] of Object.entries({ contract: "electron.contract.test", shell: "electron.shell.test", closure: "closure.test" })) {
      expect(validation).toContain(`outputs.run).validation_${id}_darwin_arm64`);
      expect(plan.workflows["release-exact"].workloads[`validation_${id}_darwin_arm64`])
        .toMatchObject({ reusable: true, parameters: { node, coverage: "architecture" }, products: "manifest" });
    }
    expect(validation).toContain("name: exact-validation-${{ matrix.target }}-${{ inputs.source_sha }}");
    expect(validation).toContain("if: always()");
    const distribution = workflow.split("\n  distribution:")[1]!.split("\n  publish:")[0]!;
    expect(distribution).not.toContain("matrix.mode");
    expect(distribution).not.toContain("baseline stage");
    const acceptance = workflow.split("\n  acceptance:")[1]!.split("\n  activate:")[0]!;
    expect(acceptance).toContain("name: exact-validation-${{ matrix.target }}-${{ inputs.source_sha }}");
    const stage = acceptance.split("- name: Fetch accepted baseline for upgrade acceptance")[1]!;
    expect(stage).toContain('--validation "$RUNNER_TEMP/exact-validation/shell.json"');
    expect(stage).toContain('tools-release baseline fetch');
    expect(stage).toContain('tools-release installation collect');
    expect(stage).toContain('--work-root "$RUNNER_TEMP/installed-acceptance"');
    expect(stage).not.toMatch(/installed_root=|user_data_root=|hot_args/u);
  });

  it("preserves native scene inputs through the actual convergence ZIP normalizer", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-scene-transport-")); roots.push(root);
    const scene = join(root, "source"); await mkdir(join(scene, "platform"), { recursive: true });
    await writeFile(join(scene, "scene.json"), "{}");
    await writeFile(join(scene, "platform", ".lock"), "locked");
    await writeFile(join(scene, "platform", "node"), "native");
    await chmod(join(scene, "platform", "node"), 0o755);
    const cli = resolve(workspaceRoot, "tools/release/dist/tools-release");
    await run(process.execPath, [cli, "scene", "pack", "--scene", scene, "--output", join(root, "scene.tar")]);
    await run("python3", ["-c", [
      "import sys, zipfile",
      "from pathlib import Path",
      "sys.path.insert(0, sys.argv[1])",
      "from convergence import normalize_product_archive",
      "root = Path(sys.argv[2])",
      "with zipfile.ZipFile(root / 'github.zip', 'w') as archive: archive.write(root / 'scene.tar', 'scene.tar')",
      "normalize_product_archive(root / 'github.zip', root / 'r2.zip')",
      "with zipfile.ZipFile(root / 'r2.zip') as archive: archive.extractall(root / 'download')",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), root]);
    expect(await readFile(join(root, "download", "scene.tar"))).toEqual(await readFile(join(root, "scene.tar")));
    await run(process.execPath, [cli, "scene", "unpack", "--archive", join(root, "download", "scene.tar"), "--output", join(root, "restored")]);
    expect(await readFile(join(root, "restored/platform/.lock"), "utf8")).toBe("locked");
    if (process.platform !== "win32") expect((await stat(join(root, "restored/platform/node"))).mode & 0o777).toBe(0o755);
  });
  it("cold-restarts after CDP hot update and delegates acceptance checks to tools-release", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const hot = workflow.split("- name: Exercise accepted macOS Shell through CDP hot update")[1]?.split("- name: Install and exercise Windows Electron Shell")[0];
    expect(hot).toBeDefined();
    expect(hot).toContain("tools-release installation exercise");
    expect(hot).toContain("--mode hot");
    expect(hot).toContain('--baseline-receipt "$RUNNER_TEMP/baseline/fetch-receipt.json"');
    expect(hot).not.toContain('"$RUNNER_TEMP/public-shell-artifact.dmg"');
    expect(hot).not.toContain("python3");
    expect(hot).not.toContain("candidateVersion");
    expect(hot).toContain('CHANNEL: ${{ inputs.channel }}');
    expect(hot).not.toMatch(/hdiutil|electron_pid|trap |Contents\/MacOS/u);
    expect(hot).not.toContain("DevToolsActivePort");
  });

  it("delegates source branch eligibility to tools-release without weakening exact checkout binding", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    expect(workflow).not.toContain('[[ "$SOURCE_REF" =~');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
    expect(workflow).toContain('git ls-remote --refs origin "$SOURCE_REF"');
    expect(workflow).toContain("tools-release policy resolve");
  });

  it("runs the current release matrix on macOS while retaining the deferred Windows declaration", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const convergence = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/plan/release-exact.json"), "utf8"));

    expect(workflow).toContain("options: [betahyx]");
    const execution = convergence.workflows["release-exact"].execution;
    expect(workflow).toContain("convergence.py --config .github/config/plan/release-exact.json execution");
    expect(execution.matrices.shell_matrix.include.map((value: { shell: string; target: string }) => [value.shell, value.target]))
      .toEqual([["terminal", "darwin-arm64"], ["electron", "darwin-arm64"]]);
    expect(execution.matrices.shell_matrix.include.every((value: { runs_on: string }) => value.runs_on === "macos-15")).toBe(true);
    expect(execution.enabled).not.toContain("electron_scene_win32_x64");
    expect(execution.runners.electron_win32_x64).toEqual(["windows-2025"]);
    expect(workflow).toContain("tools-release build scene");
    expect(workflow).toContain('tools-release build distribution');
    expect(workflow).not.toContain("exact-scene-request.json");
    expect(workflow).not.toContain("distribution-request.json");
    expect(workflow).not.toMatch(/@open-design\/shell-electron exact:|manifest-request|shellManifestFile|releaseManifestFile/u);
    expect(workflow).toContain('tools-release build scene-inputs');
    expect(workflow).not.toContain("build:resources");
    expect(workflow).not.toContain("tools/pack/dist/exact-control.mjs");
    expect(workflow).toContain("tools/release/dist/tools-release");
    expect(workflow).not.toContain("exact-pack-control.mjs");
    expect(workflow).not.toContain('exact-plan/exact-release-control.mjs');
    expect(workflow).toContain("PROFILE: exact-validation");
    expect(workflow).toContain('--endpoint-url "$STORAGE_ENDPOINT" --bucket "$STORAGE_BUCKET" --public-base-url "$PUBLIC_ORIGIN"');
    for (const capability of ["plan", "prepare", "finalize", "acceptance"]) {
      expect(workflow).toContain(`--capability ${capability}`);
    }
    expect(workflow).toContain("Install and exercise macOS Electron Shell");
    expect(workflow).toContain("Install and exercise Windows Electron Shell");
    expect(convergence.workflows["release-exact"]).toMatchObject({
      policy: "shell-scenes-v3",
      workloads: {
        terminal_scene_darwin_arm64: { reusable: true },
        electron_scene_darwin_arm64: { runnerClass: "electron_darwin_arm64", reusable: true },
        electron_scene_win32_x64: { runnerClass: "electron_win32_x64", reusable: false },
      },
    });
    expect(convergence.suites["electron-scene"]).toContain("packages/electron-capsule/");
  });

  it("transports scenes opaquely and restores the plan before reading a cache hit", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const scene = workflow.split("\n  scene:")[1]!.split("\n  prepare:")[0]!;
    expect(scene.indexOf("path: ${{ runner.temp }}/exact-plan")).toBeLessThan(scene.indexOf("- name: Restore converged scene"));
    expect(scene).toContain("path: ${{ runner.temp }}/exact-scene-artifact/scene.tar");
    expect(scene).toContain("tools-release scene pack");
    expect(scene).toContain("tools-release scene import");
    expect(scene).toContain("tools-release scene verify");
    expect(scene).not.toContain("zipfile");
    expect(scene).not.toContain('operation:"exact.scene.');
    expect(workflow).not.toContain('operation:"release.authorize"');
    expect(workflow).not.toContain('operation:"release.policy.resolve"');
    expect(workflow).toContain('tools-release acceptance fetch');
    expect(workflow).not.toContain('urllib.request.urlretrieve(required["artifact"]["url"], archive)');
    expect(workflow).not.toContain("Resolve installed Electron identity");
    expect(workflow).toContain('tools-release installation exercise');
    expect(workflow).toContain('tools-release installation collect');
    expect(workflow).not.toContain("electron-cdp-control.mjs");
    expect(workflow).not.toContain("electron-cdp-request.json");
    expect(workflow).not.toContain("acceptance-request.json");
    expect(workflow).not.toMatch(/node (?:-e |--input-type=module)/u);
    const acceptance = workflow.split("\n  acceptance:")[1]!.split("\n  activate:")[0]!;
    expect(acceptance.indexOf("node-version-file: .node-version")).toBeLessThan(acceptance.indexOf("- name: Authorize installed acceptance capability"));
    const config = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/plan/release-exact.json"), "utf8"));
    expect(config.suites["electron-scene"]).toContain("tools/release/src/exact/scene-artifact.ts");
  });

  it("checks release-neutral scenes by owned fields rather than coincidental version values", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    expect(workflow).toContain('tools-release scene verify');
    expect(workflow).not.toContain("find_release_owned_fields");
    const source = await readFile(resolve(workspaceRoot, "tools/release/src/exact/scene-artifact.ts"), "utf8");
    expect(source).toContain('["artifactBaseUrl", "channel", "publishedAt", "releaseVersion", "signatures"]');
    expect(source).toContain("releaseOwnedFields(scene)");
    expect(workflow).not.toContain('for release_field in (os.environ["RELEASE_VERSION"]');
  });

  it("keeps release entrypoints and their plan contracts independent", async () => {
    for (const lane of ["exact", "prerelease", "stable"]) {
      const name = `release-${lane}`;
      const workflow = await readFile(resolve(workspaceRoot, `.github/workflows/${name}.yml`), "utf8");
      const configPath = `.github/config/plan/${name}.json`;
      const config = JSON.parse(await readFile(resolve(workspaceRoot, configPath), "utf8"));
      expect(workflow).not.toMatch(/uses: .*\.github\/workflows\/release-/u);
      expect(workflow).not.toContain("workflow_call:");
      expect(workflow).toContain(`--config ${configPath}`);
      expect(workflow).toContain(`--workflow ${name}`);
      expect(workflow).toContain(`--id ${name}-results`);
      expect(workflow).toContain("node_version: ${{ steps.toolchain.outputs.node_version }}");
      for (const job of ["platform", "capsule"]) {
        const section = workflow.split(`\n  ${job}:`)[1]!.split(/\n  [a-z_]+:\n/u)[0]!;
        expect(section).toContain("node-version: ${{ needs.plan.outputs.node_version }}");
        expect(section).not.toContain("node-version-file:");
        expect(section.indexOf("actions/setup-node@")).toBeLessThan(section.indexOf("actions/checkout@"));
        const cache = section.split(`- name: Restore ${job} dependency cache`)[1]!.split("- name: Build independent")[0]!;
        expect(cache).toContain("if: ${{ fromJSON(needs.plan.outputs.run)[matrix.workload] }}");
        expect(cache).toContain("cache: pnpm");
        expect(cache).toContain("cache-dependency-path: pnpm-lock.yaml");
        expect(section.indexOf(`Restore ${job} dependency cache`)).toBeGreaterThan(section.indexOf("pnpm/action-setup@"));
      }
      expect(Object.keys(config.workflows)).toEqual([name]);
      expect(config.suites["convergence-control"]).toContain(configPath);
      for (const other of ["exact", "prerelease", "stable"].filter(value => value !== lane)) {
        expect(config.suites["convergence-control"]).not.toContain(`.github/workflows/release-${other}.yml`);
        expect(config.suites["convergence-control"]).not.toContain(`.github/config/plan/release-${other}.json`);
      }
      const profile = lane === "exact" ? "exact-validation" : `${lane}-distribution`;
      for (const job of ["platform", "capsule", "data"]) {
        const producer = workflow.split(`\n  ${job}:`)[1]!.split(/\n  [a-z_]+:/u)[0]!;
        expect(producer).toContain("needs: [tools, plan]");
      }
      expect(workflow).toContain(`PROFILE: ${profile}`);
      expect(workflow).toContain("RELEASE_STORAGE_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_RELEASES_AK }}");
      expect(workflow).toContain("RELEASE_STORAGE_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_RELEASES_SK }}");
      expect(workflow).toContain("secrets.CLOUDFLARE_R2_RELEASES_URL");
      expect(workflow).toContain("vars.CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN || secrets.CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN");
      expect(workflow).not.toContain("secrets.EXACT_RELEASE_");
      expect(workflow).not.toContain("CLOUDFLARE_R2_WORKLOAD_RESULTS_AK");
      expect(workflow).not.toContain("CLOUDFLARE_R2_WORKLOAD_RESULTS_SK");
      const distributionBuild = workflow.split("- name: Build native distribution")[1]!.split("- uses:")[0]!;
      const distributionSetup = workflow.split("- name: Restore distribution scene")[0]!.split("- uses: actions/setup-node@v6").at(-1)!;
      expect(distributionSetup).toContain("cache: ${{ matrix.shell == 'electron' && 'pnpm' || '' }}");
      expect(distributionSetup).toContain("cache-dependency-path: pnpm-lock.yaml");
      expect(distributionBuild).toContain("CSC_LINK: ${{ matrix.shell == 'electron' && secrets.APPLE_SIGNING_CERTIFICATE_BASE64 || '' }}");
      expect(distributionBuild).toContain("secrets.APPLE_APP_SPECIFIC_PASSWORD");
      expect(distributionBuild).toContain("secrets.APPLE_TEAM_ID");
      if (lane !== "exact") expect(workflow).toContain(`CHANNEL: ${lane}`);
      expect(workflow).toContain(`END_USER_DISTRIBUTION: "${lane === "stable"}"`);
      expect(workflow).toContain(lane === "stable"
        ? "STABLE_AUTHORIZED: ${{ inputs.confirm_end_user_distribution }}"
        : 'STABLE_AUTHORIZED: "false"');
    }
    const consumer = await readFile(resolve(workspaceRoot, ".github/workflows/convergence.atom.yml"), "utf8");
    expect(consumer).toContain("workflows: [ci, release-exact, release-prerelease, release-stable]");
    expect(consumer).toContain('convergence.py --config "$CONVERGENCE_CONFIG" admit');
    expect(consumer).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(consumer).toContain('ref: ${{ inputs.trusted_sha }}');
    expect(consumer).toContain('python3 .github/scripts/convergence.py source');
    expect(consumer).toContain('--release-policy "$RUNNER_TEMP/release-policy/release-policy.json"');
    expect(consumer).not.toContain("CLOUDFLARE_R2_RELEASES_AK");
    await expect(stat(resolve(workspaceRoot, ".github/workflows/convergence-exact.atom.yml"))).rejects.toThrow();
  });

  it("uses Python-only planning and one public business CLI", async () => {
    for (const lane of ["exact", "prerelease", "stable"]) {
      const source = await readFile(resolve(workspaceRoot, `.github/workflows/release-${lane}.yml`), "utf8");
      for (const job of source.split(/\n  [a-z_]+:\n/u).slice(1)) {
        const download = job.indexOf('uses: actions/download-artifact@v8\n        with:\n          name: release-tools-${{ inputs.source_sha }}');
        if (download < 0) continue;
        expect(job.indexOf("- name: Expose release tool"), `${lane}: tool must exist before chmod/PATH`).toBeGreaterThan(download);
        const invocation = job.includes("uses: ./.github/actions/release-data")
          ? job.indexOf("uses: ./.github/actions/release-data") : job.indexOf("tools-release ");
        expect(invocation, `${lane}: expose before invocation`).toBeGreaterThan(job.indexOf("- name: Expose release tool"));
      }
    }
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    const plan = workflow.split("\n  plan:")[1]!.split("\n  tools:")[0]!;
    expect(plan).not.toMatch(/setup-node|pnpm|node |release-tools|release-policy/u);
    expect(workflow).not.toMatch(/node "\$RUNNER_TEMP|exact-release-plan|--plan |--registry /u);
    expect(workflow).toContain('echo "$RUNNER_TEMP/release-tools" >> "$GITHUB_PATH"');
    expect(workflow).toContain("tools-release baseline inspect");
    expect(workflow).toContain("options: [accepted, candidate]");
    expect(workflow.match(/--mode "\$\{\{ inputs.baseline_mode \}\}"/gu)).toHaveLength(2);
    expect(workflow).not.toContain('"operation": "exact.prepare"');
    expect(workflow).not.toContain('"operation": "exact.finalize"');
    for (const command of ["prepare", "finalize", "publish", "activate", "baseline promote", "baseline fetch"]) {
      expect(workflow).toContain(`tools-release ${command}`);
    }
    expect(workflow).not.toContain("relocated-publish-receipt.json");
    expect(workflow).not.toContain('"operation": "exact.publish"');
    expect(workflow).not.toContain('"operation": "exact.activate"');
    expect(workflow).not.toContain('"operation": "exact.baseline.promote"');
    expect(workflow).not.toContain(".github/scripts/pack.py");
    expect(workflow).not.toContain(".github/scripts/release.py");
    expect(workflow).not.toContain("installed_acceptance.py");
    expect(workflow).toContain('tools-release installation collect');
    expect(workflow).not.toContain("node tools/release/src/exact/control-cli.ts");
    expect(workflow).not.toContain("somechan");
    expect(workflow).not.toContain("somepreview");
    expect(workflow).not.toContain('"appId": "io.open-design.betahyx"');
    expect(workflow).not.toContain('"executableName": "open-design-betahyx"');
    const finalize = workflow.split("- name: Finalize signed Shell sidecar and channel head")[1]?.split("- name: Publish immutable release objects")[0];
    expect(finalize).toContain('--distributions "$RUNNER_TEMP/distributions"');
    expect(finalize).not.toContain("python3");
    expect(finalize).not.toContain("restart-and-install");
    expect(finalize).not.toContain("shell.distribution.contribute");
  });

  it("contains no legacy Electron application or launcher authority", async () => {
    const files = [
      "AGENTS.md",
      ".gitignore",
      ...(await readdir(resolve(workspaceRoot, ".github/workflows"))).filter(file => /\.ya?ml$/u.test(file)).map(file => `.github/workflows/${file}`),
      ".github/config/scopes.json",
      ".github/config/convergence.json",
      "scripts/guard.ts",
      "scripts/check-cross-app-imports.ts",
      "pnpm-lock.yaml",
    ];
    const contents = await Promise.all(files.map(async (file) => await readFile(resolve(workspaceRoot, file), "utf8")));
    for (const content of contents) {
      expect(content).not.toMatch(/apps\/(?:desktop|packaged)|@open-design\/(?:desktop|packaged|launcher-proto)|desktop-handoff\.json/u);
    }
  });

  it("binds published macOS platform trust into installed Electron acceptance", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-installed-acceptance-"));
    roots.push(root);
    const publishedRoot = join(root, "published"), installedRoot = join(root, "installed"), acceptanceRoot = join(root, "acceptance");
    await Promise.all([mkdir(publishedRoot), mkdir(installedRoot)]);
    const sourceCommit = "a".repeat(40);
    const shell = { buildHash: "b".repeat(64), type: "electron", version: "1.2.3" };
    // This fixture binds published evidence; it does not perform native signing.
    // Public release targets require formal trust even under exact-validation.
    const platformTrust = { designatedRequirement: 'identifier "io.open-design.betahyx"', mode: "formal", platform: "macos", teamIdentifier: "TESTTEAM01" };
    const artifact = { mediaType: "application/x-apple-diskimage", sha256: "c".repeat(64), size: 73, url: "https://release.invalid/app.dmg" };
    const shellMetadata = { sha256: "d".repeat(64), size: 41, url: "https://release.invalid/electron-metadata.json" };
    const installIdentity = { appId: "io.open-design.betahyx", executableName: "open-design-betahyx", namespace: "acceptance", productName: "OpenDesign" };
    const archiveSource = join(root, "archive-source"); await mkdir(archiveSource);
    const physical = { schemaVersion: 2, ...installIdentity, publisher: "OpenDesign", protocol: "open-design",
      version: "1.2.3-betahyx.4", channel: "betahyx", shell: { ...shell, digest: "f".repeat(64) } };
    const packPhysical = async () => {
      await writeFile(join(archiveSource, "shell.json"), JSON.stringify(physical));
      await createPackage(archiveSource, join(installedRoot, "app.asar"));
    };
    await packPhysical();
    const updater = { channel: "betahyx", mechanism: "standalone" };
    const required = { artifact, installIdentity, platformTrust, shell, shellMetadata, target: "darwin-arm64", updater };
    const target = { endpointUrl: "https://storage.invalid", bucket: "release", publicBaseUrl: "https://release.invalid", latestChannelHeadUrl: "https://storage.invalid/release/betahyx/latest/channel-head.json" };
    const publishReceipt = join(publishedRoot, "publish-receipt.json"), policyReceipt = join(root, "policy.json");
    await run(process.execPath, [resolve(workspaceRoot, "tools/release/bin/tools-release.mjs"), "policy", "resolve", "--profile", "exact-validation",
      "--channel", "betahyx", "--release-version", "1.2.3-betahyx.4", "--source-commit", sourceCommit, "--source-ref", "refs/heads/feat/electron",
      "--endpoint-url", target.endpointUrl, "--bucket", target.bucket, "--public-base-url", target.publicBaseUrl,
      "--end-user-distribution", "false", "--stable-authorized", "false", "--receipt", policyReceipt]);
    await writeFile(publishReceipt, JSON.stringify({ schemaVersion: 1, operation: "exact.publish", profile: "exact-validation", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4", sourceCommit, target, requiredAcceptances: [required] }));

    const installedFiles = await Promise.all(["host.mjs", "supervisor.mjs", "content.json", "trust.json", "updater-provider.mjs", "capsule-manifest.json", "capsule.zip"].map(async (file) => {
      const body = Buffer.from(`installed:${file}`);
      await writeFile(join(installedRoot, file), body);
      return { file, sha256: createHash("sha256").update(body).digest("hex"), size: body.length };
    }));
    await writeFile(join(installedRoot, "standalone-installation.json"), JSON.stringify({
      schemaVersion: 4,
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      target: "darwin-arm64",
      host: installedFiles[0],
      updaterProvider: installedFiles[4],
      supervisor: installedFiles[1],
      content: installedFiles[2],
      trust: installedFiles[3],
      capsule: { manifest: installedFiles[5], archive: installedFiles[6] },
    }));
    const baseUserDataRoot = join(root, "user-data");
    const runtimeRoot = join(baseUserDataRoot, "exact/channels/betahyx/namespaces/acceptance-headless/runtime/electron");
    const runtimeLog = join(runtimeRoot, "logs/electron-runtime.jsonl");
    await mkdir(dirname(runtimeLog), { recursive: true });
    await writeFile(runtimeLog, [
      { attemptId: "acceptance-attempt", event: "startup.committed" },
      { attemptId: "acceptance-attempt", event: "shutdown.complete" },
    ].map((event) => JSON.stringify(event)).join("\n"));

    const firstInstallRoot = join(root, "first-installed"), firstInstallUserDataRoot = join(root, "first-user-data");
    await cp(installedRoot, firstInstallRoot, { recursive: true });
    await cp(baseUserDataRoot, firstInstallUserDataRoot, { recursive: true });
    const collect = async (hotReceipt?: string) => {
      await run(process.execPath, [resolve(workspaceRoot, "tools/release/dist/tools-release"), "acceptance", "collect",
        "--publication", publishReceipt, "--policy", policyReceipt, "--installed-root", installedRoot, "--runtime-proof-root", root,
        "--shell", "electron", "--target", "darwin-arm64", "--base-user-data-root", baseUserDataRoot,
        ...(hotReceipt == null ? [] : ["--hot-receipt", hotReceipt, "--first-install-root", firstInstallRoot,
          "--first-install-user-data-root", firstInstallUserDataRoot]), "--receipt", join(acceptanceRoot, "electron-darwin-arm64.json")]);
    };
    await collect();
    const credential = JSON.parse(await readFile(join(acceptanceRoot, "electron-darwin-arm64.json"), "utf8"));
    expect(credential).toMatchObject({ artifact, installIdentity, platformTrust, shell, shellMetadata, target: "darwin-arm64", updater });
    expect(credential.installed.proof.physical.manifest).toEqual(physical);

    const installationPath = join(installedRoot, "standalone-installation.json");
    const installation = JSON.parse(await readFile(installationPath, "utf8"));
    installation.releaseVersion = "1.2.3-betahyx.3";
    await writeFile(installationPath, JSON.stringify(installation));
    physical.version = installation.releaseVersion;
    await packPhysical();
    const line = (state: string, candidateVersion?: string) => ({
      lines: { closure: { state, ...(candidateVersion == null ? {} : { candidateVersion }) }, shell: { currentVersion: "1.2.3", state: "current" } },
    });
    const hotReceipt = join(root, "electron-cdp-receipt.json");
    await writeFile(hotReceipt, JSON.stringify({
      schemaVersion: 1, operation: "electron.cdp.contract.invoked", discoveryUrl: "http://127.0.0.1:9222",
      results: [line("idle"), line("ready", "1.2.3-betahyx.4"), { outcome: "context-destroyed" }, line("idle")],
    }));
    const generationId = "e".repeat(64);
    const store = join(runtimeRoot, "standalone-store/channels/betahyx");
    const standaloneState = join(store, "namespaces/acceptance-headless/state.json"), standaloneGenerations = join(store, "generations");
    await mkdir(standaloneGenerations, { recursive: true }); await mkdir(dirname(standaloneState), { recursive: true });
    await writeFile(standaloneState, JSON.stringify({
      schemaVersion: 5, active: generationId, lastHealthy: generationId, prepared: null,
      activationIntent: null, activationAttempt: null, revision: 7,
    }));
    await writeFile(join(standaloneGenerations, `${generationId}.json`), JSON.stringify({
      schemaVersion: 4, id: generationId, channel: "betahyx", releaseVersion: "1.2.3-betahyx.4",
    }));
    await expect(collect(hotReceipt)).rejects.toThrow("mounted candidate renderer");
    await writeFile(runtimeLog, [
      { attemptId: "hot-attempt", event: "startup.committed" },
      { attemptId: "hot-attempt", event: "renderer.generation.committed", details: { generationId, bindingDigest: "f".repeat(64) } },
      { attemptId: "hot-attempt", event: "shutdown.complete" },
      { attemptId: "cold-attempt", event: "startup.committed", details: { generationId } },
      { attemptId: "cold-attempt", event: "shutdown.complete" },
    ].map((event) => JSON.stringify(event)).join("\n"));
    await collect(hotReceipt);
    const hotCredential = JSON.parse(await readFile(join(acceptanceRoot, "electron-darwin-arm64.json"), "utf8"));
    expect(hotCredential.installed.proof).toMatchObject({
      baselineReleaseVersion: "1.2.3-betahyx.4",
      hotUpdate: { releaseVersion: "1.2.3-betahyx.4", discoveryUrl: "http://127.0.0.1:9222", generationId,
        baseline: { proof: { baselineReleaseVersion: "1.2.3-betahyx.3" } } },
    });
  });
});
