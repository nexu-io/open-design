import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = resolve(templateRoot, 'assets');
const manifestPath = resolve(templateRoot, 'references/assets.sha256');
const forbiddenCaptionArtifacts = new Map([
  ['assets/film-copper-hours.webp', '7ae98e9faab88a2331a687fe1e5c79d5458d39f8b61f141c29b5aeea67865a57'],
]);
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
  if (forbiddenCaptionArtifacts.get(relativePath) === actual) {
    throw new Error(`Visible generated caption artifact found: ${relativePath}`);
  }
  const binaryText = bytes.toString('latin1');
  if (/AI生成|WORKBUDD|Cinematic film poster still|AI-generated|AI generated/i.test(binaryText)) {
    throw new Error(`Watermark or generated-caption metadata found: ${relativePath}`);
  }
}

console.log(`GO MOVIE asset QA passed: ${manifest.length} clean WebP assets verified.`);
