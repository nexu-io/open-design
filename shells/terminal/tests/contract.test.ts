import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileFixtureLifecyclePort } from "../runtime/fixture-lifecycle.mjs";
import { FixtureShellUpdaterPort } from "../runtime/fixture-shell-updater.mjs";
import { SHARED_LIFECYCLE_ALGEBRA, SHELL_UPDATE_ALGEBRA } from "@open-design/standalone";
import { cleanupFixtures, terminalRoot } from "./helpers.js";

const fixtureLifecycle = (root: string, options: Record<string, unknown> = {}) => new FileFixtureLifecyclePort(root, {
  algebra: SHARED_LIFECYCLE_ALGEBRA,
  ...options,
});

const exactBinding = (scope: { channel: string; namespace: string }, generation: { id: string }) => ({
  schemaVersion: 1,
  protocol: "standalone-launcher-v1",
  scope,
  generationId: generation.id,
  launcher: {
    resourceId: "standalone-launcher",
    blobSha256: "0".repeat(64),
    entrypoint: "launcher.mjs",
    path: "/fixture/launcher.mjs",
  },
  minimumShellVersions: { terminal: "0.1.0" },
  digest: generation.id,
}) as any;

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
      const lifecycle = fixtureLifecycle(root);
      const scope = { channel: "somechan", namespace: "shared" };
      const generation = { id: "a".repeat(64) } as any;
      const first = await lifecycle.start(scope, generation, { id: "terminal", shell: { type: "terminal", version: "0.1.0", buildHash: "d".repeat(64), digest: "b".repeat(64) } }, exactBinding(scope, generation));
      const second = await lifecycle.start(scope, generation, { id: "electron", shell: { type: "electron", version: "1.0.0", buildHash: "e".repeat(64), digest: "c".repeat(64) } }, exactBinding(scope, generation));
      expect(second).toMatchObject({ scope, instanceId: first.instanceId, references: 2, state: "running" });
      await expect(lifecycle.heartbeat(scope, { id: "electron", shell: { type: "electron", version: "1.0.0", buildHash: "e".repeat(64), digest: "c".repeat(64) } })).resolves.toMatchObject({ references: 2 });
      await expect(lifecycle.stop(scope, second.fence - 1)).rejects.toThrow("stale shared lifecycle stop fence");
      await expect(lifecycle.stop(scope, second.fence)).resolves.toMatchObject({ state: "stopped", references: 0, fence: second.fence + 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent attachments and expires an unreferenced lease", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-fixture-concurrency-"));
    try {
      const lifecycle = fixtureLifecycle(root, { heartbeatIntervalMs: 1_000, leaseDurationMs: 2_000 });
      const scope = { channel: "somechan", namespace: "concurrent" };
      const generation = { id: "d".repeat(64) } as any;
      const shell = { type: "terminal", version: "0.1.0", buildHash: "f".repeat(64), digest: "e".repeat(64) };
      const starts = await Promise.all(
        Array.from({ length: 8 }, (_, index) => lifecycle.start(scope, generation, { id: `terminal-${index}`, shell }, exactBinding(scope, generation))),
      );
      expect(new Set(starts.map(({ instanceId }) => instanceId)).size).toBe(1);
      await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "running", references: 8 });

      await Promise.all(Array.from({ length: 8 }, (_, index) => lifecycle.release(scope, `terminal-${index}`)));
      const released = await lifecycle.status(scope);
      expect(released).toMatchObject({ state: "running", references: 0 });

      const expiringLifecycle = fixtureLifecycle(root, { heartbeatIntervalMs: 1_000, leaseDurationMs: 20 });
      const expiringScope = { channel: "somechan", namespace: "expiring" };
      const expiring = await expiringLifecycle.start(expiringScope, generation, { id: "terminal-expiring", shell }, exactBinding(expiringScope, generation));
      await expiringLifecycle.release(expiringScope, "terminal-expiring");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
      const expired = await expiringLifecycle.status(expiringScope);
      expect(expired).toMatchObject({ state: "stopped", references: 0, lease: null, fence: expiring.fence + 1 });

      const restarted = await expiringLifecycle.start(expiringScope, generation, { id: "terminal-next", shell }, exactBinding(expiringScope, generation));
      expect(restarted).toMatchObject({ state: "running", references: 1, fence: expired.fence + 1 });
      expect(restarted.instanceId).not.toBe(expiring.instanceId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("models Electron updater progress, foreign reference blocking, later, and forced installer handoff", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-updater-"));
    try {
      const lifecycle = fixtureLifecycle(root);
      const scope = { channel: "somechan", namespace: "shared" };
      const generation = { id: "f".repeat(64) } as any;
      await lifecycle.start(scope, generation, { id: "terminal-active", shell: { type: "terminal", version: "0.1.0", buildHash: "b".repeat(64), digest: "a".repeat(64) } }, exactBinding(scope, generation));
      const retirementStates: string[] = [];
      const updater = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        attachmentId: "electron-updater",
        shellType: "electron",
        withRetiredStandalone: async (_input, commit) => {
          retirementStates.push((await lifecycle.status(scope)).state);
          const result = await commit();
          retirementStates.push((await lifecycle.status(scope)).state);
          return result;
        },
      });
      await expect(updater.invoke("check")).resolves.toMatchObject({ snapshot: { state: "available" } });
      await expect(updater.invoke("download")).resolves.toMatchObject({ snapshot: { state: "ready", progress: { completed: 2, total: 2 } } });
      const blocked = await updater.invoke("install");
      expect(blocked).toMatchObject({
        outcome: "blocked",
        snapshot: {
          state: "ready",
          blockedBy: [{ attachmentId: "terminal-active", shell: { type: "terminal" } }],
          actions: [{ id: "later" }, { id: "force-stop-and-install" }],
        },
      });
      await expect(updater.invoke("later")).resolves.toMatchObject({ snapshot: { state: "ready" } });
      await expect(updater.invoke("force-stop-and-install")).resolves.toMatchObject({
        outcome: "accepted",
        snapshot: { state: "handed-off", blockedBy: [], actions: [{ id: "abandon" }] },
      });
      expect(retirementStates).toEqual(["running", "stopped"]);
      await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "stopped", references: 0 });
      await expect(updater.invoke("abandon")).resolves.toMatchObject({
        outcome: "accepted",
        snapshot: { state: "failed", error: { code: "shell-install-abandoned" }, actions: [{ id: "check" }] },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resumes the same sealed install attempt after handoff persistence fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-handoff-recovery-"));
    try {
      const lifecycle = fixtureLifecycle(root, { transitionLeaseDurationMs: 2_000 });
      const scope = { channel: "somechan", namespace: "handoff-recovery" };
      const generation = { id: "6".repeat(64) } as any;
      await lifecycle.start(scope, generation, {
        id: "terminal-active",
        shell: { type: "terminal", version: "0.1.0", buildHash: "7".repeat(64), digest: "8".repeat(64) },
      }, exactBinding(scope, generation));
      const guarded = async <T>(_input: unknown, commit: () => Promise<T>): Promise<T> => await commit();
      const failing = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        faultAt: "before-handoff-persist",
        shellType: "electron",
        withRetiredStandalone: guarded,
      });
      await failing.invoke("check");
      await failing.invoke("download");
      await expect(failing.invoke("force-stop-and-install")).rejects.toThrow("durable installer handoff");
      const applying = await failing.readSnapshot();
      expect(applying).toMatchObject({ state: "applying" });
      await expect(lifecycle.status(scope)).resolves.toMatchObject({
        state: "stopped",
        references: 0,
      });

      const recovered = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        shellType: "electron",
        withRetiredStandalone: guarded,
      });
      await expect(recovered.invoke("install")).resolves.toMatchObject({
        outcome: "accepted",
        snapshot: { state: "handed-off", installAttemptId: applying.installAttemptId },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when physical authority returns without invoking the guarded commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-missing-commit-"));
    try {
      const lifecycle = fixtureLifecycle(root);
      const scope = { channel: "somechan", namespace: "missing-commit" };
      const updater = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        shellType: "electron",
        withRetiredStandalone: async <T>() => undefined as T,
      });
      await updater.invoke("check");
      await updater.invoke("download");
      await expect(updater.invoke("install")).resolves.toMatchObject({
        outcome: "failed",
        snapshot: { state: "failed", error: { code: "standalone-retirement-commit-missing" } },
      });
      const result = await lifecycle.beginTransition(scope, "shell-install", { attemptId: "next-attempt" });
      expect(result.state).toBe("acquired");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rebuilds an applying install attempt after its sealed transition lease expires", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-expired-handoff-"));
    try {
      const lifecycle = fixtureLifecycle(root, { transitionLeaseDurationMs: 40 });
      const scope = { channel: "somechan", namespace: "expired-handoff" };
      const generation = { id: "9".repeat(64) } as any;
      await lifecycle.start(scope, generation, {
        id: "terminal-active",
        shell: { type: "terminal", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
      }, exactBinding(scope, generation));
      const guarded = async <T>(_input: unknown, commit: () => Promise<T>): Promise<T> => await commit();
      const failing = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        faultAt: "before-handoff-persist",
        shellType: "electron",
        withRetiredStandalone: guarded,
      });
      await failing.invoke("check");
      await failing.invoke("download");
      await expect(failing.invoke("force-stop-and-install")).rejects.toThrow("durable installer handoff");
      const attemptId = (await failing.readSnapshot()).installAttemptId;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
      await lifecycle.status(scope);

      const recovered = new FixtureShellUpdaterPort(root, scope, lifecycle, {
        algebra: SHELL_UPDATE_ALGEBRA,
        shellType: "electron",
        withRetiredStandalone: guarded,
      });
      await expect(recovered.invoke("install")).resolves.toMatchObject({
        outcome: "accepted",
        snapshot: { state: "handed-off", installAttemptId: attemptId },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refines a forced Shell transition into one atomic replacement start", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-transition-"));
    try {
      const lifecycle = fixtureLifecycle(root);
      const scope = { channel: "somechan", namespace: "transition" };
      const generation = { id: "1".repeat(64) } as any;
      const terminal = { type: "terminal", version: "0.1.0", buildHash: "4".repeat(64), digest: "2".repeat(64) };
      await lifecycle.start(scope, generation, { id: "terminal-active", shell: terminal }, exactBinding(scope, generation));
      const result = await lifecycle.beginTransition(scope, "shell-install", { ownerShellType: "electron", force: true });
      expect(result.state).toBe("acquired");
      if (result.state !== "acquired") throw new Error("fixture transition was not acquired");
      await expect(lifecycle.start(scope, generation, { id: "late-terminal", shell: terminal }, exactBinding(scope, generation))).rejects.toThrow("transition is active");
      await result.transition.forceStop();
      await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "stopped", references: 0 });
      await expect(lifecycle.start(scope, generation, { id: "late-after-stop", shell: terminal }, exactBinding(scope, generation))).rejects.toThrow("transition is active");
      const replacement = { id: "terminal-v2", shell: { ...terminal, version: "0.2.0", buildHash: "5".repeat(64), digest: "3".repeat(64) } };
      await expect(result.transition.completeBoundStart(generation, replacement, exactBinding(scope, generation))).resolves.toMatchObject({
        state: "running",
        generationId: generation.id,
        references: 1,
        occupants: [{ attachmentId: replacement.id, shell: replacement.shell }],
      });
      await expect(result.transition.completeBoundStart(generation, replacement, exactBinding(scope, generation))).rejects.toThrow("stale shared lifecycle transition");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks an unforced Shell install on another attachment of the same Shell type", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-shell-same-type-blocker-"));
    try {
      const lifecycle = fixtureLifecycle(root);
      const scope = { channel: "somechan", namespace: "same-type-blocker" };
      const generation = { id: "6".repeat(64) } as any;
      const terminal = { type: "terminal", version: "0.1.0", buildHash: "7".repeat(64), digest: "8".repeat(64) };
      await lifecycle.start(scope, generation, { id: "terminal-active", shell: terminal }, exactBinding(scope, generation));

      await expect(lifecycle.beginTransition(scope, "shell-install", {
        ownerAttachmentId: "terminal-updater",
        ownerShellType: "terminal",
      })).resolves.toMatchObject({
        state: "blocked",
        reason: "occupied",
        occupants: [{ attachmentId: "terminal-active", shell: { type: "terminal" } }],
      });

      await lifecycle.start(scope, generation, { id: "terminal-updater", shell: terminal }, exactBinding(scope, generation));
      await lifecycle.release(scope, "terminal-active");
      await expect(lifecycle.beginTransition(scope, "shell-install", {
        ownerAttachmentId: "terminal-updater",
        ownerShellType: "terminal",
      })).resolves.toMatchObject({ state: "acquired" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expires an abandoned transition and fences its stale owner", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-transition-expiry-"));
    try {
      const lifecycle = fixtureLifecycle(root, { transitionLeaseDurationMs: 40 });
      const scope = { channel: "somechan", namespace: "abandoned-transition" };
      const generation = { id: "a".repeat(64) } as any;
      const result = await lifecycle.beginTransition(scope, "shell-install", { ownerShellType: "electron", force: true });
      if (result.state !== "acquired") throw new Error("fixture transition was not acquired");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
      await expect(result.transition.forceStop()).rejects.toThrow("stale shared lifecycle transition");
      const restarted = await lifecycle.start(scope, generation, {
        id: "terminal",
        shell: { type: "terminal", version: "0.1.0", buildHash: "c".repeat(64), digest: "b".repeat(64) },
      }, exactBinding(scope, generation));
      expect(restarted).toMatchObject({ state: "running", references: 1, fence: result.transition.fence + 2 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
