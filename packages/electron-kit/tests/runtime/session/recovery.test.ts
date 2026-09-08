import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElectronActivationAttempt, inspectElectronStartup } from "@/runtime/session/activation.js";
import { acquireElectronSessionLease } from "@/runtime/session/lease.js";
import { readElectronRecoveryIntent, recoverElectronStartup } from "@/runtime/session/recovery.js";

const failure = vi.hoisted(() => ({ removeIntent: false }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: async (...args: Parameters<typeof actual.rm>) => {
    if (failure.removeIntent && String(args[0]).endsWith("/recovery.json")) throw new Error("interrupted final unblock");
    return actual.rm(...args);
  } };
});

const roots: string[] = [];
const target = Object.freeze({ capsuleManifestSha256: "a".repeat(64), closureGenerationId: "b".repeat(64) });
async function root() { const value = await mkdtemp(join(tmpdir(), "electron-recovery-")); roots.push(value); return value; }
afterEach(async () => { failure.removeIntent = false; await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("durable exact startup recovery", () => {
  it("pins a failed repair and retries it without selecting another target", async () => {
    const runtimeRoot = await root();
    const activation = await ElectronActivationAttempt.begin(runtimeRoot);
    await activation.fail(new Error("interrupted startup"));
    const bytes = await readFile(join(runtimeRoot, "activation.json"), "utf8");
    const selectTarget = vi.fn(async () => target);
    await expect(recoverElectronStartup({ runtimeRoot, selectTarget, repair: async exact => {
      expect(exact).toEqual(target);
      expect(await readElectronRecoveryIntent(runtimeRoot)).toMatchObject({ target });
      throw new Error("exact bytes missing");
    } })).rejects.toThrow("exact bytes missing");
    expect(await readFile(join(runtimeRoot, "activation.json"), "utf8")).toBe(bytes);
    await expect(ElectronActivationAttempt.begin(runtimeRoot)).rejects.toThrow("recovery is unfinished");
    expect(await inspectElectronStartup(runtimeRoot)).toMatchObject({ required: true, reason: "recovery-unfinished", recovery: { target } });
    await expect(recoverElectronStartup({ runtimeRoot, selectTarget, target: { ...target, closureGenerationId: "c".repeat(64) }, repair: vi.fn() }))
      .rejects.toThrow("pinned to a different exact target");
    const repair = vi.fn(async () => {});
    await recoverElectronStartup({ runtimeRoot, selectTarget, repair });
    expect(selectTarget).toHaveBeenCalledOnce();
    expect(repair).toHaveBeenCalledExactlyOnceWith(target);
    expect(await readElectronRecoveryIntent(runtimeRoot)).toBeNull();
    expect(await inspectElectronStartup(runtimeRoot)).toMatchObject({ required: false, activation: null, recovery: null });
    await expect(readFile(join(runtimeRoot, "activation.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(ElectronActivationAttempt.begin(runtimeRoot)).resolves.toBeDefined();
  });

  it("keeps startup blocked after attempt removal until the last recovery write succeeds", async () => {
    const runtimeRoot = await root();
    await ElectronActivationAttempt.begin(runtimeRoot);
    failure.removeIntent = true;
    await expect(recoverElectronStartup({ runtimeRoot, selectTarget: async () => target, repair: async () => {} })).rejects.toThrow("interrupted final unblock");
    await expect(readFile(join(runtimeRoot, "activation.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(ElectronActivationAttempt.begin(runtimeRoot)).rejects.toThrow("recovery is unfinished");
    failure.removeIntent = false;
    const selectTarget = vi.fn();
    await recoverElectronStartup({ runtimeRoot, selectTarget, repair: async () => {} });
    expect(selectTarget).not.toHaveBeenCalled();
    await expect(ElectronActivationAttempt.begin(runtimeRoot)).resolves.toBeDefined();
  });

  it("refuses a live carrier before writing intent or entering repair", async () => {
    const runtimeRoot = await root(), lease = await acquireElectronSessionLease(runtimeRoot);
    const selectTarget = vi.fn(), repair = vi.fn();
    try {
      await expect(recoverElectronStartup({ runtimeRoot, selectTarget, repair })).rejects.toThrow("session is owned");
      expect(selectTarget).not.toHaveBeenCalled(); expect(repair).not.toHaveBeenCalled();
      expect(await readElectronRecoveryIntent(runtimeRoot)).toBeNull();
    } finally { await lease.release(); }
  });

  it("retains the exact repair blockade across process death while releasing kernel ownership", async () => {
    const runtimeRoot = await root();
    await ElectronActivationAttempt.begin(runtimeRoot);
    const activationBytes = await readFile(join(runtimeRoot, "activation.json"), "utf8");
    // Exercise the published Node-safe entry in another process, not a mocked
    // filesystem exception or an in-process release masquerading as a crash.
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { recoverElectronStartup } from "@open-design/electron-kit";
      await recoverElectronStartup({
        runtimeRoot: ${JSON.stringify(runtimeRoot)},
        selectTarget: async () => (${JSON.stringify(target)}),
        repair: async () => {
          process.send("repair-entered");
          await new Promise(() => {});
        },
      });
    `], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = "";
    child.stderr!.on("data", chunk => { stderr += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      child.once("message", message => message === "repair-entered" ? resolve() : reject(new Error("unexpected recovery fixture signal")));
      timeout = setTimeout(() => reject(new Error(`recovery fixture timed out: ${stderr}`)), 5_000);
    });
    try {
      await Promise.race([ready, exited.then(() => { throw new Error(`recovery fixture exited early: ${stderr}`); })]);
      clearTimeout(timeout);
      const intentBytes = await readFile(join(runtimeRoot, "recovery.json"), "utf8");
      const selectTarget = vi.fn(), repair = vi.fn(async () => {});
      await expect(recoverElectronStartup({ runtimeRoot, selectTarget, repair })).rejects.toThrow("session is owned");
      expect(repair).not.toHaveBeenCalled();
      child.kill("SIGKILL");
      await exited;
      expect(await readFile(join(runtimeRoot, "activation.json"), "utf8")).toBe(activationBytes);
      expect(await readFile(join(runtimeRoot, "recovery.json"), "utf8")).toBe(intentBytes);
      await expect(ElectronActivationAttempt.begin(runtimeRoot)).rejects.toThrow("recovery is unfinished");
      await recoverElectronStartup({ runtimeRoot, selectTarget, repair });
      expect(selectTarget).not.toHaveBeenCalled();
      expect(repair).toHaveBeenCalledExactlyOnceWith(target);
      await expect(ElectronActivationAttempt.begin(runtimeRoot)).resolves.toBeDefined();
    } finally {
      clearTimeout(timeout);
      if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
      await exited;
    }
  });

  it.each(["{", "null", "{}"])("preserves a malformed intent and blocks startup: %s", async bytes => {
    const runtimeRoot = await root(), path = join(runtimeRoot, "recovery.json");
    await writeFile(path, bytes);
    await expect(ElectronActivationAttempt.begin(runtimeRoot)).rejects.toThrow();
    expect(await inspectElectronStartup(runtimeRoot)).toMatchObject({ required: true, reason: "metadata-invalid" });
    await expect(recoverElectronStartup({ runtimeRoot, selectTarget: async () => target, repair: vi.fn() })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });
});
