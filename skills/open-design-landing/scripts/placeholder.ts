#!/usr/bin/env -S npx -y tsx
/**
 * open-design-landing — SVG framework placeholder generator.
 *
 * When `imagery.strategy === 'placeholder'`, this script writes one
 * paper-textured SVG file per slot in `assets/image-manifest.json`.
 * The generated files live alongside the schema-named PNGs that the
 * composer references (`hero.png`, `about.png`, `lab-1.png`, …) so
 * the layout renders fully without any image budget.
 *
 * Each placeholder shows: slot id · ratio · pixel dimensions · the
 * `prompt_section` hint copied from the manifest. Drop the real PNG
 * with the same filename to swap in production imagery; no markup
 * change required.
 *
 * Usage:
 *   npx tsx scripts/placeholder.ts <out-dir>
 *
 * Default out-dir is `./assets/`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface ManifestSlot {
  id: string;
  file: string;
  width: number;
  height: number;
  ratio: string;
  prompt_section: string;
  required: boolean;
  rekey_on_brand_change: boolean;
}

interface Manifest {
  skill: string;
  design_system: string;
  slots: ManifestSlot[];
}

const PAPER = '#efe7d2';
const INK_FAINT = '#8b8676';
const CORAL = '#ed6f5c';
const LINE = 'rgba(21, 20, 15, 0.16)';

/** Compose a single paper-textured SVG for one slot. */
export function placeholderSvg(slot: ManifestSlot): string {
  const w = slot.width;
  const h = slot.height;
  const cx = w / 2;
  const cy = h / 2;
  const isPortrait = h > w;
  const titleSize = Math.round(Math.min(w, h) * (isPortrait ? 0.075 : 0.07));
  const metaSize = Math.round(Math.min(w, h) * 0.028);
  const dimsSize = Math.round(Math.min(w, h) * 0.024);

  // Inner frame inset.
  const inset = Math.round(Math.min(w, h) * 0.04);
  const frame = {
    x: inset,
    y: inset,
    w: w - inset * 2,
    h: h - inset * 2,
  };

  // Diagonal strokes for the classic "image goes here" cross.
  const cross = `
    <line x1='${frame.x}' y1='${frame.y}' x2='${frame.x + frame.w}' y2='${frame.y + frame.h}' stroke='${INK_FAINT}' stroke-opacity='0.22' stroke-width='1' />
    <line x1='${frame.x + frame.w}' y1='${frame.y}' x2='${frame.x}' y2='${frame.y + frame.h}' stroke='${INK_FAINT}' stroke-opacity='0.22' stroke-width='1' />
  `;

  const cornerLen = Math.round(Math.min(w, h) * 0.05);
  const corners = `
    <path d='M${frame.x} ${frame.y + cornerLen} L${frame.x} ${frame.y} L${frame.x + cornerLen} ${frame.y}' stroke='${INK_FAINT}' fill='none' stroke-width='1.5' />
    <path d='M${frame.x + frame.w - cornerLen} ${frame.y} L${frame.x + frame.w} ${frame.y} L${frame.x + frame.w} ${frame.y + cornerLen}' stroke='${INK_FAINT}' fill='none' stroke-width='1.5' />
    <path d='M${frame.x} ${frame.y + frame.h - cornerLen} L${frame.x} ${frame.y + frame.h} L${frame.x + cornerLen} ${frame.y + frame.h}' stroke='${INK_FAINT}' fill='none' stroke-width='1.5' />
    <path d='M${frame.x + frame.w - cornerLen} ${frame.y + frame.h} L${frame.x + frame.w} ${frame.y + frame.h} L${frame.x + frame.w} ${frame.y + frame.h - cornerLen}' stroke='${INK_FAINT}' fill='none' stroke-width='1.5' />
  `;

  return `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'>
  <defs>
    <filter id='paper'>
      <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.07 0'/>
    </filter>
  </defs>
  <!-- paper base -->
  <rect width='${w}' height='${h}' fill='${PAPER}' />
  <rect width='${w}' height='${h}' filter='url(#paper)' />
  <!-- frame -->
  <rect x='${frame.x}' y='${frame.y}' width='${frame.w}' height='${frame.h}' fill='none' stroke='${LINE}' stroke-dasharray='6 6' />
  ${cross}
  ${corners}
  <!-- coral plate index, top-left -->
  <text x='${inset + 14}' y='${inset + 26}' font-family='Inter Tight, system-ui, sans-serif' font-size='${dimsSize}' font-weight='600' letter-spacing='2' fill='${CORAL}'>PLATE · ${slot.id.toUpperCase()}</text>
  <!-- coordinates, top-right -->
  <text x='${w - inset - 14}' y='${inset + 26}' text-anchor='end' font-family='JetBrains Mono, monospace' font-size='${dimsSize}' fill='${INK_FAINT}'>${w} × ${h} · ${slot.ratio}</text>
  <!-- centered title block -->
  <text x='${cx}' y='${cy - titleSize * 0.2}' text-anchor='middle' font-family='Playfair Display, serif' font-style='italic' font-weight='500' font-size='${titleSize}' fill='#15140f'>${escapeXml(slot.id)}</text>
  <text x='${cx}' y='${cy + metaSize * 1.6}' text-anchor='middle' font-family='Inter Tight, system-ui, sans-serif' font-size='${metaSize}' letter-spacing='3' fill='${INK_FAINT}'>${escapeXml(slot.prompt_section.toUpperCase())}</text>
  <!-- bottom slug -->
  <text x='${inset + 14}' y='${h - inset - 14}' font-family='Inter Tight, system-ui, sans-serif' font-size='${dimsSize}' letter-spacing='2' fill='${INK_FAINT}'>${slot.required ? 'REQUIRED' : 'OPTIONAL'} · ${slot.rekey_on_brand_change ? 'REKEY ON BRAND' : 'STABLE'}</text>
  <text x='${w - inset - 14}' y='${h - inset - 14}' text-anchor='end' font-family='Inter Tight, system-ui, sans-serif' font-size='${dimsSize}' letter-spacing='2' fill='${INK_FAINT}'>OPEN DESIGN · ATELIER ZERO</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function loadManifest(): Promise<Manifest> {
  const path = resolve(SKILL_ROOT, 'assets', 'image-manifest.json');
  return JSON.parse(await readFile(path, 'utf8')) as Manifest;
}

/**
 * Write `<out>/<slot.file>` for every slot. The composer references
 * slots by .png filename; we honor that by writing `<basename>.svg`
 * AND a `<basename>.png.svg` symlink-style fallback. Most static
 * hosts serve SVG to <img> just fine, so the practical convention
 * is: if you want placeholders, point your `imagery.assets_path` at
 * a directory of `.svg` files OR rename the SVGs to `.png` (some
 * browsers honor extensionless content-sniffing).
 *
 * For the most reliable result, write BOTH:
 *   - `<id>.svg`   — clean, editable
 *   - `<file>`     — same SVG content under the .png filename so the
 *                    composer's `<img src='./assets/<id>.png'>` works
 *                    without changing markup.
 */
export async function writePlaceholders(outDir: string): Promise<string[]> {
  const manifest = await loadManifest();
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const slot of manifest.slots) {
    const svg = placeholderSvg(slot);
    const svgPath = resolve(outDir, `${slot.id}.svg`);
    const pngPath = resolve(outDir, slot.file);
    await writeFile(svgPath, svg, 'utf8');
    await writeFile(pngPath, svg, 'utf8');
    written.push(svgPath, pngPath);
  }
  return written;
}

async function main(): Promise<void> {
  const [, , outArg] = process.argv;
  const out = isAbsolute(outArg ?? '')
    ? outArg!
    : resolve(process.cwd(), outArg ?? './assets/');
  const written = await writePlaceholders(out);
  const pngs = written.filter((p) => p.endsWith('.png')).length;
  const svgs = written.filter((p) => p.endsWith('.svg')).length;
  console.log(`✓ wrote ${pngs} png-named placeholders + ${svgs} svg files into ${out}`);
  console.log(`  (${written.map((p) => basename(p)).join(', ')})`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
