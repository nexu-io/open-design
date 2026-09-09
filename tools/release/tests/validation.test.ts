import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveExactValidationRecipe, validateReleaseRecipe } from "@/exact/validation.ts";

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
  await mkdir(join(root, "packages/electron-contract"), { recursive: true });
  await writeFile(join(root, "packages/electron-contract/package.json"), JSON.stringify({ name: "fixture", scripts: { test: script } }));
  return { root, target: "darwin-arm64", sourceCommit: "a".repeat(40), node: "electron.contract.test", log: join(root, "test.log"), receipt: join(root, "result.json") };
}

it("executes the selected recipe and emits execution provenance, not a plan identity", async () => {
  const input = await fixture(), result = await validateReleaseRecipe(input);
  expect(result).toMatchObject({ operation: "exact.validation", status: "passed", node: input.node,
    sourceCommit: input.sourceCommit, target: input.target,
    commands: [{ directory: "packages/electron-contract", args: ["test"] }] });
  expect(result).not.toHaveProperty("identity");
  expect(result).not.toHaveProperty("planIdentity");
  expect(await readFile(input.log, "utf8")).toContain("executed contract test");
  const original = await readFile(input.receipt);
  await expect(validateReleaseRecipe(input)).rejects.toThrow("receipt already exists");
  expect(await readFile(input.receipt)).toEqual(original);
});

it.runIf(process.platform === "darwin" && process.arch === "arm64")("keeps business receipts distinct using tiny fixture packages, never real business suites", async () => {
  const input = await fixture();
  for (const directory of ["apps/closure", "apps/daemon", "apps/web"]) {
    await mkdir(join(input.root, directory), { recursive: true });
    await writeFile(join(input.root, directory, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: 'node -e "console.log(\'fixture only\')"' } }));
  }
  const result = await validateReleaseRecipe({ ...input, node: "closure.test", coverage: "business", reason: "fixture verifies explicit aggregate dispatch" });
  expect(result).toMatchObject({ operation: "exact.business-validation", coverage: "business", sourceCommit: input.sourceCommit,
    reason: "fixture verifies explicit aggregate dispatch" });
  expect(result).not.toHaveProperty("identity");
  expect(result.commands).toHaveLength(3);
});

it("rejects unknown recipes and invalid execution provenance before running commands", async () => {
  const input = await fixture();
  await expect(validateReleaseRecipe({ ...input, node: "arbitrary-command" })).rejects.toThrow("unsupported");
  await expect(validateReleaseRecipe({ ...input, sourceCommit: "short" })).rejects.toThrow("full source commit");
  await expect(validateReleaseRecipe({ ...input, target: "linux-x64" })).rejects.toThrow("unsupported validation target");
  await expect(readFile(input.log)).rejects.toMatchObject({ code: "ENOENT" });
});

it("retains logs but no successful receipt for command failure", async () => {
  const input = await fixture('node -e "console.error(\'intentional failure\');process.exit(2)"');
  await expect(validateReleaseRecipe(input)).rejects.toThrow("validation failed");
  expect((await readFile(input.log)).length).toBeGreaterThan(0);
  await expect(readFile(input.receipt)).rejects.toMatchObject({ code: "ENOENT" });
});
