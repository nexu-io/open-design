import type { SharePublishResult } from '@open-design/contracts';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';
import type { createShareAliasReservations } from './share-alias-reservation.js';
import { runVelaCommand, velaWorkspaceCommandOptions } from '../integrations/vela-command.js';

export interface VelaSharePublishInput {
  /** Original local file, not the rewritten package entry. */
  filePath: string;
  workspaceId: string;
  projectId: string;
  resourceId: string;
  slug: string;
  sourceKey: string;
  entryPath: string;
  name: string;
  versionId: string;
}

export type ReservedVelaSharePublishInput = Omit<VelaSharePublishInput,
  'filePath' | 'workspaceId' | 'projectId' | 'slug' | 'sourceKey'> & { scope: PublicFilePublicationScope };

/** Reserve the original file's stable identity before any remote mutation.
 * A rejected call leaves the reservation intact for the next explicit attempt.
 * This does not retry, record a successful publication, or enqueue binding.
 */
export async function publishReservedVelaShareVersion(
  input: ReservedVelaSharePublishInput,
  reservations: ReturnType<typeof createShareAliasReservations>,
  run: typeof runVelaCommand = runVelaCommand,
): Promise<SharePublishResult> {
  const { scope, ...upload } = input;
  const identity = { ...scope };
  const target = reservations.reserve(identity);
  return publishVelaShareVersion({ ...upload, ...target,
    workspaceId: identity.resourceTeamId, projectId: identity.projectId, filePath: identity.filePath,
  }, run);
}

/** Go share publish atomically advances the alias and binds the project.
 * Accept only a committed receipt for this exact alias, entry and immutable upload.
 * A two-step CLI binary returning binding_pending cannot satisfy this contract.
 */
export async function publishVelaShareVersion(
  input: VelaSharePublishInput,
  run: typeof runVelaCommand = runVelaCommand,
): Promise<SharePublishResult> {
  try {
    const request = Object.freeze({ ...input });
    // Blank versionId makes the Go command fall back to a mutable ref; blank
    // workspace can similarly select ambient scope. Refuse before spawning.
    const required = [request.filePath, request.workspaceId, request.projectId, request.resourceId,
      request.slug, request.sourceKey, request.entryPath, request.name, request.versionId];
    if (required.some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error('missing publish identity');
    }
    const stdout = await run([
      'share', 'publish', request.resourceId,
      '--project-id', request.projectId,
      '--source-file-path', request.filePath,
      '--slug', request.slug,
      '--source-key', request.sourceKey,
      '--entry-path', request.entryPath,
      '--name', request.name,
      '--version-id', request.versionId,
      '--json',
    ], { ...velaWorkspaceCommandOptions(request.workspaceId), timeoutMs: 30_000 });
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid receipt');
    const record = value as Record<string, unknown>;
    const snapshot = record.snapshot;
    if (record.slug !== request.slug || record.entryPath !== request.entryPath
      || typeof record.version !== 'number' || !Number.isSafeInteger(record.version) || record.version < 1
      || typeof record.publishedAt !== 'number' || !Number.isSafeInteger(record.publishedAt) || record.publishedAt < 0
      || !snapshot || typeof snapshot !== 'object' || !('versionId' in snapshot)
      || snapshot.versionId !== request.versionId) throw new Error('mismatched receipt');
    const acknowledged = record.receipt;
    if (!acknowledged || typeof acknowledged !== 'object' || Array.isArray(acknowledged)) throw new Error('missing receipt');
    const confirmed = acknowledged as Record<string, unknown>;
    if (confirmed.slug !== request.slug || confirmed.versionId !== request.versionId
      || confirmed.entryPath !== request.entryPath || confirmed.version !== record.version
      || confirmed.publishedAt !== record.publishedAt) throw new Error('inconsistent receipt');
    const receipt = { filePath: request.filePath, slug: request.slug, version: record.version,
      versionId: request.versionId, publishedAt: record.publishedAt, entryPath: request.entryPath };
    if (record.status !== 'published') throw new Error('unconfirmed publish outcome');
    return { status: 'published', receipt };
  } catch {
    // Child diagnostics can include upstream bodies. No fallback to snapshots
    // or implicit retry: the remote pointer may already have advanced.
    throw new Error('PUBLIC_SHARE_PUBLISH_FAILED');
  }
}
