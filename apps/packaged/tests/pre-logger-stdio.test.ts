/**
 * The packaged entry logs its launcher diagnostics with the raw `console`
 * before `createPackagedDesktopLogger` exists (the structured logger needs the
 * resolved paths). On the normal first launch the desktop IPC socket is
 * absent, `requestJsonIpc` rejects, and `inspectExistingDesktopForLauncher`
 * echoes `inspect-unavailable` — to a detached stdout when the packaged app
 * has no controlling terminal, which is exactly the EPIPE crash the stdio
 * guard exists to swallow (issue #6964). The entry installs the guard before
 * `main()` runs, so these tests keep that pre-logger sequence covered.
 */

import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectExistingDesktopForLauncher } from "../src/launcher-after-quit.js";
import { installStdioErrorGuard } from "../src/logging.js";
import type { PackagedNamespacePaths } from "../src/paths.js";

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    desktopIdentityPath: join(root, "runtime", "desktop-root.json"),
    desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"),
    electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"),
    headlessIdentityPath: join(root, "runtime", "headless-root.json"),
    installationRoot: root,
    installerObservationRoot: join(root, "data", "observations", "installer"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources", "open-design"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

/**
 * A stdout/stderr stand-in for a packaged first launch: no controlling
 * terminal, so every write fails *asynchronously* with EPIPE. `onWrite` lets a
 * test observe what was true at the moment the write happened.
 */
function detachedPipe(): NodeJS.WritableStream & { onWrite: () => void } {
  const stream = new EventEmitter() as unknown as NodeJS.WritableStream & { onWrite: () => void };
  stream.onWrite = () => {};
  (stream as unknown as { write: (chunk: unknown) => boolean }).write = () => {
    stream.onWrite();
    process.nextTick(() => {
      const error = new Error("write EPIPE") as NodeJS.ErrnoException;
      error.code = "EPIPE";
      stream.emit("error", error);
    });
    return true;
  };
  return stream;
}

describe("packaged pre-logger stdio guard", () => {
  it("survives the first-launch launcher inspection on a detached stdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-prelogger-stdio-"));
    const stdout = detachedPipe();
    const stderr = detachedPipe();
    const guardedAtWrite: boolean[] = [];
    stdout.onWrite = () => guardedAtWrite.push(
      (stdout as unknown as EventEmitter).listenerCount("error") > 0,
    );

    try {
      const paths = fakePaths(root);
      // Mirrors the entry: the guard is installed before the inspection,
      // which still logs through the raw console.
      installStdioErrorGuard([stdout, stderr]);

      const result = await inspectExistingDesktopForLauncher("release-beta-win", {
        logger: {
          info: (message: string) => stdout.write(message),
          warn: (message: string) => stderr.write(message),
        },
        paths,
        requestIpc: (async () => {
          throw new Error("pipe closed");
        }) as typeof import("@open-design/sidecar").requestJsonIpc,
      });
      // Drain the detached pipe's asynchronous EPIPE 'error' event.
      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toEqual({ action: "continue", reason: "inspect-failed" });
      // The diagnostic really ran, and it ran with the guard already
      // listening — the ordering the unguarded first launch crashed on.
      const log = await readFile(join(root, "logs", "launcher", "after-quit.log"), "utf8");
      expect(log).toContain("inspect-unavailable namespace=release-beta-win action=continue error=pipe closed");
      expect(guardedAtWrite.length).toBeGreaterThan(0);
      expect(guardedAtWrite.every(Boolean)).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
