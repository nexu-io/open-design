import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseContentIdentityRegistry, resolveContentIdentityDeclaration } from "@open-design/metatool";

import { createExactPlan, selectExactPlanActions, type ExactPlan } from "../src/exact/plan.js";

const roots: string[] = [];
const ACCEPTED_BASELINE = `sha256:${"a".repeat(64)}` as const;

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(): Promise<{ registry: ReturnType<typeof parseContentIdentityRegistry>; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "od-exact-plan-"));
  roots.push(root);
  const ids = [
    "electron.contract.build",
    "electron.contract.test",
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
    expect(shellSources.find(({ path }) => path === "packages/electron-kit/src")?.excludePaths).toEqual([
      "cdp", "cdp-api.ts",
    ]);
    expect(shellPaths.some((path) => path.startsWith("apps/web") || path.startsWith("apps/daemon") || path.startsWith("apps/closure"))).toBe(false);

    const hotAcceptancePaths = resolveContentIdentityDeclaration(registry, "closure.acceptance.hot").sources.map(({ path }) => path);
    expect(hotAcceptancePaths).toContain("packages/electron-kit/src/cdp");

    const closurePaths = resolveContentIdentityDeclaration(registry, "closure.build").sources.map(({ path }) => path);
    expect(closurePaths).toContain("apps/closure/src");
    expect(closurePaths).toEqual(expect.arrayContaining(["skills", "design-templates", "design-systems", "craft", "plugins/_official", "plugins/registry", "assets/frames", "assets/community-pets", "prompt-templates", "data/plugin-previews"]));
    expect(closurePaths).not.toContain("shells/electron/src");
    expect(closurePaths).not.toContain("packages/electron-kit/src");
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
