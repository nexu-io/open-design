import { createHash } from 'node:crypto';
import { execAgentFile } from './invocation.js';
import { AGENT_DEFS } from './registry.js';
import {
  DEFAULT_MODEL_OPTION,
  getRememberedLiveModels,
  mergeFallbackModelMetadata,
  rememberLiveModels,
} from './models.js';
import { applyAgentLaunchEnv, resolveAgentLaunch } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import { probeAgentAuthStatus } from './auth.js';
import { agentCapabilities } from './capabilities.js';
import { installMetaForAgent } from './metadata.js';
import {
  forgetUnusableExecutables,
  rememberUnusableExecutable,
  resolveAmrOpenCodeExecutable,
} from './executables.js';
import { resolveAmrProfile } from '../integrations/vela.js';
import {
  buildAuthDiagnostic,
  buildCompatibilityDiagnostic,
  buildExecutableDiagnostic,
  buildNotInvocableDiagnostic,
  buildVersionDiagnostic,
  type NotInvocableCause,
} from './diagnostics.js';
import type {
  AgentDiagnostic,
  DetectedAgent,
  RuntimeAgentDef,
  RuntimeVersionPolicy,
  RuntimeCapabilityMap,
  RuntimeModelSource,
  RuntimeModelOption,
} from './types.js';

type FetchedRuntimeModels = {
  models: RuntimeModelOption[];
  source: RuntimeModelSource;
};

export interface DetectedRuntimeVersions {
  /** The configured executable successfully spawned, independent of version parsing. */
  invocable: true;
  agentCliVersion?: string;
  runtimeCompanionName?: string;
  runtimeCompanionVersion?: string;
}

// Detection already pays the bounded `--version` probe cost used by Settings.
// Keep the result as daemon-lifetime provenance so run telemetry can name the
// exact executable family without spawning another process on every turn.
const detectedRuntimeVersions = new Map<string, DetectedRuntimeVersions>();
const detectedRuntimeVersionScopes = new Map<string, string>();
const detectedRuntimeVersionProbes = new Map<
  string,
  Promise<DetectedRuntimeVersions | null>
>();
const detectedRuntimeCapabilityScopes = new Map<string, string>();
const detectedRuntimeCapabilityProbes = new Map<
  string,
  Promise<RuntimeCapabilityMap | null>
>();

// How many unusable binaries detection will walk past before giving up on an
// agent. Each attempt costs one bounded `--version` spawn, and the healthy
// case stops at the first candidate, so this only bounds the pathological
// shape: the same CLI name shadowed in many search directories at once.
const MAX_EXECUTABLE_ATTEMPTS = 8;

export function getDetectedRuntimeVersions(
  agentId: string | null | undefined,
): DetectedRuntimeVersions | null {
  if (!agentId) return null;
  const remembered = detectedRuntimeVersions.get(agentId);
  return remembered ? { ...remembered } : null;
}

/**
 * Resolve exact runtime provenance for one selected agent without requiring a
 * prior Settings or `/api/agents` request to have warmed the daemon cache.
 *
 * OD Next uses this at its capability boundary. The cache remains the normal
 * fast path; after a daemon restart, the selected CLI is probed once through
 * the same bounded detection path used by the agent picker. A successfully
 * spawned probe remains non-null even when version output is
 * unavailable; only a non-invocable runtime stays null.
 */
export async function ensureDetectedRuntimeVersions(
  agentId: string | null | undefined,
  configuredAgentEnv: Record<string, string> = {},
): Promise<DetectedRuntimeVersions | null> {
  if (!agentId) return null;
  const def = AGENT_DEFS.find((candidate) => candidate.id === agentId);
  if (!def) return null;
  const context = runtimeVersionProbeContext(def, configuredAgentEnv);
  if (!context) return null;
  const remembered = getDetectedRuntimeVersions(agentId);
  if (
    remembered
    && detectedRuntimeVersionScopes.get(agentId) === context.scope
  ) {
    return remembered;
  }
  const probeKey = `${agentId}:${context.scope}`;
  const existing = detectedRuntimeVersionProbes.get(probeKey);
  if (existing) return existing;
  const probe = probeRuntimeVersionsOnly(def, context);
  detectedRuntimeVersionProbes.set(probeKey, probe);
  try {
    return await probe;
  } finally {
    if (detectedRuntimeVersionProbes.get(probeKey) === probe) {
      detectedRuntimeVersionProbes.delete(probeKey);
    }
  }
}

/**
 * Resolve the advertised `--help` capability flags for one selected agent
 * without requiring a prior Settings or `/api/agents` request to have warmed
 * `agentCapabilities`.
 *
 * `ensureDetectedRuntimeVersions` deliberately probes only `--version`, so an
 * admission path that never ran full detection sees an empty capability map
 * and cannot tell "this CLI does not advertise the flag" apart from "nobody
 * asked the CLI yet". Callers that gate behaviour on an advertised flag must
 * establish the answer through this probe first; it reuses the same bounded
 * `--help` read and the same `agentCapabilities` cache as full detection.
 *
 * Returns null only when the runtime is not resolvable or declares no
 * capability metadata; a CLI whose `--help` simply omits every known flag
 * resolves to a populated map of `false` values.
 */
export async function ensureDetectedRuntimeCapabilities(
  agentId: string | null | undefined,
  configuredAgentEnv: Record<string, string> = {},
): Promise<RuntimeCapabilityMap | null> {
  if (!agentId) return null;
  const def = AGENT_DEFS.find((candidate) => candidate.id === agentId);
  if (!def) return null;
  const context = runtimeVersionProbeContext(def, configuredAgentEnv);
  if (!context) return null;
  const remembered = agentCapabilities.get(agentId);
  if (
    remembered
    && detectedRuntimeCapabilityScopes.get(agentId) === context.scope
  ) {
    return { ...remembered };
  }
  const probeKey = `${agentId}:${context.scope}`;
  const existing = detectedRuntimeCapabilityProbes.get(probeKey);
  if (existing) return existing;
  const probe = probeCapabilities(def, context.launchPath, context.probeEnv)
    .then((caps) => {
      if (caps) {
        agentCapabilities.set(def.id, caps);
        detectedRuntimeCapabilityScopes.set(def.id, context.scope);
      }
      return caps ? { ...caps } : null;
    });
  detectedRuntimeCapabilityProbes.set(probeKey, probe);
  try {
    return await probe;
  } finally {
    if (detectedRuntimeCapabilityProbes.get(probeKey) === probe) {
      detectedRuntimeCapabilityProbes.delete(probeKey);
    }
  }
}

function configuredEnvForAgent(
  configuredEnvByAgent: Record<string, Record<string, string>>,
  agentId: string,
): Record<string, string> {
  const configAgentId = agentId === 'byok-opencode' ? 'opencode' : agentId;
  return configuredEnvByAgent?.[configAgentId] ?? {};
}

function amrModelScopeFromEnv(env: NodeJS.ProcessEnv): string {
  return resolveAmrProfile(env);
}

function withRememberedAmrModels(
  def: RuntimeAgentDef,
  env: NodeJS.ProcessEnv,
  modelResult: FetchedRuntimeModels,
): FetchedRuntimeModels {
  if (def.id !== 'amr' || modelResult.models.length > 0) return modelResult;
  const rememberedModels = getRememberedLiveModels(def.id, amrModelScopeFromEnv(env));
  if (rememberedModels.length === 0) return modelResult;
  return { models: rememberedModels, source: 'live' };
}

async function fetchModels(
  def: RuntimeAgentDef,
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<FetchedRuntimeModels> {
  if (typeof def.fetchModels === 'function') {
    try {
      const parsed = await def.fetchModels(resolvedBin, env);
      if (!parsed || parsed.length === 0) {
        return { models: def.fallbackModels, source: 'fallback' };
      }
      return { models: mergeFallbackModelMetadata(def, parsed), source: 'live' };
    } catch {
      return { models: def.fallbackModels, source: 'fallback' };
    }
  }
  if (!def.listModels) {
    return { models: def.fallbackModels, source: 'fallback' };
  }
  try {
    const { stdout } = await execAgentFile(resolvedBin, def.listModels.args, {
      env,
      timeout: def.listModels.timeoutMs ?? 5000,
      // Models lists from popular CLIs (e.g. opencode) easily exceed the
      // default 1MB buffer once you include every openrouter model. Bump
      // it so we don't truncate the listing.
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = def.listModels.parse(String(stdout));
    // Empty / null parse result means the CLI didn't actually return a
    // usable list (e.g. cursor-agent's "No models available"); fall back
    // to the static hint so the picker isn't stuck on Default-only.
    if (!parsed || parsed.length === 0) {
      return { models: def.fallbackModels, source: 'fallback' };
    }
    return { models: mergeFallbackModelMetadata(def, parsed), source: 'live' };
  } catch {
    return { models: def.fallbackModels, source: 'fallback' };
  }
}

export type VersionProbeOutcome =
  | { kind: 'not-invocable'; cause: NotInvocableCause }
  | { kind: 'spawned'; version: string | null };

// cmd.exe's equivalent of POSIX 127 ("command not found").
const WINDOWS_COMMAND_NOT_FOUND_EXIT = 9009;

// Evidence that the *launcher* never reached the program it stands for, as
// opposed to the program running and reporting its own failure.
//
// Exit status alone cannot make this call on Windows. A global npm wrapper is
// a `.CMD`, which OpenDesign runs through `cmd.exe /d /s /c`; when the package
// behind it has been uninstalled, cmd.exe starts, node starts, and only then
// does node fail to load the script the wrapper names — a plain exit 1 with
// MODULE_NOT_FOUND on stderr. Nothing along that chain failed to *start*, so
// none of the POSIX signals (ENOENT, 126, 127) ever appear, and the wrapper
// looks indistinguishable from a healthy CLI that dislikes `--version`.
//
// So match the launcher's own vocabulary instead, and only that: node's
// missing-module report, and cmd.exe / PowerShell's missing-command and
// missing-path reports. A non-zero exit on its own stays a real answer from
// the right binary — otherwise a CLI that merely rejects its arguments would
// be abandoned in favour of some other install of itself.
//
// `isCliNotInstalledText` in run-failure-classification.ts reads similar
// output, and the overlap is deliberate rather than shared: it buckets a
// finished run for telemetry, where over-matching costs a mislabelled event,
// while this decides whether to abandon a binary mid-resolution, where
// over-matching sends a working CLI's user to a different install. It carries
// broader phrases ("not installed", "not on PATH") that must not leak in here.
const LAUNCHER_TARGET_MISSING_PATTERNS = [
  /\bMODULE_NOT_FOUND\b/,
  /\bCannot find module\b/i,
  /is not recognized as (?:an internal or external command|the name of a cmdlet)/i,
  /\bCommandNotFoundException\b/,
  /The system cannot find the (?:path|file) specified/i,
];

function launcherTargetMissing(err: unknown): boolean {
  const stderr = (err as { stderr?: unknown })?.stderr;
  if (typeof stderr !== 'string' || stderr.length === 0) return false;
  return LAUNCHER_TARGET_MISSING_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * Classify a rejected `--version` probe. There are two distinct failure modes
 * to discriminate:
 *
 *   - **Not invocable.** The OS rejected the spawn outright, OR the
 *     wrapper script spawned but its underlying interpreter / target
 *     failed. We split permission failures (EACCES / exit 126) from
 *     missing-target failures (ENOENT / ENOTDIR / exit 127 / cmd.exe's 9009,
 *     plus the launcher stderr Windows wrappers report instead) so Settings
 *     can offer permission-specific copy instead of treating every failure as
 *     a broken shim. We still mark the agent unavailable so Settings does not
 *     advertise a ghost entry (issue #658, lefarcen review P2 on PR #1301).
 *
 *   - **Spawned but `--version` was unhappy.** The binary itself ran
 *     (any other rejection: timeout, generic non-zero exit, stderr
 *     noise) so the CLI is invocable; we just can't read a version
 *     string. Adapters whose `--version` flag is unsupported land
 *     here and must keep working with `version: null`.
 *
 * `child_process.execFile` reports OS-level rejections with a string
 * `err.code` (`'ENOENT'`, `'EACCES'`, `'ENOTDIR'`) and non-zero exit
 * codes with a *numeric* `err.code` equal to the exit status, so those
 * two arms are unambiguous. Windows wrappers are the case they cannot
 * decide on their own — see `launcherTargetMissing` above.
 *
 * Exported because half of what it decides cannot be reached from a test that
 * spawns a fixture. `9009` and cmd.exe / PowerShell's wording only ever come
 * from a real Windows launcher, and POSIX masks exit statuses to 8 bits, so a
 * shell asked for 9009 reports 49. Since the daemon suite runs on Linux in CI,
 * driving this directly is the only way the merge gate can catch a regression
 * in a signature the Windows fix depends on.
 */
export function classifyVersionProbeFailure(err: unknown): VersionProbeOutcome {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (typeof code === 'string') {
    if (code === 'EACCES') {
      return { kind: 'not-invocable', cause: 'not-executable' };
    }
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { kind: 'not-invocable', cause: 'missing-target' };
    }
  } else if (typeof code === 'number') {
    if (code === 126) {
      return { kind: 'not-invocable', cause: 'not-executable' };
    }
    // 127 is the POSIX shell's "command not found"; 9009 is cmd.exe's.
    if (code === 127 || code === WINDOWS_COMMAND_NOT_FOUND_EXIT) {
      return { kind: 'not-invocable', cause: 'missing-target' };
    }
    if (launcherTargetMissing(err)) {
      return { kind: 'not-invocable', cause: 'missing-target' };
    }
  }
  return { kind: 'spawned', version: null };
}

/** Run the agent's `--version` probe and classify the result. */
async function probeVersionAtPath(
  def: RuntimeAgentDef,
  resolved: string,
  env: NodeJS.ProcessEnv,
): Promise<VersionProbeOutcome> {
  try {
    const { stdout } = await execAgentFile(resolved, def.versionArgs, {
      env,
      timeout: def.versionProbeTimeoutMs ?? 3000,
    });
    const rawVersion = String(stdout).trim().split('\n')[0]?.trim() || null;
    const version = rawVersion && def.versionPolicy?.parse
      ? def.versionPolicy.parse(rawVersion)
      : rawVersion;
    return { kind: 'spawned', version };
  } catch (err) {
    return classifyVersionProbeFailure(err);
  }
}

/**
 * Whether a probed version is one this build stands behind: an exact match on
 * what we exercised, or a match on the release line the agent declares. The
 * line exists so an agent that ships release candidates faster than we ship
 * does not warn every user who followed our own install instructions.
 */
function versionIsSupported(policy: RuntimeVersionPolicy, version: string): boolean {
  if (policy.supportedVersions.includes(version)) return true;
  return policy.supportedVersionPattern?.test(version) ?? false;
}

async function probeAmrOpenCodeVersion(
  def: RuntimeAgentDef,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (def.id !== 'amr') return null;
  const companion = resolveAmrOpenCodeExecutable(env);
  if (!companion) return null;
  try {
    const { stdout } = await execAgentFile(companion, ['--version'], {
      env,
      timeout: def.versionProbeTimeoutMs ?? 3000,
    });
    return String(stdout).trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

type RuntimeVersionProbeContext = {
  launchPath: string;
  probeEnv: NodeJS.ProcessEnv;
  scope: string;
};

function runtimeVersionProbeContext(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string>,
): RuntimeVersionProbeContext | null {
  const launch = resolveAgentLaunch(def, configuredEnv);
  if (!launch.selectedPath || !launch.launchPath) return null;
  const probeEnv = applyAgentLaunchEnv(
    spawnEnvForAgent(
      def.id,
      {
        ...process.env,
        ...(def.env || {}),
      },
      configuredEnv,
      undefined,
      { resolvedBin: launch.selectedPath },
    ),
    launch,
  );
  const companionPath = def.id === 'amr'
    ? resolveAmrOpenCodeExecutable(probeEnv)
    : null;
  return {
    launchPath: launch.launchPath,
    probeEnv,
    scope: createHash('sha256').update(JSON.stringify({
      agentId: def.id,
      selectedPath: launch.selectedPath,
      launchPath: launch.launchPath,
      companionPath,
    })).digest('hex'),
  };
}

async function probeRuntimeVersionsOnly(
  def: RuntimeAgentDef,
  context: RuntimeVersionProbeContext,
): Promise<DetectedRuntimeVersions | null> {
  const [outcome, amrOpenCodeVersion] = await Promise.all([
    probeVersionAtPath(def, context.launchPath, context.probeEnv),
    probeAmrOpenCodeVersion(def, context.probeEnv),
  ]);
  if (outcome.kind !== 'spawned') return null;
  const versions: DetectedRuntimeVersions = {
    invocable: true,
    ...(outcome.version ? { agentCliVersion: outcome.version } : {}),
    ...(amrOpenCodeVersion
      ? {
          runtimeCompanionName: 'opencode',
          runtimeCompanionVersion: amrOpenCodeVersion,
        }
      : {}),
  };
  detectedRuntimeVersions.set(def.id, versions);
  detectedRuntimeVersionScopes.set(def.id, context.scope);
  return { ...versions };
}

function unavailableAgent(
  def: RuntimeAgentDef,
  diagnostics: AgentDiagnostic[] = [],
  detected?: { path?: string; version?: string | null },
): DetectedAgent {
  return {
    ...stripFns(def),
    models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
    modelsSource: 'fallback',
    available: false,
    ...(detected?.path ? { path: detected.path } : {}),
    ...(detected && 'version' in detected ? { version: detected.version ?? null } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...installMetaForAgent(def.id),
  };
}

// Probe the agent's `--help` once and record which advertised flags the
// installed CLI supports, so buildArgs can consult the cache. Extracted from
// the main probe so it can run concurrently with model + auth probing instead
// of blocking them. Returns the capability map (or null when the agent
// declares no help/capability metadata or the probe failed).
async function probeCapabilities(
  def: RuntimeAgentDef,
  launchPath: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeCapabilityMap | null> {
  if (!def.helpArgs || !def.capabilityFlags) return null;
  try {
    const { stdout, stderr } = await execAgentFile(launchPath, def.helpArgs, {
      env,
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    });
    // Scan BOTH streams. Which one carries `--help` is a per-CLI accident of the
    // arg parser: OpenCode writes its entire help to stderr and leaves stdout
    // empty, so a stdout-only scan silently resolved every one of its flags to
    // `false`. That made the whole capability mechanism dead for OpenCode —
    // `--dangerously-skip-permissions` was never appended even on builds that
    // support it, and `--dir` (which pins the workspace to the project so the
    // agent stops adopting the enclosing git root) never applied either.
    const help = `${String(stdout)}\n${String(stderr)}`;
    const caps: RuntimeCapabilityMap = {};
    for (const [flag, key] of Object.entries(def.capabilityFlags)) {
      caps[key] = help.includes(flag);
    }
    return caps;
  } catch {
    // If --help fails, leave caps empty so buildArgs falls back to the safe
    // baseline (no optional flags).
    return {};
  }
}

async function probe(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): Promise<DetectedAgent> {
  detectedRuntimeVersions.delete(def.id);
  // Forget what a previous pass proved unusable before re-probing: a rescan
  // after the user repairs or reinstalls a CLI must not keep skipping it.
  forgetUnusableExecutables(def.id);
  // Detection must probe the exact path the runtime will spawn, not just the
  // PATH-visible shim. This is load-bearing for Codex under nvm/fnm/mise:
  // the discovered `codex` entry is often a `#!/usr/bin/env node` wrapper
  // that is not invocable from a GUI-launched app's stripped PATH, while the
  // launch resolver can still upgrade it to the packaged native Codex binary.
  // If detection probes the shim but chat/run spawns the native binary, the
  // UI incorrectly reports "not installed" until the user pins CODEX_BIN by
  // hand even though the real launch path is healthy.
  const initialLaunch = resolveAgentLaunch(def, configuredEnv);
  if (!initialLaunch.selectedPath || !initialLaunch.launchPath) {
    return unavailableAgent(def, [buildExecutableDiagnostic(def, configuredEnv)]);
  }
  // Carry the narrowed pair explicitly: the candidate walk below reassigns
  // this binding, which would otherwise discard the null-check above and
  // force every downstream reader to re-prove the paths are present.
  type ProbedLaunch = ReturnType<typeof resolveAgentLaunch> & {
    selectedPath: string;
    launchPath: string;
  };
  let launch: ProbedLaunch = {
    ...initialLaunch,
    selectedPath: initialLaunch.selectedPath,
    launchPath: initialLaunch.launchPath,
  };
  let probeEnv = applyAgentLaunchEnv(
    spawnEnvForAgent(
      def.id,
      {
        ...process.env,
        ...(def.env || {}),
      },
      configuredEnv,
      undefined,
      { resolvedBin: launch.selectedPath },
    ),
    launch,
  );
  let outcome = await probeVersionAtPath(def, launch.launchPath, probeEnv);
  // Resolving a name on PATH only proves a file exists there, never that it
  // runs. A directory that ranks earlier in the search order can hold a
  // wrapper orphaned by a half-finished `npm i -g` — the shim survives, the
  // package it points at does not — and stopping at that first hit hides a
  // perfectly good CLI of the same name further down the list. Walk past
  // every candidate that cannot be executed before declaring the agent
  // unusable. Only spawn-level failures advance the walk: a version that
  // parses badly, or a binary that runs and exits non-zero, is a real
  // answer from the right binary and must not fall through to another one.
  const attemptedPaths: string[] = [];
  while (
    outcome.kind === 'not-invocable' &&
    attemptedPaths.length < MAX_EXECUTABLE_ATTEMPTS
  ) {
    const failedPath = launch.selectedPath;
    if (!failedPath) break;
    attemptedPaths.push(failedPath);
    const next = resolveAgentLaunch(def, configuredEnv, {
      skipPathCandidates: attemptedPaths,
    });
    // No candidate left, or the resolver handed back something already
    // proven broken (an explicit override or packaged built-in, which are
    // deliberately not skippable) — either way there is nothing new to try.
    if (!next.selectedPath || !next.launchPath) break;
    if (attemptedPaths.includes(next.selectedPath)) break;
    launch = {
      ...next,
      selectedPath: next.selectedPath,
      launchPath: next.launchPath,
    };
    probeEnv = applyAgentLaunchEnv(
      spawnEnvForAgent(
        def.id,
        {
          ...process.env,
          ...(def.env || {}),
        },
        configuredEnv,
        undefined,
        { resolvedBin: next.selectedPath },
      ),
      next,
    );
    outcome = await probeVersionAtPath(def, next.launchPath, probeEnv);
  }
  // Publish every candidate this pass proved cannot be launched, so chat, the
  // connection test, and every other spawn site skip them instead of redoing
  // the naive first-hit-on-PATH walk and landing back on the shim detection
  // rejected. This restores the invariant stated above — detection probes the
  // exact path the runtime will spawn — which the candidate walk would
  // otherwise have broken. Recording the dead paths rather than the winner
  // leaves PATH order in charge of every candidate still standing.
  for (const attempted of attemptedPaths) {
    rememberUnusableExecutable(def.id, attempted);
  }
  if (outcome.kind === 'not-invocable') {
    rememberUnusableExecutable(def.id, launch.selectedPath);
    // Report the path that was actually tried. The agent picker only renders
    // an unavailable agent when it carries a path (that is what makes the
    // row actionable), so dropping it here erases the agent from the UI and
    // leaves the user with no way to see or fix what went wrong.
    return unavailableAgent(
      def,
      [buildNotInvocableDiagnostic(def, launch, outcome.cause)],
      { path: launch.selectedPath },
    );
  }
  if (def.versionPolicy?.requireVersion && !outcome.version) {
    return unavailableAgent(def, [buildVersionDiagnostic(def, outcome.version)], {
      path: launch.selectedPath,
      version: outcome.version,
    });
  }
  let runtimeCompanionVersion: string | undefined;
  if (def.compatibilityProbe) {
    try {
      if (def.compatibilityProbe.preflight && !def.compatibilityProbe.preflight(probeEnv)) {
        return unavailableAgent(def, [buildCompatibilityDiagnostic(def)], {
          path: launch.selectedPath,
          version: outcome.version,
        });
      }
      const { stdout } = await execAgentFile(
        launch.launchPath,
        def.compatibilityProbe.args,
        {
          env: probeEnv,
          timeout: def.compatibilityProbe.timeoutMs ?? 5000,
          maxBuffer: 1024 * 1024,
        },
      );
      runtimeCompanionVersion = def.compatibilityProbe.parse(String(stdout));
    } catch {
      return unavailableAgent(def, [buildCompatibilityDiagnostic(def)], {
        path: launch.selectedPath,
        version: outcome.version,
      });
    }
  }
  const versionDiagnostic =
    def.versionPolicy &&
    outcome.version &&
    !versionIsSupported(def.versionPolicy, outcome.version)
      ? buildVersionDiagnostic(def, outcome.version)
      : null;
  // The version probe must finish first (it gates availability), but the
  // three post-version probes are independent reads — run them concurrently
  // so a single agent's detection wall is max(help, models, auth) ≈ 5s rather
  // than the sum ≈ 15s. `--help` capabilities are cached on `agentCapabilities`
  // for buildArgs to consult.
  const [caps, modelResult, auth, amrOpenCodeVersion] = await Promise.all([
    probeCapabilities(def, launch.launchPath, probeEnv),
    fetchModels(def, launch.launchPath, probeEnv),
    probeAgentAuthStatus(def, launch.launchPath, probeEnv),
    probeAmrOpenCodeVersion(def, probeEnv),
  ]);
  const surfacedModelResult = withRememberedAmrModels(def, probeEnv, modelResult);
  if (caps) {
    agentCapabilities.set(def.id, caps);
  }
  const authDiagnostic = auth ? buildAuthDiagnostic(def, auth) : null;
  const runtimeVersions: DetectedRuntimeVersions = {
    invocable: true,
    ...(outcome.version ? { agentCliVersion: outcome.version } : {}),
    ...(amrOpenCodeVersion
      ? {
          runtimeCompanionName: 'opencode',
          runtimeCompanionVersion: amrOpenCodeVersion,
        }
      : {}),
    ...(runtimeCompanionVersion
      ? {
          runtimeCompanionName: def.id === 'deepseek-harness'
            ? '@open-design/dsh-runtime'
            : 'runtime-profile',
          runtimeCompanionVersion,
        }
      : {}),
  };
  if (Object.keys(runtimeVersions).length > 0) {
    detectedRuntimeVersions.set(def.id, runtimeVersions);
    detectedRuntimeVersionScopes.set(
      def.id,
      runtimeVersionProbeContext(def, configuredEnv)?.scope ?? '',
    );
  }
  return {
    ...stripFns(def),
    models: surfacedModelResult.models,
    modelsSource: surfacedModelResult.source,
    available: true,
    path: launch.selectedPath,
    version: outcome.version,
    ...(auth
      ? {
          authStatus: auth.status,
          ...(auth.message ? { authMessage: auth.message } : {}),
        }
      : {}),
    ...(versionDiagnostic || authDiagnostic
      ? {
          diagnostics: [versionDiagnostic, authDiagnostic].filter(
            (diagnostic): diagnostic is AgentDiagnostic => diagnostic !== null,
          ),
        }
      : {}),
    ...installMetaForAgent(def.id),
  };
}

function stripFns(
  def: RuntimeAgentDef,
): Omit<DetectedAgent, 'models' | 'modelsSource' | 'available' | 'path' | 'version'> {
  // Drop the buildArgs / listModels closures but keep declarative metadata
  // (reasoningOptions, streamFormat, name, bin, etc.). `models` is
  // populated separately by `fetchModels`, so we strip the static
  // `fallbackModels` slot here too. `helpArgs` / `capabilityFlags` /
  // `fallbackBins` / `maxPromptArgBytes` / `env` are probe-or-spawn-only
  // metadata and shouldn't bleed into the API response either.
  // Runtime timeout fields are spawn-time hints for chat-run watchdogs and
  // are not part of the public AgentInfo contract — strip them here so the
  // runtime registry stays the only consumer.
  const {
    buildArgs,
    listModels,
    fetchModels,
    fallbackModels,
    helpArgs,
    capabilityFlags,
    fallbackBins,
    versionProbeTimeoutMs,
    versionPolicy,
    compatibilityProbe,
    maxPromptArgBytes,
    env,
    inactivityTimeoutMs,
    firstOutputTimeoutMs,
    authProbe,
    ...rest
  } = def;
  return rest;
}

export async function detectAgent(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): Promise<DetectedAgent> {
  try {
    return await probe(def, configuredEnv);
  } catch {
    // Fault isolation (issue #2297): one adapter's probe blowing up
    // — e.g. a synchronous filesystem throw during PATH walking on a
    // packaged Windows daemon, or an async rejection from one of the
    // post-launch probes — must not collapse the whole agent picker.
    // Without this guard the bare `Promise.all` rejected and the
    // `/api/agents` catch arm returned `[]`, so the UI silently lost
    // every CLI option and fell back to BYOK / Cloud only.
    return unavailableAgent(def);
  }
}

function rememberDetectedLiveModels(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string>,
  agent: DetectedAgent,
): void {
  if (def.id === 'amr' && agent.models.length === 0) return;
  const scope = def.id === 'amr'
    ? amrModelScopeFromEnv({
        ...process.env,
        ...(def.env || {}),
        ...configuredEnv,
      })
    : null;
  rememberLiveModels(agent.id, agent.models, scope);
}

export async function detectAgents(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
) {
  const results = await Promise.all(
    AGENT_DEFS.map((def) => detectAgent(def, configuredEnvForAgent(configuredEnvByAgent, def.id))),
  );
  // Refresh the validation cache from whatever we just surfaced to the UI
  // so /api/chat can accept any model the user could have just picked,
  // including ones that only showed up after a CLI re-auth.
  for (const [index, agent] of results.entries()) {
    const def = AGENT_DEFS[index];
    if (!def) continue;
    rememberDetectedLiveModels(def, configuredEnvForAgent(configuredEnvByAgent, def.id), agent);
  }
  return results;
}

// Streaming variant: yields each agent the moment its probe settles, in
// completion order rather than registry order, so the UI can paint a card
// as soon as it resolves instead of waiting for the slowest CLI. The model
// validation cache is refreshed per-agent (same effect as the batch path,
// just incrementally). `detectAgents` keeps the array contract for callers
// that don't care about incremental delivery (cache warm, analytics, chat).
export async function* detectAgentsStream(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
): AsyncGenerator<DetectedAgent> {
  const tagged = AGENT_DEFS.map((def, index) =>
    detectAgent(def, configuredEnvForAgent(configuredEnvByAgent, def.id)).then((agent) => {
      rememberDetectedLiveModels(def, configuredEnvForAgent(configuredEnvByAgent, def.id), agent);
      return { index, agent };
    }),
  );
  const pending = new Set(tagged.keys());
  while (pending.size > 0) {
    const { index, agent } = await Promise.race(
      tagged.filter((_, i) => pending.has(i)),
    );
    pending.delete(index);
    yield agent;
  }
}
