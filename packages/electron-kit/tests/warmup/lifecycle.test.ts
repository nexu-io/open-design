import { describe, expect, it, vi } from "vitest";

import {
  ELECTRON_WARMUP_ATOMS,
  runElectronWarmupTopology,
  validateElectronRuntimeWarmupTopology,
  validateElectronWarmupTopology,
  type ElectronWarmupTopology,
} from "@/warmup/index.js";

const runtimeTopology: ElectronWarmupTopology = {
  schemaVersion: 1,
  nodes: [
    { id: "carrier", executor: ELECTRON_WARMUP_ATOMS.ENSURE_CARRIER, dependsOn: [], blocking: true },
    { id: "generation", executor: ELECTRON_WARMUP_ATOMS.RESOLVE_STANDALONE, dependsOn: ["carrier"], blocking: true },
    { id: "ready", executor: ELECTRON_WARMUP_ATOMS.AWAIT_STANDALONE_READY, dependsOn: ["generation"], blocking: true },
    { id: "renderer", executor: ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER, dependsOn: ["ready"], blocking: true },
  ],
};

describe("Electron warmup topology", () => {
  it("validates the required runtime atoms and their transitive order", () => {
    expect(validateElectronRuntimeWarmupTopology(runtimeTopology)).toEqual(runtimeTopology);
    expect(() => validateElectronRuntimeWarmupTopology({
      ...runtimeTopology,
      nodes: runtimeTopology.nodes.map((node) => node.id === "renderer" ? { ...node, dependsOn: ["carrier"] } : node),
    })).toThrow(/must order standalone\.await-ready before electron\.mount-renderer/u);
  });

  it("rejects unknown dependencies and cycles before executing", () => {
    expect(() => validateElectronWarmupTopology({
      schemaVersion: 1,
      nodes: [{ id: "one", executor: "shell.one", dependsOn: ["missing"], blocking: true }],
    })).toThrow(/unknown dependency/u);
    expect(() => validateElectronWarmupTopology({
      schemaVersion: 1,
      nodes: [
        { id: "one", executor: "shell.one", dependsOn: ["two"], blocking: true },
        { id: "two", executor: "shell.two", dependsOn: ["one"], blocking: true },
      ],
    })).toThrow(/contains a cycle/u);
  });

  it("resolves blocking readiness independently and disposes background work", async () => {
    const order: string[] = [];
    const backgroundStarted = vi.fn();
    const run = runElectronWarmupTopology({
      topology: {
        schemaVersion: 1,
        nodes: [
          { id: "blocking", executor: "shell.blocking", dependsOn: [], blocking: true },
          { id: "background", executor: "shell.background", dependsOn: ["blocking"], blocking: false },
        ],
      },
      executors: {
        "shell.blocking": () => { order.push("blocking"); },
        "shell.background": ({ signal }) => {
          backgroundStarted();
          return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        },
      },
      onEvent: ({ node, state }) => { order.push(`${node.id}:${state}`); },
    });
    await run.ready;
    expect(backgroundStarted).toHaveBeenCalledOnce();
    expect(order).toEqual([
      "blocking:running",
      "blocking",
      "blocking:completed",
      "background:running",
    ]);
    await run.dispose();
    await run.settled;
    expect(order.at(-1)).toBe("background:cancelled");
  });
});
