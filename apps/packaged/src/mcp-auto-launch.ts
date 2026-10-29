import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";

import { isMcpUserQuitRecordActive, MCP_BOOTSTRAP_CONTRACT } from "@open-design/sidecar-proto";

/** User intent belongs to the resolved data root, never a process generation. */
export function createPackagedMcpAutoLaunchPolicy(
  dataRoot: string,
  clock: { now(): number; uptime(): number } = { now: Date.now, uptime },
) {
  const path = join(dataRoot, MCP_BOOTSTRAP_CONTRACT.USER_QUIT_FILE);
  return {
    isSuspended(): boolean {
      try {
        return isMcpUserQuitRecordActive(JSON.parse(readFileSync(path, "utf8")), clock.now(), clock.uptime());
      } catch {
        return false;
      }
    },
    suspend(): void {
      mkdirSync(dataRoot, { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, quitAtMs: clock.now() }), { mode: 0o600 });
        renameSync(temporary, path);
      } finally {
        rmSync(temporary, { force: true });
      }
    },
    resume(): void {
      rmSync(path, { force: true });
    },
  };
}

/** Internal teardown and OS session termination must not record a user quit. */
export function createPackagedQuitIntent(recordUserQuit: () => void) {
  let stopping = false;
  let systemExit = false;
  let recorded = false;
  return {
    isStopping(): boolean { return stopping || systemExit || recorded; },
    userQuit(): void {
      if (stopping || systemExit || recorded) return;
      recordUserQuit();
      recorded = true;
    },
    beginShutdown(): void { stopping = true; },
    systemExit(): void { systemExit = true; },
  };
}
