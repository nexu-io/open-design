import { accessSync, closeSync, constants, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import path, { delimiter } from 'node:path';
import { inspectAgentExecutableResolution, userToolchainBinDirs } from './executables.js';
import type { RuntimeAgentDef } from './types.js';

export type AgentLaunchKind = 'selected' | 'codex-native';

export type AgentLaunchResolution = ReturnType<typeof inspectAgentExecutableResolution> & {
  launchPath: string | null;
  launchKind: AgentLaunchKind;
  childPathPrepend: string[];
  diagnostic: string | null;
};

export function resolveAgentLaunch(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): AgentLaunchResolution {
  const resolution = inspectAgentExecutableResolution(def, configuredEnv);
  if (!resolution.selectedPath) {
    return { ...resolution, launchPath: null, launchKind: 'selected', childPathPrepend: [], diagnostic: null };
  }
  const childPathPrepend = path.isAbsolute(resolution.selectedPath)
    ? [path.dirname(resolution.selectedPath)]
    : [];
  if (def.id !== 'codex') {
    return { ...resolution, launchPath: resolution.selectedPath, launchKind: 'selected', childPathPrepend, diagnostic: null };
  }
  const native = tryResolveCodexNativeBinary(resolution.selectedPath);
  return {
    ...resolution,
    launchPath: native.path ?? resolution.selectedPath,
    launchKind: native.path ? 'codex-native' : 'selected',
    childPathPrepend: [...childPathPrepend, ...native.childPathPrepend],
    diagnostic: native.diagnostic,
  };
}

export function applyAgentLaunchEnv(
  env: NodeJS.ProcessEnv,
  launch: Pick<AgentLaunchResolution, 'childPathPrepend'>,
  nodeBinDir: string = path.dirname(process.execPath),
  appendPathDirs: string[] = userToolchainBinDirs(),
): NodeJS.ProcessEnv {
  // Build the ordered list of directories to guarantee are at the front of
  // PATH: the running Node binary directory first (so npm .cmd shims on
  // Windows that invoke bare "node" find the correct binary even when the
  // daemon was GUI-launched without a nodejs entry on PATH), then the agent
  // wrapper/shim directory.  Using process.execPath as the default means
  // every call site — detectAgents, connection tests, and chat runs —
  // consistently reaches the correct Node binary without each caller having
  // to duplicate the dirname(process.execPath) prepend independently.
  //
  // `appendPathDirs` adds the user toolchain bin dirs (Homebrew, ~/.bun/bin,
  // version-manager dirs, …) to the END of PATH so a resolved binary's shebang
  // interpreter is findable at spawn time even when the daemon's own PATH is
  // minimal (GUI launch). Without this, an agent like Pi — a `#!/usr/bin/env
  // bun` script — resolves but the version probe / run spawn fails with exit
  // 127 ("env: bun: No such file or directory"), so detection wrongly marks it
  // unavailable. Defaults to the real toolchain dirs; tests pass [] for
  // determinism.
  const toPrepend = [...(nodeBinDir ? [nodeBinDir] : []), ...launch.childPathPrepend];
  if (toPrepend.length === 0 && appendPathDirs.length === 0) return env;
  // Case-insensitive key lookup — Windows uses 'Path', not 'PATH'.
  // Using env.PATH directly would be undefined on Windows, yielding a
  // one-entry PATH that contains only toPrepend and discards all system
  // paths.  Find the actual key name so we update in place rather than
  // adding a conflicting duplicate key.
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const existing = typeof env[pathKey] === 'string' ? (env[pathKey] as string) : '';
  const normalize = (p: string) => {
    const trimmed = p.replace(/[/\\]+$/, '');
    return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
  };
  const existingParts = existing.split(delimiter).filter((e) => e.length > 0);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...toPrepend, ...existingParts, ...appendPathDirs]) {
    const n = normalize(entry);
    if (!seen.has(n)) {
      seen.add(n);
      merged.push(entry);
    }
  }
  return { ...env, [pathKey]: merged.join(delimiter) };
}

function tryResolveCodexNativeBinary(wrapperPath: string): {
  path: string | null;
  childPathPrepend: string[];
  diagnostic: string | null;
} {
  const packageSuffix = codexNativePackageSuffix();
  const targetTriple = codexNativeTargetTriple();
  for (const root of codexSearchRoots(wrapperPath)) {
    for (const candidate of codexNativeCandidates(root, packageSuffix, targetTriple)) {
      if (isExecutableFile(candidate.path)) {
        return { path: candidate.path, childPathPrepend: existingDirectories(candidate.childPathPrepend), diagnostic: null };
      }
    }
  }
  if (!looksLikeCodexNodeWrapper(wrapperPath)) return { path: null, childPathPrepend: [], diagnostic: null };
  return {
    path: null,
    childPathPrepend: [],
    diagnostic: `Codex native binary was not found for ${packageSuffix}/${targetTriple}; falling back to wrapper ${wrapperPath}. Set CODEX_BIN to a native Codex binary if this wrapper cannot launch from a GUI environment.`,
  };
}

function codexSearchRoots(wrapperPath: string): string[] {
  const roots = new Set<string>();
  for (const seed of [wrapperPath, safeRealpath(wrapperPath)]) {
    if (!seed) continue;
    let current = path.dirname(seed);
    while (current !== path.dirname(current)) {
      roots.add(current);
      current = path.dirname(current);
    }
  }
  return [...roots];
}

function codexNativeCandidates(
  root: string,
  packageSuffix: string,
  targetTriple: string,
): Array<{ path: string; childPathPrepend: string[] }> {
  const scoped = path.join(root, 'node_modules', '@openai');
  const packageDirs = [path.join(scoped, `codex-${packageSuffix}`)];
  try {
    for (const entry of readdirSync(scoped, { encoding: 'utf8', withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('codex-')) packageDirs.push(path.join(scoped, entry.name));
    }
  } catch {
    // Optional package layouts vary by npm version; absence uses wrapper fallback.
  }
  return [...new Set(packageDirs)].flatMap((dir) => {
    const vendorPathDir = path.join(dir, 'vendor', targetTriple, 'path');
    const childPathPrepend = [vendorPathDir];
    return [
      { path: path.join(dir, 'vendor', targetTriple, 'codex', 'codex'), childPathPrepend },
      { path: path.join(dir, 'vendor', targetTriple, 'codex', 'codex.exe'), childPathPrepend },
      { path: path.join(dir, 'codex'), childPathPrepend },
      { path: path.join(dir, 'bin', 'codex'), childPathPrepend },
      { path: path.join(dir, 'vendor', 'codex'), childPathPrepend },
      { path: path.join(dir, 'codex.exe'), childPathPrepend },
      { path: path.join(dir, 'bin', 'codex.exe'), childPathPrepend },
    ];
  });
}

function codexNativePackageSuffix(): string {
  return `${process.platform}-${process.arch}`;
}

function codexNativeTargetTriple(): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-musl';
  if (process.platform === 'win32' && process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  return `${process.platform}-${process.arch}`;
}

function looksLikeCodexNodeWrapper(filePath: string): boolean {
  // Read only the first 64KB rather than slurping the whole file: the selected
  // codex path can now be the native Codex.app binary (~190MB), and
  // `readFileSync` would otherwise load all of it into a string just to sniff a
  // shebang. A node wrapper is a tiny script, so the header is enough.
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(64_000);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    return /node|@openai\/codex|codex-/i.test(buffer.toString('utf8', 0, bytesRead));
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Best-effort close; nothing actionable if it fails.
      }
    }
  }
}

function safeRealpath(filePath: string): string | null {
  try {
    return realpathSync(filePath);
  } catch {
    return null;
  }
}

function existingDirectories(dirs: string[]): string[] {
  return dirs.filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

function isExecutableFile(filePath: string): boolean {
  try {
    if (!statSync(filePath).isFile()) return false;
    if (process.platform !== 'win32') accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
