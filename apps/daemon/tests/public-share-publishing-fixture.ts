import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createSharePublicationCompletion } from '../src/collab/share-publication-completion.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { resolvePublicShareLink } from '../src/collab/public-share-viewer-url.js';
import { parseProjectShareState } from '../src/collab/vela-project-share-state.js';
import { publicFileResourceIdFor } from '../src/collab/public-file-resource-id.js';
import type { PublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import type { RegisterCollabSyncRoutesDeps } from '../src/routes/collab-sync.js';

export type FixtureShareCloud = Map<string, { projectId: string; sourceFilePath: string; sourceFileId?: string; slug: string; status: 'active' | 'stopped' }>;
export const fixtureShareSlug = 'a863b8d7-cc55-465a-a359-435bd3ef4919';
/** What the synthetic `vela share … --json` adds to an ACTIVE binding: AMR's
 * `url`, or `link: {status:'unavailable', code}` (AA5 shapes). Stopped
 * bindings carry neither, exactly like the real CLI. */
export type FixtureAmrShareFields = (projectId: string, slug: string) => Record<string, unknown>;
/** Real local publish pipeline. Only the CLI transport is synthetic. The Web
 * origin is explicit fixture configuration, never an ambient/prod fallback. */
export function createPublicSharePublishingFixture(
  db: Database.Database,
  store: PublicFilePublicationStore,
  resource: (args: string[], workspace: string) => Promise<string>,
  enqueue: Parameters<typeof createPublicFilePublicationRecorder>[2] = () => ({ enqueued: 0, skippedInbound: 0 }),
  options: { denyAuthority?: boolean; teamProject?: (args: string[]) => Promise<string>; env?: NodeJS.ProcessEnv; configuredEnv?: Record<string, string>; amr?: FixtureAmrShareFields; failShareState?: () => boolean; pending?: boolean; failUpload?: boolean; failStop?: boolean; failResume?: boolean; failResumeAfterActivation?: boolean; failComplete?: boolean; beforeStop?: () => Promise<void>; commands?: string[][]; cloud?: FixtureShareCloud } = {},
): Pick<RegisterCollabSyncRoutesDeps, 'sharePublishing' | 'readProjectShareState' | 'resolvePublicShareLink' | 'resolveLocalPublicShareOwner'> {
  const outbox = createShareBindingOutbox(db);
  let ids = 0;
  const cloud: FixtureShareCloud = options.cloud ?? new Map();
  let lastReceipt: { slug: string; version: number; versionId: string; publishedAt: number; entryPath: string } | null = null;
  const viewerEnv = options.env ?? { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' };
  const amrFields = (projectId: string, slug: string) => options.amr?.(projectId, slug) ?? {};
  // Publish and read share one resolver, as in server.ts.
  return { resolveLocalPublicShareOwner: () => 'owner', resolvePublicShareLink: (projectId, slug, amr) => resolvePublicShareLink(projectId, slug, amr, viewerEnv, options.configuredEnv), readProjectShareState: async scope => {
    if (options.failShareState?.()) throw new Error('SHARE_STATE_UNAVAILABLE');
    const publications = [...cloud.values()].filter(item => item.projectId === scope.projectId).map(({ projectId, ...item }) =>
      ({ ...item, ...(item.status === 'active' ? amrFields(projectId, item.slug) : {}) }));
    // The raw `vela share project-status --json` body, through the real parser.
    return parseProjectShareState(JSON.stringify({ projectId: scope.projectId, bindingExists: publications.length > 0, publications }), scope.projectId);
  }, sharePublishing: {
    ensureProject: async (scope) => ({projectId:scope.projectId,ownerMemberId:scope.ownerMemberId,sharedAt:new Date(1).toISOString()}),
    // Synthetic creator artifact pointer for this transport fixture only;
    // production resolves workspace_artifacts, never an alias/path election.
    sourceFileId: scope => {
      const stored = db.prepare(`SELECT source_file_id AS id FROM share_alias_reservations
        WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ? AND source_file_id <> ''`)
        .get(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath) as { id: string } | undefined;
      if (stored) return stored.id;
      const hasComments = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'preview_comments'").get();
      const local = hasComments ? db.prepare('SELECT source_file_id AS id FROM preview_comments WHERE project_id = ? AND file_path = ? AND source_file_id IS NOT NULL LIMIT 1')
        .get(scope.projectId, scope.filePath) as { id: string } | undefined : undefined;
      return local?.id ?? randomUUID();
    },
    reservations: createShareAliasReservations(db, () => ids++ === 0 ? fixtureShareSlug : randomUUID()),
    outbox,
    complete: input => {
      if (options.failComplete) throw new Error('injected publication completion failure');
      return createSharePublicationCompletion(db, createPublicFilePublicationRecorder(db, store, enqueue), outbox, true)(input);
    },
    prepare: async (scope, slug) => ({
      run: async args => {
        if (options.denyAuthority) throw Object.assign(new Error('API denied'),{stderr:'{"error":"denied","status":403,"errorCode":"forbidden"}'});
        const targetSlug = args[0] === 'share' && args[1] === 'publish' ? args[args.indexOf('--slug')+1]! : args[0] === 'share' ? args[2]! : slug;
        options.commands?.push([...args]);
        if (args[0] === 'team-projects') {
          if (options.teamProject) return options.teamProject(args);
          if (args[1] !== 'register-resource' || args[2] !== scope.projectId
            || args[3] !== publicFileResourceIdFor(scope)) throw new Error('unexpected project association');
          return JSON.stringify({ ok: true });
        }
        if (args[0] === 'resource') {
          if (options.failUpload) throw new Error('upload unavailable');
          return resource(args.slice(1), scope.resourceTeamId);
        }
        if (args[0] !== 'share') throw new Error('unexpected CLI namespace');
        if (args[1] === 'stop') {
          await options.beforeStop?.();
          if (options.failStop) throw new Error('remote stop unavailable');
          cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, ...((scope.sourceFileId ?? cloud.get(scope.projectId + ':' + scope.filePath)?.sourceFileId) ? { sourceFileId: scope.sourceFileId ?? cloud.get(scope.projectId + ':' + scope.filePath)?.sourceFileId as string } : {}), slug: targetSlug, status: 'stopped' });
          return JSON.stringify({ status: 'stopped', projectId: scope.projectId, slug: targetSlug });
        }
        if (args[1] === 'resume-existing') {
          const prior = cloud.get(scope.projectId + ':' + scope.filePath);
          if (options.failResume || !prior || prior.status !== 'stopped' || prior.slug !== args[2] || !lastReceipt) {
            throw new Error('stopped original alias unavailable');
          }
          cloud.set(scope.projectId + ':' + scope.filePath, { ...prior, status: 'active' });
          if (options.failResumeAfterActivation) throw new Error('resume response lost after alias activation');
          return JSON.stringify({ status: 'active', projectId: scope.projectId,
            resourceId: publicFileResourceIdFor(scope), ...lastReceipt, ...amrFields(scope.projectId, lastReceipt.slug) });
        }
        if (args[1] === 'bind' || args[1] === 'resume') {
          if (args[1] === 'resume' && options.failResume) throw new Error('resume unavailable');
          if (args[1] === 'bind' && cloud.get(scope.projectId + ':' + scope.filePath)?.status === 'stopped') throw new Error('SHARE_BINDING_STOPPED');
          cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, ...(scope.sourceFileId ? { sourceFileId: scope.sourceFileId } : {}), slug: targetSlug, status: 'active' });
          return JSON.stringify({ status: 'active', projectId: scope.projectId, slug: targetSlug, ...amrFields(scope.projectId, targetSlug),
            verifiedVersion: Number(args[args.indexOf('--version') + 1]), verifiedVersionId: args[args.indexOf('--version-id') + 1] });
        }
        if (args[1] !== 'publish') throw new Error('unexpected share operation');
        const versionId = args[args.indexOf('--version-id') + 1];
        const entryPath = args[args.indexOf('--entry-path') + 1];
        if (!versionId || !entryPath) throw new Error('missing publication identity');
        const receipt = { slug: targetSlug, versionId, version: 1, publishedAt: 1, entryPath };
        lastReceipt = receipt;
        const pending = options.pending || cloud.get(scope.projectId + ':' + scope.filePath)?.status === 'stopped';
        if (!pending) cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, ...(scope.sourceFileId ? { sourceFileId: scope.sourceFileId } : {}), slug: targetSlug, status: 'active' });
        return JSON.stringify({ status: pending ? 'binding_pending' : 'published', ...receipt, receipt, snapshot: { versionId },
          ...(pending ? { binding: { code: 'SHARE_BINDING_UNAVAILABLE' } } : amrFields(scope.projectId, targetSlug)) });
      },
    }),
    retry: () => {},
  } };
}
