import { publicFileResourceIdFor } from './public-file-resource-id.js';
import type { PreparePublicFileStop } from './public-file-publication-store.js';
import { readVelaControlApiContext } from '../integrations/vela.js';
import { fetchVelaWorkspaceDirectory } from './vela-workspace-context.js';
import { runPinnedVelaCommand } from './vela-pinned-command.js';

export interface VelaPublicFileStopOptions {
  readSession?: typeof readVelaControlApiContext;
  fetchDirectory?: typeof fetchVelaWorkspaceDirectory;
  /** Used only by the existing directory integration, never for stop. */
  fetch?: typeof fetch;
  configuredEnv?: Record<string, string> | (() => Record<string, string>);
  dataRoot?: string;
  runCommand?: typeof runPinnedVelaCommand;
}

/** Delete the published source resource for file/project deletion and its retries.
 * The server atomically revokes snapshots with source_deleted. Manual unshare
 * uses share stop separately; never substitute it for this operation.
 * Workspace roles cannot substitute for the persisted original member; the
 * remote resource authority still checks creator ownership at execution time.
 */
export function createVelaPublicFileStop(options: VelaPublicFileStopOptions = {}): PreparePublicFileStop {
  return async (key) => {
    const dataRoot = options.dataRoot;
    if (!dataRoot) return null;
    const configuredEnv = { ...(typeof options.configuredEnv === 'function'
      ? options.configuredEnv() : options.configuredEnv ?? {}) };
    const session = (options.readSession ?? readVelaControlApiContext)(process.env, configuredEnv);
    if (!session?.controlKey || !session.apiUrl) return null;
    const captured = Object.freeze({ ...session });
    const { resourceTeamId, ownerMemberId } = key;
    const resourceId = publicFileResourceIdFor(key);
    const directory = await (options.fetchDirectory ?? fetchVelaWorkspaceDirectory)({
      readSession: () => captured,
      fetch: options.fetch ?? fetch,
    });
    if (!directory.ok || !directory.items.some((item) =>
      item.workspaceId === resourceTeamId
      && item.workspaceMemberId === ownerMemberId
      && item.memberStatus === 'active'
      && item.lifecycleState !== 'deleted'
      && item.lifecycleState !== 'deleting'
    )) return null;
    return {
      resourceTeamId,
      ownerMemberId,
      async stop() {
        try {
          const stdout = await (options.runCommand ?? runPinnedVelaCommand)({
            args: ['resource', 'remove', resourceId, '--json'],
            session: captured, workspaceId: resourceTeamId, dataRoot, configuredEnv,
          });
          const receipt: unknown = JSON.parse(stdout);
          if (typeof receipt !== 'object' || receipt === null || !('ok' in receipt) || receipt.ok !== true
            || !('resource' in receipt) || typeof receipt.resource !== 'object' || receipt.resource === null) {
            throw new Error('invalid deletion receipt');
          }
          const resource = receipt.resource;
          if (!('id' in resource) || resource.id !== resourceId
            || !('teamId' in resource) || resource.teamId !== resourceTeamId
            || !('ownerMemberId' in resource) || resource.ownerMemberId !== ownerMemberId
            || !('deletedAt' in resource) || typeof resource.deletedAt !== 'string' || !resource.deletedAt.trim()) {
            throw new Error('unconfirmed source deletion');
          }
        } catch {
          throw new Error('PUBLIC_FILE_STOP_FAILED');
        }
      },
    };
  };
}
