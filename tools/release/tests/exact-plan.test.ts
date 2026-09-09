import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseContentIdentityRegistry, resolveContentIdentityDeclaration } from "@open-design/metatool";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";

import { createExactPlan, resolveExactBasePlanNode, selectExactPlanActions, EXACT_DATA_PLAN_NODE_IDS, type ExactPlan } from "@/exact/plan.js";
import { writeExactPlan } from "@/exact/write-plan.ts";

const roots: string[] = [];
const ACCEPTED_BASELINE = `sha256:${"a".repeat(64)}` as const;

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(): Promise<{ registry: ReturnType<typeof parseContentIdentityRegistry>; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "od-exact-plan-"));
  roots.push(root);
  const ids = [
    ...EXACT_DATA_PLAN_NODE_IDS,
    "electron.contract.build",
    "electron.contract.test", "electron.platform.build", "electron.capsule.build", "electron.base.build",
    "electron.shell.build",
    "electron.shell.test",
    "closure.build",
    "closure.test",
    "electron.distribution",
    "electron.acceptance.full",
    "closure.acceptance.hot",
  ] as const;
  for (const id of ids) {
    await mkdir(join(root, id), { recursive: true });
    await writeFile(join(root, id, "input.txt"), `${id}\n`);
  }
  return {
    registry: parseContentIdentityRegistry({
      identities: Object.fromEntries(ids.map((id) => [id, {
        parameters: (id.startsWith("electron.") && !id.startsWith("electron.contract.")) || id === "closure.acceptance.hot"
          ? ["target", "acceptedShellBaseline"]
          : ["target"],
        schemaVersion: 1,
        sourceSets: [id],
      }])),
      schemaVersion: 1,
      sourceSets: Object.fromEntries(ids.map((id) => [id, { paths: [id] }])),
    }),
    root,
  };
}

function identities(plan: ExactPlan): Set<string> {
  return new Set(Object.values(plan.nodes).map((node) => node.identity));
}

describe("exact release plan", () => {
  it("binds base production to carrier inputs and selects only downstream work for base changes", async () => {
    const input = { ...await fixture(), acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const registryPath = join(input.root, "registry.json");
    await writeFile(registryPath, JSON.stringify(input.registry));
    const before = await createExactPlan(input);
    expect(await resolveExactBasePlanNode({ ...input, registryPath })).toEqual(before.nodes["electron.base.build"]);
    expect(before.nodes["electron.base.build"].dependencies).toEqual(["electron.shell.build"]);
    await writeFile(join(input.root, "electron.base.build/input.txt"), "new assembly inputs");
    const after = await createExactPlan(input);
    expect(selectExactPlanActions(after, identities(before)).map(action => action.id)).toEqual([
      "electron.base.build", "electron.distribution", "electron.acceptance.full", "exact.compose", "exact.publish", "exact.activate",
    ]);
    expect(after.nodes["electron.shell.build"].identity).toBe(before.nodes["electron.shell.build"].identity);
  });
  it("writes the versioned plan envelope required by independent build and cache commands", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "registry.json"), JSON.stringify(f.registry));
    await writeExactPlan({ root: f.root, registry: "registry.json", output: "plan.json",
      target: "darwin-arm64", acceptedShellBaseline: ACCEPTED_BASELINE });
    const receipt = JSON.parse(await readFile(join(f.root, "plan.json"), "utf8"));
    expect(receipt).toMatchObject({ schemaVersion: 1, plan: { target: "darwin-arm64",
      nodes: { "electron.capsule.build": { target: "darwin-arm64" } } } });
    expect(receipt.actions).toContainEqual({ id: "electron.capsule.build", reason: "identity-miss" });
  });
  it("selects Capsule and hot acceptance for an independent Capsule identity change", async () => {
    const input = { ...await fixture(), acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const before = await createExactPlan(input);
    await writeFile(join(input.root, "electron.capsule.build/input.txt"), "changed capsule");
    const after = await createExactPlan(input);
    expect(after.nodes["electron.capsule.build"].dependencies).toEqual([]);
    expect(selectExactPlanActions(after, identities(before)).map(action => action.id)).toEqual([
      "electron.capsule.build", "closure.acceptance.hot", "exact.compose", "exact.publish", "exact.activate",
    ]);
  });
  it("rebuilds only the independent platform and downstream distribution when native inputs change", async () => {
    const input = { ...await fixture(), acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const before = await createExactPlan(input);
    await writeFile(join(input.root, "electron.platform.build/input.txt"), "changed platform");
    const after = await createExactPlan(input);
    expect(selectExactPlanActions(after, identities(before)).map(action => action.id)).toEqual([
      "electron.platform.build", "electron.distribution", "electron.acceptance.full", "exact.compose", "exact.publish", "exact.activate",
    ]);
    expect(after.nodes["electron.platform.build"].dependencies).toEqual([]);
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const registry = parseContentIdentityRegistry(JSON.parse(await readFile(join(repositoryRoot, "tools/release/resources/exact-plan-identities.json"), "utf8")));
    const paths = resolveContentIdentityDeclaration(registry, "electron.platform.build").sources.map(source => source.path);
    expect(paths).toContain("shells/electron/config/carriers/node-lock.json");
    expect(paths).toContain("shells/electron/resources/platform");
    expect(paths.some(path => path.startsWith("apps/") || path.startsWith("packages/electron-capsule"))).toBe(false);
  });
  it("selects only the changed data producer and hot acceptance when independent results are available", async () => {
    const input = { ...await fixture(), acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const before = await createExactPlan(input);
    await writeFile(join(input.root, "closure.data.craft.build", "input.txt"), "new craft bytes");
    const after = await createExactPlan(input);
    expect(selectExactPlanActions(after, identities(before)).map(action => action.id)).toEqual([
      "closure.data.craft.build", "closure.acceptance.hot", "exact.compose", "exact.publish", "exact.activate",
    ]);
    for (const id of EXACT_DATA_PLAN_NODE_IDS.filter(id => id !== "closure.data.craft.build")) {
      expect(after.nodes[id].identity).toBe(before.nodes[id].identity);
    }
  });
  it("declares one byte-exact data identity per public Closure resource", async () => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const registry = parseContentIdentityRegistry(JSON.parse(await readFile(join(repositoryRoot, "tools/release/resources/exact-plan-identities.json"), "utf8")));
    for (const resource of CLOSURE_DATA_RESOURCES) {
      const { sources } = resolveContentIdentityDeclaration(registry, `closure.data.${resource.id}.build`);
      for (const input of resource.inputs) {
        expect(sources.find(source => source.path === input.source)).toMatchObject({ excludeDirectoryNames: [] });
      }
      expect(sources.map(source => source.path)).toContain("apps/closure/src/build/data-resources.ts");
      expect(sources.some(source => source.path.startsWith("apps/daemon") || source.path.startsWith("apps/web"))).toBe(false);
    }
  });
  it("keeps the checked-in identities complete and separated by delivery boundary", async () => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const registry = parseContentIdentityRegistry(JSON.parse(await readFile(join(repositoryRoot, "tools/release/resources/exact-plan-identities.json"), "utf8")) as unknown);
    for (const id of Object.keys(registry.identities)) {
      const paths = resolveContentIdentityDeclaration(registry, id).sources.map(({ path }) => path);
      await Promise.all(paths.map(async (path) => await access(join(repositoryRoot, path))));
      expect(paths.some((path) => path.includes("linux"))).toBe(false);
    }
    const contractPaths = resolveContentIdentityDeclaration(registry, "electron.contract.build").sources.map(({ path }) => path);
    expect(contractPaths).toContain("packages/electron-contract/src");
    expect(contractPaths).not.toContain("packages/electron-kit/src");

    const shellSources = resolveContentIdentityDeclaration(registry, "electron.shell.build").sources;
    const shellPaths = shellSources.map(({ path }) => path);
    expect(shellPaths).toContain("shells/electron/src");
    expect(shellPaths).toContain("packages/sidecar/esbuild.config.mjs");
    expect(shellPaths).toContain("packages/standalone/esbuild.config.ts");
    expect(resolveContentIdentityDeclaration(registry, "electron.shell.test").sources.map(({ path }) => path))
      .toContain("packages/standalone/tests/packages");
    expect(shellPaths).toContain("packages/electron-kit/src");
    // Until the physical entry selects an external Capsule, its actual bundle
    // still includes Capsule code. Moving source must not authorize reuse.
    expect(shellPaths).toContain("packages/electron-capsule/src");
    expect(resolveContentIdentityDeclaration(registry, "electron.shell.test").sources.map(({ path }) => path))
      .toContain("packages/electron-capsule/tests");
    expect(shellSources.find(({ path }) => path === "packages/electron-kit/src")?.excludePaths).toEqual([
      "cdp", "cdp-api.ts",
    ]);
    expect(shellPaths.some((path) => path.startsWith("apps/web") || path.startsWith("apps/daemon") || path.startsWith("apps/closure"))).toBe(false);

    const hotAcceptancePaths = resolveContentIdentityDeclaration(registry, "closure.acceptance.hot").sources.map(({ path }) => path);
    expect(hotAcceptancePaths).toContain("packages/electron-kit/src/cdp");

    const closurePaths = resolveContentIdentityDeclaration(registry, "closure.build").sources.map(({ path }) => path);
    expect(closurePaths).toContain("apps/closure/src");
    expect(closurePaths).toContain("apps/web/sidecar");
    for (const resource of CLOSURE_DATA_RESOURCES) for (const input of resource.inputs) expect(closurePaths).not.toContain(input.source);
    expect(closurePaths).not.toContain("shells/electron/src");
    expect(closurePaths).not.toContain("packages/electron-kit/src");
  });

  it("isolates each data-only change using the real registry without rebuilding runtime, carrier or tests", async () => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const registry = parseContentIdentityRegistry(JSON.parse(await readFile(join(repositoryRoot, "tools/release/resources/exact-plan-identities.json"), "utf8")));
    const root = await mkdtemp(join(tmpdir(), "od-exact-data-plan-")); roots.push(root);
    const paths = new Set(Object.keys(registry.identities).flatMap(id => resolveContentIdentityDeclaration(registry, id).sources.map(source => source.path)));
    for (const path of paths) {
      const directory = (await stat(join(repositoryRoot, path))).isDirectory();
      const file = join(root, path, ...(directory ? ["fixture.ts"] : []));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, path.endsWith("package.json") ? '{"name":"fixture","version":"1.0.0"}' : "baseline\n");
    }
    const input = { root, registry, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const before = await createExactPlan(input);
    for (const resource of CLOSURE_DATA_RESOURCES) {
      const path = join(root, resource.inputs[0]!.source, "fixture.ts");
      await writeFile(path, "changed data\n");
      const after = await createExactPlan(input);
      expect(selectExactPlanActions(after, identities(before)).map(action => action.id), resource.id).toEqual([
        `closure.data.${resource.id}.build`, "closure.acceptance.hot", "exact.compose", "exact.publish", "exact.activate",
      ]);
      await writeFile(path, "baseline\n");
    }
  });

  it.each([
    "lifecycle-api.ts",
    "adapters/tools/lifecycle/observation.ts",
    "adapters/tools/lifecycle/dev-tool.ts",
    "adapters/tools/lifecycle/runtime-tool.ts",
  ])("reuses Carrier products but reruns validation for %s using the real registry", async (lifecyclePath) => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const registry = parseContentIdentityRegistry(JSON.parse(await readFile(join(repositoryRoot, "tools/release/resources/exact-plan-identities.json"), "utf8")) as unknown);
    const root = await mkdtemp(join(tmpdir(), "od-exact-lifecycle-plan-"));
    roots.push(root);
    // Minimal bytes at every real declared boundary; no parallel copy of selector rules.
    const paths = new Set(Object.keys(registry.identities).flatMap(id => resolveContentIdentityDeclaration(registry, id).sources.map(source => source.path)));
    for (const path of paths) {
      const directory = (await stat(join(repositoryRoot, path))).isDirectory();
      const file = join(root, path, ...(directory ? ["fixture.ts"] : []));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, path.endsWith("package.json") ? '{"name":"fixture","version":"1.0.0"}' : "baseline\n");
    }
    const changedPath = join(root, "shells/electron/src", lifecyclePath);
    await mkdir(dirname(changedPath), { recursive: true });
    await writeFile(changedPath, "baseline\n");
    const input = { root, registry, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" as const };
    const before = await createExactPlan(input);
    await writeFile(changedPath, "changed lifecycle observation\n");
    const after = await createExactPlan(input);
    expect(after.nodes["electron.shell.build"].identity).toBe(before.nodes["electron.shell.build"].identity);
    expect(after.nodes["electron.distribution"].identity).toBe(before.nodes["electron.distribution"].identity);
    expect(selectExactPlanActions(after, identities(before)).map(action => action.id)).toEqual([
      "electron.shell.test", "electron.acceptance.full", "exact.compose", "exact.publish", "exact.activate",
    ]);
    const budgetPath = join(root, "tools/release/src/exact/capsule-budget.ts");
    await writeFile(budgetPath, "changed release budget\n");
    const budgetChange = await createExactPlan(input);
    expect(budgetChange.nodes["electron.shell.build"].identity).toBe(after.nodes["electron.shell.build"].identity);
    expect(budgetChange.nodes["closure.build"].identity).toBe(after.nodes["closure.build"].identity);
    expect(budgetChange.nodes["electron.distribution"].identity).not.toBe(after.nodes["electron.distribution"].identity);
    await writeFile(budgetPath, "baseline\n");
    const nativeLock = join(root, "shells/electron/resources/platform/package-lock.json");
    await mkdir(dirname(nativeLock), { recursive: true });
    await writeFile(nativeLock, '{"native":"changed"}');
    const platformChange = await createExactPlan(input);
    expect(platformChange.nodes["electron.shell.build"].identity).not.toBe(after.nodes["electron.shell.build"].identity);
    // New or mixed production inputs must still invalidate the Carrier.
    await writeFile(join(root, "shells/electron/src/new-production-entry.ts"), "new runtime behavior\n");
    const mixed = await createExactPlan(input);
    expect(mixed.nodes["electron.shell.build"].identity).not.toBe(platformChange.nodes["electron.shell.build"].identity);
    expect(selectExactPlanActions(mixed, identities(platformChange)).map(action => action.id)).toContain("electron.distribution");
    const packageSource = join(root, "packages/standalone/src/packages/runtime.ts");
    await mkdir(dirname(packageSource), { recursive: true });
    await writeFile(packageSource, "physical package binding change\n");
    const physical = await createExactPlan(input);
    expect(physical.nodes["electron.shell.build"].identity).not.toBe(mixed.nodes["electron.shell.build"].identity);
    expect(physical.nodes["closure.build"].identity).toBe(mixed.nodes["closure.build"].identity);
    await writeFile(join(root, "packages/standalone/tests/packages/fixture.ts"), "physical binding test change\n");
    const physicalTest = await createExactPlan(input);
    expect(physicalTest.nodes["electron.shell.build"].identity).toBe(physical.nodes["electron.shell.build"].identity);
    expect(physicalTest.nodes["electron.shell.test"].identity).not.toBe(physical.nodes["electron.shell.test"].identity);
    expect(selectExactPlanActions(physicalTest, identities(physical)).map(action => action.id)).toContain("electron.acceptance.full");
  });

  it("uses hot acceptance for a Closure-only change while reusing the accepted Shell", async () => {
    const input = await fixture();
    const before = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" });
    await writeFile(join(input.root, "closure.build", "input.txt"), "changed\n");
    const after = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" });
    const actions = selectExactPlanActions(after, identities(before)).map(({ id }) => id);

    expect(after.nodes["electron.shell.build"].identity).toBe(before.nodes["electron.shell.build"].identity);
    expect(after.nodes["electron.shell.test"].identity).toBe(before.nodes["electron.shell.test"].identity);
    expect(after.nodes["electron.distribution"].identity).toBe(before.nodes["electron.distribution"].identity);
    expect(actions).toEqual([
      "closure.build",
      "closure.test",
      "closure.acceptance.hot",
      "exact.compose",
      "exact.publish",
      "exact.activate",
    ]);
  });

  it("requires full installed acceptance when the Shell boundary changes", async () => {
    const input = await fixture();
    const before = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "win32-x64" });
    await writeFile(join(input.root, "electron.shell.build", "input.txt"), "changed\n");
    const after = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "win32-x64" });
    const actions = selectExactPlanActions(after, identities(before)).map(({ id }) => id);

    expect(actions).toEqual([
      "electron.shell.build",
      "electron.shell.test",
      "electron.base.build",
      "electron.distribution",
      "electron.acceptance.full",
      "exact.compose",
      "exact.publish",
      "exact.activate",
    ]);
    expect(actions).not.toContain("closure.acceptance.hot");
  });

  it("keeps activation explicit when every reusable result is available", async () => {
    const input = await fixture();
    const plan = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-x64" });
    expect(selectExactPlanActions(plan, identities(plan)).map(({ id }) => id)).toEqual([
      "exact.compose",
      "exact.publish",
      "exact.activate",
    ]);
  });

  it("invalidates only Shell-bound work when its accepted baseline advances", async () => {
    const input = await fixture();
    const before = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" });
    const after = await createExactPlan({
      ...input,
      acceptedShellBaseline: `sha256:${"b".repeat(64)}`,
      target: "darwin-arm64",
    });
    expect(after.nodes["closure.build"].identity).toBe(before.nodes["closure.build"].identity);
    expect(after.nodes["closure.test"].identity).toBe(before.nodes["closure.test"].identity);
    expect(after.nodes["electron.shell.build"].identity).not.toBe(before.nodes["electron.shell.build"].identity);
    expect(after.nodes["electron.distribution"].identity).not.toBe(before.nodes["electron.distribution"].identity);
    expect(after.nodes["electron.acceptance.full"].identity).not.toBe(before.nodes["electron.acceptance.full"].identity);
  });
});
