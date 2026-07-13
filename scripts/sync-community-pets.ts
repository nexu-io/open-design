#!/usr/bin/env node
// Sync community Codex pets from the public catalogs into the local
// `${CODEX_HOME:-$HOME/.codex}/pets/` registry that the daemon scans
// in `apps/daemon/src/codex-pets.ts`. Once synced, every pet shows up
// under Settings → Pets → Recently hatched and can be adopted with a
// single click — no manual `pet.json` / `spritesheet.webp` upload.
//
// Sources:
//   - Codex Pet Share (https://codex-pet-share.pages.dev) — paginated
//     Supabase Functions endpoint, ~170 pets at the time of writing.
//   - j20 Hatchery (https://j20.nz/hatchery)              — single-shot
//     JSON catalog, ~30 pets at the time of writing.
//
// Both catalogs serve a `pet.json` (Codex pet contract) and a
// `spritesheet.webp` (8x9 atlas) per pet, so we just persist them to
// disk in the canonical Codex layout.
//
// Usage:
//   node --experimental-strip-types scripts/sync-community-pets.ts
//   node --experimental-strip-types scripts/sync-community-pets.ts --out /tmp/pets
//   node --experimental-strip-types scripts/sync-community-pets.ts --source petshare
//   node --experimental-strip-types scripts/sync-community-pets.ts --force
//
// Flags:
//   --out <dir>         Destination root. Defaults to
//                       `${CODEX_HOME:-$HOME/.codex}/pets`.
//   --source <name>     'petshare' | 'hatchery' | 'all' (default).
//   --force             Re-download pets that already have a folder.
//   --limit <n>         Stop after N pets per source (handy for smoke
//                       tests).
//   --concurrency <n>   Parallel downloads. Defaults to 6.
//   --no-pet-share      Skip the petshare catalog.
//   --no-hatchery       Skip the hatchery catalog.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PETSHARE_BASE = 'https://ihzwckyzfcuktrljwpha.supabase.co/functions/v1/petshare';
const HATCHERY_LIST = 'https://j20.nz/hatchery/api/pets.json';

interface Args {
  out: string;
  sources: Set<'petshare' | 'hatchery'>;
  force: boolean;
  limit: number | null;
  concurrency: number;
}

interface PetTask {
  source: 'petshare' | 'hatchery';
  // Slug-safe folder name under <out>/.
  folder: string;
  // Manifest written verbatim to <folder>/pet.json.
  manifest: Record<string, unknown>;
  // URL of the spritesheet binary.
  spritesheetUrl: string;
  // Detected file extension ('webp' | 'png' | 'gif').
  spritesheetExt: string;
}

function parseArgs(argv: string[]): Args {
  const home = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  const args: Args = {
    out: path.join(home, 'pets'),
    sources: new Set(['petshare', 'hatchery']),
    force: false,
    limit: null,
    concurrency: 6,
  };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`flag ${flag} expects a value`);
      return v;
    };
    switch (flag) {
      case '--out':
        args.out = path.resolve(next());
        break;
      case '--source': {
        const value = next();
        if (value === 'all') {
          args.sources = new Set(['petshare', 'hatchery']);
        } else if (value === 'petshare' || value === 'hatchery') {
          args.sources = new Set([value]);
        } else {
          throw new Error(`unknown --source value: ${value}`);
        }
        break;
      }
      case '--no-pet-share':
        args.sources.delete('petshare');
        break;
      case '--no-hatchery':
        args.sources.delete('hatchery');
        break;
      case '--force':
        args.force = true;
        break;
      case '--limit':
        args.limit = Math.max(1, Number.parseInt(next(), 10));
        break;
      case '--concurrency':
        args.concurrency = Math.max(1, Number.parseInt(next(), 10));
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Sync community Codex pets into ~/.codex/pets

Usage:
  node --experimental-strip-types scripts/sync-community-pets.ts [flags]

Flags:
  --out <dir>         Destination root (default: $CODEX_HOME/pets or ~/.codex/pets)
  --source <name>     petshare | hatchery | all (default: all)
  --no-pet-share      Skip the Codex Pet Share catalog
  --no-hatchery       Skip the j20 Hatchery catalog
  --force             Re-download pets that already exist on disk
  --limit <n>         Cap each source at N pets (for smoke tests)
  --concurrency <n>   Parallel downloads (default: 6)
  -h, --help          Show this message`);
}

function sanitizeFolder(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
}

function extOf(url: string): string {
  const clean = url.split('?')[0] ?? '';
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

interface PetSharePet {
  id: string;
  displayName: string;
  description: string;
  ownerName?: string;
  tags?: string[];
  spritesheetUrl: string;
  spritesheetPath?: string;
}

interface PetShareResponse {
  pets: PetSharePet[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
    const data = (await resp.json()) as PetShareResponse;
    for (const pet of data.pets) {
      const folder = sanitizeFolder(pet.id);
      if (!folder) continue;
      const spritesheetUrl = pet.spritesheetUrl.startsWith('http')
        ? pet.spritesheetUrl
        : `${PETSHARE_BASE}${pet.spritesheetUrl}`;
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
          sourceUrl: `https://codex-pet-share.pages.dev/#/pets/${encodeURIComponent(pet.id)}`,
        },
        spritesheetUrl,
        spritesheetExt: ext,
      });
      if (limit && tasks.length >= limit) return tasks;
    }
    if (page >= data.totalPages) break;
    page++;
  }
  return tasks;
}

interface HatcheryPet {
  id: string;
  displayName: string;
  description: string;
  petManifestId?: string;
  authorLabel?: string;
  authorXUrl?: string;
  galleryUrl?: string;
  petJsonUrl: string;
  spritesheetUrl: string;
  downloadCount?: number;
  createdAt?: string;
}

interface HatcheryResponse {
  source: string;
  count: number;
  pets: HatcheryPet[];
}

async function listHatcheryPets(limit: number | null): Promise<PetTask[]> {
  const resp = await fetch(HATCHERY_LIST);
  if (!resp.ok) {
    throw new Error(`hatchery list failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as HatcheryResponse;
  const tasks: PetTask[] = [];
  for (const pet of data.pets) {
    // Prefer the human-readable manifest id when available — that is
    // what users see in their `~/.codex/pets/` listing.
    const folder = sanitizeFolder(pet.petManifestId || pet.id);
    if (!folder) continue;
    // We will rewrite pet.json from the live `petJsonUrl` content, but
    // also keep our enriched fields so users can trace the origin.
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
  // Validate the magic bytes minimally — abort writes when the server
  // returns an HTML error page (every catalog has had transient hiccups
  // at some point), so callers do not end up with `.webp` files that
  // are actually `<!doctype html>`.
  if (bytes.length < 16) {
    throw new Error(`${task.folder}: spritesheet too small (${bytes.length} bytes)`);
  }
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
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(String((err as Error).message ?? err));
    printHelp();
    process.exit(1);
  }

  if (args.sources.size === 0) {
    console.error('No sources selected — nothing to do.');
    process.exit(1);
  }

  console.log(`Destination: ${args.out}`);
  await mkdir(args.out, { recursive: true });

  const tasks: PetTask[] = [];
  if (args.sources.has('petshare')) {
    process.stdout.write('Fetching codex-pet-share catalog…');
    const list = await listPetSharePets(args.limit);
    process.stdout.write(` ${list.length} pets\n`);
    tasks.push(...list);
  }
  if (args.sources.has('hatchery')) {
    process.stdout.write('Fetching j20 hatchery catalog…');
    const list = await listHatcheryPets(args.limit);
    process.stdout.write(` ${list.length} pets\n`);
    tasks.push(...list);
  }

  if (tasks.length === 0) {
    console.log('No pets to download.');
    return;
  }

  // Earlier sources win when two catalogs publish the same folder name
  // (e.g. an upstream "goku" appears in both feeds). De-duplicate so we
  // do not race two writers on the same folder.
  const dedup = new Map<string, PetTask>();
  for (const task of tasks) {
    if (!dedup.has(task.folder)) dedup.set(task.folder, task);
  }
  const unique = Array.from(dedup.values());

  let wrote = 0;
  let skipped = 0;
  let failed = 0;
  await runPool(unique, args.concurrency, async (task) => {
    try {
      const result = await writePet(task, args.out, args.force);
      if (result === 'wrote') {
        wrote++;
        console.log(`+ ${task.source.padEnd(8)} ${task.folder}`);
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`! ${task.source.padEnd(8)} ${task.folder}: ${(err as Error).message}`);
    }
  });

  console.log(`\nDone. wrote=${wrote} skipped=${skipped} failed=${failed} (total=${unique.length})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
