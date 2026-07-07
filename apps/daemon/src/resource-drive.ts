import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type {
  ManifestEntryInput,
  ResourceHubClient,
  ResourceHubPrincipal,
  VersionRecord,
} from './integrations/resource-hub.js';

// Neutral cloud-drive SDK over the resource hub. Kind-agnostic: it moves
// directory trees to/from the hub as content-addressed manifests + blobs, and
// knows nothing about design-systems / plugins / skills or WHEN to sync — that
// is the consumer's concern. Consumers build features ("share a design system")
// on top of these primitives; this layer stays a neutral cloud drive.

const DIGEST_ALGORITHM = 'sha256';

function digestBytes(bytes: Uint8Array): string {
  return `${DIGEST_ALGORITHM}:${createHash(DIGEST_ALGORITHM)
    .update(bytes)
    .digest('hex')}`;
}

export interface PackedTree {
  manifestDigest: string;
  entries: ManifestEntryInput[];
  // Content-addressed file bytes, deduped by digest — the blobs to upload.
  blobs: Map<string, Uint8Array>;
}

// Canonical manifest digest: sort entries by path and hash a stable
// serialization. The hub trusts (does not recompute) this digest, so the only
// requirement is that the daemon computes it deterministically.
export function computeManifestDigest(entries: ManifestEntryInput[]): string {
  const canonical = [...entries]
    .sort(byPath)
    .map((entry) =>
      [
        entry.type,
        entry.executable ? '1' : '0',
        entry.blobDigest ?? '',
        entry.symlinkTarget ?? '',
        entry.path,
      ].join('\t'),
    )
    .join('\n');
  return `${DIGEST_ALGORITHM}:${createHash(DIGEST_ALGORITHM)
    .update(canonical)
    .digest('hex')}`;
}

function byPath(a: { path: string }, b: { path: string }): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

// Walk a directory into a content-addressed tree. Paths are stored relative to
// rootDir with forward slashes (canonical). Directories are recorded explicitly
// so empty dirs survive; symlinks are stored by target without following.
export async function packTree(rootDir: string): Promise<PackedTree> {
  const entries: ManifestEntryInput[] = [];
  const blobs = new Map<string, Uint8Array>();

  async function walk(absDir: string, relDir: string): Promise<void> {
    const dirents = await fsp.readdir(absDir, { withFileTypes: true });
    for (const dirent of dirents) {
      const abs = path.join(absDir, dirent.name);
      const rel = relDir ? `${relDir}/${dirent.name}` : dirent.name;
      if (dirent.isSymbolicLink()) {
        entries.push({
          path: rel,
          type: 'symlink',
          symlinkTarget: await fsp.readlink(abs),
        });
      } else if (dirent.isDirectory()) {
        entries.push({ path: rel, type: 'dir' });
        await walk(abs, rel);
      } else if (dirent.isFile()) {
        const bytes = new Uint8Array(await fsp.readFile(abs));
        const digest = digestBytes(bytes);
        if (!blobs.has(digest)) blobs.set(digest, bytes);
        const stat = await fsp.stat(abs);
        entries.push({
          path: rel,
          type: 'file',
          executable: (stat.mode & 0o111) !== 0,
          blobDigest: digest,
        });
      }
      // Other node types (sockets/fifos/devices) are not representable — skip.
    }
  }

  await walk(rootDir, '');
  return { manifestDigest: computeManifestDigest(entries), entries, blobs };
}

// Push a packed tree as a new version: upload only the blobs the store is
// missing, then publish. Optionally move a ref (with optimistic concurrency).
export async function pushTree(
  client: ResourceHubClient,
  principal: ResourceHubPrincipal,
  resourceId: string,
  packed: PackedTree,
  options: { ref?: string; expectedVersionId?: string | null } = {},
): Promise<VersionRecord> {
  const missing = await client.findMissingBlobs(principal, [
    ...packed.blobs.keys(),
  ]);
  for (const digest of missing) {
    const bytes = packed.blobs.get(digest);
    if (!bytes) continue;
    await client.pushBlob(principal, { digest, bytes });
  }
  return client.publishVersion(principal, resourceId, {
    manifestDigest: packed.manifestDigest,
    entries: packed.entries,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
    ...(options.expectedVersionId === undefined
      ? {}
      : { expectedVersionId: options.expectedVersionId }),
  });
}

// Materialize a manifest's tree into destDir. Pulls only file blobs. Uses a
// hardened join so a hostile path or symlink target cannot escape destDir
// (Spec E §2.7 safe landing).
export async function materializeTree(
  client: ResourceHubClient,
  principal: ResourceHubPrincipal,
  manifestDigest: string,
  destDir: string,
): Promise<void> {
  const manifest = await client.getManifest(principal, manifestDigest);
  const root = path.resolve(destDir);
  // Sort by path so parent directories are created before their children.
  for (const entry of [...manifest.entries].sort(byPath)) {
    const target = safeJoin(root, entry.path);
    if (entry.type === 'dir') {
      await fsp.mkdir(target, { recursive: true });
    } else if (entry.type === 'symlink') {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      assertContained(
        root,
        path.resolve(path.dirname(target), entry.symlinkTarget ?? ''),
      );
      await fsp.symlink(entry.symlinkTarget ?? '', target);
    } else if (entry.type === 'file' && entry.blobDigest) {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(
        target,
        await client.pullBlob(principal, entry.blobDigest),
      );
      if (entry.executable) await fsp.chmod(target, 0o755);
    }
  }
}

// Resolve a ref to its version's manifest and materialize it. Convenience over
// getRef + listVersions so consumers don't re-implement the lookup.
export async function materializeRef(
  client: ResourceHubClient,
  principal: ResourceHubPrincipal,
  resourceId: string,
  ref: string,
  destDir: string,
): Promise<VersionRecord> {
  const refRecord = await client.getRef(principal, resourceId, ref);
  const versions = await client.listVersions(principal, resourceId);
  const version = versions.find((candidate) => candidate.id === refRecord.versionId);
  if (!version) {
    throw new Error(`ref ${ref} points at unknown version ${refRecord.versionId}`);
  }
  await materializeTree(client, principal, version.manifestDigest, destDir);
  return version;
}

function safeJoin(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath);
  assertContained(root, resolved);
  return resolved;
}

function assertContained(root: string, resolved: string): void {
  const rel = path.relative(root, resolved);
  if (rel === '') return;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`unsafe path escapes destination: ${resolved}`);
  }
}
