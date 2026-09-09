import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createExactPlanFromRegistryFile } from "../src/exact/plan.ts";
import { resolveExactValidationRecipe, validateExactPlanNode } from "../src/exact/validation.ts";

const roots: string[] = [];
it("defaults Closure validation to architecture boundaries, not business aggregates", () => {
  const recipe = resolveExactValidationRecipe("closure.test");
  expect(recipe.coverage).toBe("architecture");
  expect(recipe.commands.find(command => command.directory === "apps/closure")?.args).toEqual(["test"]);
  for (const directory of ["apps/daemon", "apps/web"]) {
    const command = recipe.commands.find(command => command.directory === directory)!;
    expect(command.args.slice(0, 3)).toEqual(["exec", "vitest", "run"]);
    expect(command.args.some(arg => arg.startsWith("tests/") && arg.endsWith(".test.ts"))).toBe(true);
    expect(command.args).not.toEqual(["test"]);
  }
});

it("requires an explicit reason for business coverage and rejects unsupported combinations", () => {
  expect(() => resolveExactValidationRecipe("closure.test", "business")).toThrow("reason");
  expect(() => resolveExactValidationRecipe("closure.test", "business", " ")).toThrow("reason");
  expect(() => resolveExactValidationRecipe("electron.shell.test", "business", "risk")).toThrow("only Closure");
  expect(() => resolveExactValidationRecipe("closure.test", "unknown", "risk")).toThrow("coverage");
  const recipe = resolveExactValidationRecipe("closure.test", "business", "broad business change");
  expect(recipe.commands.map(command => command.directory)).toEqual(["apps/closure", "apps/daemon", "apps/web"]);
  expect(recipe.commands.every(command => JSON.stringify(command.args) === '["test"]')).toBe(true);
});
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

it.runIf(process.platform === "darwin" && process.arch === "arm64")("keeps business receipts distinct using tiny fixture packages, never real business suites", async () => {
  const input = await fixture();
  const plan = JSON.parse(await readFile(input.plan, "utf8"));
  plan.actions = [{ id: "closure.test" }];
  await writeFile(input.plan, JSON.stringify(plan));
  for (const directory of ["apps/closure", "apps/daemon", "apps/web"]) {
    await mkdir(join(input.root, directory), { recursive: true });
    await writeFile(join(input.root, directory, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: 'node -e "console.log(\'fixture only\')"' } }));
  }
  const result = await validateExactPlanNode({ ...input, node: "closure.test", coverage: "business", reason: "fixture verifies explicit aggregate dispatch" });
  expect(result).toMatchObject({ operation: "exact.business-validation", coverage: "business", planIdentity: plan.plan.nodes["closure.test"].identity,
    reason: "fixture verifies explicit aggregate dispatch" });
  expect(result.identity).not.toBe(result.planIdentity);
  expect(result.commands).toHaveLength(3);
});

it("rejects unknown, unselected or stale plans before running commands", async () => {
  const input = await fixture();
  await expect(validateExactPlanNode({ ...input, node: "arbitrary-command" })).rejects.toThrow("unsupported");
  await expect(validateExactPlanNode({ ...input, node: "closure.test" })).rejects.toThrow("not selected");
  await writeFile(join(input.root, "electron.contract.test/input.txt"), "changed test");
  await expect(validateExactPlanNode(input)).rejects.toThrow("binding mismatch");
  await expect(readFile(input.log)).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["before", "during"])("does not invalidate a node receipt for unrelated source changes %s validation", async when => {
  const input = await fixture(when === "during"
    ? 'node -e "require(\'node:fs\').appendFileSync(\'../../closure.build/input.txt\',\'changed\')"'
    : undefined);
  if (when === "before") await writeFile(join(input.root, "closure.build/input.txt"), "unrelated Closure change");
  const result = await validateExactPlanNode(input);
  expect(result.identity).toBe(JSON.parse(await readFile(input.plan, "utf8")).plan.nodes[input.node].identity);
});

it.each([
  ['node -e "console.error(\'intentional failure\');process.exit(2)"', "validation failed"],
  ['node -e "require(\'node:fs\').appendFileSync(\'../../electron.contract.test/input.txt\',\'changed\')"', "source changed"],
  ['node -e "require(\'node:fs\').appendFileSync(\'../../electron.contract.build/input.txt\',\'changed\')"', "source changed"],
])("retains logs but no successful receipt for %s", async (script, message) => {
  const input = await fixture(script);
  await expect(validateExactPlanNode(input)).rejects.toThrow(message);
  expect((await readFile(input.log)).length).toBeGreaterThan(0);
  await expect(readFile(input.receipt)).rejects.toMatchObject({ code: "ENOENT" });
});
