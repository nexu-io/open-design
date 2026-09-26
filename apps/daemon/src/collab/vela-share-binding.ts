import type { SharePublishReceipt } from '@open-design/contracts';
import { confirmedReceipt } from './share-binding-outbox.js';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';
import { publicFileResourceIdFor } from './public-file-resource-id.js';
import { runVelaCommand, velaWorkspaceCommandOptions } from '../integrations/vela-command.js';

export interface VelaShareBindingInput {
  /** Original project-relative path persisted in the publication receipt. */
  sourceFilePath: string;
  workspaceId: string;
  projectId: string;
  resourceId: string;
  slug: string;
  version: number;
  versionId: string;
}

/** Complete only the captured publication's binding. The Go command uses a
 * dedicated guarded endpoint; never fall back to registration or publication.
 * Callers can supply a runner pinned to the original verified session.
 */
export async function bindVelaShareVersion(input: VelaShareBindingInput, run: typeof runVelaCommand = runVelaCommand): Promise<void> {
  return completeVelaShareVersion('bind', input, run);
}

/** Only an explicit owner publish request may resume a stopped generation.
 * Background binding retries must continue using bindVelaShareVersion. */
export async function resumeVelaShareVersion(input: VelaShareBindingInput, run: typeof runVelaCommand = runVelaCommand): Promise<void> {
  return completeVelaShareVersion('resume', input, run);
}

/** Reopen an Owner-stopped alias at the immutable version already held by Vela.
 * The authenticated command reads the exact published source/version under an
 * alias generation lock. Neither OD nor the caller may supply a guessed version.
 */
export async function resumeExistingVelaShare(
  scope: PublicFilePublicationScope,
  slug: string,
  run: typeof runVelaCommand = runVelaCommand,
): Promise<SharePublishReceipt> {
  try {
    const identity = Object.freeze({ ...scope });
    const resourceId = publicFileResourceIdFor(identity);
    if (!slug.trim() || !identity.projectId.trim() || !identity.filePath.trim() || !identity.resourceTeamId.trim()) {
      throw new Error('invalid stopped share identity');
    }
    const stdout = await run(['share', 'resume-existing', slug,
      '--project-id', identity.projectId, '--source-file-path', identity.filePath, '--json'],
    { ...velaWorkspaceCommandOptions(identity.resourceTeamId), timeoutMs: 30_000 });
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid resume receipt');
    const record = value as Record<string, unknown>;
    if (record.status !== 'active' || record.projectId !== identity.projectId || record.slug !== slug
      || record.resourceId !== resourceId || typeof record.versionId !== 'string'
      || typeof record.entryPath !== 'string' || typeof record.publishedAt !== 'number'
      || typeof record.version !== 'number') throw new Error('unverified resume receipt');
    const receipt = confirmedReceipt({ filePath: identity.filePath, slug,
      version: record.version, versionId: record.versionId,
      entryPath: record.entryPath, publishedAt: record.publishedAt });
    if (receipt.entryPath.includes('\\') || receipt.entryPath.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('unsafe original entry path');
    }
    return receipt;
  } catch {
    // Error payloads can include credentials; callers receive a bounded code only.
    throw new Error('PUBLIC_SHARE_RESUME_FAILED');
  }
}

async function completeVelaShareVersion(operation: 'bind' | 'resume', input: VelaShareBindingInput, run: typeof runVelaCommand): Promise<void> {
  try {
    const request = Object.freeze({ ...input });
    if ([request.sourceFilePath, request.workspaceId, request.projectId, request.resourceId, request.slug, request.versionId]
      .some(value => typeof value !== 'string' || !value.trim())
      || !Number.isSafeInteger(request.version) || request.version < 1) throw new Error('invalid binding identity');
    const stdout = await run(['share', operation, request.slug, '--project-id', request.projectId,
      '--source-file-path', request.sourceFilePath, '--resource-id', request.resourceId, '--version', String(request.version), '--version-id', request.versionId, '--json'],
    { ...velaWorkspaceCommandOptions(request.workspaceId), timeoutMs: 30_000 });
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid binding receipt');
    const record = value as Record<string, unknown>;
    if (record.status !== 'active' || record.projectId !== request.projectId || record.slug !== request.slug
      || record.verifiedVersion !== request.version || record.verifiedVersionId !== request.versionId) throw new Error('unverified binding');
  } catch {
    throw new Error('PUBLIC_SHARE_BINDING_FAILED');
  }
}
