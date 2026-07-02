import { execFile, execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type WellKnownUserToolchainOptions = {
  home?: string;
  includeSystemBins?: boolean;
  env?: NodeJS.ProcessEnv;
};

export function wellKnownUserToolchainBins(options: WellKnownUserToolchainOptions = {}): string[] {
  const home = options.home ?? homedir();
  const includeSystemBins = options.includeSystemBins ?? process.platform !== "win32";
  const env = options.env ?? process.env;
  const dirs: string[] = [];

  // NPM_CONFIG_PREFIX / npm_config_prefix
  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      dirs.push(join(npmPrefix, "bin"));
      if (process.platform === "win32") dirs.push(npmPrefix);
    }
  } else if (process.platform === "win32") {
    // GUI-launched daemons miss NPM_CONFIG_PREFIX env var.
    // Try reading npm config directly.
    try {
      const npmPrefix = execFileSync("npm", ["config", "get", "prefix"], {
        encoding: "utf8", timeout: 3_000, windowsHide: true,
      }).trim();
      if (npmPrefix.length > 0) {
        dirs.push(join(npmPrefix, "bin"));
        dirs.push(npmPrefix);
      }
    } catch {}
  }

  if (process.platform === "win32") {
    dirs.push(join(home, "AppData", "Roaming", "npm"));
  }

  dirs.push(
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"),
    join(home, ".cargo", "bin"),
  );

  // ... additional well-known paths would follow in the full file ...
  return dirs;
}