import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the complete checked-in snapshot, never a hand-picked replacement list.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-hyperframes.ts /path/to/personal-video-agent');
const sourceRoot = path.resolve(source, 'apps/web/public/home');
const target = fileURLToPath(new URL('../web/catalog/', import.meta.url));
const raw = await readFile(path.join(sourceRoot, 'hyperframes.json'));
const catalog = JSON.parse(raw.toString());
if (catalog.version !== 1 || !Array.isArray(catalog.entries) || new Set(catalog.entries.map((entry: { id: string }) => entry.id)).size !== catalog.entries.length) throw new Error('Invalid source catalog');
const frames = JSON.parse(await readFile(path.join(sourceRoot, 'template-frames.json'), 'utf8'));
await mkdir(path.join(target, 'template-frames'), { recursive: true });
for (const frame of frames.frames) {
  if (!/^\/home\/template-frames\/[a-f0-9]{24}\.jpg$/.test(frame.poster)) throw new Error('Invalid poster path');
  const entry = catalog.entries.find((item: { id: string }) => item.id === frame.id);
  if (!entry || frame.video !== entry.video) throw new Error('Poster does not match its reference video');
  await copyFile(path.join(sourceRoot, frame.poster.slice('/home/'.length)), path.join(target, 'template-frames', path.basename(frame.poster)));
  frame.poster = frame.poster.replace('/home/', '/web/catalog/');
}
await writeFile(path.join(target, 'hyperframes.json'), raw);
await writeFile(path.join(target, 'template-frames.json'), JSON.stringify(frames, null, 2) + '\n');
await writeFile(path.join(target, 'provenance.json'), JSON.stringify({ source: 'personal-video-agent/apps/web/public/home/hyperframes.json', sha256: createHash('sha256').update(raw).digest('hex'), entries: catalog.entries.length, syncedAt: catalog.syncedAt, sources: catalog.sources, posters: frames.frames.length }, null, 2) + '\n');
console.log(`Imported all ${catalog.entries.length} Hyperframes entries and ${frames.frames.length} matching local posters.`);
