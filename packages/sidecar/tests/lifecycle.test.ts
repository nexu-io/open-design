import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapSidecarLifecycle,
  type SidecarLifecycleOwner,
  type SidecarLifecyclePlane,
} from "../src/lifecycle/index.js";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function createFixture(options: Readonly<{ maxLeaseMs?: number }> = {}) {
  const root = await mkdtemp(join(tmpdir(), "open-design-sidecar-lifecycle-"));
  cleanups.push(() => rm(root, { force: true, recursive: true }));
  let nowMs = 1_000;
  const plane = bootstrapSidecarLifecycle({
    controlRoot: root,
    maxLeaseMs: options.maxLeaseMs ?? 60_000,
    now: () => nowMs,
    scope: { channel: "beta", namespace: "release-beta" },
  });
  return {
    advance(milliseconds: number) {
      nowMs += milliseconds;
    },
    plane,
    root,
  };
}

function owner(key: string, generation = 1): SidecarLifecycleOwner {
  return {
    generation,
    incarnation: `${key}-incarnation`,
    key,
    projection: { label: key },
  };
}

async function attach(plane: SidecarLifecyclePlane, key: string, generation = 1) {
  const result = await plane.attach({ leaseMs: 60_000, owner: owner(key, generation) });
  expect(result.state).toBe("attached");
  if (result.state !== "attached") throw new Error("attachment unexpectedly blocked");
  return result;
}

describe("namespace lifecycle leases", () => {
  it("uses caller heartbeats as bounded evidence and never revives an expired lease", async () => {
    const { advance, plane } = await createFixture();
    const first = await attach(plane, "electron-a", 7);

    advance(20_000);
    await expect(plane.renewLease({ credential: first.credential, leaseMs: 60_000 })).resolves.toMatchObject({
      state: "renewed",
    });
    advance(60_001);
    await expect(plane.renewLease({ credential: first.credential, leaseMs: 60_000 })).resolves.toEqual({
      reason: "expired-or-fenced",
      state: "rejected",
    });

    const second = await attach(plane, "electron-a", 7);
    expect(second.credential).not.toEqual(first.credential);
    await expect(plane.detach(first.credential)).resolves.toEqual({ detached: false });
    await expect(plane.detach(second.credential)).resolves.toEqual({ detached: true });
    await expect(plane.detach(second.credential)).resolves.toEqual({ detached: false });
  });

  it("enforces the protocol-wide one minute lease ceiling", async () => {
    const { plane } = await createFixture();
    await expect(plane.attach({ leaseMs: 60_001, owner: owner("electron") })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });
});

describe("namespace transition", () => {
  it("atomically prunes, checks occupants and lets only the requester stay live inside the transition", async () => {
    const { plane } = await createFixture();
    const requester = await attach(plane, "electron-a", 3);
    const occupant = await attach(plane, "codex-plugin", 2);

    await expect(plane.beginTransition({
      kind: "apply-shell-update",
      leaseMs: 60_000,
      owner: owner("electron-a", 3),
      requester: requester.credential,
    })).resolves.toMatchObject({
      occupants: [{ owner: { key: "codex-plugin" } }],
      reason: "occupied",
      state: "blocked",
    });

    await plane.detach(occupant.credential);
    const acquired = await plane.beginTransition({
      kind: "apply-shell-update",
      leaseMs: 60_000,
      owner: owner("electron-a", 3),
      requester: requester.credential,
    });
    expect(acquired.state).toBe("acquired");
    if (acquired.state !== "acquired") throw new Error("transition unexpectedly blocked");

    await expect(plane.renewLease({ credential: requester.credential, leaseMs: 60_000 })).resolves.toMatchObject({
      reason: "transition-active",
      state: "rejected",
    });
    await expect(plane.renewLease({
      credential: requester.credential,
      leaseMs: 60_000,
      transition: acquired.credential,
    })).resolves.toMatchObject({ state: "renewed" });
    await expect(plane.snapshot()).resolves.toMatchObject({
      leases: [{ owner: { key: "electron-a" } }],
      transition: { id: acquired.credential.id },
    });
    await expect(plane.attach({ leaseMs: 60_000, owner: owner("old-generation", 3) })).resolves.toMatchObject({
      reason: "transition-active",
      state: "blocked",
    });
  });

  it("fences handoff-once credentials and only completes with an attached target", async () => {
    const { plane } = await createFixture();
    const acquired = await plane.beginTransition({
      kind: "install-standalone",
      leaseMs: 60_000,
      owner: owner("old-electron", 4),
    });
    if (acquired.state !== "acquired") throw new Error("transition unexpectedly blocked");

    const helper = await plane.takeoverTransition({
      credential: acquired.credential,
      leaseMs: 60_000,
      owner: owner("installer-helper", 4),
    });
    expect(helper.state).toBe("acquired");
    if (helper.state !== "acquired") throw new Error("transition handoff unexpectedly rejected");
    expect(helper.credential.fence).toBeGreaterThan(acquired.credential.fence);

    await expect(plane.renewTransition({ credential: acquired.credential, leaseMs: 60_000 })).resolves.toEqual({
      reason: "expired-or-fenced",
      state: "rejected",
    });
    await expect(plane.attach({
      leaseMs: 60_000,
      owner: owner("new-electron", 5),
      transition: acquired.credential,
    })).resolves.toMatchObject({ reason: "transition-active", state: "blocked" });

    const target = await plane.attach({
      leaseMs: 60_000,
      owner: owner("new-electron", 5),
      transition: helper.credential,
    });
    if (target.state !== "attached") throw new Error("target attachment unexpectedly blocked");
    await expect(plane.renewLease({
      credential: target.credential,
      leaseMs: 60_000,
      transition: helper.credential,
    })).resolves.toMatchObject({ state: "renewed" });
    await expect(plane.renewLease({
      credential: target.credential,
      leaseMs: 60_000,
      transition: acquired.credential,
    })).resolves.toMatchObject({ reason: "transition-active", state: "rejected" });
    await expect(plane.completeTransition({
      lease: { id: "missing", token: "missing" },
      transition: helper.credential,
    })).resolves.toEqual({ reason: "lease-expired-or-fenced", state: "rejected" });
    await expect(plane.completeTransition({
      lease: target.credential,
      transition: helper.credential,
    })).resolves.toEqual({ state: "completed" });

    await expect(plane.snapshot()).resolves.toMatchObject({
      leases: [{ owner: { generation: 5, key: "new-electron" } }],
      transition: null,
    });
  });

  it("recovers after a crashed transition only when its bounded lease expires", async () => {
    const { advance, plane } = await createFixture();
    const acquired = await plane.beginTransition({
      kind: "install-standalone",
      leaseMs: 1_000,
      owner: owner("crashed-helper"),
    });
    expect(acquired.state).toBe("acquired");
    await expect(plane.attach({ leaseMs: 60_000, owner: owner("electron") })).resolves.toMatchObject({
      reason: "transition-active",
      state: "blocked",
    });

    advance(1_001);
    await expect(plane.attach({ leaseMs: 60_000, owner: owner("electron") })).resolves.toMatchObject({
      state: "attached",
    });
  });

  it("lets the current fenced owner abort a failed transition without touching a successor", async () => {
    const { plane } = await createFixture();
    const acquired = await plane.beginTransition({
      kind: "repair-standalone",
      leaseMs: 60_000,
      owner: owner("electron"),
    });
    if (acquired.state !== "acquired") throw new Error("transition unexpectedly blocked");
    const helper = await plane.takeoverTransition({
      credential: acquired.credential,
      leaseMs: 60_000,
      owner: owner("helper"),
    });
    if (helper.state !== "acquired") throw new Error("transition handoff unexpectedly rejected");

    await expect(plane.abortTransition(acquired.credential)).resolves.toEqual({
      reason: "expired-or-fenced",
      state: "rejected",
    });
    await expect(plane.abortTransition(helper.credential)).resolves.toEqual({ state: "aborted" });
    await expect(plane.snapshot()).resolves.toMatchObject({ transition: null });
  });
});

describe("lifecycle persistence failures", () => {
  it("keeps opaque lifecycle credentials private on disk", async () => {
    const { plane, root } = await createFixture();
    await attach(plane, "electron");
    const stateDirectory = join(root, "sidecar-lifecycle");
    const [stateFile] = (await readdir(stateDirectory)).filter((entry) => entry.endsWith(".json"));

    if (process.platform !== "win32") {
      expect((await stat(stateDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(join(stateDirectory, stateFile!))).mode & 0o777).toBe(0o600);
    }
  });

  it("quick-fails corrupt state instead of deleting history and continuing", async () => {
    const { plane, root } = await createFixture();
    await plane.snapshot();
    const stateDirectory = join(root, "sidecar-lifecycle");
    const [stateFile] = (await readdir(stateDirectory)).filter((entry) => entry.endsWith(".json"));
    await writeFile(join(stateDirectory, stateFile!), "{ broken", "utf8");

    await expect(plane.snapshot()).rejects.toMatchObject({ code: "state-corrupt" });
  });

  it("bounds filesystem guard spin and returns a structured quick failure", async () => {
    const { root } = await createFixture();
    const plane = bootstrapSidecarLifecycle({
      controlRoot: root,
      guardSpinMs: 0,
      scope: { channel: "beta", namespace: "release-beta" },
    });
    await plane.snapshot();
    const stateDirectory = join(root, "sidecar-lifecycle");
    const [stateFile] = (await readdir(stateDirectory)).filter((entry) => entry.endsWith(".json"));
    await mkdir(join(stateDirectory, `${stateFile}.guard`));

    await expect(plane.snapshot()).rejects.toMatchObject({ code: "guard-busy" });
  });
});
