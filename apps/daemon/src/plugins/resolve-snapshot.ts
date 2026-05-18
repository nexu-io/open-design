// Plugin snapshot resolver — wires the pure `applyPlugin()` into the
// daemon's `POST /api/projects` and `POST /api/runs` paths. Spec §8.2.1
// invariant I3: the AppliedPluginSnapshot is the only contract between
// "plugin" and "run". This module owns the side-effect-bearing edges:
//
//   1. Caller supplies `appliedPluginSnapshotId` → look it up, verify it
//      isn't stale.
//   2. Caller supplies `pluginId` (+ optional `pluginInputs`,
//      `grantCaps`) → run `applyPlugin()` with the live registry,
//      persist a `createSnapshot()` row, and return the new snapshot id.
//   3. Neither field present → return `null`; the caller proceeds with
//      the legacy non-plugin code path.
//
// Capability gating: when the resolved snapshot is `restricted` and any
// `capabilitiesRequired` is missing from `capabilitiesGranted`, we
// short-circuit with the §9.1 / exit-66 / 409 body. The caller maps the
// returned `error` shape to either an HTTP 409 or a stderr JSON envelope.
//
// This module is the single entry point for both project create and
// run start; all snapshot wiring goes through here so the behavior stays
// deterministic across CLI / desktop / web.

import type Database from 'better-sqlite3';
import type {
  AppliedPluginSnapshot,
  ApplyResult,
  InstalledPluginRecord,
  PluginConnectorBinding,
} from '@open-design/contracts';
import {
  applyPlugin,
  MissingInputError,
  type ApplyTrust,
} from './apply.js';
import {
  getInstalledPlugin,
} from './registry.js';
import {
  createSnapshot,
  getSnapshot,
  linkSnapshotToConversation,
  linkSnapshotToProject,
  linkSnapshotToRun,
} from './snapshots.js';
import {
  type ConnectorProbe,
} from './connector-gate.js';
import type { RegistryView } from '@open-design/plugin-runtime';

type SqliteDb = Database.Database;

export interface ResolveSnapshotInput {
  db: SqliteDb;
  body: Record<string, unknown> | null | undefined;
  // The project this snapshot will pin to. For the run-create path we
  // always know it (the run carries `projectId`). For project-create we
  // pass the freshly-inserted project id.
  projectId: string;
  conversationId?: string | null | undefined;
  runId?: string | null | undefined;
  // Pluggable for tests; in production these are the daemon's live
  // skill / design-system catalogs (server.ts wires them).
  registry: RegistryView;
  connectorProbe?: ConnectorProbe | undefined;
  // Optional active-project DS binding. Forwarded to `applyPlugin` so
  // plugins that declared `od.context.designSystem.primary: true` get
  // bound to the project's DS at apply time.
  activeProjectDesignSystem?: { id: string; title?: string } | undefined;
}

export interface ResolveSnapshotOk {
  ok: true;
  snapshotId: string;
  snapshot: AppliedPluginSnapshot;
  applyResult?: ApplyResult;
  // Whether this call created a new snapshot (true) or reused an
  // explicit `appliedPluginSnapshotId` (false). Used by callers to
  // decide when to re-link to a different project / run / conversation.
  created: boolean;
}

export interface ResolveSnapshotError {
  ok: false;
  status: number; // HTTP status to return
  exitCode: number; // Matching CLI exit code (§12.4)
  body: {
    error: {
      code: string;
      message: string;
      data?: Record<string, unknown>;
    };
  };
}

export type ResolveSnapshotResult = ResolveSnapshotOk | ResolveSnapshotError | null;

// Read the snapshot id that's currently pinned on a project row (if any).
// Returns null when the project is missing or has no snapshot pinned.
// Used by resolvePluginSnapshot's fallback so a plain `POST /api/runs
// { projectId }` reuses the snapshot the user picked at project create
// time — without forcing every caller to re-thread the snapshot id.
function readProjectPinnedSnapshotId(db: SqliteDb, projectId: string): string | null {
  try {
    const row = db
      .prepare(`SELECT applied_plugin_snapshot_id AS id FROM projects WHERE id = ?`)
      .get(projectId) as { id?: string | null } | undefined;
    const id = row?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Pull plugin-bearing fields off the request body without mutating it.
function pickPluginFields(body: Record<string, unknown> | null | undefined) {
  if (!body || typeof body !== 'object') return {};
  const pluginId = typeof body.pluginId === 'string' && body.pluginId.trim().length > 0
    ? body.pluginId.trim()
    : undefined;
  const snapshotId = typeof body.appliedPluginSnapshotId === 'string'
    && body.appliedPluginSnapshotId.trim().length > 0
    ? body.appliedPluginSnapshotId.trim()
    : undefined;
  const pluginInputs =
    body.pluginInputs && typeof body.pluginInputs === 'object'
      ? (body.pluginInputs as Record<string, unknown>)
      : body.inputs && typeof body.inputs === 'object'
        ? (body.inputs as Record<string, unknown>)
        : {};
  const grantCaps = Array.isArray(body.grantCaps)
    ? (body.grantCaps as unknown[])
        .filter((c): c is string => typeof c === 'string')
    : [];
  const locale = typeof body.locale === 'string' ? body.locale : undefined;
  return { pluginId, snapshotId, pluginInputs, grantCaps, locale };
}

export function resolvePluginSnapshot(input: ResolveSnapshotInput): ResolveSnapshotResult {
  const fields = pickPluginFields(input.body);
  // If the caller didn't name a plugin / snapshot in the body but a
  // snapshot is already pinned to the project (set by a prior project /
  // conversation create that ran the plugin), reuse it. This is what
  // makes ChatComposer's "start a run" path work after the user picked a
  // plugin in NewProjectPanel — the body only carries `projectId`.
  if (!fields.pluginId && !fields.snapshotId && input.projectId) {
    const pinned = readProjectPinnedSnapshotId(input.db, input.projectId);
    if (pinned) {
      fields.snapshotId = pinned;
    }
  }
  if (!fields.pluginId && !fields.snapshotId) return null;

  // Path 1: explicit snapshot id — look it up and verify status.
  if (fields.snapshotId) {
    const snapshot = getSnapshot(input.db, fields.snapshotId);
    if (!snapshot) {
      return {
        ok: false,
        status: 404,
        exitCode: 65,
        body: {
          error: {
            code: 'snapshot-not-found',
            message: `Applied plugin snapshot ${fields.snapshotId} not found`,
            data: { snapshotId: fields.snapshotId },
          },
        },
      };
    }
    if (snapshot.status === 'stale') {
      return {
        ok: false,
        status: 409,
        exitCode: 72,
        body: {
          error: {
            code: 'snapshot-stale',
            message: `Snapshot ${fields.snapshotId} was marked stale; re-apply the plugin or replay the run.`,
            data: {
              snapshotId: snapshot.snapshotId,
              pluginId: snapshot.pluginId,
              snapshotVersion: snapshot.pluginVersion,
            },
          },
        },
      };
    }
    return finalizeOk({
      input,
      snapshot,
      created: false,
    });
  }

  // Path 2: pluginId — run apply, persist a new snapshot.
  const plugin = getInstalledPlugin(input.db, fields.pluginId!);
  if (!plugin) {
    return {
      ok: false,
      status: 404,
      exitCode: 65,
      body: {
        error: {
          code: 'plugin-not-found',
          message: `Plugin "${fields.pluginId}" is not installed.`,
          data: { pluginId: fields.pluginId },
        },
      },
    };
  }

  let applyComputed;
  try {
    applyComputed = applyPlugin({
      plugin,
      inputs: fields.pluginInputs ?? {},
      registry: input.registry,
      activeProjectDesignSystem: input.activeProjectDesignSystem,
      connectorProbe: input.connectorProbe,
      locale: fields.locale,
    });
  } catch (err) {
    if (err instanceof MissingInputError) {
      return {
        ok: false,
        status: 422,
        exitCode: 67,
        body: {
          error: {
            code: 'missing-input',
            message: `Plugin "${fields.pluginId}" is missing required inputs: ${err.fields.join(', ')}.`,
            data: { pluginId: fields.pluginId, missing: err.fields },
          },
        },
      };
    }
    throw err;
  }

  const result = applyComputed.result;
  const trust: ApplyTrust = result.trust;
  const grantedSet = new Set([...result.capabilitiesGranted, ...fields.grantCaps]);
  const merged = Array.from(grantedSet);

  const missing = result.capabilitiesRequired.filter((c) => !grantedSet.has(c));
  if (trust === 'restricted' && missing.length > 0) {
    return capabilitiesRequiredError({
      pluginId: plugin.id,
      pluginVersion: plugin.version,
      required: result.capabilitiesRequired,
      granted: merged,
      missing,
    });
  }

  const persisted = createSnapshot(input.db, {
    projectId: input.projectId,
    conversationId: input.conversationId ?? null,
    runId: input.runId ?? null,
    pluginId: result.appliedPlugin.pluginId,
    pluginSpecVersion: result.appliedPlugin.pluginSpecVersion ?? plugin.manifest.specVersion,
    pluginVersion: result.appliedPlugin.pluginVersion,
    pluginTitle: result.appliedPlugin.pluginTitle,
    pluginDescription: result.appliedPlugin.pluginDescription,
    manifestSourceDigest: applyComputed.manifestSourceDigest,
    sourceMarketplaceId: result.appliedPlugin.sourceMarketplaceId ?? null,
    sourceMarketplaceEntryName: result.appliedPlugin.sourceMarketplaceEntryName ?? null,
    sourceMarketplaceEntryVersion: result.appliedPlugin.sourceMarketplaceEntryVersion ?? null,
    marketplaceTrust: result.appliedPlugin.marketplaceTrust ?? null,
    resolvedSource: result.appliedPlugin.resolvedSource ?? null,
    resolvedRef: result.appliedPlugin.resolvedRef ?? null,
    archiveIntegrity: result.appliedPlugin.archiveIntegrity ?? null,
    pinnedRef: result.appliedPlugin.pinnedRef ?? null,
    taskKind: result.appliedPlugin.taskKind,
    inputs: result.appliedPlugin.inputs,
    resolvedContext: result.appliedPlugin.resolvedContext,
    pipeline: result.appliedPlugin.pipeline,
    genuiSurfaces: result.appliedPlugin.genuiSurfaces ?? [],
    capabilitiesGranted: merged,
    capabilitiesRequired: result.capabilitiesRequired,
    assetsStaged: result.appliedPlugin.assetsStaged,
    connectorsRequired: result.appliedPlugin.connectorsRequired,
    connectorsResolved: result.appliedPlugin.connectorsResolved,
    mcpServers: result.appliedPlugin.mcpServers,
    query: result.query,
  });

  return finalizeOk({
    input,
    snapshot: persisted,
    applyResult: { ...result, appliedPlugin: persisted },
    created: true,
  });
}

function finalizeOk(args: {
  input: ResolveSnapshotInput;
  snapshot: AppliedPluginSnapshot;
  applyResult?: ApplyResult;
  created: boolean;
}): ResolveSnapshotOk {
  // Pin the snapshot to whichever surfaces the caller already knows.
  // Order matters: link to project (always) before conversation/run so
  // the foreign key is satisfied and `expires_at` clears in one statement.
  const { db } = args.input;
  const snap = args.snapshot;
  if (args.input.projectId) {
    linkSnapshotToProject(db, snap.snapshotId, args.input.projectId);
  }
  if (args.input.conversationId) {
    linkSnapshotToConversation(db, snap.snapshotId, args.input.conversationId);
  }
  if (args.input.runId) {
    linkSnapshotToRun(db, snap.snapshotId, args.input.runId);
  }
  return {
    ok: true,
    snapshotId: snap.snapshotId,
    snapshot: snap,
    ...(args.applyResult ? { applyResult: args.applyResult } : {}),
    created: args.created,
  };
}

export function capabilitiesRequiredError(args: {
  pluginId: string;
  pluginVersion: string;
  required: string[];
  granted: string[];
  missing: string[];
}): ResolveSnapshotError {
  const remediation = [
    `od plugin trust ${args.pluginId} --capabilities ${args.missing.join(',')}`,
    `or pass --grant-caps ${args.missing.join(',')} to the apply / run command`,
  ];
  return {
    ok: false,
    status: 409,
    exitCode: 66,
    body: {
      error: {
        code: 'capabilities-required',
        message: `Plugin ${args.pluginId} requires capabilities not yet granted.`,
        data: {
          pluginId: args.pluginId,
          pluginVersion: args.pluginVersion,
          required: args.required,
          granted: args.granted,
          missing: args.missing,
          remediation,
        },
      },
    },
  };
}

// Convenience pass-through so tests that already imported the helper
// don't need to reach into other files.
export type { PluginConnectorBinding };
