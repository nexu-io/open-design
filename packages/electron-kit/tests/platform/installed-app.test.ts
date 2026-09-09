import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { withMacElectronProcess } from "@/platform/macos/installed-app.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function app(body: string) {
  const appPath = await mkdtemp(join(tmpdir(), "electron-process-")); roots.push(appPath);
  await mkdir(join(appPath, "Contents/MacOS"), { recursive: true });
  await writeFile(join(appPath, "Contents/MacOS/fixture"), "#!/bin/sh\n" + body, { mode: 0o755 });
  return { appPath, executableName: "fixture", args: [], timeoutMs: 2_000 };
}
it.skipIf(process.platform !== "darwin")("waits for clean exit and rejects failed exits", async () => {
  await expect(withMacElectronProcess(await app("exit 0\n"))).resolves.toBeUndefined();
  await expect(withMacElectronProcess(await app("exit 7\n"))).rejects.toThrow("Electron exited with 7");
});
it.skipIf(process.platform !== "darwin")("reaps its child when the exercise fails or times out", async () => {
  await expect(withMacElectronProcess(await app("exec /bin/sleep 30\n"), async () => { throw new Error("exercise failed"); })).rejects.toThrow("exercise failed");
  await expect(withMacElectronProcess({ ...await app("exec /bin/sleep 30\n"), timeoutMs: 30 })).rejects.toThrow("timed out");
});
