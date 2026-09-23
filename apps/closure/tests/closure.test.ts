import { describe, expect, it } from "vitest";

import { CLOSURE_FIXTURE_COMPONENT, createClosureFixtureContribution, prepareClosureShellUpdate } from "../src/index.js";
import closureFixture from "../src/fixture.js";

describe("Closure cold-start fixture", () => {
  it("declares an intentionally Web/daemon-free content slot", () => {
    expect(closureFixture).toEqual({ schemaVersion: 1, capability: "cold-start-lifecycle-fixture", web: false, daemon: false });
    const bytes = Buffer.from("fixture");
    expect(createClosureFixtureContribution({ artifactUrl: "https://example.invalid/fixture.mjs", artifactBytes: bytes })).toMatchObject({
      id: CLOSURE_FIXTURE_COMPONENT,
      sync: true,
      blob: { size: bytes.byteLength, mediaType: "text/javascript" },
      materialization: { type: "file", entrypoint: "fixture.mjs" },
    });
  });

  it("drives a Shell-owned updater through check and download when the Closure floor is not met", async () => {
    let revision = 0;
    let state: "idle" | "available" | "ready" = "idle";
    const snapshots: string[] = [];
    const updater = {
      shellType: "electron",
      readSnapshot: async () => ({ schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] }),
      waitForChange: async () => ({ schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] }),
      invoke: async (action: string) => {
        revision += 1;
        state = action === "check" ? "available" : "ready";
        return { outcome: "accepted" as const, snapshot: { schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [], ...(state === "ready" ? { progress: { completed: 2, total: 2 } } : {}) } };
      },
      confirmInstalled: async () => ({ outcome: "unsupported" as const, snapshot: { schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] } }),
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "2.0.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
      onSnapshot: (snapshot) => { snapshots.push(snapshot.state); },
    })).resolves.toMatchObject({ state: "update-required", minimumVersion: "2.0.0", snapshot: { state: "ready", progress: { completed: 2, total: 2 } } });
    expect(snapshots).toEqual(["idle", "available", "ready"]);
  });

  it("does not enter the Shell handler when the current Shell satisfies the fossil floor", async () => {
    const updater = {
      shellType: "electron",
      readSnapshot: async () => { throw new Error("must not read a compatible Shell updater"); },
      waitForChange: async () => { throw new Error("must not wait on a compatible Shell updater"); },
      invoke: async () => { throw new Error("must not invoke a compatible Shell updater"); },
      confirmInstalled: async () => { throw new Error("must not confirm a compatible Shell updater"); },
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "1.2.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.2.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
    })).resolves.toEqual({ state: "compatible" });
  });

  it("fails closed when the available updater belongs to another Shell type", async () => {
    let invoked = false;
    const updater = {
      shellType: "terminal",
      readSnapshot: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      waitForChange: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      invoke: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      confirmInstalled: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "2.0.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
    })).resolves.toEqual({ state: "update-required", currentVersion: "1.0.0", minimumVersion: "2.0.0", snapshot: null });
    expect(invoked).toBe(false);
  });
});
