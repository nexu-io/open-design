/**
 * Auto-discover the running Open Design daemon URL and project root.
 *
 * Daemon URL priority chain:
 *   1. OD_DAEMON_URL env var (injected by daemon spawn)
 *   2. .od/tmp/daemon-url.json in the project root
 *   3. http://127.0.0.1:7456 (default daemon port)
 *
 * Project root: walk up from cwd until we find a .od directory.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".od"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export async function discoverDaemonUrl(): Promise<string> {
  // 1. Env var
  const envUrl = process.env.OD_DAEMON_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // 2. Known file
  const projectRoot = findProjectRoot();
  try {
    const knownFile = join(projectRoot, ".od", "tmp", "daemon-url.json");
    const raw = await readFile(knownFile, "utf-8");
    const parsed = JSON.parse(raw) as { url?: string };
    if (parsed.url) return parsed.url.replace(/\/$/, "");
  } catch {
    // File doesn't exist or is malformed — fall through
  }

  // 3. Default port
  return "http://127.0.0.1:7456";
}
