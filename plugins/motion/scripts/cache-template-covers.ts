import { readFile, writeFile, mkdir, rename, rm, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isCatalogMedia } from '../shared/catalog.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'web/catalog/covers');
const catalog = JSON.parse(await readFile(path.join(root, 'web/catalog/hyperframes.json'), 'utf8'));
const frames = JSON.parse(await readFile(path.join(root, 'web/catalog/template-frames.json'), 'utf8')).frames;
const prior = new Map<string, { source: string; method: string }>((await readFile(path.join(root, 'web/catalog/covers.json'), 'utf8').then(JSON.parse, () => ({ entries: [] }))).entries.map((entry: { id: string; source: string; method: string }) => [entry.id, entry]));
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
await mkdir(directory, { recursive: true });
function run(args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let errors = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors += chunk);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(errors.slice(-150) || 'Cover conversion timed out')); });
  });
}
async function usable(file: string) {
  try {
    const pixels = await run(['-i', file, '-vf', 'scale=32:32', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
    if (pixels.length !== 3072) return false;
    const mean = pixels.reduce((sum, n) => sum + n, 0) / pixels.length;
    const deviation = Math.sqrt(pixels.reduce((sum, n) => sum + (n - mean) ** 2, 0) / pixels.length);
    return deviation >= 8 && mean > 3 && mean < 252;
  } catch { return false; }
}
const results: any[] = [], unavailable: string[] = [];
let cursor = 0, done = 0;
async function processEntry(entry: any) {
  const existing = frames.find((frame: any) => frame.id === entry.id && frame.video === entry.video);
  const source = entry.videoAvailable !== false && entry.video ? entry.video : entry.poster;
  const name = createHash('sha256').update(entry.id + ':' + (source || '')).digest('hex').slice(0, 24) + '.jpg';
  const target = path.join(directory, name), temp = target + '.download';
  const keep = (method: string, sourceUrl: string) => results.push({ id: entry.id, video: entry.video, source: sourceUrl, poster: '/web/catalog/covers/' + name, method });
  if (await access(target).then(() => true, () => false) && await usable(target)) { const cached = prior.get(entry.id); keep(cached?.method || 'cached', cached?.source || source); return; }
  if (existing && await usable(path.join(root, existing.poster))) {
    await copyFile(path.join(root, existing.poster), target); keep('source-frame', entry.video); return;
  }
  if (entry.poster && entry.posterAvailable !== false && isCatalogMedia(entry.poster)) {
    try {
      const response = await fetch(entry.poster, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Poster unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 4 * 1024 * 1024) throw new Error('Poster too large');
      await writeFile(temp, bytes);
      if (await usable(temp)) {
        await run(['-i', temp, '-vf', 'scale=min(640\\,iw):-2', '-frames:v', '1', '-q:v', '4', '-y', target]);
        keep('poster', entry.poster); return;
      }
    } catch {} finally { await rm(temp, { force: true }); }
  }
  if (entry.video && entry.videoAvailable !== false && isCatalogMedia(entry.video)) {
    try {
      await run(['-rw_timeout', '10000000', '-ss', '0.5', '-i', entry.video, '-vf', 'thumbnail=48,scale=min(640\\,iw):-2', '-frames:v', '1', '-q:v', '4', '-y', target]);
      if (await usable(target)) { keep('video-frame', entry.video); return; }
    } catch {}
  }
  await rm(target, { force: true }); unavailable.push(entry.id);
}
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < catalog.entries.length) {
    const entry = catalog.entries[cursor++];
    await processEntry(entry); done++;
    if (done % 50 === 0) console.log(`${done}/${catalog.entries.length}: ${results.length} verified covers`);
  }
}));
results.sort((a, b) => a.id.localeCompare(b.id)); unavailable.sort();
const output = path.join(root, 'web/catalog/covers.json');
await writeFile(output + '.tmp', JSON.stringify({ version: 1, entries: results, unavailable }, null, 2) + '\n');
await rename(output + '.tmp', output);
console.log(`Saved ${results.length} verified original covers; ${unavailable.length} entries remain in the full catalog but are hidden from the visual gallery.`);
