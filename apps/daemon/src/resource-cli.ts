import {
  ResourceHubError,
  createResourceHubClient,
  readResourceHubPrincipal,
} from './integrations/resource-hub.js';
import type {
  PublicSnapshotResponse,
  ResourceDetailResponse,
  ResourceListResponse,
  ResourceLocalMapping,
  ResourceSnapshotRecord,
} from '@open-design/contracts';
import { resolveDaemonUrl } from './daemon-url.js';
import { materializeRef, packTree, pushTree } from './resource-drive.js';

// `od resource …` — neutral cloud-drive CLI over the resource hub. It moves
// directory trees to/from the hub (put/get) and lists team resources; it is
// kind-agnostic. Feature-specific sharing ("share a design system") is exposed
// here as a thin daemon-route wrapper so the CLI matches the HTTP surface.

const USAGE = `Usage:
  od resource list [--json] [--daemon-url <url>]
                                                List team resources through the daemon
  od resource put <dir> --kind <kind> [--resource <id>] [--ref <name>]
                                                Upload a directory tree as a new version
  od resource get <resource-id> <dest-dir> [--ref <name>]
                                                Materialize a version's tree locally
  od resource share <kind> <local-id> [--json] [--daemon-url <url>]
                                                Share a local resource through the daemon
  od resource pull <kind> <hub-resource-id> [--json] [--daemon-url <url>]
                                                Pull a team resource through the daemon
  od resource detail <resource-id> [--json] [--daemon-url <url>]
                                                Inspect versions and latest manifest through the daemon
  od resource snapshot <resource-id> [--name <name>] [--json] [--daemon-url <url>]
                                                Publish latest version as a public snapshot through the daemon
  od resource public-snapshot <slug> [--json] [--daemon-url <url>]
                                                Read a public snapshot through the daemon

Environment (dev/local, provisional until link B lands the member table):
  OD_RESOURCE_HUB_URL / OD_RESOURCE_HUB_TOKEN
  OD_WORKSPACE_MEMBER_ID / OD_WORKSPACE_TEAM_ID / OD_WORKSPACE_ROLE
`;

function printUsage(): void {
  console.log(USAGE);
}

function parseFlags(args: string[]): {
  positionals: string[];
  flags: Map<string, string>;
} {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(key, next);
        index += 1;
      } else {
        flags.set(key, 'true');
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function requirePrincipalOrExit() {
  const principal = readResourceHubPrincipal();
  if (!principal) {
    console.error(
      'workspace principal unavailable; set OD_WORKSPACE_MEMBER_ID and OD_WORKSPACE_TEAM_ID',
    );
    process.exitCode = 1;
    return null;
  }
  return principal;
}

function reportError(error: unknown): void {
  if (error instanceof ResourceHubError) {
    console.error(`resource hub error (${error.status} ${error.code})`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('resource hub operation failed');
  }
  process.exitCode = 1;
}

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value));
}

function endpoint(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${pathname}`;
}

async function readDaemonJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function daemonErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const body = payload as { error?: unknown; detail?: unknown };
    const error = typeof body.error === 'string' ? body.error : `HTTP ${status}`;
    const detail = typeof body.detail === 'string' ? `: ${body.detail}` : '';
    return `daemon resource endpoint failed (${status} ${error})${detail}`;
  }
  return `daemon resource endpoint failed with ${status}`;
}

async function postDaemonResource(
  action: 'share' | 'pull',
  args: string[],
): Promise<void> {
  const { positionals, flags } = parseFlags(args);
  const kind = positionals[0];
  const id = positionals[1];
  const json = flags.has('json');
  if (!kind || !id) {
    console.error(
      `usage: od resource ${action} <kind> <${action === 'share' ? 'local-id' : 'hub-resource-id'}> [--json] [--daemon-url <url>]`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const flagUrl = flags.get('daemon-url');
    const baseUrl = await resolveDaemonUrl(
      flagUrl === undefined ? {} : { flagUrl },
    );
    const response = await fetch(
      endpoint(
        baseUrl,
        `/api/resources/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${action}`,
      ),
      { method: 'POST' },
    );
    const payload = await readDaemonJson(response);
    if (!response.ok) {
      throw new Error(daemonErrorMessage(response.status, payload));
    }
    if (json) {
      writeJson(payload);
      return;
    }
    const body = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as { hubResourceId?: unknown; version?: unknown; dir?: unknown; alreadyOwned?: unknown }
      : {};
    if (action === 'share') {
      console.log(
        `shared ${kind} ${id} -> resource ${String(body.hubResourceId ?? '')} version ${String(body.version ?? '')}`,
      );
    } else if (body.alreadyOwned === true) {
      console.log(`resource ${id} is already owned locally`);
    } else {
      console.log(
        `pulled ${kind} ${id} -> ${String(body.dir ?? '')} version ${String(body.version ?? '')}`,
      );
    }
  } catch (error) {
    reportError(error);
  }
}

function formatLocalMapping(local: ResourceLocalMapping | null): string {
  if (!local) return '-';
  const version = local.lastSyncedVersion === null
    ? 'unsynced'
    : `v${local.lastSyncedVersion}`;
  return `${local.role}:${local.localId}:${version}`;
}

async function runList(args: string[]): Promise<void> {
  const { flags } = parseFlags(args);
  try {
    const flagUrl = flags.get('daemon-url');
    const baseUrl = await resolveDaemonUrl(
      flagUrl === undefined ? {} : { flagUrl },
    );
    const response = await fetch(endpoint(baseUrl, '/api/resources'), {
      method: 'GET',
    });
    const payload = await readDaemonJson(response);
    if (!response.ok) {
      throw new Error(daemonErrorMessage(response.status, payload));
    }
    const { resources } = payload as ResourceListResponse;
    if (flags.has('json')) {
      writeJson(payload);
      return;
    }
    if (resources.length === 0) {
      console.log('no team resources');
      return;
    }
    for (const resource of resources) {
      console.log(
        `${resource.kind}\t${resource.id}\t${resource.ownerMemberId}\t${formatLocalMapping(resource.local)}`,
      );
    }
  } catch (error) {
    reportError(error);
  }
}

async function runPut(args: string[]): Promise<void> {
  const principal = requirePrincipalOrExit();
  if (!principal) return;
  const { positionals, flags } = parseFlags(args);
  const dir = positionals[0];
  const kind = flags.get('kind');
  if (!dir || !kind) {
    console.error(
      'usage: od resource put <dir> --kind <kind> [--resource <id>] [--ref <name>]',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const client = createResourceHubClient();
    const resourceId = flags.get('resource');
    const resource = await client.createResource(principal, {
      kind,
      ...(resourceId ? { resourceId } : {}),
    });
    const packed = await packTree(dir);
    const version = await pushTree(client, principal, resource.id, packed, {
      ref: flags.get('ref') ?? 'latest',
    });
    console.log(
      `pushed ${packed.blobs.size} blob(s) -> resource ${resource.id} version ${version.version} (${version.id})`,
    );
  } catch (error) {
    reportError(error);
  }
}

async function runGet(args: string[]): Promise<void> {
  const principal = requirePrincipalOrExit();
  if (!principal) return;
  const { positionals, flags } = parseFlags(args);
  const resourceId = positionals[0];
  const dest = positionals[1];
  if (!resourceId || !dest) {
    console.error(
      'usage: od resource get <resource-id> <dest-dir> [--ref <name>]',
    );
    process.exitCode = 1;
    return;
  }
  const ref = flags.get('ref') ?? 'latest';
  try {
    await materializeRef(
      createResourceHubClient(),
      principal,
      resourceId,
      ref,
      dest,
    );
    console.log(`materialized resource ${resourceId} (ref ${ref}) -> ${dest}`);
  } catch (error) {
    reportError(error);
  }
}

async function runDetail(args: string[]): Promise<void> {
  const { positionals, flags } = parseFlags(args);
  const resourceId = positionals[0];
  if (!resourceId) {
    console.error('usage: od resource detail <resource-id> [--json] [--daemon-url <url>]');
    process.exitCode = 1;
    return;
  }
  try {
    const flagUrl = flags.get('daemon-url');
    const baseUrl = await resolveDaemonUrl(
      flagUrl === undefined ? {} : { flagUrl },
    );
    const response = await fetch(
      endpoint(baseUrl, `/api/resources/${encodeURIComponent(resourceId)}/detail`),
      { method: 'GET' },
    );
    const payload = await readDaemonJson(response);
    if (!response.ok) {
      throw new Error(daemonErrorMessage(response.status, payload));
    }
    const detail = payload as ResourceDetailResponse;
    if (flags.has('json')) {
      console.log(JSON.stringify(detail, null, 2));
      return;
    }
    console.log(
      `${detail.resource.kind}\t${detail.resource.id}\t${detail.resource.ownerMemberId}`,
    );
    console.log(`versions\t${detail.versions.length}`);
    for (const version of detail.versions) {
      console.log(
        `version\t${version.version}\t${version.id}\t${version.manifestDigest}\t${version.createdAt}`,
      );
    }
    const entries = detail.manifest?.entries ?? [];
    console.log(`manifest\t${detail.manifest?.digest ?? 'none'}\t${entries.length} entries`);
    for (const entry of entries) {
      console.log(
        `entry\t${entry.type}\t${entry.path}\t${entry.blobDigest ?? entry.symlinkTarget ?? ''}`,
      );
    }
  } catch (error) {
    reportError(error);
  }
}

async function runSnapshot(args: string[]): Promise<void> {
  const { positionals, flags } = parseFlags(args);
  const resourceId = positionals[0];
  if (!resourceId) {
    console.error(
      'usage: od resource snapshot <resource-id> [--name <name>] [--json] [--daemon-url <url>]',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const flagUrl = flags.get('daemon-url');
    const baseUrl = await resolveDaemonUrl(
      flagUrl === undefined ? {} : { flagUrl },
    );
    const name = flags.get('name') ?? 'snapshot';
    const response = await fetch(
      endpoint(
        baseUrl,
        `/api/resources/${encodeURIComponent(resourceId)}/snapshot?name=${encodeURIComponent(name)}`,
      ),
      { method: 'POST' },
    );
    const payload = await readDaemonJson(response);
    if (!response.ok) {
      throw new Error(daemonErrorMessage(response.status, payload));
    }
    const snapshot = payload as ResourceSnapshotRecord;
    if (flags.has('json')) {
      writeJson(snapshot);
      return;
    }
    console.log(
      `snapshot ${resourceId} -> ${snapshot.slug} (${snapshot.name})`,
    );
  } catch (error) {
    reportError(error);
  }
}

async function runPublicSnapshot(args: string[]): Promise<void> {
  const { positionals, flags } = parseFlags(args);
  const slug = positionals[0];
  if (!slug) {
    console.error(
      'usage: od resource public-snapshot <slug> [--json] [--daemon-url <url>]',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const flagUrl = flags.get('daemon-url');
    const baseUrl = await resolveDaemonUrl(
      flagUrl === undefined ? {} : { flagUrl },
    );
    const response = await fetch(
      endpoint(baseUrl, `/api/public-snapshots/${encodeURIComponent(slug)}`),
      { method: 'GET' },
    );
    const payload = await readDaemonJson(response);
    if (!response.ok) {
      throw new Error(daemonErrorMessage(response.status, payload));
    }
    const snapshot = payload as PublicSnapshotResponse;
    if (flags.has('json')) {
      writeJson(snapshot);
      return;
    }
    const entries = snapshot.manifest?.entries ?? [];
    console.log(`${snapshot.kind}\t${snapshot.slug}\t${snapshot.name}`);
    console.log(
      `manifest\t${snapshot.manifest?.digest ?? 'none'}\t${entries.length} entries`,
    );
    for (const entry of entries) {
      console.log(
        `entry\t${entry.type}\t${entry.path}\t${entry.blobDigest ?? entry.symlinkTarget ?? ''}`,
      );
    }
  } catch (error) {
    reportError(error);
  }
}

export async function runResource(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':
      await runList(rest);
      return;
    case 'put':
      await runPut(rest);
      return;
    case 'get':
      await runGet(rest);
      return;
    case 'share':
      await postDaemonResource('share', rest);
      return;
    case 'pull':
      await postDaemonResource('pull', rest);
      return;
    case 'detail':
      await runDetail(rest);
      return;
    case 'snapshot':
      await runSnapshot(rest);
      return;
    case 'public-snapshot':
      await runPublicSnapshot(rest);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      return;
    default:
      console.error(`unknown subcommand: od resource ${sub}`);
      printUsage();
      process.exitCode = 1;
  }
}
