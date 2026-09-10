import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { tryAcquireKernelLease } from "../src/index.js";

async function endpoint() {
  return { domain: "test.kernel", key: randomUUID() };
}

describe("kernel lease", () => {
  it("fails immediately on contention and permits acquisition only after release", async () => {
    const address = await endpoint();
    const owner = await tryAcquireKernelLease(address);
    expect(owner).not.toBeNull();
    try {
      expect(await tryAcquireKernelLease(address)).toBeNull();
    } finally { await Promise.all([owner!.release(), owner!.release()]); }
    const next = await tryAcquireKernelLease(address);
    try { expect(next).not.toBeNull(); }
    finally { await next?.release(); }
  });

  it("does not share ownership between independent endpoints", async () => {
    const first = await tryAcquireKernelLease(await endpoint());
    const second = await tryAcquireKernelLease(await endpoint());
    try { expect(first).not.toBeNull(); expect(second).not.toBeNull(); }
    finally { await second?.release(); await first?.release(); }
  });

  it("rejects transport addresses and malformed logical identities", async () => {
    await expect(tryAcquireKernelLease({ host: "127.0.0.1", port: 1 } as never)).rejects.toThrow(/identity/u);
    await expect(tryAcquireKernelLease({ domain: "../escape", key: "a" })).rejects.toThrow(/identity/u);
    await expect(tryAcquireKernelLease({ domain: "test", key: "" })).rejects.toThrow(/identity/u);
  });

  it("releases ownership on real process death without stale-file cleanup", async () => {
    const address = await endpoint();
    const module = new URL("../src/kernel-lease.ts", import.meta.url).href;
    const child = spawn(process.execPath, ["--expose-gc", "--input-type=module", "-e", `
      import { tryAcquireKernelLease } from ${JSON.stringify(module)};
      await (async () => {
        if (!await tryAcquireKernelLease(${JSON.stringify(address)})) throw new Error("fixture endpoint busy");
      })();
      globalThis.gc();
      process.on("message", () => {}); // Keep the real owner alive, independently of the lease backend.
      process.send("owned");
    `], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let errors = "";
    child.stderr!.on("data", chunk => { errors += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
    const ready = new Promise<void>(resolve => child.once("message", message => {
      if (message === "owned") resolve();
    }));
    try {
      await Promise.race([ready, exited.then(() => { throw new Error(`lease owner exited before acquisition: ${errors}`); })]);
      expect(await tryAcquireKernelLease(address)).toBeNull();
      child.kill("SIGKILL");
      await exited;
      const successor = await tryAcquireKernelLease(address);
      try { expect(successor).not.toBeNull(); }
      finally { await successor?.release(); }
    } finally {
      if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
      await exited;
    }
  });
});
