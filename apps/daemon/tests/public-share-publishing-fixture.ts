import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createSharePublicationCompletion } from '../src/collab/share-publication-completion.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { resolvePublicShareViewerUrl } from '../src/collab/public-share-viewer-url.js';
import { publicFileResourceIdFor } from '../src/collab/public-file-resource-id.js';
import type { PublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import type { RegisterCollabSyncRoutesDeps } from '../src/routes/collab-sync.js';

export type FixtureShareCloud = Map<string, { projectId: string; sourceFilePath: string; slug: string; status: 'active' | 'stopped' }>;
export const fixtureShareSlug = 'a863b8d7-cc55-465a-a359-435bd3ef4919';
/** Real local publish pipeline. Only the CLI transport is synthetic. The Web
 * origin is explicit fixture configuration, never an ambient/prod fallback. */
export function createPublicSharePublishingFixture(
  db: Database.Database,
  store: PublicFilePublicationStore,
  resource: (args: string[], workspace: string) => Promise<string>,
  enqueue: Parameters<typeof createPublicFilePublicationRecorder>[2] = () => ({ enqueued: 0, skippedInbound: 0 }),
  options: { env?: NodeJS.ProcessEnv; configuredEnv?: Record<string, string>; pending?: boolean; failUpload?: boolean; failStop?: boolean; failResume?: boolean; failResumeAfterActivation?: boolean; failComplete?: boolean; beforeStop?: () => Promise<void>; commands?: string[][]; cloud?: FixtureShareCloud } = {},
): Pick<RegisterCollabSyncRoutesDeps, 'sharePublishing' | 'readProjectShareState'> {
  const outbox = createShareBindingOutbox(db);
  let ids = 0;
  const cloud: FixtureShareCloud = options.cloud ?? new Map();
  let lastReceipt: { slug: string; version: number; versionId: string; publishedAt: number; entryPath: string } | null = null;
  return { readProjectShareState: async scope => {
    const publications = [...cloud.values()].filter(item => item.projectId === scope.projectId).map(({ projectId: _projectId, ...item }) => item);
    return { projectId: scope.projectId, bindingExists: publications.length > 0, hasEverShared: publications.length > 0, publications };
  }, sharePublishing: {
    reservations: createShareAliasReservations(db, () => ids++ === 0 ? fixtureShareSlug : randomUUID()),
    outbox,
    complete: input => {
      if (options.failComplete) throw new Error('injected publication completion failure');
      return createSharePublicationCompletion(db, createPublicFilePublicationRecorder(db, store, enqueue), outbox, true)(input);
    },
    prepare: async (scope, slug) => ({
      url: resolvePublicShareViewerUrl(scope.projectId, slug, options.env ?? { OD_VELA_WEB_URL: 'https://viewer.example.test/cloud' }, options.configuredEnv),
      run: async args => {
        options.commands?.push([...args]);
        if (args[0] === 'resource') {
          if (options.failUpload) throw new Error('upload unavailable');
          return resource(args.slice(1), scope.resourceTeamId);
        }
        if (args[0] !== 'share') throw new Error('unexpected CLI namespace');
        if (args[1] === 'stop') {
          await options.beforeStop?.();
          if (options.failStop) throw new Error('remote stop unavailable');
          cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, slug, status: 'stopped' });
          return JSON.stringify({ status: 'stopped', projectId: scope.projectId, slug });
        }
        if (args[1] === 'resume-existing') {
          const prior = cloud.get(scope.projectId + ':' + scope.filePath);
          if (options.failResume || !prior || prior.status !== 'stopped' || prior.slug !== args[2] || !lastReceipt) {
            throw new Error('stopped original alias unavailable');
          }
          cloud.set(scope.projectId + ':' + scope.filePath, { ...prior, status: 'active' });
          if (options.failResumeAfterActivation) throw new Error('resume response lost after alias activation');
          return JSON.stringify({ status: 'active', projectId: scope.projectId,
            resourceId: publicFileResourceIdFor(scope), ...lastReceipt });
        }
        if (args[1] === 'bind' || args[1] === 'resume') {
          if (args[1] === 'resume' && options.failResume) throw new Error('resume unavailable');
          if (args[1] === 'bind' && cloud.get(scope.projectId + ':' + scope.filePath)?.status === 'stopped') throw new Error('SHARE_BINDING_STOPPED');
          cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, slug, status: 'active' });
          return JSON.stringify({ status: 'active', projectId: scope.projectId, slug,
            verifiedVersion: Number(args[args.indexOf('--version') + 1]), verifiedVersionId: args[args.indexOf('--version-id') + 1] });
        }
        if (args[1] !== 'publish') throw new Error('unexpected share operation');
        const versionId = args[args.indexOf('--version-id') + 1];
        const entryPath = args[args.indexOf('--entry-path') + 1];
        if (!versionId || !entryPath) throw new Error('missing publication identity');
        const receipt = { slug, versionId, version: 1, publishedAt: 1, entryPath };
        lastReceipt = receipt;
        const pending = options.pending || cloud.get(scope.projectId + ':' + scope.filePath)?.status === 'stopped';
        if (!pending) cloud.set(scope.projectId + ':' + scope.filePath, { projectId: scope.projectId, sourceFilePath: scope.filePath, slug, status: 'active' });
        return JSON.stringify({ status: pending ? 'binding_pending' : 'published', ...receipt, receipt, snapshot: { versionId }, ...(pending ? { binding: { code: 'SHARE_BINDING_UNAVAILABLE' } } : {}) });
      },
    }),
    retry: () => {},
  } };
}
