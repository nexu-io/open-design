import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { standaloneClosureDeliveryMatrix } from "../../resources/standalone-closure-delivery-matrix.js";

const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const requiredOutcomes = {
  "distribution": [
    "namespace-neutral-platform-archive",
    "shell-and-closure-build-independence",
    "manifest-inventory-digest-consistency",
    "detached-manifest-signature-assets",
    "publish-false-release-storage-retrieval",
  ],
  "local-debug": [
    "one-tools-dev-control-plane",
    "source-body-start-status-logs-stop",
    "namespace-isolated-cleanup",
    "no-release-publication-required",
  ],
  "local-e2e": [
    "real-shim-real-body",
    "local-release-source",
    "fresh-reuse-reject-reinstall-rollback",
    "exact-readiness-no-fixed-sleep",
  ],
  "process-lifecycle": [
    "daemon-before-web-readiness",
    "web-before-daemon-shutdown",
    "partial-start-convergence",
    "requested-stop-versus-unexpected-failure",
  ],
  "shell-shim": [
    "min-version-or-handoff-once",
    "generation-bound-capability-result",
    "generation-bound-terminal-status",
    "no-store-or-body-layout-read-by-shell",
  ],
  "update-lifecycle": [
    "discover-trust-materialize-activate",
    "confirm-or-bounded-rollback",
    "no-live-swap",
    "shell-min-version-before-body-download",
  ],
  "windows-installer": [
    "namespace-scoped-product-identity",
    "stop-before-overwrite",
    "min-version-installer-reinstall",
    "cold-start-and-clean-uninstall",
  ],
} as const;

const acceptanceLevels = [
  "contract",
  "component",
  "local-real",
  "platform-product",
] as const;

type AcceptanceLevel = (typeof acceptanceLevels)[number];
type LaneId = keyof typeof requiredOutcomes;

type Gate = {
  level: AcceptanceLevel;
  state: "planned" | "proven";
  witness?: string;
};

type Lane = {
  coordinates: string[];
  evidence: Array<{ path: string; role: string }>;
  gates: Gate[];
  id: LaneId;
  owners: string[];
  requiredOutcomes: string[];
};

type Task = {
  delivery: "later-retirement" | "next-release";
  dependsOn: string[];
  id: string;
  lanes: LaneId[];
  outcome: string;
  ownerPaths: string[];
  track: string;
};

type Matrix = {
  acceptanceLevels: string[];
  architecture: {
    activation: string;
    artifact: string;
    body: string;
    coordinates: string[];
    launcher: string;
    persistentTruthOwner: string;
    shellBoundary: string;
    sidecarControl: string;
    sidecars: string[];
  };
  lanes: Lane[];
  role: string;
  schemaVersion: number;
  tasks: Task[];
};

async function readMatrix(): Promise<Matrix> {
  return JSON.parse(JSON.stringify(standaloneClosureDeliveryMatrix)) as Matrix;
}

function absoluteWorkspacePath(relativePath: string): string {
  expect(relativePath).not.toMatch(/^(?:[A-Za-z]:)?[\\/]/u);
  const absolutePath = resolve(workspaceRoot, relativePath);
  expect(
    absolutePath === workspaceRoot || absolutePath.startsWith(workspaceRoot + sep),
  ).toBe(true);
  return absolutePath;
}

async function expectPath(relativePath: string): Promise<void> {
  await expect(stat(absoluteWorkspacePath(relativePath))).resolves.toBeDefined();
}

function expectAcyclicTasks(tasks: Task[]): void {
  const remaining = new Map(tasks.map((task) => [task.id, new Set(task.dependsOn)]));
  const settled = new Set<string>();

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => [...dependencies].every((id) => settled.has(id)))
      .map(([id]) => id);
    expect(ready, "delivery task dependencies must form a DAG").not.toHaveLength(0);
    for (const id of ready) {
      remaining.delete(id);
      settled.add(id);
    }
  }
}

describe("Standalone Closure delivery matrix", () => {
  it("keeps Standalone product code distinct from the shell-side launcher", async () => {
    await Promise.all([
      expectPath("apps/standalone"),
      expectPath("packages/standalone-runtime"),
    ]);
    await Promise.all([
      expect(stat(absoluteWorkspacePath("apps/headless"))).rejects.toMatchObject({ code: "ENOENT" }),
      expect(stat(absoluteWorkspacePath("packages/headless-runtime"))).rejects.toMatchObject({ code: "ENOENT" }),
    ]);

    const standalonePackage = JSON.parse(await readFile(
      absoluteWorkspacePath("apps/standalone/package.json"),
      "utf8",
    )) as { name: string };
    const runtimePackage = JSON.parse(await readFile(
      absoluteWorkspacePath("packages/standalone-runtime/package.json"),
      "utf8",
    )) as { name: string };
    const packagedPackage = JSON.parse(await readFile(
      absoluteWorkspacePath("apps/packaged/package.json"),
      "utf8",
    )) as { exports: Record<string, { default: string }> };

    expect(standalonePackage.name).toBe("@open-design/standalone");
    expect(runtimePackage.name).toBe("@open-design/standalone-runtime");
    expect(packagedPackage.exports["./standalone-launcher"]?.default)
      .toBe("./dist/standalone-launcher.mjs");
    expect(packagedPackage.exports).not.toHaveProperty("./headless");
  });

  it("freezes the hard-won identity, ownership, and activation shape", async () => {
    const matrix = await readMatrix();

    expect(matrix).toMatchObject({
      role: "test-only-acceptance-map",
      schemaVersion: 1,
    });
    expect(matrix.architecture).toEqual({
      activation: "launcher-committed-generation",
      artifact: "standalone-closure",
      body: "standalone(web+daemon)",
      coordinates: ["channel", "namespace", "generation"],
      launcher: "standalone-launcher",
      persistentTruthOwner: "standalone-launcher",
      shellBoundary: "bootloader.mjs+handoff-once",
      sidecarControl: "normalized-caller-owned",
      sidecars: ["daemon", "web"],
    });
    expect(matrix.acceptanceLevels).toEqual(acceptanceLevels);
  });

  it("keeps every delivery face explicit and backed by repository credentials", async () => {
    const matrix = await readMatrix();
    const expectedLaneIds = Object.keys(requiredOutcomes).sort();
    const lanes = new Map(matrix.lanes.map((lane) => [lane.id, lane]));

    expect([...lanes.keys()].sort()).toEqual(expectedLaneIds);
    expect(lanes.size).toBe(matrix.lanes.length);

    for (const id of expectedLaneIds as LaneId[]) {
      const lane = lanes.get(id);
      expect(lane, "missing delivery lane " + id).toBeDefined();
      if (lane == null) continue;

      expect(new Set(lane.requiredOutcomes)).toEqual(new Set(requiredOutcomes[id]));
      expect(lane.coordinates.every(
        (coordinate) => matrix.architecture.coordinates.includes(coordinate),
      )).toBe(true);
      expect(lane.owners.length).toBeGreaterThan(0);
      expect(lane.evidence.length).toBeGreaterThan(0);
      expect(lane.gates.length).toBeGreaterThan(0);

      await Promise.all([
        ...lane.owners.map(expectPath),
        ...lane.evidence.map(({ path }) => expectPath(path)),
      ]);

      for (const gate of lane.gates) {
        expect(acceptanceLevels).toContain(gate.level);
        if (gate.state === "proven") {
          expect(gate.witness).toBeTypeOf("string");
          await expectPath(gate.witness ?? "");
        } else {
          expect(gate).not.toHaveProperty("witness");
        }
      }
    }

    const legacyReferences = matrix.lanes.flatMap((lane) => lane.evidence)
      .filter((entry) => entry.role === "legacy-product-reference");
    expect(legacyReferences.length).toBeGreaterThan(0);
    expect(legacyReferences.every((entry) => (
      entry.path.startsWith("apps/packaged/") || entry.path.startsWith("e2e/specs/")
    ))).toBe(true);

    const syntheticWitness = "packages/closure-shim/tests/conformance.test.ts";
    for (const id of ["process-lifecycle", "update-lifecycle"] as const) {
      expect(lanes.get(id)?.gates).not.toContainEqual(expect.objectContaining({
        level: "local-real",
        state: "proven",
        witness: syntheticWitness,
      }));
    }
    expect(lanes.get("distribution")?.gates.some((gate) => gate.state === "proven"))
      .toBe(false);
  });

  it("keeps the next-release delivery gates explicit, ordered, and honest about retirement", async () => {
    const matrix = await readMatrix();
    const taskIds = matrix.tasks.map((task) => task.id);
    const taskIdSet = new Set(taskIds);
    const laneIds = new Set(Object.keys(requiredOutcomes));

    expect(taskIds).toEqual([
      "SC-01",
      "SC-02",
      "SC-03",
      "SC-04",
      "SC-05",
      "SC-06",
      "SC-07",
      "SC-08",
      "SC-09",
      "SC-10",
      "SC-11",
    ]);
    expect(taskIdSet.size).toBe(matrix.tasks.length);
    expect(matrix.tasks.filter((task) => task.delivery === "next-release")).toHaveLength(10);
    expect(matrix.tasks.filter((task) => task.delivery === "later-retirement").map((task) => task.id))
      .toEqual(["SC-11"]);

    for (const task of matrix.tasks) {
      expect(task.outcome.trim().split(/\n/u)).toHaveLength(1);
      expect(task.ownerPaths.length).toBeGreaterThan(0);
      expect(task.lanes.length).toBeGreaterThan(0);
      expect(task.dependsOn.every((id) => taskIdSet.has(id))).toBe(true);
      expect(task.dependsOn).not.toContain(task.id);
      expect(task.lanes.every((id) => laneIds.has(id))).toBe(true);
      await Promise.all(task.ownerPaths.map(expectPath));
    }

    expectAcyclicTasks(matrix.tasks);
    expect(new Set(matrix.tasks.flatMap((task) => task.lanes))).toEqual(laneIds);

    expect(matrix.tasks.find((task) => task.id === "SC-01")?.dependsOn).toEqual([]);
    expect(matrix.tasks.find((task) => task.id === "SC-02")?.dependsOn).toEqual([]);
    expect(matrix.tasks.find((task) => task.id === "SC-03")?.dependsOn).toEqual(["SC-01", "SC-02"]);
    expect(matrix.tasks.find((task) => task.id === "SC-10")?.dependsOn).toEqual(["SC-07", "SC-09"]);
    expect(matrix.tasks.find((task) => task.id === "SC-11")?.dependsOn).toEqual(["SC-10"]);
  });
});
