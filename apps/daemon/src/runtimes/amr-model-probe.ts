import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from '../agents.js';
import { agentCliEnvForAgent, type readAppConfig } from '../app-config.js';
import { readVelaCredentialRevision, resolveAmrProfile } from '../integrations/vela.js';
import type { VelaCredentialRevision } from '../integrations/vela.js';

export interface ResolveAmrModelProbeDeps {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  readAppConfig: typeof readAppConfig;
  workspaceId?: string | null;
}

export interface BuildAmrModelCacheKeyInput {
  launchPath: string;
  env: NodeJS.ProcessEnv;
  credentialRevision: VelaCredentialRevision;
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
    amrHome: env.AMR_HOME ?? '',
    velaApiUrl: env.VELA_API_URL ?? '',
    workspaceId: env.VELA_WORKSPACE_ID?.trim() ?? '',
    velaLinkUrl: env.VELA_LINK_URL ?? '',
    velaRuntimeKey: env.VELA_RUNTIME_KEY ?? '',
    velaOpencodeBin: env.VELA_OPENCODE_BIN ?? '',
    credentialRevision,
  });
}

/** Partition remembered catalogs by caller credentials and exact billing space. */
export function amrModelScope(env: NodeJS.ProcessEnv, credentialRevision: VelaCredentialRevision): string {
  return JSON.stringify({
    profile: resolveAmrProfile(env),
    workspaceId: env.VELA_WORKSPACE_ID?.trim() ?? '',
    credentialRevision,
  });
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
  const env = applyAgentLaunchEnv(
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
  );
  // A proven unbound project is account-scoped, never the ambient CLI wallet.
  if (workspaceId !== undefined) env.VELA_WORKSPACE_ID = workspaceId ?? '';
  const credentialRevision = readVelaCredentialRevision(baseEnv, configuredEnv);
  const cacheKey = buildAmrModelCacheKey({
    launchPath,
    env,
    credentialRevision,
  });
  return { launchPath, env, configuredEnv, cacheKey, modelScope: amrModelScope(env, credentialRevision) };
}
