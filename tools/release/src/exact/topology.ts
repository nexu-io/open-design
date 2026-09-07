import { join } from "node:path";
import { readObject, writeObject } from "./control-common.ts";

type Entry = Readonly<{ shell: "electron" | "terminal"; target: string; workload: string; runner_class: string; runs_on: string }>;
function entries(value: unknown): Entry[] {
  if (!Array.isArray(value)) throw new Error("topology must declare active and deferred arrays");
  return value.map(entry => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== "runner_class,runs_on,shell,target,workload"
      || !["electron", "terminal"].includes(entry.shell) || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(entry.target)
      || !/^[a-z][a-z0-9_]*$/u.test(entry.workload) || !/^[a-z][a-z0-9_]*$/u.test(entry.runner_class)
      || typeof entry.runs_on !== "string" || !entry.runs_on.trim()) throw new Error("invalid release topology declaration");
    return entry as Entry;
  });
}

export async function projectReleaseTopology(input: Readonly<{ declaration: string; plans: string; output: string }>) {
  const declaration = await readObject(input.declaration);
  const active = entries(declaration.active), deferred = entries(declaration.deferred);
  if (active.length === 0) throw new Error("release topology has no active targets");
  const scopes = new Set<string>(), workloads = new Set<string>(), runners = new Map<string, string>();
  for (const entry of [...active, ...deferred]) {
    const scope = `${entry.shell}/${entry.target}`;
    if (scopes.has(scope) || workloads.has(entry.workload)) throw new Error("duplicate release topology target or workload");
    scopes.add(scope); workloads.add(entry.workload);
    const runner = runners.get(entry.runner_class);
    if (runner != null && runner !== entry.runs_on) throw new Error("release topology runner class is inconsistent");
    runners.set(entry.runner_class, entry.runs_on);
  }
  const resolved = [];
  for (const entry of active) {
    let mode: "full" | "hot" = "full";
    if (entry.shell === "electron") {
      const plan = await readObject(join(input.plans, `electron-${entry.target}.json`));
      if (plan.schemaVersion !== 1 || plan.plan?.target !== entry.target || !Array.isArray(plan.actions)
        || plan.actions.some((action: unknown) => action == null || typeof action !== "object" || !("id" in action) || typeof action.id !== "string")) throw new Error("release topology plan is invalid");
      if (!plan.actions.some((action: { id: string }) => action.id === "electron.distribution")) {
        if (plan.baseline?.mode !== "accepted" || plan.baseline?.requiredAcceptance !== "hot") throw new Error("hot topology lacks an accepted Shell baseline");
        mode = "hot";
      }
    }
    resolved.push({ ...entry, mode });
  }
  const topology = { active: resolved, deferred };
  const scope = { enabled: Object.fromEntries(resolved.map(entry => [entry.workload, true])) };
  const runnerPlan = Object.fromEntries(resolved.map(entry => [entry.runner_class, [entry.runs_on]]));
  await writeObject(join(input.output, "topology.json"), topology);
  await writeObject(join(input.output, "scope.json"), scope);
  await writeObject(join(input.output, "runners.json"), runnerPlan);
  return { schemaVersion: 1, operation: "release.topology", matrix: { include: resolved }, topology, scope, runners: runnerPlan };
}
