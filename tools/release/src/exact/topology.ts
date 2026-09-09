import { join } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { readObject, writeObject } from "./control-common.ts";

type Entry = Readonly<{ shell: "electron" | "terminal"; target: string; workload: string; platform_workload?: string; runner_class: string; runs_on: string }>;
function entries(value: unknown): Entry[] {
  if (!Array.isArray(value)) throw new Error("topology must declare active and deferred arrays");
  return value.map(entry => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== (entry.shell === "electron"
        ? "platform_workload,runner_class,runs_on,shell,target,workload" : "runner_class,runs_on,shell,target,workload")
      || (entry.shell === "electron" && (typeof entry.platform_workload !== "string" || !/^[a-z][a-z0-9_]*$/u.test(entry.platform_workload)))
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
  // Data is shared content, not one copy per native Shell. Its declared producer
  // supplies the conservative target identity and execution class for all groups.
  const data = declaration.data;
  if (data == null || Object.keys(data).sort().join(",") !== "runner_class,runs_on,target"
    || !active.some(entry => entry.shell === "electron" && entry.target === data.target
      && entry.runner_class === data.runner_class && entry.runs_on === data.runs_on)) throw new Error("data producer must match an active Electron target");
  const dataMatrix = { include: CLOSURE_DATA_RESOURCES.map(({ id }) => ({ ...data, resource_id: id,
    workload: `closure_data_${id.replaceAll("-", "_")}_${data.target.replaceAll("-", "_")}` })) };
  const scopes = new Set<string>(), workloads = new Set<string>(), runners = new Map<string, string>();
  for (const entry of [...active, ...deferred]) {
    const scope = `${entry.shell}/${entry.target}`;
    if (scopes.has(scope)) throw new Error("duplicate release topology target or workload");
    scopes.add(scope);
    for (const workload of [entry.workload, ...(entry.platform_workload == null ? [] : [entry.platform_workload])]) {
      if (workloads.has(workload)) throw new Error("duplicate release topology target or workload");
      workloads.add(workload);
    }
    const runner = runners.get(entry.runner_class);
    if (runner != null && runner !== entry.runs_on) throw new Error("release topology runner class is inconsistent");
    runners.set(entry.runner_class, entry.runs_on);
  }
  const resolved = [];
  for (const entry of dataMatrix.include) {
    if (workloads.has(entry.workload)) throw new Error("duplicate release topology target or workload");
    workloads.add(entry.workload);
  }
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
    resolved.push({ ...entry, mode, ...(entry.shell === "electron" ? { base_workload: `electron_base_${entry.target.replaceAll("-", "_")}` } : {}) });
  }
  const topology = { active: resolved, deferred, data };
  // Convergence requires a complete workload/runner declaration, even for
  // disabled targets. Only active entries belong in the execution matrix.
  const scope = { enabled: Object.fromEntries([
    ...resolved.flatMap(entry => [[entry.workload, true], ...(entry.platform_workload == null ? [] : [[entry.platform_workload, true]])]),
    ...deferred.flatMap(entry => [[entry.workload, false], ...(entry.platform_workload == null ? [] : [[entry.platform_workload, false]])]),
    ...dataMatrix.include.map(entry => [entry.workload, true]),
  ]) };
  const runnerPlan = Object.fromEntries([...runners].map(([runnerClass, label]) => [runnerClass, [label]]));
  await writeObject(join(input.output, "topology.json"), topology);
  await writeObject(join(input.output, "runners.json"), runnerPlan);
  const validationMatrix = { include: resolved.filter(entry => entry.shell === "electron") };
  // Platform bytes are needed for metadata composition in full and hot releases.
  // Only convergence decides whether they need building or can be restored.
  const platformMatrix = { include: resolved.filter(entry => entry.shell === "electron").map(entry => ({
    target: entry.target, workload: entry.platform_workload!, runner_class: entry.runner_class, runs_on: entry.runs_on,
  })) };
  const capsuleMatrix = { include: platformMatrix.include.map(entry => ({ ...entry, workload: `electron_capsule_${entry.target.replaceAll("-", "_")}` })) };
  for (const entry of [...active, ...deferred].filter(entry => entry.shell === "electron")) {
    for (const product of ["capsule", "base"]) {
      const workload = `electron_${product}_${entry.target.replaceAll("-", "_")}`;
      if (workloads.has(workload)) throw new Error("duplicate release topology target or workload");
      workloads.add(workload);
      scope.enabled[workload] = active.includes(entry);
    }
  }
  await writeObject(join(input.output, "scope.json"), scope);
  return { schemaVersion: 1, operation: "release.topology", matrix: { include: resolved }, validationMatrix, platformMatrix, capsuleMatrix, dataMatrix, topology, scope, runners: runnerPlan };
}
