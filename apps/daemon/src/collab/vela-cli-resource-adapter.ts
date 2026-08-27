import {
  workspaceContextHasTeamIdentity,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  runVelaCommand,
  velaWorkspaceCommandOptions,
} from '../integrations/vela-command.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import { IGNORED_PROJECT_DIR_NAMES } from '../project-ignored-dirs.js';
import type { ResourcePublishAdapter } from './publish-scheduler.js';
import {
  emitVelaResourcePullProfile,
  sharedProjectPullProfileEnabled,
} from './pull-profile.js';
import type { ResourceHubPrincipal } from './resource-principal.js';

// The `vela resource` transport for the publish/pull machinery (T7c). Instead of
// the daemon holding an internal token and driving the hub over HTTP itself, it
// shells out to `vela resource push/head/pull`, which authenticates with the same
// vela login session AMR uses — one identity, and the content-addressing lives in
// the vela CLI so any vela-embedding project shares the exact same code path.
//
// This is a drop-in ResourcePublishAdapter selected by the collaboration mode.
// The child process is injectable so the wiring is unit-tested without a live
// CLI or hub.

const PUBLISHED_REF = 'published';
const PROJECT_KIND = 'project';
// A normal feature-test pull is expected to finish in roughly five seconds.
// Give the transport a generous 6x envelope for large snapshots, but never
// let a wedged Vela child hold the per-project materialization lock forever.
const RESOURCE_PULL_TIMEOUT_MS = 30_000;
// One batch may carry up to 128 destinations. Blob work is still bounded
// inside Vela, but the aggregate can legitimately outlive one small pull.
const RESOURCE_PULL_BATCH_TIMEOUT_MS = 120_000;
// A push uploads the author's full member-mirror snapshot; on a slow uplink a
// large project can legitimately take minutes, so this budget exists only to
// reap a truly wedged child — it must stay far above any honest upload time.
const RESOURCE_PUSH_TIMEOUT_MS = 600_000;
// head/shared/remove are metadata round-trips with no bulk transfer.
const RESOURCE_METADATA_TIMEOUT_MS = 60_000;
// Wall-clock budget per `vela resource` subcommand. A child that outlives its
// budget is terminated (confirmed-kill, see `runVelaCommand`) and the command
// rejects, so a hung CLI surfaces as an ordinary command failure instead of
// pinning the scheduler's in-flight publish or the per-project
// materialization lock forever. Subcommands not listed here (snapshot /
// snapshot-redact) keep their historical unbounded behavior.
const RESOURCE_COMMAND_TIMEOUTS_MS: Readonly<Record<string, number>> = {
  pull: RESOURCE_PULL_TIMEOUT_MS,
  'pull-batch': RESOURCE_PULL_BATCH_TIMEOUT_MS,
  push: RESOURCE_PUSH_TIMEOUT_MS,
  head: RESOURCE_METADATA_TIMEOUT_MS,
  shared: RESOURCE_METADATA_TIMEOUT_MS,
  remove: RESOURCE_METADATA_TIMEOUT_MS,
};
const MEMBER_MIRROR_EXCLUDED_ENTRIES = [
  '.file-versions',
  '.live-artifacts',
  '.od-skills',
  '.od-frames',
  '.git',
  'node_modules',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.aws',
  '.ssh',
  '.azure',
  '.docker',
  '.gnupg',
  '.kube',
  '.pulumi',
  '.terraform',
  '.git-credentials',
  '.netrc',
  '.pypirc',
  'terraform.tfstate',
  'terraform.tfstate.backup',
] as const;
/**
 * Name prefixes a snapshot skips.
 *
 * `.env` is secret-bearing, so it is bare and matches any entry type — a
 * `.env.local` file and a stray `.envrc` directory are equally unwelcome in a
 * member mirror.
 *
 * `deriveddata-` mirrors the owner-side rule (`isIgnoredProjectDirName` treats
 * any `deriveddata-*` name as hidden) and is directory-scoped for the same
 * reason the generated-tree names are: a regular file starting with that
 * prefix is ordinary project content. See
 * {@link MEMBER_MIRROR_PUSH_EXCLUDED_ENTRIES} for the trailing-slash contract
 * and why it degrades safely on a Vela that predates it.
 */
const MEMBER_MIRROR_EXCLUDED_PREFIXES = ['.env', 'deriveddata-/'] as const;

/**
 * Every entry name a `vela resource push` snapshot skips.
 *
 * Two families with DIFFERENT matching semantics, which is why they are not
 * one flat list:
 *
 * - {@link MEMBER_MIRROR_EXCLUDED_ENTRIES} — secret-bearing entries
 *   (credentials, tool state, OpenDesign private bookkeeping). These must
 *   never leave the author's machine whether they are a file, a directory, or
 *   a symlink, so they are sent bare and match any entry of that name.
 * - {@link IGNORED_PROJECT_DIR_NAMES} — generated/installed/cache trees the
 *   owner's own file list already hides. The owner hides them as DIRECTORIES
 *   only (`collectFiles` consults `shouldSkipDir` inside its `isDirectory()`
 *   branch), so a bare name here would over-match: a project holding a regular
 *   file called `target` or `out` would have it silently dropped from every
 *   member mirror while the owner still sees it. These are therefore sent with
 *   a trailing slash, the directory-only form.
 *
 * The trailing slash is also the compatibility seam. A Vela build that does
 * not yet understand it compares `"dist/"` against entry names that never
 * contain a slash, so the rule matches nothing and the tree is published in
 * full — the pre-optimization payload, never a missing file. Once the CLI
 * understands the form, the same push starts skipping those directories with
 * no further OpenDesign change. A new `--exclude-dir` flag could NOT degrade
 * this way: older CLIs reject unknown flags, which would fail every publish.
 */
export const MEMBER_MIRROR_PUSH_EXCLUDED_ENTRIES: readonly string[] = (() => {
  const secretBearing = new Set<string>(MEMBER_MIRROR_EXCLUDED_ENTRIES);
  // `.git` and `node_modules` appear in both families. The bare rule already
  // covers them for every entry type, so adding the directory-only form would
  // be dead weight on the command line.
  const directoryOnly = [...IGNORED_PROJECT_DIR_NAMES]
    .filter((name) => !secretBearing.has(name))
    .map((name) => `${name}/`);
  return [...secretBearing, ...directoryOnly];
})();

/** Run `vela resource <args>` and resolve its stdout. */
export type RunVelaResource = (
  args: string[],
  workspaceId?: string,
) => Promise<string>;

export interface VelaResourcePullBatchRequest {
  key: string;
  kind: 'design_system' | 'plugin' | 'skill';
  resourceId: string;
  dir: string;
  ref: string;
}

export interface VelaCliResourceAdapterOptions {
  /** The project's source directory to publish (managed-project root). */
  resolveProjectDir: (projectId: string) => string | Promise<string>;
  /** Optional resource-index metadata for team project discovery/cards. */
  describeProject?: (projectId: string) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  /** Where a member materializes pulled content. Defaults to the project dir. */
  resolvePullDir?: (projectId: string) => string | Promise<string>;
  /** (projectId, principal) → hub resourceId. Colon-free (routed as a path param). */
  resourceIdFor?: (projectId: string, principal?: ResourceHubPrincipal | null) => string;
  /** Hub resource kind (project / design_system / plugin / skill). */
  kind?: string;
  /**
   * Whether the caller currently has a team identity. Null/false → no-op, the
   * same single-identity gate the SDK adapter applies, so a personal / signed-out
   * session never publishes. The CLI itself resolves the concrete member/team
   * from the vela session; this only gates whether we invoke it at all.
   */
  hasTeamIdentity: (
    principal?: ResourceHubPrincipal | null,
  ) => boolean | Promise<boolean>;
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaResource;
}

interface VelaVersionRecord {
  id?: string;
  version?: number;
  versionId?: string;
}

export interface VelaResourceSnapshotRecord {
  slug: string;
  name: string;
  kind: string;
  versionId: string;
  createdAt: string;
}

export function createVelaCliResourceAdapter(
  options: VelaCliResourceAdapterOptions,
): ResourcePublishAdapter {
  const resolvePullDir = options.resolvePullDir ?? options.resolveProjectDir;
  const resourceIdFor = options.resourceIdFor ?? projectResourceIdFor;
  const kind = options.kind ?? PROJECT_KIND;
  const run = options.run ?? defaultRunVelaResource;

  async function gated<T>(
    principal: ResourceHubPrincipal | null | undefined,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    return (await options.hasTeamIdentity(principal)) ? fn() : fallback;
  }

  function resourceIdsFor(projectId: string, principal?: ResourceHubPrincipal | null): string[] {
    const primary = resourceIdFor(projectId, principal);
    if (!principal) return [primary];
    const legacy = resourceIdFor(projectId, null);
    return legacy === primary ? [primary] : [primary, legacy];
  }

  return {
    publish({ projectId, principal }) {
      return gated(principal, async () => {
        const dir = await options.resolveProjectDir(projectId);
        const args = ['push', kind, resourceIdFor(projectId, principal), dir, '--ref', PUBLISHED_REF, '--json'];
        for (const name of MEMBER_MIRROR_PUSH_EXCLUDED_ENTRIES) {
          args.push('--exclude', name);
        }
        for (const prefix of MEMBER_MIRROR_EXCLUDED_PREFIXES) {
          args.push('--exclude-prefix', prefix);
        }
        const metadata = await options.describeProject?.(projectId);
        const resourceMetadata = kind === PROJECT_KIND
          ? { projectId, ...(metadata ?? {}) }
          : metadata;
        if (resourceMetadata && Object.keys(resourceMetadata).length > 0) {
          args.push('--metadata-json', JSON.stringify(resourceMetadata));
        }
        const out = await run(args, principal?.teamId);
        return parseVersion(out);
      }, null);
    },

    syncLatest({ projectId, principal }) {
      return gated(principal, async () => {
        // `head` reports the published version without downloading — a null
        // version means nothing is published yet.
        for (const resourceId of resourceIdsFor(projectId, principal)) {
          const out = await run(
            ['head', resourceId, '--ref', PUBLISHED_REF, '--json'],
            principal?.teamId,
          );
          const version = parseVersion(out);
          if (version != null) return version;
        }
        return null;
      }, null);
    },

    async pull({ projectId, principal }) {
      return gated(principal, async () => {
        const dir = await resolvePullDir(projectId);
        let lastError: unknown;
        const resourceIds = resourceIdsFor(projectId, principal);
        for (const [index, resourceId] of resourceIds.entries()) {
          try {
            const out = await run(
              ['pull', kind, resourceId, dir, '--ref', PUBLISHED_REF, '--json'],
              principal?.teamId,
            );
            const materialized = parseVersion(out);
            if (!materialized) {
              throw new Error(
                'vela resource pull response is missing the materialized version',
              );
            }
            return materialized;
          } catch (error) {
            lastError = error;
            if (
              index === resourceIds.length - 1 ||
              !isMissingResourceError(error)
            ) throw error;
          }
        }
        throw lastError;
      }, null);
    },

    async unpublish({ projectId, principal }) {
      await gated(principal, async () => {
        try {
          await run(
            ['remove', resourceIdFor(projectId, principal), '--json'],
            principal?.teamId,
          );
        } catch (error) {
          // Unpublish is a retraction toward one end state: "the hub no
          // longer serves this resource". A hub answer that the resource is
          // already absent IS that end state, so it must read as success.
          // Propagating it made retraction non-idempotent: an unshare whose
          // two hub writes (resource remove → team-projects catalog remove)
          // half-landed could then NEVER be completed — every retry died
          // re-removing the already-tombstoned resource, the catalog row
          // outlived it, and after a reinstall the retracted project revived
          // as a ghost team card (reproduced live on the feature-test hub,
          // 2026-07-27; 飞书 recvqA6qhV7St1).
          if (!isRetractedHubResourceError(error)) throw error;
        }
      }, undefined);
    },
  };
}

function isMissingResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource_not_found|status\s+404|ref_not_found/u.test(message);
}

/**
 * True when the hub itself answered `resource_not_found` — its tombstone gate
 * refuses every resource-scoped call once `resources.deleted_at` is set (and
 * answers the same for an id that never existed). Deliberately NARROWER than
 * {@link isMissingResourceError}: `ref_not_found` / bare-404 shapes can mean
 * "live resource with nothing published yet", which must never be read as
 * "this resource was retracted".
 */
export function isRetractedHubResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource_not_found/u.test(message);
}

/** Parse the `version` field out of a `vela resource` --json line. Returns null
 *  when the field is absent or explicitly null (e.g. `head` on an unpublished
 *  resource), so callers treat "nothing published" as a clean empty result. */
function parseVersion(
  stdout: string,
): { version: number; versionId?: string } | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as VelaVersionRecord;
  if (parsed.version == null) return null;
  if (typeof parsed.version !== 'number') {
    throw new Error('vela resource response has an invalid version');
  }
  const versionId = typeof parsed.versionId === 'string' && parsed.versionId.trim()
    ? parsed.versionId.trim()
    : typeof parsed.id === 'string' && parsed.id.trim()
      ? parsed.id.trim()
      : null;
  return {
    version: parsed.version,
    ...(versionId ? { versionId } : {}),
  };
}

export function parseVelaResourceSnapshot(stdout: string): VelaResourceSnapshotRecord | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<VelaResourceSnapshotRecord>;
    return typeof parsed.slug === 'string' && parsed.slug
      ? {
          slug: parsed.slug,
          name: typeof parsed.name === 'string' ? parsed.name : '',
          kind: typeof parsed.kind === 'string' ? parsed.kind : '',
          versionId: typeof parsed.versionId === 'string' ? parsed.versionId : '',
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
        }
      : null;
  } catch {
    return null;
  }
}

export const runVelaResourceCommand: RunVelaResource = (args, workspaceId) => {
  const workspaceOptions = velaWorkspaceCommandOptions(workspaceId);
  const profilePull =
    args[0] === 'pull' && sharedProjectPullProfileEnabled(process.env);
  const timeoutMs = RESOURCE_COMMAND_TIMEOUTS_MS[args[0] ?? ''];
  return runVelaCommand(
    ['resource', ...args],
    {
      ...workspaceOptions,
      configuredEnv: {
        ...workspaceOptions.configuredEnv,
        ...(profilePull ? { VELA_RESOURCE_PULL_PROFILE: '1' } : {}),
      },
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(profilePull
        ? {
            onStderr: (stderr: string) =>
              emitVelaResourcePullProfile(stderr, process.env),
          }
        : {}),
    },
  );
};

/** Run one workspace-scoped batch through stdin to avoid argv size limits. */
export function runVelaResourceBatchCommand(
  requests: readonly VelaResourcePullBatchRequest[],
  workspaceId: string,
): Promise<string> {
  const workspaceOptions = velaWorkspaceCommandOptions(workspaceId);
  return runVelaCommand(
    ['resource', 'pull-batch', '--requests-file', '-', '--json'],
    {
      ...workspaceOptions,
      timeoutMs: RESOURCE_PULL_BATCH_TIMEOUT_MS,
      input: JSON.stringify({ requests }),
    },
  );
}

const defaultRunVelaResource: RunVelaResource = runVelaResourceCommand;

/**
 * Whether this run should drive resource sharing through the `vela resource` CLI
 * transport instead of the in-process SDK. An explicit `OD_RESOURCE_TRANSPORT`
 * wins; otherwise the Vela-backed team/collab modes imply the same CLI identity
 * for bytes so the daemon does not publish catalog rows through Vela while
 * leaving project content on the local stub.
 */
export function shouldUseVelaCliResourceTransport(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') return true;
  const explicitTransport = env.OD_RESOURCE_TRANSPORT?.trim();
  if (explicitTransport) return explicitTransport === 'vela-cli';
  return env.OD_TEAM_PROJECTS_TRANSPORT?.trim() === 'vela-cli' ||
    env.OD_COLLAB_TRANSPORT?.trim() === 'vela-cli';
}

/**
 * Derive the resource-identity gate from the one workspace context: does this
 * daemon's live vela session currently belong to an ACTIVE member of the
 * project's team?
 *
 * `workspaceContextHasTeamIdentity` alone is not enough here. It only proves
 * the context can ADDRESS the resource hub — `workspaceType`/`workspaceId`/
 * `workspaceMemberId` all resolve — and those fields keep resolving for a
 * member B has already removed from the team; only `memberStatus` flips to
 * `'removed'`. The publish/pull/syncLatest/unpublish operations this gates all
 * shell out to `vela resource …`, authenticated by the same vela CLI login
 * session AMR uses, which does not itself re-derive OD's team membership per
 * call. Without the explicit `memberStatus` check below, a member removed
 * from a team while their daemon keeps running would keep passing this gate
 * on every project they used to own, and the file watcher in
 * `collab-publish-watcher.ts` would keep pushing their local edits to the
 * team's resource hub through a vela session that is still locally valid.
 *
 * `hasTeamIdentity` is re-evaluated fresh on every publish/pull/syncLatest/
 * unpublish attempt. The runtime supplies the immutable principal captured by
 * the request or project watch; it never re-targets through daemon-global
 * active Workspace state.
 */
export function contextHasTeamIdentity(context: WorkspaceCollabContext | null): boolean {
  return workspaceContextHasTeamIdentity(context) && context?.memberStatus === 'active';
}
