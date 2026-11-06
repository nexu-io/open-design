#!/usr/bin/env node
// Bake a curated handful of community pets from Codex Pet Share into
// the repo so they ship out-of-the-box without users having to hit the
// "Download community pets" button in Pet settings. The daemon scans
// `assets/community-pets/` alongside `${CODEX_HOME:-$HOME/.codex}/pets/`
// so anything written here shows up in the "Recently hatched" grid as
// a built-in pet that any user can adopt with one click.
//
// Run after editing the `BUNDLED_PETS` list below:
//   node --experimental-strip-types scripts/bake-community-pets.ts
//
// Flags:
//   --force         Re-download pets that already exist on disk.
//   --out <dir>     Destination folder (defaults to assets/community-pets).

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PETSHARE_BASE = 'https://ihzwckyzfcuktrljwpha.supabase.co/functions/v1/petshare';

// Hand-picked pets that should ship with the repo. Add to this list
// (and re-run this script) to bundle a new pet. Keep entries sorted
// alphabetically by id so review diffs stay clean.
const BUNDLED_PETS = [
  'clippit',
  'dario',
  'nyako-shigure',
  'slavik',
  'tux',
  'yelling-dario',
  'yorha-sit-2b',
];

interface PetShareDetail {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath?: string;
  ownerName?: string;
  tags?: string[];
  spritesheetUrl: string;
}

interface PetShareEnvelope {
  pet: PetShareDetail;
}

interface ParsedArgs {
  out: string;
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..');
  const args: ParsedArgs = {
    out: path.join(repoRoot, 'assets', 'community-pets'),
    force: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--force') {
      args.force = true;
      continue;
    }
    if (flag === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out expects a value');
      args.out = path.resolve(value);
      continue;
    }
    if (flag === '-h' || flag === '--help') {
      console.log('Usage: bake-community-pets.ts [--force] [--out <dir>]');
      process.exit(0);
    }
    throw new Error(`unknown flag: ${flag}`);
  }
  return args;
}

function extOf(url: string | undefined): 'webp' | 'png' | 'gif' {
  if (!url) return 'webp';
  const clean = url.split('?')[0] ?? '';
  const ext = clean.split('.').pop()?.toLowerCase() ?? 'webp';
  if (ext === 'png' || ext === 'gif') return ext;
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

async function fetchPetDetail(id: string): Promise<PetShareDetail> {
  const url = `${PETSHARE_BASE}/api/pets/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetch ${id}: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as PetShareEnvelope;
  if (!data?.pet?.id) throw new Error(`fetch ${id}: empty pet payload`);
  return data.pet;
}

async function downloadBinary(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`download ${url}: ${resp.status} ${resp.statusText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function isPlausibleSpritesheet(bytes: Buffer): boolean {
  if (bytes.length < 16) return false;
  const head = bytes.subarray(0, 12);
  const isWebp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  const isPng = head.toString('hex', 0, 8) === '89504e470d0a1a0a';
  const isGif = head.toString('ascii', 0, 6) === 'GIF87a' || head.toString('ascii', 0, 6) === 'GIF89a';
  return isWebp || isPng || isGif;
}

async function bakePet(id: string, outRoot: string, force: boolean): Promise<'wrote' | 'skipped'> {
  const detail = await fetchPetDetail(id);
  const ext = extOf(detail.spritesheetPath ?? detail.spritesheetUrl);
  const dir = path.join(outRoot, id);
  const sheetPath = path.join(dir, `spritesheet.${ext}`);
  const manifestPath = path.join(dir, 'pet.json');
  if (!force && (await pathExists(sheetPath)) && (await pathExists(manifestPath))) {
    return 'skipped';
  }
  const spritesheetUrl = detail.spritesheetUrl.startsWith('http')
    ? detail.spritesheetUrl
    : `${PETSHARE_BASE}${detail.spritesheetUrl}`;
  const bytes = await downloadBinary(spritesheetUrl);
  if (!isPlausibleSpritesheet(bytes)) {
    throw new Error(`${id}: spritesheet is not webp/png/gif`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(sheetPath, bytes);
  // Mirror the manifest shape the daemon's `listCodexPets` reader
  // expects, plus an explicit `source` block so the in-repo origin is
  // documented next to the bytes (handy when re-baking).
  const manifest = {
    id: detail.id,
    displayName: detail.displayName,
    description: detail.description ?? '',
    spritesheetPath: `spritesheet.${ext}`,
    author: detail.ownerName,
    tags: detail.tags ?? [],
    source: 'codex-pet-share',
    sourceUrl: `https://codex-pet-share.pages.dev/#/pets/${encodeURIComponent(detail.id)}`,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return 'wrote';
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(String((err as Error).message ?? err));
    process.exit(1);
  }
  console.log(`Destination: ${args.out}`);
  await mkdir(args.out, { recursive: true });

  let wrote = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of BUNDLED_PETS) {
    try {
      const result = await bakePet(id, args.out, args.force);
      if (result === 'wrote') {
        wrote++;
        console.log(`+ ${id}`);
      } else {
        skipped++;
        console.log(`= ${id} (skipped, use --force to re-download)`);
      }
    } catch (err) {
      failed++;
      console.error(`! ${id}: ${(err as Error).message ?? err}`);
    }
  }
  console.log(`\nDone. wrote=${wrote} skipped=${skipped} failed=${failed} (total=${BUNDLED_PETS.length})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
