import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';

// Codex and Pi reach the managed (keyless) web search/fetch service through
// two assets that ship inside the `@powerformer/vela-cli` npm package:
//
//   runtime/managed-web.mjs  — a small CLI that Codex invokes through its own
//                              native shell tool, because the pinned Codex
//                              exec path exposes no configured MCP tools.
//   runtime/pi-web.mjs       — a Pi extension loaded with `-e`, which
//                              registers the same tools through Pi's API.
//
// Vela reads their absolute paths from `VELA_WEB_TOOLS` / `VELA_PI_WEB_EXTENSION`
// and refuses to start the harness when either is missing, because normally the
// package's own `bin/vela.cjs` launcher injects them just before it spawns the
// compiled binary.
//
// OpenDesign never runs that launcher: it resolves and spawns the platform
// package's raw `vela` binary directly (see `resolveAgentExecutable`). Without
// the values below, every Codex and Pi run therefore dies with "managed Codex
// web tools missing: launch through the Vela npm package" — a capability gap
// that reads as a total harness failure. Resolving the companion assets here is
// the same thing `resolveAmrOpenCodeExecutable` already does for the OpenCode
// companion binary that lives beside the same vela release.

const MANAGED_WEB_RELATIVE = path.join('runtime', 'managed-web.mjs');
const PI_WEB_RELATIVE = path.join('runtime', 'pi-web.mjs');

export type VelaManagedWebRuntime = {
  webTools: string | null;
  piWebExtension: string | null;
};

const EMPTY: VelaManagedWebRuntime = { webTools: null, piWebExtension: null };

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function safeRealpath(candidate: string): string | null {
  try {
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

function ancestorDirectories(start: string): string[] {
  const out: string[] = [];
  let current = start;
  while (current !== path.dirname(current)) {
    out.push(current);
    current = path.dirname(current);
  }
  return out;
}

// pnpm installs the platform package twice over: a hoisted symlink tree under
// `node_modules/.pnpm/node_modules/@powerformer/…` and the isolated real store
// at `node_modules/.pnpm/<mangled>/node_modules/@powerformer/…`. Only the
// hoisted tree has `@powerformer/vela-cli` as a directory sibling, so walk the
// ancestors of BOTH the invoked path and its realpath: from the isolated store
// the `.pnpm` ancestor still reaches the hoisted tree one level down. npm and
// yarn layouts are covered by the same two shapes.
function packageDirectoryCandidates(velaBin: string): string[] {
  const roots = new Set<string>();
  for (const seed of [velaBin, safeRealpath(velaBin)]) {
    if (!seed) continue;
    for (const ancestor of ancestorDirectories(path.dirname(seed))) {
      roots.add(ancestor);
    }
  }
  const out: string[] = [];
  for (const root of roots) {
    out.push(path.join(root, '@powerformer', 'vela-cli'));
    out.push(path.join(root, 'node_modules', '@powerformer', 'vela-cli'));
  }
  return out;
}

/**
 * Locate the `@powerformer/vela-cli` runtime assets that belong to the same
 * vela release as `velaBin`.
 *
 * Both files are required together: a package that ships only one of them is a
 * partial install, and half-configuring the harnesses would trade one silent
 * capability gap for another. Returns nulls when nothing matches, leaving vela
 * to report its own actionable error rather than substituting a stale package
 * from an unrelated install.
 */
export function resolveVelaManagedWebRuntime(
  velaBin: string | null | undefined,
): VelaManagedWebRuntime {
  const bin = velaBin?.trim();
  if (!bin) return EMPTY;
  for (const dir of packageDirectoryCandidates(bin)) {
    const webTools = path.join(dir, MANAGED_WEB_RELATIVE);
    const piWebExtension = path.join(dir, PI_WEB_RELATIVE);
    if (isFile(webTools) && isFile(piWebExtension)) {
      return { webTools, piWebExtension };
    }
  }
  return EMPTY;
}

/**
 * Same resolution, seeded the way `resolveAmrOpenCodeExecutable` seeds the
 * OpenCode companion: the explicitly selected vela binary first, then the
 * packaged resource root. `resolvedBin` is the path the caller is actually
 * about to spawn and wins when supplied, so a Settings override or a native
 * relaunch still finds the assets belonging to that exact release.
 */
export function velaManagedWebRuntimeForEnv(
  env: NodeJS.ProcessEnv = process.env,
  resolvedBin?: string | null,
): VelaManagedWebRuntime {
  const resourceRoot = env.OD_RESOURCE_ROOT?.trim();
  const seeds = [
    resolvedBin,
    env.VELA_BIN,
    resourceRoot
      ? path.join(
          resourceRoot,
          'bin',
          process.platform === 'win32' ? 'vela.exe' : 'vela',
        )
      : null,
  ];
  for (const seed of seeds) {
    const resolved = resolveVelaManagedWebRuntime(seed);
    if (resolved.webTools && resolved.piWebExtension) return resolved;
  }
  return EMPTY;
}

/**
 * The Node interpreter `runtime/managed-web.mjs` is executed with.
 *
 * `bin/vela.cjs` uses its own `process.execPath`, which is always a real Node
 * there. The daemon's is not: inside the packaged desktop app it is the
 * Electron binary, which would only work as a Node host with
 * ELECTRON_RUN_AS_NODE plumbed through a shell Codex controls. Prefer the real
 * interpreter the packaged launcher already hands us, and fall back to
 * `process.execPath` only when this process really is Node.
 */
export function resolveVelaNodeBin(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = env.OD_NODE_BIN?.trim();
  if (configured) return configured;
  if (process.versions.electron) return null;
  return process.execPath || null;
}
