import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { agentPrompt, loadCatalog, orderedTemplates, resourceUrl, type Locale, type MotionReference } from './catalog.ts';

const args = process.argv.slice(2);
let locale: Locale = 'zh-CN';
let output: string | undefined;
let concurrency = 4;
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === '--help') {
    process.stdout.write('node scripts/motion-templates/download.ts [--locale en|zh-CN] [--output directory] [--concurrency 1..8]\n');
    process.exit(0);
  }
  const value = args[++index];
  if (!value) throw new Error(`Missing value for ${argument}`);
  if (argument === '--locale' && (value === 'en' || value === 'zh-CN')) locale = value;
  else if (argument === '--output') output = value;
  else if (argument === '--concurrency' && /^[1-8]$/.test(value)) concurrency = Number(value);
  else throw new Error(`Invalid argument: ${argument} ${value}`);
}

const catalog = await loadCatalog();
const items = orderedTemplates(catalog);
const directory = path.resolve(output ?? `.tmp/motion-guides-${locale}`);
const packagesDirectory = path.join(directory, 'packages');
const promptsDirectory = path.join(directory, 'agent-prompts');
await mkdir(packagesDirectory, { recursive: true });
await mkdir(promptsDirectory, { recursive: true });
const lock = path.join(directory, '.download.lock');
await writeFile(lock, `${process.pid}\n`, { flag: 'wx' }).catch(() => {
  throw new Error(`Another download may own ${directory}. Use a different output directory or inspect .download.lock.`);
});

async function readExisting(filename: string): Promise<Buffer | null> {
  try { return await readFile(filename); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Publish complete bytes without replacing an existing user file. */
async function createFile(filename: string, data: Buffer | string): Promise<void> {
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  const existing = await readExisting(filename);
  if (existing) {
    if (!existing.equals(bytes)) throw new Error(`Existing output differs; preserve it and choose a new directory: ${filename}`);
    return;
  }
  const temporary = `${filename}.${randomUUID()}.part`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try { await link(temporary, filename); }
  finally { await unlink(temporary); }
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let downloaded = 0;
let reused = 0;
let completed = 0;
let cursor = 0;
const failures: string[] = [];

async function download(item: MotionReference): Promise<void> {
  const url = item.packageUrl[locale];
  const expected = resourceUrl.exec(url)?.[1];
  if (!expected) throw new Error(`Invalid package URL: ${item.code}`);
  const filename = path.join(packagesDirectory, `${item.code}.motion.md.zip`);
  const previous = await readExisting(filename);
  if (previous) {
    if (digest(previous) !== expected) throw new Error(`Existing package has changed; preserve it and choose a new output directory: ${item.code}`);
    reused++;
  } else {
    let bytes: Buffer | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000), credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const candidate = Buffer.from(await response.arrayBuffer());
        if (digest(candidate) !== expected || candidate[0] !== 80 || candidate[1] !== 75) throw new Error('Published ZIP checksum or format does not match.');
        bytes = candidate;
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (!bytes) throw new Error(`No package received: ${item.code}`);
    await createFile(filename, bytes);
    downloaded++;
  }
  await createFile(path.join(promptsDirectory, `${item.code}.txt`), `${agentPrompt(item, locale)}\n`);
}

async function worker(): Promise<void> {
  while (cursor < items.length) {
    const item = items[cursor++];
    if (!item) return;
    try { await download(item); }
    catch (error) { failures.push(`${item.code}: ${error instanceof Error ? error.message : String(error)}`); }
    completed++;
    if (completed % 20 === 0 || completed === items.length) process.stdout.write(`Verified ${completed - failures.length}/${items.length} packages (${failures.length} failures).\n`);
  }
}

try {
  const savedCatalog = { ...catalog, selectedLocale: locale, templates: items };
  await createFile(path.join(directory, 'catalog.json'), `${JSON.stringify(savedCatalog, null, 2)}\n`);
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failures.length) throw new Error(`${failures.length} packages failed; verified files were preserved for retry.\n${failures.slice(0, 12).join('\n')}`);
  const zh = locale === 'zh-CN';
  const index = [
    `# ${zh ? 'Motion.md 说明包合集' : 'Motion.md package collection'}`,
    '',
    `${items.length} ${zh ? '份原始说明包，前 40 条采用精选顺序。未包含预览 MP4 或完整可编辑视频工程。' : 'original guide packages, with the featured 40 first. Preview MP4s and ready-to-edit video projects are not included.'}`,
    '',
    zh ? '选择条目后，解压对应 ZIP 阅读 motion.md，或把 agent-prompts 中的指令交给 Agent，并补充你的文案和素材。' : 'Choose an entry and extract its ZIP to read motion.md, or send its agent-prompts text file to your agent with your brief and assets.',
    '',
    ...items.map((item, position) => `${position + 1}. **${item.code} · ${item.title[locale]}** — [Motion.md ZIP](packages/${item.code}.motion.md.zip) · [${zh ? 'Agent 指令' : 'Agent brief'}](agent-prompts/${item.code}.txt) · [${zh ? '查看说明' : 'Guide'}](${item.guideUrl[locale]}) · [${zh ? '预览' : 'Preview'}](${item.previewUrl})`),
    '',
    `Source publication: ${catalog.source.publicationId} (${catalog.source.version}).`,
    '',
  ].join('\n');
  await createFile(path.join(directory, 'README.md'), index);
  process.stdout.write(`${JSON.stringify({ complete: true, total: items.length, downloaded, reused, locale, directory })}\n`);
} finally {
  await unlink(lock);
}
