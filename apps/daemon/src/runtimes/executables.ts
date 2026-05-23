import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { wellKnownUserToolchainBins } from '@open-design/platform';
import { resolveSandboxRuntimeConfigFromEnv } from '../sandbox-mode.js';
import { execAgentFile } from './invocation.js';
import { expandHomePath } from './paths.js';
import type { RuntimeAgentDef } from './types.js';

const RUNTIME_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const AGENT_BIN_ENV_KEYS = new Map<string, string>([
  ['amr', 'VELA_BIN'],
  ['aider', 'AIDER_BIN'],
  ['claude', 'CLAUDE_BIN'],
  ['codex', 'CODEX_BIN'],
  ['copilot', 'COPILOT_BIN'],
  ['cursor-agent', 'CURSOR_AGENT_BIN'],
  ['deepseek', 'DEEPSEEK_BIN'],
  ['devin', 'DEVIN_BIN'],
  ['gemini', 'GEMINI_BIN'],
  ['hermes', 'HERMES_BIN'],
  ['kimi', 'KIMI_BIN'],
  ['kiro', 'KIRO_BIN'],
  ['kilo', 'KILO_BIN'],
  ['opencode', 'OPENCODE_BIN'],
  ['pi', 'PI_BIN'],
  ['qoder', 'QODER_BIN'],
  ['qwen', 'QWEN_BIN'],
  ['reasonix', 'REASONIX_BIN'],
  ['trae-cli', 'TRAE_CLI_BIN'],
  ['vibe', 'VIBE_BIN'],
]);

const TOOLCHAIN_DIR_CACHE_TTL_MS = 5000;
let cachedToolchainHome: string | null = null;
let cachedToolchainDirs: string[] | null = null;
let cachedToolchainDirsAt = 0;

function userToolchainDirs() {
  const sandboxRuntime = resolveSandboxRuntimeConfigFromEnv(
    process.env,
    RUNTIME_PROJECT_ROOT,
  );
  const homeOverride =
    sandboxRuntime?.roots.agentHomeDir ?? process.env.OD_AGENT_HOME;
  const home = homeOverride || homedir();
  const now = Date.now();
  if (
    cachedToolchainHome === home &&
    cachedToolchainDirs &&
    now - cachedToolchainDirsAt < TOOLCHAIN_DIR_CACHE_TTL_MS
  ) {
    return cachedToolchainDirs;
  }
  cachedToolchainHome = home;
  cachedToolchainDirsAt = now;
  // When OD_AGENT_HOME is set, scope the search strictly to the override
  // home: skip Homebrew / /usr/local *and* pass an empty env so that a
  // developer or CI runner with NPM_CONFIG_PREFIX / npm_config_prefix
  // exported can't leak the real machine's <prefix>/bin into a sandboxed
  // detection run. Without this the agents.test.ts cases that build a
  // tmp home would be machine-environment-dependent.
  cachedToolchainDirs = wellKnownUserToolchainBins({
    home,
    includeSystemBins: process.platform !== 'win32' && !homeOverride,
    env: homeOverride ? {} : process.env,
  });
  return cachedToolchainDirs;
}

// The user-level toolchain bin directories (Homebrew, ~/.local/bin, ~/.bun/bin,
// version-manager node dirs, npm prefixes, …) that binary *resolution* searches
// beyond process.env.PATH. Exposed so the spawn env can append the same dirs:
// a binary can resolve here yet fail to *execute* if its shebang interpreter
// (e.g. `#!/usr/bin/env bun`) lives in one of these dirs and the spawn PATH
// doesn't include it. Keeping resolution and spawn PATH symmetric fixes that.
export function userToolchainBinDirs(): string[] {
  return userToolchainDirs();
}

function resolvePathDirs() {
  const seen = new Set();
  const dirs = [
    ...(process.env.PATH || '').split(delimiter),
    // GUI launchers (macOS .app bundles, Linux .desktop files) often start
    // with a minimal PATH. Include common user-level CLI install locations
    // so agent detection matches the user's shell-installed tools,
    // especially Node version managers.
    ...userToolchainDirs(),
  ];
  return dirs.filter((dir) => {
    if (!dir || seen.has(dir)) return false;
    seen.add(dir);
    return true;
  });
}

// The exact, de-duplicated directory list `resolveOnPath` walks. Surfaced so
// detection can attach it to a `not-on-path` diagnostic verbatim — the UI
// shows the user where we actually looked before asking them to set an
// explicit binary path, instead of recomputing PATH client-side.
export function agentSearchDirs(): string[] {
  return resolvePathDirs();
}

// The `*_BIN` environment variable that overrides PATH detection for a given
// agent id (e.g. `cursor-agent` → `CURSOR_AGENT_BIN`), or null when the agent
// has no override key. Drives the `setEnv` / `clearEnv` fix intents.
export function agentBinEnvKey(agentId: string | undefined): string | null {
  if (!agentId) return null;
  return AGENT_BIN_ENV_KEYS.get(agentId) ?? null;
}

export function resolveOnPath(bin: string): string | null {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  const dirs = resolvePathDirs();
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      if (full && existsSync(full)) return full;
    }
  }
  return null;
}

// Same search shape as `resolveOnPath`, but returns *every* directory
// the bin resolves in (PATH order, then toolchain dirs). Used by the
// version-aware chooser to evaluate every candidate rather than stop
// at the first match (#978).
export function enumerateOnPath(bin: string): string[] {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  const dirs = resolvePathDirs();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      if (!full || seen.has(full)) continue;
      if (existsSync(full)) {
        seen.add(full);
        found.push(full);
      }
    }
  }
  return found;
}

function looksExecutableOnWindows(filePath: string): boolean {
  const ext = path.extname(filePath).trim().toUpperCase();
  if (!ext) return false;
  const executableExts = (process.env.PATHEXT || '.EXE;.CMD;.BAT')
    .split(';')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return executableExts.includes(ext);
}

function executableFilePath(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const expanded = expandHomePath(raw.trim());
  if (!path.isAbsolute(expanded)) return null;
  try {
    if (!statSync(expanded).isFile()) return null;
    if (process.platform === 'win32') {
      if (!looksExecutableOnWindows(expanded)) return null;
    } else {
      accessSync(expanded, constants.X_OK);
    }
    return expanded;
  } catch {
    return null;
  }
}

// Resolve the first available binary for an agent definition. Tries
// `def.bin` first, then walks `def.fallbackBins` in order. Used for
// agents whose forks ship under a different binary name but speak the
// exact same CLI (Claude Code → OpenClaude, issue #235). Returns null
// when no candidate is on PATH.
function configuredExecutableOverride(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): string | null {
  const envKey = AGENT_BIN_ENV_KEYS.get(def?.id);
  if (!envKey) return null;
  return executableFilePath(configuredEnv?.[envKey]);
}

export function resolveAmrOpenCodeExecutable(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const configured = executableFilePath(env.VELA_OPENCODE_BIN);
  if (configured) return configured;
  // In packaged builds prefer the bundled companion under
  // `OD_RESOURCE_ROOT/bin/libexec/opencode/opencode` so a stale global
  // `opencode` on the user's PATH can't override the known-good build that
  // shipped with this app. PATH is only consulted as a last resort.
  const resourceRoot = (
    env.OD_RESOURCE_ROOT ?? process.env.OD_RESOURCE_ROOT
  )?.trim();
  if (resourceRoot) {
    const bundledDir = packagedVelaOpenCodeCompanionTree(resourceRoot);
    if (bundledDir) {
      const bundled = executableFilePath(
        path.join(
          bundledDir,
          process.platform === 'win32' ? 'opencode.exe' : 'opencode',
        ),
      );
      if (bundled) return bundled;
    }
  }
  return resolveOnPath('opencode-cli') ?? resolveOnPath('opencode');
}

// `tools/pack/tests/resources.test.ts` ships the AMR OpenCode companion as a
// `<resourceRoot>/bin/libexec/opencode/opencode` *executable file*, not just
// the directory. Treating any directory there as a valid companion produces a
// false-positive availability path: `detectAgents()` would surface AMR as
// available even though the first real run can't launch (`vela` would spawn
// a missing/non-executable inner binary). Verify the inner executable too.
function packagedVelaOpenCodeCompanionTree(resourceRoot: string): string | null {
  const candidate = path.join(resourceRoot, 'bin', 'libexec', 'opencode');
  const exe = path.join(
    candidate,
    process.platform === 'win32' ? 'opencode.exe' : 'opencode',
  );
  try {
    if (!statSync(candidate).isDirectory()) return null;
    if (!statSync(exe).isFile()) return null;
    if (process.platform === 'win32') {
      if (!looksExecutableOnWindows(exe)) return null;
    } else {
      accessSync(exe, constants.X_OK);
    }
    return candidate;
  } catch {
    return null;
  }
}

function packagedBuiltInExecutable(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): string | null {
  if (def.id !== 'amr') return null;
  const resourceRoot = process.env.OD_RESOURCE_ROOT?.trim();
  if (!resourceRoot) return null;
  if (
    !resolveAmrOpenCodeExecutable({ ...process.env, ...configuredEnv }) &&
    !packagedVelaOpenCodeCompanionTree(resourceRoot)
  ) {
    return null;
  }
  const candidate = path.join(
    resourceRoot,
    'bin',
    process.platform === 'win32' ? 'vela.exe' : 'vela',
  );
  try {
    if (!statSync(candidate).isFile()) return null;
    if (process.platform === 'win32') {
      if (!looksExecutableOnWindows(candidate)) return null;
    } else {
      accessSync(candidate, constants.X_OK);
    }
    return candidate;
  } catch {
    return null;
  }
}

export function resolveAgentExecutable(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): string | null {
  return inspectAgentExecutableResolution(def, configuredEnv).selectedPath;
}

export function inspectAgentExecutableResolution(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): {
  configuredOverridePath: string | null;
  pathResolvedPath: string | null;
  selectedPath: string | null;
} {
  if (!def?.bin) {
    return {
      configuredOverridePath: null,
      pathResolvedPath: null,
      selectedPath: null,
    };
  }
  const configuredOverridePath = configuredExecutableOverride(def, configuredEnv);
  // Version-aware cache lookup runs only when there is no explicit
  // override and the def opts in via `minVersion`. The cache is
  // populated by `chooseExecutableByMinVersion` during detection so
  // chat-time spawn sees the same binary detection picked instead of
  // falling back to first-match (#978).
  let pathResolvedPath: string | null = null;
  if (!configuredOverridePath && def.minVersion) {
    const cached = versionAwareCache.get(def.id);
    if (cached && existsSync(cached)) {
      pathResolvedPath = cached;
    }
  }
  if (!pathResolvedPath) {
    const candidates = [
      def.bin,
      ...(Array.isArray(def.fallbackBins) ? def.fallbackBins : []),
    ];
    for (const bin of candidates) {
      const resolved = resolveOnPath(bin);
      if (resolved) {
        pathResolvedPath = resolved;
        break;
      }
    }
  }
  const builtInPath = packagedBuiltInExecutable(def, configuredEnv);
  return {
    configuredOverridePath,
    pathResolvedPath,
    selectedPath: configuredOverridePath || builtInPath || pathResolvedPath,
  };
}

// ---- Version-aware resolution (#978) -------------------------------------
//
// Gemini-style "stale binary shadows the modern one" problem: macOS GUI
// launches inherit `/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin`, and an
// ancient `/usr/local/bin/gemini=0.1.12` left by an old `npm i -g
// @google/gemini-cli` shadows the modern Homebrew/nvm install. The old
// binary lacks `--output-format`, so the daemon spawn lands on yargs
// `Unknown arguments`. The fix runs `--version` against every candidate
// and picks the first that meets the floor pinned on the def.

const VERSION_PROBE_TIMEOUT_MS = 1_500;

// agent.id → resolved path that passed the version gate. Populated by
// `chooseExecutableByMinVersion`; consulted by
// `inspectAgentExecutableResolution` so the sync chat-spawn path sees
// the same pick detection landed on. Only writes for the auto-pick path
// — an explicit `<AGENT>_BIN` override is intentionally NOT cached so
// clearing the env reliably falls back to auto-pick (#1007 round-2 P2).
const versionAwareCache = new Map<string, string>();

export function clearVersionAwareResolutionCache(agentId?: string): void {
  if (agentId === undefined) {
    versionAwareCache.clear();
  } else {
    versionAwareCache.delete(agentId);
  }
}

// Strict, anchored semver parse. Accepts a leading `v` and tolerates
// trailing pre-release (`-rc.1`) / build metadata (`+build.5`) but
// only major.minor.patch participates in comparison. Returns `null`
// for unparseable input so the chooser explicitly rejects the
// candidate instead of letting it pass the gate (#1007 round-1 P1).
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  const [la, lb, lc] = left;
  const [ra, rb, rc] = right;
  if (la !== ra) return la - ra;
  if (lb !== rb) return lb - rb;
  if (lc !== rc) return lc - rc;
  return 0;
}

function parseSemver(value: string): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const m = SEMVER_RE.exec(value.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export interface ChooseExecutableByMinVersionOptions {
  // Test seam: inject a fake `runVersion(path)` so unit tests do not
  // need real binaries that print versions. Production passes the
  // default that spawns `<path> <def.versionArgs>` with a timeout.
  runVersion?: (resolvedPath: string) => Promise<string>;
}

export async function chooseExecutableByMinVersion(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
  options: ChooseExecutableByMinVersionOptions = {},
): Promise<string | null> {
  if (!def?.bin || !def.minVersion) return resolveAgentExecutable(def, configuredEnv);

  // Explicit user override always wins; do not probe and do not pollute
  // the cache (a later run with the override cleared must rediscover
  // a fresh auto-pick).
  const override = configuredExecutableOverride(def, configuredEnv);
  if (override) return override;

  // Enumerate every match for def.bin and (if declared) any fallback
  // bins, in the same order resolveOnPath would walk.
  const candidates: string[] = [];
  const seen = new Set<string>();
  const bins = [def.bin, ...(Array.isArray(def.fallbackBins) ? def.fallbackBins : [])];
  for (const bin of bins) {
    for (const hit of enumerateOnPath(bin)) {
      if (seen.has(hit)) continue;
      seen.add(hit);
      candidates.push(hit);
    }
  }
  if (candidates.length === 0) {
    versionAwareCache.delete(def.id);
    return null;
  }

  const runVersion = options.runVersion ?? ((p) => probeVersionWithTimeout(p, def));
  const probes = await Promise.all(
    candidates.map(async (p) => {
      try {
        const out = await runVersion(p);
        return { path: p, version: typeof out === 'string' ? out.trim().split('\n')[0] ?? '' : '' };
      } catch {
        return { path: p, version: '' };
      }
    }),
  );

  for (const probe of probes) {
    const cmp = compareSemver(probe.version, def.minVersion);
    if (cmp !== null && cmp >= 0) {
      versionAwareCache.set(def.id, probe.path);
      return probe.path;
    }
  }

  // Regression-safe fallback: keep the previous behavior (first-found)
  // so the existing "agent exited with code 1" surface still fires
  // when nothing meets the floor, instead of the agent silently
  // disappearing from the picker. Drop any stale cache entry so a
  // later install of a modern binary is not occluded.
  versionAwareCache.delete(def.id);
  return candidates[0] ?? null;
}

async function probeVersionWithTimeout(
  resolvedPath: string,
  def: RuntimeAgentDef,
): Promise<string> {
  // Mirror the core of `applyAgentLaunchEnv`: prepend the daemon's
  // own Node binary directory and the candidate's directory to PATH so
  // Node-wrapper CLIs (`#!/usr/bin/env node`, npm `.cmd` shims on
  // Windows) can resolve `node` even when the daemon was GUI-launched
  // with a stripped PATH. We do NOT import `applyAgentLaunchEnv`
  // directly: launch.ts depends on executables.ts and the import
  // cycle would break.
  const env: NodeJS.ProcessEnv = { ...process.env, ...(def.env || {}) };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const existing = typeof env[pathKey] === 'string' ? (env[pathKey] as string) : '';
  const prepend = [path.dirname(process.execPath), path.dirname(resolvedPath)].filter(Boolean);
  const merged = [...prepend, ...existing.split(delimiter).filter(Boolean)];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const dir of merged) {
    if (!seen.has(dir)) {
      seen.add(dir);
      deduped.push(dir);
    }
  }
  env[pathKey] = deduped.join(delimiter);
  const { stdout } = await execAgentFile(resolvedPath, def.versionArgs, {
    env,
    timeout: VERSION_PROBE_TIMEOUT_MS,
  });
  return String(stdout);
}
