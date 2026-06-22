import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from '../agents.js';
import { agentCliEnvForAgent, type readAppConfig } from '../app-config.js';
import { readVelaCredentialRevision } from '../integrations/vela.js';

export interface ResolveAmrModelProbeDeps {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  readAppConfig: typeof readAppConfig;
}

export async function resolveAmrModelProbe({
  dataDir,
  env: baseEnv,
  readAppConfig,
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
  const credentialRevision = readVelaCredentialRevision(baseEnv, configuredEnv);
  const cacheKey = JSON.stringify({
    launchPath,
    home: env.HOME ?? env.USERPROFILE ?? '',
    openDesignAmrProfile: env.OPEN_DESIGN_AMR_PROFILE ?? '',
    velaProfile: env.VELA_PROFILE ?? '',
    velaLinkUrl: env.VELA_LINK_URL ?? '',
    velaRuntimeKey: env.VELA_RUNTIME_KEY ?? '',
    velaOpencodeBin: env.VELA_OPENCODE_BIN ?? '',
    credentialRevision,
  });
  return { launchPath, env, configuredEnv, cacheKey };
}
