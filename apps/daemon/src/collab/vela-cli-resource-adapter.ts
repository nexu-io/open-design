import { execFile } from 'node:child_process';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import type { ResourceHubPrincipal } from '../integrations/resource-hub.js';
import type { ResourcePublishAdapter } from './publish-scheduler.js';

// The `vela resource` transport for the publish/pull machinery (T7c). Instead of
// the daemon holding an internal token and driving the hub over HTTP itself, it
// shells out to `vela resource push/head/pull`, which authenticates with the same
// vela login session AMR uses — one identity, and the content-addressing lives in
// the vela CLI so any vela-embedding project shares the exact same code path.
//
// This is a drop-in ResourcePublishAdapter, selected by env so it coexists with
// the in-process SDK adapter until the CLI ships everywhere (see
// createResourcePublishAdapterFromEnv). The child process is injectable so the
// wiring is unit-tested without a live CLI or hub.

const PUBLISHED_REF = 'published';
const PROJECT_KIND = 'project';

/** Run `vela resource <args>` and resolve its stdout. */
export type RunVelaResource = (args: string[]) => Promise<string>;

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
  hasTeamIdentity: () => boolean | Promise<boolean>;
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaResource;
}

interface VelaVersionRecord {
  version?: number;
}

export function createVelaCliResourceAdapter(
  options: VelaCliResourceAdapterOptions,
): ResourcePublishAdapter {
  const resolvePullDir = options.resolvePullDir ?? options.resolveProjectDir;
  const resourceIdFor = options.resourceIdFor ?? projectResourceIdFor;
  const kind = options.kind ?? PROJECT_KIND;
  const run = options.run ?? defaultRunVelaResource;

  async function gated<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return (await options.hasTeamIdentity()) ? fn() : fallback;
  }

  function resourceIdsFor(projectId: string, principal?: ResourceHubPrincipal | null): string[] {
    const primary = resourceIdFor(projectId, principal);
    if (!principal) return [primary];
    const legacy = resourceIdFor(projectId, null);
    return legacy === primary ? [primary] : [primary, legacy];
  }

  return {
    publish({ projectId, principal }) {
      return gated(async () => {
        const dir = await options.resolveProjectDir(projectId);
        const args = ['push', kind, resourceIdFor(projectId, principal), dir, '--ref', PUBLISHED_REF, '--json'];
        const metadata = await options.describeProject?.(projectId);
        if (metadata && Object.keys(metadata).length > 0) {
          args.push('--metadata-json', JSON.stringify(metadata));
        }
        const out = await run(args);
        const version = parseVersion(out);
        return version == null ? null : { version };
      }, null);
    },

    syncLatest({ projectId, principal }) {
      return gated(async () => {
        // `head` reports the published version without downloading — a null
        // version means nothing is published yet.
        for (const resourceId of resourceIdsFor(projectId, principal)) {
          const out = await run(['head', resourceId, '--ref', PUBLISHED_REF, '--json']);
          const version = parseVersion(out);
          if (version != null) return { version };
        }
        return null;
      }, null);
    },

    async pull({ projectId, principal }) {
      await gated(async () => {
        const dir = await resolvePullDir(projectId);
        let lastError: unknown;
        for (const resourceId of resourceIdsFor(projectId, principal)) {
          try {
            await run(['pull', kind, resourceId, dir, '--ref', PUBLISHED_REF, '--json']);
            return;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
      }, undefined);
    },

    async unpublish({ projectId, principal }) {
      await gated(async () => {
        await run(['remove', resourceIdFor(projectId, principal), '--json']);
      }, undefined);
    },
  };
}

/** Parse the `version` field out of a `vela resource` --json line. Returns null
 *  when the field is absent or explicitly null (e.g. `head` on an unpublished
 *  resource), so callers treat "nothing published" as a clean empty result. */
function parseVersion(stdout: string): number | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as VelaVersionRecord;
    return typeof parsed.version === 'number' ? parsed.version : null;
  } catch {
    return null;
  }
}

const defaultRunVelaResource: RunVelaResource = (args) =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['resource', ...args],
      // Inherit the AMR profile so the CLI reads the same ~/.amr session the
      // daemon's AMR runtime uses — one login drives agent runs and resources.
      { env: buildVelaResourceEnv(), maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });

export function buildVelaResourceEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // OPEN_DESIGN_AMR_PROFILE remains the daemon-level default, but an explicit
  // VELA_PROFILE/AMR_HOME/VELA_API_URL on the daemon process must win so local
  // multi-user tools-dev runs can point each daemon at a different CLI profile.
  return { ...amrVelaProfileEnv(env), ...env };
}

/**
 * Whether this run should drive resource sharing through the `vela resource` CLI
 * transport instead of the in-process SDK. An explicit `OD_RESOURCE_TRANSPORT`
 * wins; otherwise the Vela-backed team/collab modes imply the same CLI identity
 * for bytes so the daemon does not publish catalog rows through Vela while
 * leaving project content on the local stub.
 */
export function shouldUseVelaCliResourceTransport(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicitTransport = env.OD_RESOURCE_TRANSPORT?.trim();
  if (explicitTransport) return explicitTransport === 'vela-cli';
  return env.OD_TEAM_PROJECTS_TRANSPORT?.trim() === 'vela-cli' ||
    env.OD_COLLAB_TRANSPORT?.trim() === 'vela-cli';
}

/** Derive the team-identity gate from the one workspace context (team + live). */
export function contextHasTeamIdentity(context: WorkspaceCollabContext | null): boolean {
  return Boolean(context && context.workspaceType === 'team' && context.teamId);
}
