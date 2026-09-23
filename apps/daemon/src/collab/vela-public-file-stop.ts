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

/** Bind directory verification and the Go share stop command to one session.
 * Workspace roles cannot substitute for the persisted original member; the
 * remote binding authority still checks project ownership at execution time.
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
    const { resourceTeamId, ownerMemberId, projectId, slug } = key;
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
            args: ['share', 'stop', slug, '--project-id', projectId, '--json'],
            session: captured, workspaceId: resourceTeamId, dataRoot, configuredEnv,
          });
          const receipt: unknown = JSON.parse(stdout);
          if (typeof receipt !== 'object' || receipt === null
            || !('status' in receipt) || receipt.status !== 'stopped'
            || !('slug' in receipt) || receipt.slug !== slug
            || !('projectId' in receipt) || receipt.projectId !== projectId) {
            throw new Error('invalid stop receipt');
          }
        } catch {
          throw new Error('PUBLIC_FILE_STOP_FAILED');
        }
      },
    };
  };
}
