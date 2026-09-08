import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { acquireElectronSessionLease } from "@/index.js";

it("excludes normal startup and recovery through the same canonical runtime root", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-session-lease-"));
  const alias = root + "-alias";
  await symlink(root, alias, "dir");
  try {
    const lease = await acquireElectronSessionLease(root);
    try {
      await expect(acquireElectronSessionLease(root)).rejects.toThrow(/session is owned/u);
      await expect(acquireElectronSessionLease(alias)).rejects.toThrow(/session is owned/u);
    } finally { await lease.release(); }
    const recovered = await acquireElectronSessionLease(alias);
    await recovered.release();
  } finally { await rm(alias); await rm(root, { recursive: true }); }
});
