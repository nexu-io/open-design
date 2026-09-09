import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createExactPlanFromRegistryFile } from "../src/exact/plan.ts";
import { validateExactPlanNode } from "../src/exact/validation.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(script = 'node -e "console.log(\'executed contract test\')"') {
  const root = await mkdtemp(join(tmpdir(), "release-validation-")); roots.push(root);
  const ids = ["electron.contract.build", "electron.contract.test", "electron.shell.build", "electron.shell.test",
    "closure.build", "closure.test", "electron.distribution", "electron.acceptance.full", "closure.acceptance.hot"];
  for (const id of ids) { await mkdir(join(root, id)); await writeFile(join(root, id, "input.txt"), id); }
  const registry = join(root, "registry.json"), plan = join(root, "plan.json");
  await writeFile(registry, JSON.stringify({ schemaVersion: 1,
    identities: Object.fromEntries(ids.map(id => [id, { schemaVersion: 1, sourceSets: [id], parameters: ["target"] }])),
    sourceSets: Object.fromEntries(ids.map(id => [id, { paths: [id] }])),
  }));
  const resolved = await createExactPlanFromRegistryFile({ root, registryPath: registry,
    acceptedShellBaseline: `sha256:${"a".repeat(64)}`, target: "darwin-arm64" });
  await writeFile(plan, JSON.stringify({ schemaVersion: 1, plan: resolved, actions: [{ id: "electron.contract.test" }] }));
  await mkdir(join(root, "packages/electron-contract"), { recursive: true });
  await writeFile(join(root, "packages/electron-contract/package.json"), JSON.stringify({ name: "fixture", scripts: { test: script } }));
  return { root, registry, plan, node: "electron.contract.test", log: join(root, "test.log"), receipt: join(root, "result.json") };
}

it("executes the selected recipe and emits only its successful identity", async () => {
  const input = await fixture(), result = await validateExactPlanNode(input);
  expect(result).toMatchObject({ operation: "exact.validation", status: "passed", node: input.node,
    identity: JSON.parse(await readFile(input.plan, "utf8")).plan.nodes[input.node].identity,
    commands: [{ directory: "packages/electron-contract", args: ["test"] }] });
  expect(await readFile(input.log, "utf8")).toContain("executed contract test");
  const original = await readFile(input.receipt);
  await expect(validateExactPlanNode(input)).rejects.toThrow("receipt already exists");
  expect(await readFile(input.receipt)).toEqual(original);
});

it("rejects unknown, unselected or stale plans before running commands", async () => {
  const input = await fixture();
  await expect(validateExactPlanNode({ ...input, node: "arbitrary-command" })).rejects.toThrow("unsupported");
  await expect(validateExactPlanNode({ ...input, node: "closure.test" })).rejects.toThrow("not selected");
  await writeFile(join(input.root, "electron.contract.test/input.txt"), "changed test");
  await expect(validateExactPlanNode(input)).rejects.toThrow("binding mismatch");
  await expect(readFile(input.log)).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([
  ['node -e "console.error(\'intentional failure\');process.exit(2)"', "validation failed"],
  ['node -e "require(\'node:fs\').appendFileSync(\'../../electron.contract.test/input.txt\',\'changed\')"', "source changed"],
])("retains logs but no successful receipt for %s", async (script, message) => {
  const input = await fixture(script);
  await expect(validateExactPlanNode(input)).rejects.toThrow(message);
  expect((await readFile(input.log)).length).toBeGreaterThan(0);
  await expect(readFile(input.receipt)).rejects.toMatchObject({ code: "ENOENT" });
});
