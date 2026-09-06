import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { observeElectronDevDiagnostics } from "../scripts/dev-diagnostics.ts";

it("retains only diagnostic roots after exit, without stale process or CDP state", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-dev-diagnostics-"));
  try {
    const logRoots = [{ scope: "shell", path: join(root, "logs") }];
    const running = { state: "running", pid: 42, cdp: { state: "ready" }, logRoots };
    expect(await observeElectronDevDiagnostics(root, running)).toBe(running);
    expect(await observeElectronDevDiagnostics(root, null)).toEqual({ state: "idle", logRoots });
    expect(JSON.parse(await readFile(join(root, "diagnostic-log-roots.json"), "utf8"))).toEqual(logRoots);
    await writeFile(join(root, "diagnostic-log-roots.json"), "{");
    expect(await observeElectronDevDiagnostics(root, null)).toEqual({ state: "idle", logRoots: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
