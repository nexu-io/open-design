#!/usr/bin/env -S pnpm exec tsx
/**
 * Full-chain end-to-end verifier for Spec E resource sharing. Drives the REAL
 * daemon resource client/SDK and the REAL `od` binary against a REAL resource
 * hub (the vela API's /api/v1/resources/* surface) backed by real Postgres +
 * object store. Not part of the unit suite — it needs a running hub.
 *
 * Prerequisites:
 *   - A resource hub reachable at OD_RESOURCE_HUB_URL (default the folded vela
 *     API on http://localhost:18080), backed by real Postgres + MinIO/R2.
 *   - `pnpm --filter @open-design/daemon build` (this imports from ../dist).
 *
 * Usage:
 *   OD_RESOURCE_HUB_URL=http://localhost:18080 \
 *   OD_RESOURCE_HUB_TOKEN=dev-internal-token \
 *   pnpm exec tsx apps/daemon/scripts/verify-resource-real-vela.ts
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

interface ResourceHubPrincipal {
  memberId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'member';
  lifecycleState: string | null;
}

interface ResourceHubErrorLike extends Error {
  status: number;
  code: string;
}

interface ResourceHubErrorConstructor {
  new (status: number, code: string, message?: string): ResourceHubErrorLike;
}

interface ResourceRecord {
  id: string;
}

interface VersionRecord {
  id: string;
  version: number;
  manifestDigest: string;
}

interface ManifestEntryInput {
  path: string;
  type: 'file' | 'dir' | 'symlink';
  executable?: boolean;
  blobDigest?: string | null;
  symlinkTarget?: string | null;
}

interface PackedTree {
  manifestDigest: string;
  entries: ManifestEntryInput[];
  blobs: Map<string, Uint8Array>;
}

interface ResourceHubClient {
  listResources(principal: ResourceHubPrincipal): Promise<ResourceRecord[]>;
  getResource(
    principal: ResourceHubPrincipal,
    resourceId: string,
  ): Promise<ResourceRecord>;
  createResource(
    principal: ResourceHubPrincipal,
    input: { kind: string },
  ): Promise<ResourceRecord>;
  findMissingBlobs(
    principal: ResourceHubPrincipal,
    digests: string[],
  ): Promise<string[]>;
  publishVersion(
    principal: ResourceHubPrincipal,
    resourceId: string,
    input: { manifestDigest: string; entries: ManifestEntryInput[] },
  ): Promise<VersionRecord>;
}

interface ResourceHubModule {
  ResourceHubError: ResourceHubErrorConstructor;
  createResourceHubClient(options: {
    config: { baseUrl: string; internalToken: string };
  }): ResourceHubClient;
}

interface ResourceDriveModule {
  packTree(rootDir: string): Promise<PackedTree>;
  pushTree(
    client: ResourceHubClient,
    principal: ResourceHubPrincipal,
    resourceId: string,
    packed: PackedTree,
    options?: { ref?: string; expectedVersionId?: string | null },
  ): Promise<VersionRecord>;
  materializeRef(
    client: ResourceHubClient,
    principal: ResourceHubPrincipal,
    resourceId: string,
    ref: string,
    destDir: string,
  ): Promise<void>;
}

const { createResourceHubClient, ResourceHubError } = (await import(
  path.join(HERE, '..', 'dist', 'integrations', 'resource-hub.js')
)) as ResourceHubModule;
const { packTree, pushTree, materializeRef } = (await import(
  path.join(HERE, '..', 'dist', 'resource-drive.js')
)) as ResourceDriveModule;

const BASE = process.env.OD_RESOURCE_HUB_URL || 'http://localhost:18080';
const TOKEN = process.env.OD_RESOURCE_HUB_TOKEN || 'dev-internal-token';
const OD_BIN = path.join(HERE, '..', 'bin', 'od.mjs');

const client = createResourceHubClient({ config: { baseUrl: BASE, internalToken: TOKEN } });
const owner = (
  team: string,
  member: string,
  life: string | null = null,
): ResourceHubPrincipal => ({
  memberId: member,
  teamId: team,
  role: 'owner',
  lifecycleState: life,
});

let passed = 0;
let failed = 0;
function ok(label: string): void {
  passed += 1;
  console.log(`  PASS ${label}`);
}
function bad(label: string, detail: string): void {
  failed += 1;
  console.log(`  FAIL ${label} - ${detail}`);
}

function describeError(error: unknown): string {
  if (error instanceof ResourceHubError) {
    return `${error.status} ${error.code}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isExitError(error: unknown): error is Error & { code?: unknown } {
  return error instanceof Error && 'code' in error;
}

async function expectError(
  label: string,
  status: number,
  code: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    bad(label, 'expected error, call succeeded');
  } catch (error) {
    if (error instanceof ResourceHubError && error.status === status && error.code === code) {
      ok(`${label} -> ${status} ${code}`);
    } else {
      bad(label, `got ${describeError(error)}`);
    }
  }
}

async function seedTree(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rv-src-'));
  await writeFile(path.join(dir, 'tokens.json'), '{"c":"blue"}');
  await mkdir(path.join(dir, 'sub'));
  await writeFile(path.join(dir, 'sub', 'note.md'), '# real-vela');
  return dir;
}

console.log(`full-chain resource E2E against ${BASE}`);

// --- 1. happy path via the real SDK -> real hub -> real store --------------
console.log('sdk happy path (real client/SDK):');
const uid = Date.now().toString(36);
const ownerA = owner(`rv-team-${uid}`, 'rv-owner');
const resource = await client.createResource(ownerA, { kind: 'design_system' });
const packed = await packTree(await seedTree());
const v1 = await pushTree(client, ownerA, resource.id, packed, { ref: 'latest' });
ok(`pushTree -> resource ${resource.id} v${v1.version} (${packed.blobs.size} blobs)`);

const dest = await mkdtemp(path.join(tmpdir(), 'rv-dst-'));
await materializeRef(client, ownerA, resource.id, 'latest', dest);
const a = await readFile(path.join(dest, 'tokens.json'), 'utf8');
const b = await readFile(path.join(dest, 'sub', 'note.md'), 'utf8');
if (a === '{"c":"blue"}' && b === '# real-vela') ok('materializeRef byte round-trip'); else bad('materializeRef', `${a} | ${b}`);

// dedup + monotonic on identical re-push
const packed2 = await packTree(await seedTree());
const v2 = await pushTree(client, ownerA, resource.id, packed2, { ref: 'latest', expectedVersionId: v1.id });
if (v2.version === v1.version + 1 && packed2.manifestDigest === packed.manifestDigest) ok('dedup + monotonic version'); else bad('dedup/version', `${v2.version} ${packed2.manifestDigest}`);

// --- 2. error matrix through the real client -> real hub -------------------
console.log('error matrix (real client):');
const badClient = createResourceHubClient({ config: { baseUrl: BASE, internalToken: 'wrong' } });
await expectError('wrong internal token', 401, 'untrusted_caller', () => badClient.listResources(ownerA));
await expectError('get missing resource', 404, 'resource_not_found', () => client.getResource(ownerA, 'nope'));
await expectError('malformed digest', 400, 'invalid_request', () => client.findMissingBlobs(ownerA, ['bad']));
await expectError('frozen create', 403, 'resource_frozen', () => client.createResource(owner(ownerA.teamId, 'x', 'locked'), { kind: 'design_system' }));
await expectError('stale ref conflict', 409, 'ref_conflict', () => pushTree(client, ownerA, resource.id, packed, { ref: 'latest', expectedVersionId: 'stale' }));
await expectError('non-creator publish', 403, 'forbidden', () => client.publishVersion(owner(ownerA.teamId, 'other'), resource.id, { manifestDigest: packed.manifestDigest, entries: packed.entries }));
await expectError('cross-team get', 404, 'resource_not_found', () => client.getResource(owner('rv-other', 'z'), resource.id));

// --- 3. real `od` binary against the same hub ------------------------------
console.log('od binary (real CLI):');
const cliEnv = {
  ...process.env,
  OD_RESOURCE_HUB_URL: BASE,
  OD_RESOURCE_HUB_TOKEN: TOKEN,
  OD_WORKSPACE_MEMBER_ID: 'rv-cli',
  OD_WORKSPACE_TEAM_ID: `rv-cli-${uid}`,
  OD_WORKSPACE_ROLE: 'owner',
};
const cliSrc = await seedTree();
const put = await run('node', [OD_BIN, 'resource', 'put', cliSrc, '--kind', 'design_system', '--ref', 'latest'], { env: cliEnv });
const rid = put.stdout.match(/resource (\S+)/)?.[1];
if (rid) {
  ok(`od resource put -> ${rid}`);
  const list = await run('node', [OD_BIN, 'resource', 'list'], { env: cliEnv });
  if (list.stdout.includes(rid)) ok('od resource list shows it'); else bad('od resource list', list.stdout);
  const cliDest = await mkdtemp(path.join(tmpdir(), 'rv-cli-dst-'));
  await run('node', [OD_BIN, 'resource', 'get', rid, cliDest], { env: cliEnv });
  const got = await readFile(path.join(cliDest, 'tokens.json'), 'utf8');
  if (got === '{"c":"blue"}') ok('od resource get byte round-trip'); else bad('od resource get', got);
  try {
    await run('node', [OD_BIN, 'resource', 'get', 'no-such-id', cliDest], { env: cliEnv });
    bad('od resource get <missing>', 'expected non-zero exit');
  } catch (error) {
    if (isExitError(error) && error.code === 1) ok('od resource get <missing> -> exit 1'); else bad('od get missing', `exit ${isExitError(error) ? String(error.code) : '?'}`);
  }
} else {
  bad('od resource put', put.stdout + put.stderr);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
