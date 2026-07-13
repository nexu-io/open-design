import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { app, crashReporter } from "electron";

/**
 * Start local crash-dump collection and point Electron's minidump directory at
 * `crashDumpsDir` — a `crashes/` folder inside the desktop log tree the
 * diagnostics export already collects, so a user who clicks "Save logs…" gets
 * the dumps in the bundle without any extra plumbing.
 *
 * `uploadToServer: false` keeps everything on-device: nothing is sent anywhere
 * until the user explicitly exports a support bundle. Renderer processes created
 * after start() inherit the reporter, so a renderer crash (e.g. a GPU/V8 CHECK,
 * exit 0x80000003) now writes a native minidump — the only reliable way to
 * root-cause such an opaque abort, which no text log records.
 *
 * Best-effort by construction: a failure here must never block startup.
 */
export function setUpDesktopCrashReporter(crashDumpsDir: string): void {
  try {
    // MUST create the dir first: app.setPath("crashDumps", …) throws when the
    // target does not exist, and on a fresh runtime `logs/desktop/crashes` won't
    // exist yet. Without this the setPath throws, we fall back to Electron's
    // default crashDumps location, and the daemon export (which only scans
    // <logs/desktop>/crashes) misses the minidump for exactly the first crash
    // loop this is meant to root-cause.
    mkdirSync(crashDumpsDir, { recursive: true });
    app.setPath("crashDumps", crashDumpsDir);
  } catch {
    // setPath can still throw on some platforms/timings; fall back to Electron's
    // default crashDumps location rather than failing startup.
  }
  try {
    crashReporter.start({ uploadToServer: false, compress: false });
  } catch {
    // crashReporter is best-effort observability, never a startup blocker.
  }
}

/**
 * Snapshot GPU + basic runtime info to `path` (JSON) at startup. For a native
 * renderer crash the single most useful non-dump signal is whether hardware
 * acceleration is on and which GPU/driver + feature-blocklist state produced it
 * — none of which the text logs capture. Fire-and-forget and best-effort.
 */
export async function writeDesktopGpuInfo(path: string): Promise<void> {
  try {
    const gpuFeatureStatus = app.getGPUFeatureStatus();
    const gpuInfo = await app.getGPUInfo("basic").catch(() => null);
    const payload = {
      capturedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      gpuFeatureStatus,
      gpuInfo,
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // never block startup on diagnostics
  }
}
