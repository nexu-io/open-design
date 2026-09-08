import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { tryAcquireKernelLease } from "../src/index.js";

async function endpoint() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("missing fixture port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return { host: "127.0.0.1" as const, port: address.port };
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

  it("rejects nonexclusive ephemeral ports and nonloopback endpoints", async () => {
    await expect(tryAcquireKernelLease({ host: "127.0.0.1", port: 0 })).rejects.toThrow(/endpoint/u);
    await expect(tryAcquireKernelLease({ host: "0.0.0.0" as never, port: 12345 })).rejects.toThrow(/endpoint/u);
    await expect(tryAcquireKernelLease("/tmp/not-a-kernel-lease.sock")).rejects.toThrow(/endpoint/u);
  });

  it("releases ownership on real process death without stale-file cleanup", async () => {
    const address = await endpoint();
    const module = new URL("../src/kernel-lease.ts", import.meta.url).href;
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { tryAcquireKernelLease } from ${JSON.stringify(module)};
      const lease = await tryAcquireKernelLease(${JSON.stringify(address)});
      if (!lease) throw new Error("fixture endpoint busy");
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
