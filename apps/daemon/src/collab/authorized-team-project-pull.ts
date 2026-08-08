import { lstat, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  runVelaCommand,
  velaWorkspaceCommandOptions,
} from '../integrations/vela-command.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import type { TeamMirrorPullScope } from '../routes/collab-sync.js';

const AUTHORIZED_PULL_TIMEOUT_MS = 30_000;
const RECEIPT_MAX_AGE_MS = 2_000;
const MANIFEST_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

class AuthorizedTeamProjectPullReceiptExpiredError extends Error {
  readonly code = 'AUTHORIZED_TEAM_PROJECT_PULL_RECEIPT_EXPIRED';
}

export function isAuthorizedTeamProjectPullReceiptExpired(
  error: unknown,
): boolean {
  return error instanceof AuthorizedTeamProjectPullReceiptExpiredError;
}

export interface AuthorizedTeamProjectPullReceipt {
  schemaVersion: 1;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
  projectId: string;
  resourceId: string;
  ref: 'published';
  version: number;
  versionId: string;
  manifestDigest: string;
  lifecycleState: 'active';
  authorizedAt: string;
  expiresAt: string;
}

export interface AuthorizedTeamProjectPullRunOptions {
  signal?: AbortSignal;
  timeoutMs: number;
}

export type RunAuthorizedTeamProjectPull = (
  args: string[],
  workspaceId: string,
  options: AuthorizedTeamProjectPullRunOptions,
) => Promise<string>;

export interface StageAuthorizedTeamProjectPullInput {
  projectId: string;
  liveDir: string;
  scope: TeamMirrorPullScope;
  expectedVersion: number;
  signal?: AbortSignal;
  run?: RunAuthorizedTeamProjectPull;
  now?: () => number;
  /** Test-only race seam. Production callers leave this unset. */
  cleanupHooks?: {
    beforeQuarantineRename?: (stageDir: string) => void | Promise<void>;
  };
}

export interface AuthorizedTeamProjectStageIdentity {
  dev: string;
  ino: string;
}

export interface StagedAuthorizedTeamProjectPull {
  stageDir: string;
  identity: AuthorizedTeamProjectStageIdentity;
  receipt: AuthorizedTeamProjectPullReceipt;
  cleanup(): Promise<void>;
}

interface ReceiptValidationInput {
  projectId: string;
  scope: TeamMirrorPullScope;
  expectedVersion: number;
  nowMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`authorized pull receipt has invalid ${key}`);
  }
  return value;
}

function parseReceipt(stdout: string): AuthorizedTeamProjectPullReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error('authorized pull response is not valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('authorized pull response must be an object');
  }
  const version = parsed.version;
  if (!Number.isSafeInteger(version) || Number(version) < 0) {
    throw new Error('authorized pull receipt has invalid version');
  }
  return {
    schemaVersion: parsed.schemaVersion as 1,
    workspaceId: requiredString(parsed, 'workspaceId'),
    resourceTeamId: requiredString(parsed, 'resourceTeamId'),
    viewerMemberId: requiredString(parsed, 'viewerMemberId'),
    ownerMemberId: requiredString(parsed, 'ownerMemberId'),
    projectId: requiredString(parsed, 'projectId'),
    resourceId: requiredString(parsed, 'resourceId'),
    ref: parsed.ref as 'published',
    version: Number(version),
    versionId: requiredString(parsed, 'versionId'),
    manifestDigest: requiredString(parsed, 'manifestDigest'),
    lifecycleState: parsed.lifecycleState as 'active',
    authorizedAt: requiredString(parsed, 'authorizedAt'),
    expiresAt: requiredString(parsed, 'expiresAt'),
  };
}

export function validateAuthorizedTeamProjectPullReceipt(
  receipt: AuthorizedTeamProjectPullReceipt,
  input: ReceiptValidationInput,
): void {
  const expectedResourceId = projectResourceIdFor(input.projectId, {
    teamId: input.scope.resourceTeamId,
    memberId: input.scope.ownerMemberId,
    role: 'member',
    lifecycleState: 'active',
    workspaceType: 'team',
  });
  if (receipt.schemaVersion !== 1) {
    throw new Error('authorized pull receipt has unsupported schemaVersion');
  }
  if (
    receipt.workspaceId !== input.scope.workspaceId ||
    receipt.resourceTeamId !== input.scope.resourceTeamId ||
    receipt.viewerMemberId !== input.scope.viewerMemberId ||
    receipt.ownerMemberId !== input.scope.ownerMemberId ||
    receipt.projectId !== input.projectId ||
    receipt.resourceId !== expectedResourceId ||
    receipt.ref !== 'published' ||
    receipt.version !== input.expectedVersion
  ) {
    throw new Error('authorized pull receipt binding does not match the pull');
  }
  if (
    !receipt.versionId.trim() ||
    !MANIFEST_DIGEST_PATTERN.test(receipt.manifestDigest) ||
    receipt.lifecycleState !== 'active' ||
    receipt.ownerMemberId === receipt.viewerMemberId
  ) {
    throw new Error('authorized pull receipt binding is incomplete');
  }
  const authorizedAt = Date.parse(receipt.authorizedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  const nowMs = input.nowMs ?? Date.now();
  if (
    !Number.isFinite(authorizedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= authorizedAt ||
    expiresAt - authorizedAt > RECEIPT_MAX_AGE_MS
  ) {
    throw new Error('authorized pull receipt is stale');
  }
  if (nowMs >= expiresAt) {
    throw new AuthorizedTeamProjectPullReceiptExpiredError(
      'authorized pull receipt is stale',
    );
  }
}

export function isAuthorizedTeamProjectPullUnavailable(
  error: unknown,
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unknown command ["']?pull["']?.*team-projects/iu.test(message) ||
    /unknown command ["']?team-projects["']?/iu.test(message) ||
    /unknown flag:\s*--(?:expected-version|live-dir|ref|json)\b/iu.test(message);
}

/** The packaged CLI predates `team-projects pull --authorize-only` (or lacks
 *  `team-projects pull` entirely). Callers must fail OPEN — pull as before —
 *  never block materialization on a missing probe. */
export function isAuthorizedTeamProjectPullInspectUnavailable(
  error: unknown,
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unknown flag:\s*--authorize-only\b/iu.test(message) ||
    isAuthorizedTeamProjectPullUnavailable(error);
}

/** Outcome of the authorize-only size probe. 'uncounted' means the CLI ran
 *  but could not report a count (old server output shape, malformed or
 *  mismatched JSON); 'unavailable' means the CLI lacks the probe itself. Both
 *  must degrade to the ordinary pull. */
export type AuthorizedTeamProjectPullInspection =
  | { kind: 'counted'; entryCount: number }
  | { kind: 'uncounted' }
  | { kind: 'unavailable' };

export interface InspectAuthorizedTeamProjectPullInput {
  projectId: string;
  scope: TeamMirrorPullScope;
  expectedVersion: number;
  signal?: AbortSignal;
  run?: RunAuthorizedTeamProjectPull;
  /** Clock override for receipt freshness, as the real pull accepts. */
  nowMs?: number;
}

/**
 * Authorize-only manifest probe: `vela team-projects pull <projectId>
 * --authorize-only` authorizes the exact published version and reports its
 * `manifestEntryCount` WITHOUT downloading a single blob (authorization
 * happens before any content transfer on the Vela side). Used by the
 * background pull size guard; the real pull re-runs full authorization and
 * receipt validation, so this probe performs only sanity binding checks and
 * degrades every anomaly to 'uncounted' (fail open).
 *
 * Throws only on transport-level failures (timeout, abort, non-capability CLI
 * errors) so the caller can fail open without caching a transient answer.
 */
export async function inspectAuthorizedTeamProjectPull(
  input: InspectAuthorizedTeamProjectPullInput,
): Promise<AuthorizedTeamProjectPullInspection> {
  if (
    !input.projectId.trim() ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    return { kind: 'uncounted' };
  }
  let stdout: string;
  try {
    stdout = await (input.run ?? defaultRun)(
      [
        'pull',
        input.projectId,
        '--authorize-only',
        '--ref',
        'published',
        '--expected-version',
        String(input.expectedVersion),
        '--json',
      ],
      input.scope.workspaceId,
      {
        timeoutMs: AUTHORIZED_PULL_TIMEOUT_MS,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
  } catch (error) {
    if (isAuthorizedTeamProjectPullInspectUnavailable(error)) {
      return { kind: 'unavailable' };
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return { kind: 'uncounted' };
  }
  if (!isRecord(parsed)) return { kind: 'uncounted' };
  // Bind the count to THIS pull with the SAME validation the real pull runs.
  // projectId + version + workspaceId is not the whole binding: one workspace
  // holds many principals, so a receipt authorized for another owner or viewer
  // would otherwise be accepted — and an oversized count there is cached as a
  // deferral, suppressing background materialization for a scope that was
  // never inspected. That is the exact inverse of the fail-open promise.
  // Reusing the pull's validator (rather than re-listing fields here) keeps
  // the two from drifting apart as the receipt contract evolves.
  try {
    validateAuthorizedTeamProjectPullReceipt(parseReceipt(stdout), {
      projectId: input.projectId,
      scope: input.scope,
      expectedVersion: input.expectedVersion,
      ...(input.nowMs != null ? { nowMs: input.nowMs } : {}),
    });
  } catch {
    return { kind: 'uncounted' };
  }
  const entryCount = parsed.manifestEntryCount;
  if (!Number.isSafeInteger(entryCount) || Number(entryCount) < 0) {
    return { kind: 'uncounted' };
  }
  return { kind: 'counted', entryCount: Number(entryCount) };
}

function fileIdentity(
  value: Awaited<ReturnType<typeof lstat>>,
): AuthorizedTeamProjectStageIdentity {
  return { dev: String(value.dev), ino: String(value.ino) };
}

function sameIdentity(
  left: AuthorizedTeamProjectStageIdentity,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return left.dev === String(right.dev) && left.ino === String(right.ino);
}

async function cleanupOwnedStage(
  stageDir: string,
  identity: AuthorizedTeamProjectStageIdentity,
  hooks?: StageAuthorizedTeamProjectPullInput['cleanupHooks'],
): Promise<void> {
  let current: Awaited<ReturnType<typeof lstat>>;
  try {
    current = await lstat(stageDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    !sameIdentity(identity, current)
  ) {
    throw new Error('authorized pull stage identity changed; refusing cleanup');
  }
  await hooks?.beforeQuarantineRename?.(stageDir);
  const quarantine = `${stageDir}.cleanup-${process.pid}-${randomUUID()}`;
  await rename(stageDir, quarantine);
  const quarantined = await lstat(quarantine);
  if (!sameIdentity(identity, quarantined)) {
    try {
      await rename(quarantine, stageDir);
    } catch {
      // Preserve the raced-in directory at quarantine when its original path
      // was concurrently recreated. Never delete an inode we did not create.
    }
    throw new Error('authorized pull stage identity changed during cleanup');
  }
  await rm(quarantine, { recursive: true, force: false });
}

const defaultRun: RunAuthorizedTeamProjectPull = (
  args,
  workspaceId,
  options,
) => {
  const workspaceOptions = velaWorkspaceCommandOptions(workspaceId);
  return runVelaCommand(['team-projects', ...args], {
    ...workspaceOptions,
    timeoutMs: options.timeoutMs,
    ...(options.signal ? { signal: options.signal } : {}),
  });
};

export async function stageAuthorizedTeamProjectPull(
  input: StageAuthorizedTeamProjectPullInput,
): Promise<StagedAuthorizedTeamProjectPull> {
  if (
    !input.projectId.trim() ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    throw new Error('authorized pull requires a project and exact version');
  }
  const liveDir = path.resolve(input.liveDir);
  const parentDir = path.dirname(liveDir);
  const stageDir = await mkdtemp(
    path.join(parentDir, `.${path.basename(liveDir)}.od-pull-stage-`),
  );
  let identity = fileIdentity(await lstat(stageDir));
  let retained = false;
  const cleanup = async (): Promise<void> => {
    if (!retained) return;
    await cleanupOwnedStage(stageDir, identity, input.cleanupHooks);
    retained = false;
  };
  try {
    if ((await readdir(stageDir)).length !== 0) {
      throw new Error('authorized pull stage must start empty');
    }
    const stdout = await (input.run ?? defaultRun)(
      [
        'pull',
        input.projectId,
        stageDir,
        '--live-dir',
        liveDir,
        '--ref',
        'published',
        '--expected-version',
        String(input.expectedVersion),
        '--json',
      ],
      input.scope.workspaceId,
      {
        timeoutMs: AUTHORIZED_PULL_TIMEOUT_MS,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    const materializedIdentity = await lstat(stageDir);
    if (materializedIdentity.isSymbolicLink() || !materializedIdentity.isDirectory()) {
      throw new Error('authorized pull stage is not a real directory');
    }
    // Vela atomically replaces the initially-empty stage with the materialized
    // snapshot. Its successful command completion transfers ownership of that
    // exact replacement inode to this caller.
    identity = fileIdentity(materializedIdentity);
    const receipt = parseReceipt(stdout);
    validateAuthorizedTeamProjectPullReceipt(receipt, {
      projectId: input.projectId,
      scope: input.scope,
      expectedVersion: input.expectedVersion,
      nowMs: input.now?.() ?? Date.now(),
    });
    retained = true;
    return { stageDir, identity, receipt, cleanup };
  } catch (error) {
    await cleanupOwnedStage(stageDir, identity, input.cleanupHooks).catch((cleanupError) => {
      throw new AggregateError(
        [error, cleanupError],
        'authorized pull failed and stage cleanup was not confirmed',
      );
    });
    throw error;
  }
}
