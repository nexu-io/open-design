import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeFigFile, modifyNodes, encodeFigFile, type FigModifyOptions } from './convert-to-fig';
import { diffHtmlPatches } from './html-to-fig-patches';

const args = process.argv.slice(2);
let input = '';
let output = '';
let htmlOrig = '';
let htmlMod = '';
const rename: Record<string, string> = {};
const fillColor: Record<string, string> = {};
const cornerRadius: Record<string, number> = {};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--input' || a === '-i') input = args[++i] || '';
  else if (a === '--output' || a === '-o') output = args[++i] || '';
  else if (a === '--html-original') htmlOrig = args[++i] || '';
  else if (a === '--html-modified') htmlMod = args[++i] || '';
  else if (a === '--rename' && args[i + 1]) { const [id, name] = args[++i].split('='); if (id && name) rename[id] = name; }
  else if (a === '--fill' && args[i + 1]) { const [id, c] = args[++i].split('='); if (id && c) fillColor[id] = c; }
  else if (a === '--radius' && args[i + 1]) { const [id, r] = args[++i].split('='); if (id && r) cornerRadius[id] = parseFloat(r); }
  else if (a === '--help' || a === '-h') {
    console.log('figma-convert: Modify .fig files and re-encode');
    console.log('');
    console.log('Manual mode:');
    console.log('  node dist/convert-to-fig-cli.js -i input.fig -o output.fig [--rename id=Name] [--fill id=#fff] [--radius id=8]');
    console.log('');
    console.log('HTML diff mode (auto-extract patches from rendered HTML):');
    console.log('  node dist/convert-to-fig-cli.js -i original.fig -o modified.fig \\');
    console.log('    --html-original original.html --html-modified edited.html');
    process.exit(0);
  }
}

if (!input || !output) { console.error('Error: --input and --output required.'); process.exit(1); }

console.log(`Decoding: ${input}`);
const { doc } = decodeFigFile(input);
console.log(`  ${doc.nodes.length} nodes`);

// Build modification options
let opts: FigModifyOptions = { rename, fillColor, cornerRadius };

// HTML diff mode: auto-extract changes
if (htmlOrig && htmlMod) {
  console.log(`Diffing HTML: ${htmlOrig} → ${htmlMod}`);
  const origHtml = readFileSync(resolve(htmlOrig), 'utf-8');
  const modHtml = readFileSync(resolve(htmlMod), 'utf-8');
  const diff = diffHtmlPatches(origHtml, modHtml);
  // Merge: CLI options take precedence over diff
  opts = {
    ...diff,
    rename: { ...(diff.rename ?? {}), ...rename },
    fillColor: { ...(diff.fillColor ?? {}), ...fillColor },
    cornerRadius: { ...(diff.cornerRadius ?? {}), ...cornerRadius },
  };

  const summary: string[] = [];
  if (diff.removeNodes?.length) summary.push(`${diff.removeNodes.length} removed`);
  if (diff.position && Object.keys(diff.position).length) summary.push(`${Object.keys(diff.position).length} moved`);
  if (diff.size && Object.keys(diff.size).length) summary.push(`${Object.keys(diff.size).length} resized`);
  if (diff.fillColor && Object.keys(diff.fillColor).length) summary.push(`${Object.keys(diff.fillColor).length} recolored`);
  if (diff.text && Object.keys(diff.text).length) summary.push(`${Object.keys(diff.text).length} text changed`);
  if (diff.cornerRadius && Object.keys(diff.cornerRadius).length) summary.push(`${Object.keys(diff.cornerRadius).length} radius`);
  if (diff.opacity && Object.keys(diff.opacity).length) summary.push(`${Object.keys(diff.opacity).length} opacity`);
  console.log(`Extracted: ${summary.join(', ')}`);
}

console.log('Modifying...');
modifyNodes(doc.nodes, opts);

console.log('Encoding...');
const bytes = encodeFigFile(doc, { images: doc.images });
writeFileSync(resolve(output), bytes);
console.log(`Wrote: ${output} (${(bytes.length / 1024).toFixed(1)} KB)`);
