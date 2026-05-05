// Daemon-side port of `scripts/sync-community-pets.ts`. Downloads pets
// from the public Codex Pet Share + j20 Hatchery catalogs into the
// `${CODEX_HOME:-$HOME/.codex}/pets/` registry that `codex-pets.ts`
// scans. Surfaced via `POST /api/codex-pets/sync` so the web Pet
// settings can offer a one-click refresh of the community catalog.
//
// Kept identical in spirit to the CLI script; tweaks here should be
// mirrored there (and vice versa) until both grow a shared package.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveCodexPetsRoot } from './codex-pets.js';

const PETSHARE_BASE = 'https://ihzwckyzfcuktrljwpha.supabase.co/functions/v1/petshare';
const HATCHERY_LIST = 'https://j20.nz/hatchery/api/pets.json';

export interface SyncOptions {
  // 'petshare' | 'hatchery' | 'all' — controls which catalogs we hit.
  source?: 'petshare' | 'hatchery' | 'all';
  // Re-download pets that already have a folder on disk.
  force?: boolean;
  // Cap the number of pets per source (handy for smoke tests).
  limit?: number | null;
  // Parallel downloads (defaults to 6).
  concurrency?: number;
}

export interface SyncResult {
  // How many pets were freshly written to disk.
  wrote: number;
  // Pets that already had a complete folder and were left alone.
  skipped: number;
  // Pets that errored during list / download / write.
  failed: number;
  // Total pets considered after de-duplication across catalogs.
  total: number;
  // Absolute path of the on-disk pet root we wrote into.
  rootDir: string;
  // Up to a handful of human-readable error messages — surfaced in the
  // UI so users get actionable feedback when a transient catalog hiccup
  // breaks an otherwise-good run.
  errors: string[];
}

interface PetTask {
  source: 'petshare' | 'hatchery';
  folder: string;
  manifest: Record<string, unknown>;
  spritesheetUrl: string;
  spritesheetExt: 'webp' | 'png' | 'gif';
}

interface PetShareItem {
  id?: string;
  displayName?: string;
  description?: string;
  spritesheetPath?: string;
  spritesheetUrl?: string;
  ownerName?: string;
  tags?: string[];
}

interface PetShareListResponse {
  pets?: PetShareItem[];
  totalPages?: number;
}

interface HatcheryItem {
  id?: string;
  petManifestId?: string;
  displayName?: string;
  description?: string;
  spritesheetUrl?: string;
  authorLabel?: string;
  authorXUrl?: string;
  galleryUrl?: string;
}

interface HatcheryListResponse {
  pets?: HatcheryItem[];
}

function sanitizeFolder(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
}

function extOf(url: string | undefined): 'webp' | 'png' | 'gif' {
  const clean = (url || '').split('?')[0] ?? '';
  const ext = clean.split('.').pop()?.toLowerCase() ?? 'webp';
  if (ext === 'webp' || ext === 'png' || ext === 'gif') return ext;
  return 'webp';
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listPetSharePets(limit: number | null): Promise<PetTask[]> {
  const tasks: PetTask[] = [];
  let page = 1;
  const pageSize = 24;
  for (;;) {
    const url = `${PETSHARE_BASE}/api/pets?page=${page}&pageSize=${pageSize}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`petshare list page ${page} failed: ${resp.status} ${resp.statusText}`);
    }
    const data = (await resp.json()) as PetShareListResponse;
    for (const pet of data.pets ?? []) {
      const folder = sanitizeFolder(pet.id);
      if (!folder) continue;
      const spritesheetUrl = pet.spritesheetUrl?.startsWith('http')
        ? pet.spritesheetUrl
        : `${PETSHARE_BASE}${pet.spritesheetUrl ?? ''}`;
      const ext = extOf(pet.spritesheetPath ?? spritesheetUrl);
      tasks.push({
        source: 'petshare',
        folder,
        manifest: {
          id: pet.id,
          displayName: pet.displayName,
          description: pet.description ?? '',
          spritesheetPath: `spritesheet.${ext}`,
          author: pet.ownerName,
          tags: pet.tags ?? [],
          source: 'codex-pet-share',
          sourceUrl: `https://codex-pet-share.pages.dev/#/pets/${encodeURIComponent(pet.id ?? '')}`,
        },
        spritesheetUrl,
        spritesheetExt: ext,
      });
      if (limit && tasks.length >= limit) return tasks;
    }
    if (page >= (data.totalPages ?? 1)) break;
    page++;
  }
  return tasks;
}

async function listHatcheryPets(limit: number | null): Promise<PetTask[]> {
  const resp = await fetch(HATCHERY_LIST);
  if (!resp.ok) {
    throw new Error(`hatchery list failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as HatcheryListResponse;
  const tasks: PetTask[] = [];
  for (const pet of data.pets ?? []) {
    const folder = sanitizeFolder(pet.petManifestId || pet.id);
    if (!folder) continue;
    if (!pet.spritesheetUrl) continue;
    tasks.push({
      source: 'hatchery',
      folder,
      manifest: {
        id: pet.petManifestId || pet.id,
        displayName: pet.displayName,
        description: pet.description ?? '',
        spritesheetPath: 'spritesheet.webp',
        author: pet.authorLabel,
        authorXUrl: pet.authorXUrl,
        source: 'j20-hatchery',
        sourceUrl: pet.galleryUrl,
      },
      spritesheetUrl: pet.spritesheetUrl,
      spritesheetExt: extOf(pet.spritesheetUrl),
    });
    if (limit && tasks.length >= limit) break;
  }
  return tasks;
}

async function downloadBinary(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`download ${url} failed: ${resp.status} ${resp.statusText}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function writePet(
  task: PetTask,
  outRoot: string,
  force: boolean,
): Promise<'wrote' | 'skipped'> {
  const dir = path.join(outRoot, task.folder);
  const sheetPath = path.join(dir, `spritesheet.${task.spritesheetExt}`);
  const manifestPath = path.join(dir, 'pet.json');
  if (!force && (await pathExists(sheetPath)) && (await pathExists(manifestPath))) {
    return 'skipped';
  }
  await mkdir(dir, { recursive: true });
  const bytes = await downloadBinary(task.spritesheetUrl);
  if (bytes.length < 16) {
    throw new Error(`${task.folder}: spritesheet too small (${bytes.length} bytes)`);
  }
  // Reject HTML error pages dressed as `.webp` so the UI doesn't end up
  // adopting a pet whose sprite is `<!doctype html>`.
  const head = bytes.subarray(0, 12);
  const isWebp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  const isPng = head.toString('hex', 0, 8) === '89504e470d0a1a0a';
  const isGif = head.toString('ascii', 0, 6) === 'GIF87a' || head.toString('ascii', 0, 6) === 'GIF89a';
  if (!isWebp && !isPng && !isGif) {
    throw new Error(`${task.folder}: spritesheet is not webp/png/gif`);
  }
  await writeFile(sheetPath, bytes);
  await writeFile(manifestPath, JSON.stringify(task.manifest, null, 2) + '\n', 'utf8');
  return 'wrote';
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx]!, idx);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function syncCommunityPets(options: SyncOptions = {}): Promise<SyncResult> {
  const sourceArg = options.source ?? 'all';
  const sources = new Set<'petshare' | 'hatchery'>();
  if (sourceArg === 'all' || sourceArg === 'petshare') sources.add('petshare');
  if (sourceArg === 'all' || sourceArg === 'hatchery') sources.add('hatchery');
  const force = Boolean(options.force);
  const limit =
    options.limit && Number.isFinite(options.limit) ? Math.max(1, options.limit) : null;
  const concurrency =
    options.concurrency && Number.isFinite(options.concurrency)
      ? Math.max(1, options.concurrency)
      : 6;

  const rootDir = resolveCodexPetsRoot();
  await mkdir(rootDir, { recursive: true });

  const errors: string[] = [];
  const tasks: PetTask[] = [];

  if (sources.has('petshare')) {
    try {
      tasks.push(...(await listPetSharePets(limit)));
    } catch (err) {
      errors.push((err as Error).message ?? String(err));
    }
  }
  if (sources.has('hatchery')) {
    try {
      tasks.push(...(await listHatcheryPets(limit)));
    } catch (err) {
      errors.push((err as Error).message ?? String(err));
    }
  }

  // Earlier sources win when two catalogs publish the same folder name
  // — matches the CLI script's de-duplication so a sync from the UI
  // produces the same on-disk layout as `pnpm sync:community-pets`.
  const dedup = new Map<string, PetTask>();
  for (const task of tasks) {
    if (!dedup.has(task.folder)) dedup.set(task.folder, task);
  }
  const unique = Array.from(dedup.values());

  let wrote = 0;
  let skipped = 0;
  let failed = 0;
  await runPool(unique, concurrency, async (task) => {
    try {
      const result = await writePet(task, rootDir, force);
      if (result === 'wrote') wrote++;
      else skipped++;
    } catch (err) {
      failed++;
      const message = (err as Error).message ?? String(err);
      // Cap the surfaced errors so a fully-broken catalog doesn't ship
      // a 200KB JSON response; the daemon log keeps the rest.
      if (errors.length < 10) errors.push(`${task.folder}: ${message}`);
    }
  });

  return {
    wrote,
    skipped,
    failed,
    total: unique.length,
    rootDir,
    errors,
  };
}
