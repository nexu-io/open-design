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

export interface BuildAmrRememberedLiveModelScopeInput {
  /** Resolved Vela / OPEN_DESIGN_AMR profile (e.g. prod, local, test). */
  profile: string;
  /**
   * Run-pinned or UI-selected workspace id. Empty/null means the personal
   * (unscoped) catalog partition — never shared with Team workspaces.
   */
  workspaceId?: string | null;
  /**
   * Optional credential identity so account switches under the same profile
   * do not reuse another user's remembered catalog. Prefer
   * `userId` (file auth) or `credentialFingerprint` (env auth).
   */
  credentialIdentity?: string | null;
}

/**
 * Scope key for `rememberLiveModels` / `getRememberedLiveModels` on AMR runs.
 *
 * Path A probes are workspace-scoped; the remembered-catalog fallback used
 * when those probes fail must partition the same way. Profile-only keys let a
 * workspace-A run rewrite an omitted/default model request to workspace B's
 * last default under the same Vela profile.
 */
export function buildAmrRememberedLiveModelScope(
  input: BuildAmrRememberedLiveModelScopeInput,
): string {
  const profile = (typeof input.profile === 'string' ? input.profile.trim() : '') || 'prod';
  const workspaceId =
    typeof input.workspaceId === 'string' ? input.workspaceId.trim() : '';
  const credentialIdentity =
    typeof input.credentialIdentity === 'string'
      ? input.credentialIdentity.trim()
      : '';
  // Always emit the workspace segment (even when empty) so personal and Team
  // partitions never collide, and so profile-only legacy keys cannot be
  // mistaken for an intentional unscoped remember from this helper.
  const parts = [profile, `ws=${workspaceId}`];
  if (credentialIdentity) parts.push(`cred=${credentialIdentity}`);
  return parts.join('|');
}

/**
 * Compact non-secret identity for remembered-model partitioning.
 * Empty when no account is attached yet (unsigned-in personal).
 *
 * File-backed auth may omit `user.id` (config `user` is optional). Without a
 * stable user/env identity, include `configMtimeMs` so a rewritten
 * `~/.amr/config.json` under the same profile/workspace cannot reuse the
 * previous account's remembered catalog after a failed scoped probe.
 */
export function amrCredentialIdentityFromRevision(
  revision: Pick<
    VelaCredentialRevision,
    'userId' | 'credentialFingerprint' | 'authSource' | 'configMtimeMs'
  > | null | undefined,
): string {
  if (!revision) return '';
  const userId = typeof revision.userId === 'string' ? revision.userId.trim() : '';
  if (userId) return `user:${userId}`;
  const fingerprint =
    typeof revision.credentialFingerprint === 'string'
      ? revision.credentialFingerprint.trim()
      : '';
  if (fingerprint) return `env:${fingerprint}`;
  if (revision.authSource === 'none') return '';
  if (revision.authSource === 'file') {
    const mtime =
      typeof revision.configMtimeMs === 'number' &&
      Number.isFinite(revision.configMtimeMs)
        ? String(revision.configMtimeMs)
        : '';
    return mtime ? `auth:file:mtime=${mtime}` : 'auth:file';
  }
  return `auth:${revision.authSource}`;
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
