import { execFile, execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// ... (full original file content with the npm prefix fix applied) ...

export function wellKnownUserToolchainBins(options: any = {}): string[] {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const dirs: string[] = [];

  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      dirs.push(join(npmPrefix, "bin"));
      if (process.platform === "win32") dirs.push(npmPrefix);
    }
  } else if (process.platform === "win32") {
    // NPM_CONFIG_PREFIX / npm_config_prefix are npm-internal vars
    // usually absent in Electron child-process environments. Fall
    // back to reading the user's actual npm prefix from .npmrc.
    try {
      const npmPrefix = execFileSync("npm", ["config", "get", "prefix"], {
        encoding: "utf8", timeout: 3_000, windowsHide: true,
      }).trim();
      if (npmPrefix.length > 0) {
        dirs.push(join(npmPrefix, "bin"));
        dirs.push(npmPrefix);
      }
    } catch { /* npm not available — fall through to conventional paths */ }
  }

  // ... rest of original function ...
  return dirs;
}