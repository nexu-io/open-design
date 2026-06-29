import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { wellKnownUserToolchainBins } from '@open-design/platform';
import { resolveSandboxRuntimeConfigFromEnv } from '../sandbox-mode.js';
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
  ['codebuddy', 'CODEBUDDY_BIN'],
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
  ['mimo', 'MIMO_BIN'],
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

// Resolve the home directory detection should search, honoring the sandbox /
// `OD_AGENT_HOME` override. `hasOverride` lets callers scope strictly to the
// override home (skipping real-machine system locations) so sandboxed
// detection runs and tests stay deterministic instead of reaching the host.
function resolveDetectionHome(): { home: string; hasOverride: boolean } {
  const sandboxRuntime = resolveSandboxRuntimeConfigFromEnv(
    process.env,
    RUNTIME_PROJECT_ROOT,
  );
  const homeOverride =
    sandboxRuntime?.roots.agentHomeDir ?? process.env.OD_AGENT_HOME;
  return { home: homeOverride || homedir(), hasOverride: Boolean(homeOverride) };
}

function userToolchainDirs() {
  const { home, hasOverride } = resolveDetectionHome();
  const homeOverride = hasOverride ? home : undefined;
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

// The official OpenAI Codex desktop app (bundle id `com.openai.codex`) ships
// the `codex` CLI *inside* its macOS application bundle at
// `Codex.app/Contents/Resources/codex` and does NOT add it to PATH unless the
// user explicitly runs the app's "Install command line tool" action. Users who
// installed Codex only through the app therefore see a "not installed" agent
// card even though a healthy native `codex` binary exists on disk, because
// neither PATH nor the user-toolchain search dirs cover the app bundle. Probe
// the well-known bundle locations so app-only installs are detected. This is a
// last-resort fallback that ranks below PATH, so an explicit `npm i -g` /
// Homebrew / version-manager install always wins.
function codexAppBundleExecutable(def: RuntimeAgentDef): string | null {
  if (def?.id !== 'codex') return null;
  for (const candidate of codexAppBundleCandidates()) {
    const resolved = executableFilePath(candidate);
    if (resolved) return resolved;
  }
  return null;
}

// Exported for tests: the no-override `/Applications` branch can't be exercised
// through `resolveAgentExecutable` deterministically (it would depend on the
// host actually having `/Applications/Codex.app`), so tests assert the built
// candidate list directly to catch a path typo or ordering regression in the
// common real-world install case.
export function codexAppBundleCandidates(): string[] {
  // The Codex app bundle is a macOS-only concept; other platforms have no
  // analogous standalone install of the `codex` CLI to probe for here.
  if (process.platform !== 'darwin') return [];
  const { home, hasOverride } = resolveDetectionHome();
  const bundleSuffix = ['Codex.app', 'Contents', 'Resources', 'codex'];
  // User-scoped install (~/Applications). Honors the override home so
  // sandboxed detection runs and tests stay deterministic.
  const candidates = [path.join(home, 'Applications', ...bundleSuffix)];
  // System-wide /Applications install. Skip it under an override home for the
  // same isolation reason `userToolchainDirs` skips Homebrew/system bins.
  if (!hasOverride) {
    candidates.unshift(path.join('/Applications', ...bundleSuffix));
  }
  return candidates;
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
  const candidates = [
    def.bin,
    ...(Array.isArray(def.fallbackBins) ? def.fallbackBins : []),
  ];
  let pathResolvedPath: string | null = null;
  for (const bin of candidates) {
    const resolved = resolveOnPath(bin);
    if (resolved) {
      pathResolvedPath = resolved;
      break;
    }
  }
  const builtInPath = packagedBuiltInExecutable(def, configuredEnv);
  const appBundlePath = codexAppBundleExecutable(def);
  return {
    configuredOverridePath,
    pathResolvedPath,
    selectedPath:
      configuredOverridePath || builtInPath || pathResolvedPath || appBundlePath,
  };
}
