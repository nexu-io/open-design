import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = resolve(templateRoot, 'assets');
const manifestPath = resolve(templateRoot, 'references/assets.sha256');
const manifest = readFileSync(manifestPath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Invalid asset manifest line: ${line}`);
    return { expected: match[1], relativePath: match[2] };
  });

const expectedNames = new Set(manifest.map(({ relativePath }) => basename(relativePath)));
const actualNames = new Set(readdirSync(assetsRoot));
const unexpected = [...actualNames].filter((name) => !expectedNames.has(name));
if (unexpected.length) throw new Error(`Unexpected asset files: ${unexpected.join(', ')}`);

for (const { expected, relativePath } of manifest) {
  const filePath = resolve(templateRoot, relativePath);
  const bytes = readFileSync(filePath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Asset checksum mismatch: ${relativePath}`);
  const binaryText = bytes.toString('latin1');
  if (/AI生成|WORKBUDD/i.test(binaryText)) throw new Error(`Watermark metadata found: ${relativePath}`);
}

console.log(`GO MOVIE asset QA passed: ${manifest.length} clean WebP assets verified.`);
