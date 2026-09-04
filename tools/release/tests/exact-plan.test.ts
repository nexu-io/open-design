import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        parameters: id.startsWith("electron.") || id === "closure.acceptance.hot"
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
      expect(paths).not.toContain("apps/desktop");
      expect(paths).not.toContain("apps/packaged");
      expect(paths.some((path) => path.includes("linux"))).toBe(false);
    }
    const shellPaths = resolveContentIdentityDeclaration(registry, "electron.shell.build").sources.map(({ path }) => path);
    expect(shellPaths.some((path) => path.startsWith("apps/web") || path.startsWith("apps/daemon") || path.startsWith("apps/closure"))).toBe(false);
  });

  it("uses hot acceptance for a Closure-only change while reusing the accepted Shell", async () => {
    const input = await fixture();
    const before = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" });
    await writeFile(join(input.root, "closure.build", "input.txt"), "changed\n");
    const after = await createExactPlan({ ...input, acceptedShellBaseline: ACCEPTED_BASELINE, target: "darwin-arm64" });
    const actions = selectExactPlanActions(after, identities(before)).map(({ id }) => id);

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
