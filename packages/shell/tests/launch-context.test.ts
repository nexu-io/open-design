import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  beginPackagedLaunchContext,
  claimPackagedLaunchContext,
  markPackagedLaunchContextRelaunchable,
  parsePackagedLaunchContext,
  rearmPackagedLaunchContext,
  recoverPackagedLaunchContext,
  restorePackagedLaunchContext,
} from "../src/launch-context/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-launch-context-"));
  roots.push(root);
  const namespaceBaseRoot = join(root, "runtime", "namespaces");
  const path = join(root, "profile", "open-design-launch-context.json");
  await mkdir(namespaceBaseRoot, { recursive: true });
  return { namespaceBaseRoot, path, root };
}

describe("packaged launch context", () => {
  it("claims, parks, reclaims, and restores one transaction", async () => {
    const { namespaceBaseRoot, path } = await fixture();
    const active = new Set([11, 22]);
    const runtime = { isProcessAlive: (pid: number) => active.has(pid) };
    const pending = await beginPackagedLaunchContext({
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      path,
      runtime,
      sessionId: "session-one",
      target: { namespace: "release-beta", namespaceBaseRoot },
    });
    expect(pending.state).toBe("pending");

    const claimed = await claimPackagedLaunchContext({
      owner: { pid: 22, startedAt: "2026-08-14T00:00:01.000Z" },
      path,
      runtime,
      sessionId: pending.sessionId,
    });
    expect(claimed).toMatchObject({ owner: { pid: 22 }, state: "active" });
    expect(await markPackagedLaunchContextRelaunchable({ ownerPid: 22, path, runtime })).toBe(true);
    active.add(33);
    expect(await claimPackagedLaunchContext({
      owner: { pid: 33, startedAt: "2026-08-14T00:00:02.000Z" },
      path,
      runtime,
    })).toMatchObject({ owner: { pid: 33 }, state: "active" });
    active.delete(22);
    expect(await restorePackagedLaunchContext({ path, runtime })).toBe(true);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("re-arms a parked transaction for an external cold launcher", async () => {
    const { namespaceBaseRoot, path } = await fixture();
    const runtime = { isProcessAlive: (pid: number) => pid === 11 };
    const pending = await beginPackagedLaunchContext({
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      path,
      runtime,
      sessionId: "session-one",
      target: { namespace: "release-beta", namespaceBaseRoot },
    });
    await claimPackagedLaunchContext({ path, runtime, sessionId: pending.sessionId });
    await markPackagedLaunchContextRelaunchable({ path, runtime, sessionId: pending.sessionId });

    const rearmed = await rearmPackagedLaunchContext({
      owner: { pid: 22, startedAt: "2026-08-14T00:00:02.000Z" },
      path,
      runtime,
      target: { namespace: "release-beta", namespaceBaseRoot },
    });
    expect(rearmed).toMatchObject({
      owner: { pid: 22 },
      sessionId: pending.sessionId,
      state: "pending",
    });
    expect(await claimPackagedLaunchContext({
      owner: { pid: 33, startedAt: "2026-08-14T00:00:03.000Z" },
      path,
      runtime,
      sessionId: pending.sessionId,
    })).toMatchObject({ owner: { pid: 33 }, state: "active" });
  });

  it("recovers a killed owner and removes legacy unleased state", async () => {
    const { namespaceBaseRoot, path } = await fixture();
    const runtime = { isProcessAlive: () => false };
    await beginPackagedLaunchContext({
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      path,
      runtime: { isProcessAlive: (pid) => pid === 11 },
      target: { namespace: "beta", namespaceBaseRoot },
    });
    expect(await recoverPackagedLaunchContext(path, runtime)).toBe("recovered");
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify({ namespace: "old", namespaceBaseRoot, schemaVersion: 1 }));
    expect(await recoverPackagedLaunchContext(path, runtime)).toBe("recovered");
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a dangling root, conflicting transaction, and malformed snapshot", async () => {
    const { namespaceBaseRoot, path, root } = await fixture();
    const runtime = { isProcessAlive: (pid: number) => pid === 11 };
    await beginPackagedLaunchContext({
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      path,
      runtime,
      target: { namespace: "beta", namespaceBaseRoot },
    });
    await expect(beginPackagedLaunchContext({
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      path,
      runtime,
      target: { namespace: "beta", namespaceBaseRoot },
    })).rejects.toThrow(/already active/);

    expect(parsePackagedLaunchContext({
      createdAt: "2026-08-14T00:00:00.000Z",
      expiresAt: "2026-08-14T01:00:00.000Z",
      owner: { pid: 11, startedAt: "2026-08-14T00:00:00.000Z" },
      previous: { bodyBase64: "e30=", sha256: "0".repeat(64) },
      schemaVersion: 2,
      sessionId: "session-one",
      state: "active",
      target: { namespace: "beta", namespaceBaseRoot: root },
      updatedAt: "2026-08-14T00:00:00.000Z",
    })).toBeNull();
  });
});
