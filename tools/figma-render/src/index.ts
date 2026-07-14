import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFig, nodeId } from 'openfig-core';
import { renderNode } from './renderer';

function main(): void {
  const args = process.argv.slice(2);
  let input = '';
  let output = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') input = args[++i] || '';
    else if (args[i] === '--output' || args[i] === '-o') output = args[++i] || '';
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('figma-render: Pixel-accurate .fig → HTML renderer');
      console.log('');
      console.log('Usage:');
      console.log('  node dist/index.js --input <file.fig> --output <dir>');
      console.log('');
      console.log('Options:');
      console.log('  -i, --input   Input .fig file (required)');
      console.log('  -o, --output  Output directory (required)');
      console.log('  -h, --help    Show this help');
      process.exit(0);
    }
  }

  if (!input || !output) {
    console.error('Error: --input and --output are required.');
    process.exit(1);
  }

  console.log(`Parsing: ${input}`);
  const buffer = readFileSync(resolve(input));
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = parseFig(data);

  // Rebuild in-memory tree: openfig-core stores hierarchy in childrenMap, not node.children
  for (const node of doc.nodes) {
    const id = nodeId(node as any);
    if (!id) continue;
    const children = doc.childrenMap.get(id) ?? [];
    (node as any).children = children;
  }

  console.log(`  ${doc.nodes.length} nodes, ${doc.images.size} images`);
  console.log(`  Header: ${doc.header.prelude} v${doc.header.version}`);

  // Collect CANVAS pages
  const pages = doc.nodes.filter((n: any) => n.type === 'CANVAS');
  console.log(`  ${pages.length} pages`);

  const outDir = resolve(output);
  mkdirSync(outDir, { recursive: true });

  // Extract images
  let imagesBase = '';
  if (doc.images.size > 0) {
    const assetsDir = join(outDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    let count = 0;
    for (const [hash, bytes] of doc.images) {
      const safe = hash.replace(/[^a-f0-9]/gi, '').slice(0, 32);
      const ext = detectImageExt(bytes as Uint8Array);
      writeFileSync(join(assetsDir, `${safe}.${ext}`), bytes as Buffer);
      count++;
    }
    console.log(`  Extracted ${count} images to assets/`);
    imagesBase = 'assets';
  }

  // Render each page as a separate HTML file
  for (const page of pages) {
    const pageName = (page as any).name || `page-${pages.indexOf(page) + 1}`;
    const safeName = pageName.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 60);
    const html = buildPageHtml(page as any, doc, { imagesBase });
    const filePath = join(outDir, `${safeName}.html`);
    writeFileSync(filePath, html, 'utf-8');
    console.log(`  ${safeName}.html (${html.length} bytes)`);
  }

  // Build index.html linking all pages
  const indexHtml = buildIndexHtml(pages as any[]);
  writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf-8');
  console.log(`  index.html`);
  console.log('');
  console.log('Done! Open the output directory in a browser.');
}

function buildPageHtml(page: any, doc: any, opts: { imagesBase?: string }): string {
  const bg = page.fillPaints?.[0]?.color
    ? `rgba(${Math.round(page.fillPaints[0].color.r * 255)},${Math.round(page.fillPaints[0].color.g * 255)},${Math.round(page.fillPaints[0].color.b * 255)},${page.fillPaints[0].color.a ?? 1})`
    : '#ffffff';

  const w = page.size?.x ?? page.absoluteBoundingBox?.width ?? 1440;
  const h = page.size?.y ?? page.absoluteBoundingBox?.height ?? 900;

  const childrenHtml = (page.children ?? [])
    .map((c: any) => renderNode(c, 1, opts, null))
    .filter(Boolean)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(page.name || 'Figma Page')}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 20px; }
.od-page-wrap { background: ${bg}; position: relative; width: ${w}px; height: ${h}px; overflow: hidden; box-shadow: 0 4px 30px rgba(0,0,0,0.3); transform-origin: top center; }
</style>
</head>
<body>
<div class="od-page-wrap">
${indent(childrenHtml, 2)}
</div>
</body>
</html>`;
}

function buildIndexHtml(pages: any[]): string {
  const links = pages.map((p: any) => {
    const name = p.name || 'Untitled';
    const safeName = name.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 60);
    return `<li><a href="${safeName}.html">${escapeHtml(name)}</a></li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Figma Render</title>
<style>
body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; padding: 40px; }
ul { list-style: none; padding: 0; }
li { margin: 8px 0; }
a { color: #4da6ff; text-decoration: none; font-size: 18px; }
a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div>
<h1>Figma Render</h1>
<ul>
${links}
</ul>
</div>
</body>
</html>`;
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line.trim() ? pad + line : line)).join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function detectImageExt(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  if (bytes.length > 0 && bytes[0] === 0x3c) return 'svg';
  return 'bin';
}

main();
