import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileFixtureLifecyclePort } from "../runtime/fixture-lifecycle.mjs";
import { cleanupFixtures, terminalRoot } from "./helpers.js";

afterEach(cleanupFixtures);

describe("Terminal native contract", () => {
  it("keeps every public contract parseable and the runtime free of TypeScript entrypoints", () => {
    const contracts = readdirSync(join(terminalRoot, "contract"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(terminalRoot, "contract", entry.name));
    expect(contracts.length).toBeGreaterThanOrEqual(10);
    for (const file of contracts) expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
    expect(existsSync(join(terminalRoot, "src"))).toBe(false);
    expect(readFileSync(join(terminalRoot, "sh/terminal.sh"), "utf8")).toMatch(/^#!\/bin\/sh/);
    expect(readFileSync(join(terminalRoot, "runtime/fossil.mjs"), "utf8")).not.toContain("apps/closure");

    const targets = ["darwin-arm64", "darwin-x64", "win32-x64"];
    const nodeLock = JSON.parse(readFileSync(join(terminalRoot, "node-lock.json"), "utf8"));
    expect(Object.keys(nodeLock.targets).sort()).toEqual(targets);
    for (const contract of ["carrier-resolution", "distribution-request", "install-manifest", "scene-request"]) {
      const schema = JSON.parse(readFileSync(join(terminalRoot, "contract", `${contract}.schema.json`), "utf8"));
      expect(schema.properties.target.enum).toEqual(targets);
    }
  });

  it("models one shared fixture instance across Shell attachments", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-fixture-lifecycle-"));
    try {
      const lifecycle = new FileFixtureLifecyclePort(root);
      const scope = { channel: "betahyx", namespace: "shared" };
      const generation = { id: "a".repeat(64) } as any;
      const first = await lifecycle.start(scope, generation, { id: "terminal", shell: { type: "terminal", version: "0.1.0", digest: "b".repeat(64) } });
      const second = await lifecycle.start(scope, generation, { id: "electron", shell: { type: "electron", version: "1.0.0", digest: "c".repeat(64) } });
      expect(second).toMatchObject({ scope, instanceId: first.instanceId, references: 2, state: "running" });
      await expect(lifecycle.heartbeat(scope, { id: "electron", shell: { type: "electron", version: "1.0.0", digest: "c".repeat(64) } })).resolves.toMatchObject({ references: 2 });
      await expect(lifecycle.stop(scope, second.fence - 1)).rejects.toThrow("stale fixture lifecycle stop fence");
      await expect(lifecycle.stop(scope, second.fence)).resolves.toMatchObject({ state: "stopped", references: 0, fence: second.fence + 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent attachments and expires an unreferenced lease", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-fixture-concurrency-"));
    try {
      const lifecycle = new FileFixtureLifecyclePort(root, { heartbeatIntervalMs: 1_000, leaseDurationMs: 2_000 });
      const scope = { channel: "betahyx", namespace: "concurrent" };
      const generation = { id: "d".repeat(64) } as any;
      const shell = { type: "terminal", version: "0.1.0", digest: "e".repeat(64) };
      const starts = await Promise.all(
        Array.from({ length: 8 }, (_, index) => lifecycle.start(scope, generation, { id: `terminal-${index}`, shell })),
      );
      expect(new Set(starts.map(({ instanceId }) => instanceId)).size).toBe(1);
      await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "running", references: 8 });

      await Promise.all(Array.from({ length: 8 }, (_, index) => lifecycle.release(scope, `terminal-${index}`)));
      const released = await lifecycle.status(scope);
      expect(released).toMatchObject({ state: "running", references: 0 });

      const expiringLifecycle = new FileFixtureLifecyclePort(root, { heartbeatIntervalMs: 1_000, leaseDurationMs: 20 });
      const expiringScope = { channel: "betahyx", namespace: "expiring" };
      const expiring = await expiringLifecycle.start(expiringScope, generation, { id: "terminal-expiring", shell });
      await expiringLifecycle.release(expiringScope, "terminal-expiring");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
      const expired = await expiringLifecycle.status(expiringScope);
      expect(expired).toMatchObject({ state: "stopped", references: 0, lease: null, fence: expiring.fence + 1 });

      const restarted = await expiringLifecycle.start(expiringScope, generation, { id: "terminal-next", shell });
      expect(restarted).toMatchObject({ state: "running", references: 1, fence: expired.fence + 1 });
      expect(restarted.instanceId).not.toBe(expiring.instanceId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
