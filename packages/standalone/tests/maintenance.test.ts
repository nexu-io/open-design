import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { withStandaloneTransaction } from "@/transaction.js";

it.each(["maintenance", "generation-state"] as const)("reacquires %s immediately after real owner death without stale-file repair", async kind => {
  const root = await mkdtemp(join(tmpdir(), "standalone-maintenance-crash-"));
  const children: ReturnType<typeof owner>[] = [];
  function owner() {
    const module = new URL("../src/maintenance.ts", import.meta.url).href;
    const transaction = new URL("../src/transaction.ts", import.meta.url).href;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { withStandaloneMaintenanceLock } from ${JSON.stringify(module)};
      import { withStandaloneTransaction } from ${JSON.stringify(transaction)};
      const operation = async () => {
        process.send("owned");
        await new Promise(() => {});
      };
      if (${JSON.stringify(kind)} === "maintenance") await withStandaloneMaintenanceLock(${JSON.stringify(root)}, operation);
      else await withStandaloneTransaction(${JSON.stringify(root)}, "generation-state", operation, 5000);
    `], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = "";
    child.stderr!.on("data", chunk => { stderr += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
    const ready = new Promise<void>(resolve => child.once("message", message => { if (message === "owned") resolve(); }));
    return { child, exited, async wait() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([ready, exited.then(() => { throw new Error(`maintenance owner exited early: ${stderr}`); }),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("maintenance still blocked after owner death")), 2_000); })]);
      } finally { clearTimeout(timer); }
    } };
  }
  try {
    const first = owner(); children.push(first);
    await first.wait();
    first.child.kill("SIGKILL");
    await first.exited;
    const successor = owner(); children.push(successor);
    await expect(successor.wait()).resolves.toBeUndefined();
  } finally {
    for (const { child } of children) if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    await Promise.all(children.map(({ exited }) => exited));
    await rm(root, { recursive: true, force: true });
  }
});

it("canonicalizes aliases, keeps transaction purposes independent and releases failed operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "standalone-transaction-")), alias = `${root}-alias`;
  await symlink(root, alias, "dir");
  try {
    await withStandaloneTransaction(root, "maintenance", async () => {
      await expect(withStandaloneTransaction(alias, "maintenance", async () => {}, 0)).rejects.toThrow("timed out");
      await expect(withStandaloneTransaction(alias, "generation-state", async () => "independent", 0)).resolves.toBe("independent");
    }, 0);
    await expect(withStandaloneTransaction(alias, "maintenance", async () => { throw new Error("operation failed"); }, 0)).rejects.toThrow("operation failed");
    await expect(withStandaloneTransaction(root, "maintenance", async () => "released", 0)).resolves.toBe("released");
    await expect(withStandaloneTransaction(root, "maintenance", async () => {}, -1)).rejects.toThrow("invalid Standalone transaction timeout");
  } finally { await rm(alias); await rm(root, { recursive: true, force: true }); }
});
