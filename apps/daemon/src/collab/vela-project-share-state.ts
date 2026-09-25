import type { ProjectShareHistoryResponse } from '@open-design/contracts';
import { hasEverShared } from '@open-design/contracts';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';
import { readVelaControlApiContext } from '../integrations/vela.js';
import { fetchVelaWorkspaceDirectory } from './vela-workspace-context.js';
import { runPinnedVelaCommand } from './vela-pinned-command.js';

export type ReadProjectShareState = (scope: Omit<PublicFilePublicationScope, 'filePath'>) => Promise<ProjectShareHistoryResponse>;
export function createVelaProjectShareState(options: {
  dataRoot: string;
  configuredEnv?: Record<string, string> | (() => Record<string, string>);
  readSession?: typeof readVelaControlApiContext;
  fetchDirectory?: typeof fetchVelaWorkspaceDirectory;
  runCommand?: typeof runPinnedVelaCommand;
  /** Persisted local authorship, never inferred from the current reader. */
  resolveLocalProjectOwner?: (projectId: string, workspaceId: string) => string | null;
  /** K3 status GET must never upsert a missing personal catalog row. */
  registerPersonalProject?: boolean;
}): ReadProjectShareState {
  return async scope => {
    const identity = Object.freeze({ ...scope });
    const configuredEnv = { ...(typeof options.configuredEnv === 'function' ? options.configuredEnv() : options.configuredEnv ?? {}) };
    const current = (options.readSession ?? readVelaControlApiContext)(process.env, configuredEnv);
    if (!current?.controlKey || !current.apiUrl || !options.dataRoot) throw new Error('SHARE_STATE_UNAVAILABLE');
    const session = Object.freeze({ ...current });
    const directory = await (options.fetchDirectory ?? fetchVelaWorkspaceDirectory)({ readSession: () => session });
    if (!directory.ok || !directory.items.some(item => item.workspaceId === identity.resourceTeamId
      && item.workspaceMemberId === identity.ownerMemberId && item.memberStatus === 'active'
      && item.lifecycleState === 'active')) throw new Error('SHARE_STATE_UNAVAILABLE');
    // A personal project can have no cloud catalog row until its first share.
    // Register only proven local authorship, not content or sharing intent.
    // Omitted sync/version/metadata fields preserve any existing cloud state.
    const personalWorkspace = directory.items.find(item => item.workspaceId === identity.resourceTeamId
      && item.workspaceMemberId === identity.ownerMemberId && item.workspaceType === 'personal');
    if (options.registerPersonalProject !== false && personalWorkspace
      && options.resolveLocalProjectOwner?.(identity.projectId, identity.resourceTeamId) === identity.ownerMemberId) {
      await (options.runCommand ?? runPinnedVelaCommand)({
        args: ['team-projects', 'upsert', identity.projectId, '--resource-id', projectResourceIdFor(identity.projectId,
          { teamId: identity.resourceTeamId, memberId: identity.ownerMemberId, role: personalWorkspace.role, lifecycleState: personalWorkspace.lifecycleState })],
        session, workspaceId: identity.resourceTeamId, dataRoot: options.dataRoot, configuredEnv,
      });
    }
    const output = await (options.runCommand ?? runPinnedVelaCommand)({
      args: ['share', 'project-status', identity.projectId, '--json'], session,
      workspaceId: identity.resourceTeamId, dataRoot: options.dataRoot, configuredEnv,
    });
    return parseProjectShareState(output, identity.projectId);
  };
}

/** Missing/unauthorized/error replies never become an empty history. */
export function parseProjectShareState(output: string, projectId: string): ProjectShareHistoryResponse {
  let value: unknown;
  try { value = JSON.parse(output); }
  catch { throw new Error('SHARE_STATE_INVALID'); }
  if (!value || typeof value !== 'object' || !('projectId' in value) || value.projectId !== projectId
    || !('bindingExists' in value) || typeof value.bindingExists !== 'boolean'
    || !('publications' in value) || !Array.isArray(value.publications)) throw new Error('SHARE_STATE_INVALID');
  const seen = new Set<string>();
  const publications = value.publications.map((item: unknown): ProjectShareHistoryResponse['publications'][number] => {
    if (!item || typeof item !== 'object' || !('sourceFilePath' in item) || typeof item.sourceFilePath !== 'string'
      || item.sourceFilePath.includes('\\') || item.sourceFilePath.includes('\0')
      || item.sourceFilePath.split('/').some(part => !part || part === '.' || part === '..')
      || !('slug' in item) || typeof item.slug !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.slug)
      || !('status' in item) || (item.status !== 'active' && item.status !== 'stopped')
      || seen.has(item.sourceFilePath)) throw new Error('SHARE_STATE_INVALID');
    seen.add(item.sourceFilePath);
    return { sourceFilePath: item.sourceFilePath, slug: item.slug, status: item.status };
  });
  if (value.bindingExists !== (publications.length > 0)) throw new Error('SHARE_STATE_INVALID');
  return { projectId, bindingExists: value.bindingExists, hasEverShared: hasEverShared({ bindingExists: value.bindingExists }), publications };
}
