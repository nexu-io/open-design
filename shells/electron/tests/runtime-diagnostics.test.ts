import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { observeElectronDiagnostics } from "@/adapters/tools/lifecycle/observation.js";

it("retains only diagnostic roots after exit, without stale process or CDP state", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-dev-diagnostics-"));
  try {
    const logRoots = [{ scope: "shell", path: join(root, "logs") }];
    const running = { state: "running", pid: 42, cdp: { state: "ready" }, logRoots };
    expect(await observeElectronDiagnostics(root, running)).toMatchObject(running);
    expect(await observeElectronDiagnostics(root, null)).toEqual({ state: "idle", logRoots,
      startup: { activation: null, recovery: null, required: false, reason: null } });
    expect(JSON.parse(await readFile(join(root, "diagnostic-log-roots.json"), "utf8"))).toEqual(logRoots);
    await writeFile(join(root, "diagnostic-log-roots.json"), "{");
    expect(await observeElectronDiagnostics(root, null)).toEqual({ state: "idle", logRoots: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("reports a retained recovery blockade while Electron and CDP are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-recovery-diagnostics-"));
  try {
    await observeElectronDiagnostics(root, { state: "starting", logRoots: [{ scope: "shell", path: join(root, "logs") }] });
    const recovery = { schemaVersion: 1, target: { capsuleManifestSha256: "a".repeat(64), closureGenerationId: "b".repeat(64) } };
    const bytes = JSON.stringify(recovery);
    await writeFile(join(root, "recovery.json"), bytes);
    expect(await observeElectronDiagnostics(root, null)).toMatchObject({ state: "idle",
      startup: { required: true, reason: "recovery-unfinished", recovery } });
    expect(await readFile(join(root, "recovery.json"), "utf8")).toBe(bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});
