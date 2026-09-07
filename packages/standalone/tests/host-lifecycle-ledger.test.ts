import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { StandaloneHostLifecycle, StandaloneHostLifecycleLedger } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("shared host lifecycle persistence", () => {
  it("validates and snapshots the scope before deriving a durable path", () => {
    expect(() => new StandaloneHostLifecycleLedger(tmpdir(), { channel: "betahyx", namespace: "../escape" })).toThrow();
    const scope = { channel: "betahyx", namespace: "shared" };
    const ledger = new StandaloneHostLifecycleLedger(tmpdir(), scope);
    scope.namespace = "changed";
    expect(ledger.scope.namespace).toBe("shared");
  });

  it("preserves a sealed transition through the read-only former Electron filename", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-host-ledger-")); roots.push(root);
    const scope = { channel: "betahyx", namespace: "shared" };
    const ledger = new StandaloneHostLifecycleLedger(root, scope);
    const first = new StandaloneHostLifecycle(scope, { statePort: ledger });
    const acquired = await first.beginTransition("shell-install", { attemptId: "install-1", force: true });
    if (acquired.state !== "acquired") throw new Error("transition was not acquired");
    await first.forceStopTransition(acquired.transition.token, acquired.transition.fence);
    const sealed = await readFile(ledger.path, "utf8");
    const legacy = join(root, "channels/betahyx/namespaces/shared/electron-lifecycle.json");
    await writeFile(legacy, sealed);
    await rm(ledger.path);
    expect(await ledger.read()).toMatchObject({ state: "stopped", transition: { token: "install-1", phase: "stopped-sealed" } });
    const successor = new StandaloneHostLifecycle(scope, { statePort: ledger });
    await successor.status();
    expect(JSON.parse(await readFile(ledger.path, "utf8"))).toMatchObject({ transition: { token: "install-1", phase: "stopped-sealed" } });
    expect(await readFile(legacy, "utf8")).toBe(sealed);
    await writeFile(ledger.path, "invalid-json");
    await expect(ledger.read()).rejects.toThrow();
  });
});
