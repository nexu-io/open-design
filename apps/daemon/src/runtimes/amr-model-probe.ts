import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from '../agents.js';
import { agentCliEnvForAgent, type readAppConfig } from '../app-config.js';
import { readVelaCredentialRevision } from '../integrations/vela.js';
import type { VelaCredentialRevision } from '../integrations/vela.js';

export interface ResolveAmrModelProbeDeps {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  readAppConfig: typeof readAppConfig;
  /**
   * UI-selected / run-pinned Workspace id for Path A discovery
   * (`vela model list`). Injected as `VELA_WORKSPACE_ID` so Link evaluates
   * Team entitlements instead of the personal free allowlist. Omitted only
   * for legacy unscoped hosts.
   */
  workspaceId?: string | null;
}

export interface BuildAmrModelCacheKeyInput {
  launchPath: string;
  env: NodeJS.ProcessEnv;
  credentialRevision: VelaCredentialRevision;
}

/**
 * Apply Path A workspace scope for `vela model list`.
 *
 * Precedence mirrors Vela CLI #1372: an explicit host workspace becomes
 * `VELA_WORKSPACE_ID`. Empty/blank values leave the env unset so Link keeps
 * its personal-default behavior for legacy callers.
 */
export function withVelaModelListWorkspaceScope(
  env: NodeJS.ProcessEnv,
  workspaceId?: string | null,
): NodeJS.ProcessEnv {
  const scopedWorkspaceId =
    typeof workspaceId === 'string' ? workspaceId.trim() : '';
  if (!scopedWorkspaceId) return env;
  return {
    ...env,
    VELA_WORKSPACE_ID: scopedWorkspaceId,
  };
}

export function buildAmrModelCacheKey({
  launchPath,
  env,
  credentialRevision,
}: BuildAmrModelCacheKeyInput): string {
  return JSON.stringify({
    launchPath,
    home: env.HOME ?? env.USERPROFILE ?? '',
    openDesignAmrProfile: env.OPEN_DESIGN_AMR_PROFILE ?? '',
    velaProfile: env.VELA_PROFILE ?? '',
    velaLinkUrl: env.VELA_LINK_URL ?? '',
    velaRuntimeKey: env.VELA_RUNTIME_KEY ?? '',
    velaOpencodeBin: env.VELA_OPENCODE_BIN ?? '',
    // Team entitlements are workspace-scoped. Without this key, a personal
    // free catalog can stick after the UI switches to a paid Team workspace.
    velaWorkspaceId: env.VELA_WORKSPACE_ID ?? '',
    credentialRevision,
  });
}

/** Failed probes may reuse models only from the same profile and workspace. */
export function buildAmrRememberedLiveModelScope(input: {
  profile: string;
  workspaceId?: string | null;
}): string {
  return JSON.stringify([input.profile, input.workspaceId?.trim() ?? '']);
}

export async function resolveAmrModelProbe({
  dataDir,
  env: baseEnv,
  readAppConfig,
  workspaceId,
}: ResolveAmrModelProbeDeps) {
  const appConfig = await readAppConfig(dataDir);
  const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
  const def = getAgentDef('amr');
  if (!def) throw new Error('AMR runtime definition is missing');
  const agentLaunch = resolveAgentLaunch(def, configuredEnv);
  const launchPath = agentLaunch.launchPath ?? agentLaunch.selectedPath;
  if (!launchPath) throw new Error('AMR vela binary could not be resolved');
  const env = withVelaModelListWorkspaceScope(
    applyAgentLaunchEnv(
      spawnEnvForAgent(
        def.id,
        {
          ...baseEnv,
          ...(def.env || {}),
        },
        configuredEnv,
        undefined,
      ),
      agentLaunch,
    ),
    workspaceId,
  );
  const credentialRevision = readVelaCredentialRevision(baseEnv, configuredEnv);
  const cacheKey = buildAmrModelCacheKey({
    launchPath,
    env,
    credentialRevision,
  });
  return { launchPath, env, configuredEnv, cacheKey };
}
