import { statSync } from "node:fs";
import { join } from "node:path";

export const VELA_RUNTIME_RESOURCE_ID = "vela-runtime" as const;
export const VELA_RUNTIME_LAZY_ENV = "OD_VELA_RUNTIME_LAZY" as const;
export const STANDALONE_RESOURCE_ROOTS_ENV = "OD_CLOSURE_RESOURCE_ROOTS_V1" as const;

/** Known Closure resource groups the packaged daemon can project from isolated CAS roots. */
export const STANDALONE_DAEMON_RESOURCE_IDS = Object.freeze([
  "community-pets",
  "craft",
  "design-systems",
  "design-templates",
  "frames",
  "plugin-previews",
  "plugins",
  "prompt-templates",
  "skills",
] as const);

export type StandaloneDaemonResourceId = (typeof STANDALONE_DAEMON_RESOURCE_IDS)[number];

/** Shared resources required before the daemon may report product readiness. */
export const STANDALONE_BOOT_RESOURCE_IDS = Object.freeze([
  "plugins",
] as const satisfies readonly StandaloneDaemonResourceId[]);

export function standaloneResourceRootsEnv(
  resources: ReadonlyMap<string, string>,
): NodeJS.ProcessEnv {
  const roots = Object.fromEntries(
    STANDALONE_DAEMON_RESOURCE_IDS.flatMap((id) => {
      const root = resources.get(id);
      return root == null ? [] : [[id, root] as const];
    }),
  );
  return Object.keys(roots).length === 0
    ? {}
    : { [STANDALONE_RESOURCE_ROOTS_ENV]: JSON.stringify(roots) };
}

export function bundledStandaloneToolEnv(resourceRoot: string): NodeJS.ProcessEnv {
  const binaryName = process.platform === "win32" ? "vela.exe" : "vela";
  const openCodeName = process.platform === "win32" ? "opencode.exe" : "opencode";
  const candidates = {
    VELA_BIN: join(resourceRoot, "bin", binaryName),
    VELA_OPENCODE_BIN: join(resourceRoot, "bin", "libexec", "opencode", openCodeName),
  } as const;
  const env: NodeJS.ProcessEnv = {};
  for (const [name, path] of Object.entries(candidates)) {
    if (process.env[name]?.trim()) continue;
    try {
      if (statSync(path).isFile()) env[name] = path;
    } catch {
      // Non-strict development contributions may intentionally omit Vela.
    }
  }
  return env;
}

export function lazyVelaRuntimeEnv(resourceRoot: string): NodeJS.ProcessEnv {
  const binaryName = process.platform === "win32" ? "vela.exe" : "vela";
  const openCodeName = process.platform === "win32" ? "opencode.exe" : "opencode";
  return {
    ...(process.env.VELA_BIN?.trim()
      ? {}
      : { VELA_BIN: join(resourceRoot, "bin", binaryName) }),
    ...(process.env.VELA_OPENCODE_BIN?.trim()
      ? {}
      : {
          VELA_OPENCODE_BIN: join(
            resourceRoot,
            "bin",
            "libexec",
            "opencode",
            openCodeName,
          ),
        }),
    [VELA_RUNTIME_LAZY_ENV]: "1",
  };
}
