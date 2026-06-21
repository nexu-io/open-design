import { agentBinEnvKey, agentSearchDirs } from './executables.js';
import type { AgentLaunchResolution } from './launch.js';
import type { AgentAuthProbeResult } from './auth.js';
import type { AgentDiagnostic, RuntimeAgentDef } from './types.js';
import type { AgentFixIntent } from '@open-design/contracts';

// Cap on how many searched dirs we attach to a `not-on-path` diagnostic.
// The resolver walks PATH + the user-toolchain whitelist, which can run to
// dozens of entries; the UI only needs enough to make "we looked here" land
// without ballooning the /api/agents payload.
const MAX_SEARCHED_DIRS = 24;

function setEnvIntent(agentId: string): AgentFixIntent[] {
  const envKey = agentBinEnvKey(agentId);
  return envKey ? [{ kind: 'setEnv', envKey }] : [];
}

// The agent is not resolvable at all: either nothing matched on PATH, or a
// user-supplied `*_BIN` override points at a missing/invalid file. The two
// cases get different copy + fix affordances because the remedy differs
// (install / point us at the binary vs. fix or clear the override).
export function buildExecutableDiagnostic(
  def: Pick<RuntimeAgentDef, 'id' | 'name' | 'bin'>,
  configuredEnv: Record<string, string> = {},
): AgentDiagnostic {
  const envKey = agentBinEnvKey(def.id);
  const overrideRaw = envKey ? configuredEnv?.[envKey]?.trim() : '';
  if (envKey && overrideRaw) {
    return {
      reason: 'configured-bin-invalid',
      severity: 'error',
      message: `${def.name}'s configured binary (${envKey}) was not found or is not executable.`,
      detail: overrideRaw,
      fixActions: [
        { kind: 'setEnv', envKey },
        { kind: 'clearEnv', envKey },
        { kind: 'rescan' },
      ],
    };
  }
  return {
    reason: 'not-on-path',
    severity: 'error',
    message: `${def.name} (\`${def.bin}\`) was not found on your PATH.`,
    searchedDirs: agentSearchDirs().slice(0, MAX_SEARCHED_DIRS),
    fixActions: [
      { kind: 'openInstall' },
      ...setEnvIntent(def.id),
      { kind: 'rescan' },
    ],
  };
}

export type NotInvocableCause = 'not-executable' | 'missing-target';

// A file matched but `--version` could not spawn it. Permission failures are
// real binaries that need their executable bit restored; missing-target
// failures are usually leftover npm/nvm/mise shims whose underlying target was
// uninstalled.
export function buildNotInvocableDiagnostic(
  def: Pick<RuntimeAgentDef, 'id' | 'name'>,
  launch: Pick<AgentLaunchResolution, 'selectedPath' | 'launchPath'>,
  cause: NotInvocableCause,
): AgentDiagnostic {
  if (cause === 'not-executable') {
    return {
      reason: 'not-executable',
      severity: 'error',
      message: `${def.name} was found but is not executable. Restore its execute permission or choose a different binary, then rescan.`,
      ...(launch.launchPath ? { detail: launch.launchPath } : {}),
      fixActions: [...setEnvIntent(def.id), { kind: 'rescan' }],
    };
  }
  return {
    reason: 'shim-broken',
    severity: 'error',
    message: `${def.name} was found but could not be launched — its wrapper or shim points at a missing target.`,
    ...(launch.launchPath ? { detail: launch.launchPath } : {}),
    fixActions: [...setEnvIntent(def.id), { kind: 'openDocs' }, { kind: 'rescan' }],
  };
}

// The agent is installed and invocable but its auth probe reported a
// missing / unverifiable credential. Detection only reaches this helper for
// adapters that declare a cheap, side-effect-free authProbe; until an adapter
// also declares a daemon-safe OAuth producer, diagnostics point at docs.
export function buildAuthDiagnostic(
  def: Pick<RuntimeAgentDef, 'id' | 'name'>,
  auth: AgentAuthProbeResult,
): AgentDiagnostic | null {
  if (auth.status === 'ok') return null;
  const signInIntent: AgentFixIntent = { kind: 'openDocs' };
  if (auth.status === 'missing') {
    return {
      reason: 'auth-missing',
      severity: 'error',
      message: auth.message || `${def.name} is installed but not authenticated.`,
      ...(auth.stderrTail ? { detail: auth.stderrTail } : {}),
      fixActions: [signInIntent, { kind: 'rescan' }],
    };
  }
  return {
    reason: 'auth-unknown',
    severity: 'warning',
    message:
      auth.message || `${def.name} authentication status could not be verified.`,
    ...(auth.stderrTail ? { detail: auth.stderrTail } : {}),
    fixActions: [signInIntent, { kind: 'rescan' }],
  };
}
