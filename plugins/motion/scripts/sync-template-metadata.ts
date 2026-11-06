import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { momentsMetadataUrl, normalizeTemplateMetadata } from '../shared/template-metadata.ts';

const directory = new URL('../web/catalog/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('hyperframes.json', directory), 'utf8'));
const response = await fetch(momentsMetadataUrl, { signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw new Error(`Hyperframes 模板热度读取失败：${response.status}`);
const raw = await response.text();
const snapshot = normalizeTemplateMetadata(catalog.entries, JSON.parse(raw), new Date().toISOString());
if (!snapshot.entries.length) throw new Error('未匹配到原模板，保留现有数据');
snapshot.source.sha256 = createHash('sha256').update(raw).digest('hex');
const modified = response.headers.get('last-modified');
if (modified) snapshot.source.lastModified = modified;
const output = new URL('metadata.json', directory), temp = new URL('metadata.json.tmp', directory);
await writeFile(temp, JSON.stringify(snapshot, null, 2) + '\n');
await rename(temp, output);
console.log(`已同步 ${snapshot.entries.length} 条模板分类，其中 ${snapshot.entries.filter(entry => entry.views !== undefined).length} 条有原帖热度数据。`);
