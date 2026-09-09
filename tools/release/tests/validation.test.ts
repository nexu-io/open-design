import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { zipFixture } from "./archive-fixture.ts";
import { bindReleaseValidation, materializeReleaseValidations, resolveExactValidationRecipe, validateReleaseRecipe } from "@/exact/validation.ts";

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
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
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

it("binds a current subject without rewriting original execution provenance", async () => {
  const input = await fixture(), execution = await validateReleaseRecipe(input);
  const original = structuredClone(execution), sourceCommit = "b".repeat(40);
  const binding = bindReleaseValidation(execution, { node: input.node, target: input.target, sourceCommit });
  expect(binding.sourceCommit).toBe(sourceCommit);
  expect(binding.execution).toEqual(original);
  expect(binding.execution.sourceCommit).toBe(input.sourceCommit);
  expect(execution).toEqual(original);
  for (const change of [{ status: "failed" }, { coverage: "business" }, { commands: [] }, { node: "closure.test" }]) {
    expect(() => bindReleaseValidation({ ...execution, ...change }, { node: input.node, target: input.target, sourceCommit }))
      .toThrow("binding mismatch");
  }
});

it("materializes declared test batches and emits independently retainable evidence", async () => {
  const input = await fixture(), sources = join(input.root, "sources.json"), output = join(input.root, "output");
  await writeFile(sources, JSON.stringify({ sources: [{ id: "contract", node: input.node, target: input.target }] }));
  const result = await materializeReleaseValidations({ sources, output, root: input.root, sourceCommit: input.sourceCommit });
  expect(result.bindings).toHaveLength(1);
  expect(JSON.parse(await readFile(join(output, "contract.json"), "utf8"))).toMatchObject({ operation: "exact.validation.binding" });
  expect(JSON.parse(await readFile(join(output, "products/contract/result.json"), "utf8")))
    .toMatchObject({ operation: "exact.validation", sourceCommit: input.sourceCommit });
  await expect(materializeReleaseValidations({ sources, output, root: input.root, sourceCommit: input.sourceCommit }))
    .rejects.toThrow("receipt already exists");
});

it("restores verified execution evidence without requiring a workspace or rerunning tests", async () => {
  const input = await fixture(), execution = await validateReleaseRecipe(input);
  const body = await zipFixture({ "result.json": JSON.stringify(execution), "test.log": "original log" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(body))));
  const sources = join(input.root, "cached.json"), output = join(input.root, "restored");
  const artifact = { url: "https://cache.example/validation.zip", sha256: createHash("sha256").update(body).digest("hex") };
  await writeFile(sources, JSON.stringify({ sources: [{ id: "contract", node: input.node, target: input.target, artifact }] }));
  const result = await materializeReleaseValidations({ sources, output, root: join(input.root, "absent-workspace"), sourceCommit: "b".repeat(40) });
  expect(result.bindings[0]).toMatchObject({ sourceCommit: "b".repeat(40), execution });
  expect(await readFile(join(output, "products/contract/test.log"), "utf8")).toBe("original log");
  await writeFile(sources, JSON.stringify({ sources: [{ id: "contract", node: input.node, target: input.target,
    artifact: { ...artifact, sha256: "0".repeat(64) } }] }));
  await expect(materializeReleaseValidations({ sources, output: join(input.root, "corrupt"), root: input.root, sourceCommit: input.sourceCommit }))
    .rejects.toThrow("digest mismatch");
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
