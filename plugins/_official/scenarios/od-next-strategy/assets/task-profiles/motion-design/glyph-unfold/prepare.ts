import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const resourceDir = path.dirname(fileURLToPath(import.meta.url));
const names = ['guide.md', 'runtime.html', 'prepare.ts'] as const;
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const inside = (value: string, root: string) => value === root || value.startsWith(root + path.sep);

async function regular(file: string) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular file: ' + file);
  return readFile(file);
}

/** Inspect the actual files; a successful check is availability, not adoption. */
export async function checkGlyphUnfold(input: { resourceHash: string; appliedSnapshot?: string }) {
  if (!/^[a-f0-9]{64}$/.test(input.resourceHash)) throw new Error('Use the resource hash from the current Motion skill.');
  const staged = path.basename(path.dirname(resourceDir)) === '.od-motion';
  let owner: { appliedSnapshot?: unknown; packageHash?: unknown; files?: Record<string, { sha256?: unknown; bytes?: unknown }> } | undefined;
  if (staged) {
    if (path.basename(resourceDir) !== 'glyph-unfold' || !input.appliedSnapshot) throw new Error('Use the current recipe_identity.applied_snapshot for staged OD Next resources.');
    for (const dir of [resourceDir, path.dirname(resourceDir)]) {
      const stat = await lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Staged resource directories must be real directories.');
    }
    owner = JSON.parse(utf8(await regular(path.join(resourceDir, '.ownership.json'))));
    if (owner?.appliedSnapshot !== input.appliedSnapshot || typeof owner.packageHash !== 'string' || !/^[a-f0-9]{64}$/.test(owner.packageHash)
      || !owner.files || Object.keys(owner.files).sort().join(',') !== [...names].sort().join(',')) throw new Error('Resources do not match the current applied snapshot.');
  } else if (input.appliedSnapshot) throw new Error('An OD Next snapshot must use its staged .od-motion/glyph-unfold bundle.');
  const hash = createHash('sha256');
  const files: Record<string, { sha256: string; bytes: number }> = {};
  for (const name of names) {
    const bytes = await regular(path.join(resourceDir, name)); utf8(bytes);
    files[name] = { sha256: sha(bytes), bytes: bytes.length };
    if (owner && (owner.files![name]?.sha256 !== files[name]!.sha256 || owner.files![name]?.bytes !== bytes.length)) throw new Error('Staged resource changed: ' + name);
    hash.update(name + '\0').update(bytes);
  }
  const resourceHash = hash.digest('hex');
  if (resourceHash !== input.resourceHash) throw new Error('Resource bytes differ from the current Motion skill; continue ordinary Motion authoring.');
  return { usable: true, reference: 'glyph-unfold', version: 1, resourceHash,
    sourceKind: staged ? 'od-next-profile' : 'skill-side-files',
    ...(owner ? { appliedSnapshot: owner.appliedSnapshot, packageHash: owner.packageHash } : {}), files };
}

/** Write only a new local module directory. The caller owns its film source. */
export async function prepareGlyphUnfold(input: { resourceHash: string; appliedSnapshot?: string; outDir: string; fontFile?: string; fontLicense?: string }) {
  const identity = await checkGlyphUnfold(input);
  const requested = path.resolve(input.outDir);
  const parent = path.dirname(requested), stat = await lstat(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output parent must be a real existing directory.');
  const outDir = path.join(await realpath(parent), path.basename(requested));
  if (inside(outDir, resourceDir) || inside(resourceDir, outDir)) throw new Error('Output must be separate from reference resources.');
  try { await lstat(outDir); throw new Error('Output already exists; choose a new module directory.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const runtimeBytes = await regular(path.join(resourceDir, 'runtime.html'));
  if (sha(runtimeBytes) !== identity.files['runtime.html']!.sha256) throw new Error('Runtime changed after the resource check.');
  const html = utf8(runtimeBytes);
  const runtime = html.match(/<script data-od-glyph-unfold-runtime>([\s\S]*?)<\/script>/)?.[1];
  if (!runtime) throw new Error('Local glyph runtime is incomplete.');
  let font: { file: string; license: string } | undefined;
  let fontBytes: Buffer | undefined, licenseBytes: Buffer | undefined;
  if (input.fontFile || input.fontLicense) {
    if (!input.fontFile || !input.fontLicense) throw new Error('A supplied font needs its license file.');
    const extension = path.extname(input.fontFile).toLowerCase();
    if (!['.woff2', '.woff', '.ttf', '.otf'].includes(extension)) throw new Error('Supply WOFF2/WOFF/TTF/OTF font bytes.');
    fontBytes = await regular(input.fontFile); licenseBytes = await regular(input.fontLicense);
    font = { file: 'font' + extension, license: 'font-license.txt' };
  }
  await mkdir(outDir); // Exclusive leaf creation: never replace a composition.
  await writeFile(path.join(outDir, 'runtime.js'), runtime, { flag: 'wx' });
  if (font) {
    await writeFile(path.join(outDir, font.file), fontBytes!, { flag: 'wx' });
    await writeFile(path.join(outDir, font.license), licenseBytes!, { flag: 'wx' });
  }
  const receipt = { ...identity, status: 'prepared', outDir, runtimeSha256: sha(runtime),
    ...(font ? { font } : {}), rendered: false, retainedInFinalSource: 'unknown' };
  await writeFile(path.join(outDir, 'reference-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  const args = new Map<string, string>(); let check = false;
  try {
    for (let index = 2; index < process.argv.length; index++) {
      const key = process.argv[index]!;
      if (key === '--check') { check = true; continue; }
      if (!['--resource-hash', '--applied-snapshot', '--out-dir', '--font-file', '--font-license'].includes(key) || !process.argv[index + 1] || args.has(key)) throw new Error('Use --check --resource-hash <current hash> [--applied-snapshot <current id>], or add --out-dir <new module directory> [--font-file <file> --font-license <file>].');
      args.set(key, process.argv[++index]!);
    }
    const identity = { resourceHash: args.get('--resource-hash') ?? '', appliedSnapshot: args.get('--applied-snapshot') };
    if (!check && !args.get('--out-dir')) throw new Error('Supply a new --out-dir.');
    const result = check ? await checkGlyphUnfold(identity) : await prepareGlyphUnfold({ ...identity, outDir: args.get('--out-dir')!, fontFile: args.get('--font-file'), fontLicense: args.get('--font-license') });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) { process.stderr.write((error as Error).message + '\n'); process.exitCode = 1; }
}
