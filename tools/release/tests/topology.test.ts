import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectReleaseTopology } from "@/exact/topology.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(hot = false) {
  const root = await mkdtemp(join(tmpdir(), "release-topology-")); roots.push(root);
  const declaration = join(root, "declaration.json"), plans = join(root, "plans"), output = join(root, "output");
  const active = ["terminal", "electron"].map(shell => ({ shell, target: "darwin-arm64", workload: `${shell}_scene`,
    ...(shell === "electron" ? { platform_workload: "platform_mac" } : {}), runner_class: `${shell}_mac`, runs_on: "macos-15" }));
  const deferred = [{ shell: "electron", target: "win32-x64", workload: "electron_win", platform_workload: "platform_win", runner_class: "electron_win", runs_on: "windows-2025" }];
  await writeFile(declaration, JSON.stringify({ active, deferred })); await mkdir(plans);
  await writeFile(join(plans, "electron-darwin-arm64.json"), JSON.stringify({ schemaVersion: 1, plan: { target: "darwin-arm64" },
    actions: hot ? [{ id: "closure.acceptance.hot" }] : [{ id: "electron.distribution" }],
    baseline: hot ? { mode: "accepted", requiredAcceptance: "hot" } : { mode: "cold", requiredAcceptance: "full" } }));
  return { declaration, plans, output };
}

it.each([false, true])("projects full/hot=%s without activating deferred Windows or dropping Terminal", async hot => {
  const f = await fixture(hot), result = await projectReleaseTopology(f);
  expect(result.matrix.include.map(value => [value.shell, value.mode])).toEqual([["terminal", "full"], ["electron", hot ? "hot" : "full"]]);
  expect(result.scope.enabled).toEqual({ terminal_scene: true, electron_scene: true, electron_win: false, platform_mac: true, platform_win: false });
  expect(result.platformMatrix.include).toEqual([{ target: "darwin-arm64", workload: "platform_mac", runner_class: "electron_mac", runs_on: "macos-15" }]);
  expect(result.runners).toEqual({ terminal_mac: ["macos-15"], electron_mac: ["macos-15"], electron_win: ["windows-2025"] });
  expect(result.topology.deferred).toHaveLength(1);
  expect(result.validationMatrix.include.map(value => value.target)).toEqual(["darwin-arm64"]);
  expect(result.validationMatrix.include.every(value => value.shell === "electron")).toBe(true);
  expect(JSON.parse(await readFile(join(f.output, "topology.json"), "utf8"))).toEqual(result.topology);
});

it("rejects omission without accepted baseline and duplicate topology", async () => {
  const f = await fixture();
  await writeFile(join(f.plans, "electron-darwin-arm64.json"), JSON.stringify({ schemaVersion: 1, plan: { target: "darwin-arm64" }, actions: [] }));
  await expect(projectReleaseTopology(f)).rejects.toThrow("accepted Shell baseline");
  const declaration = JSON.parse(await readFile(f.declaration, "utf8")); declaration.active.push(declaration.active[0]);
  await writeFile(f.declaration, JSON.stringify(declaration));
  await expect(projectReleaseTopology(f)).rejects.toThrow("duplicate");
});
