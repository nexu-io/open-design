#!/usr/bin/env -S npx -y tsx
/** Generate deterministic, art-directed SVG placeholders for every image slot. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
interface Slot { id: string; file: string; width: number; height: number; ratio: string; prompt_section: string; }
interface Manifest { slots: Slot[] }

function svg(slot: Slot, index: number): string {
  const { width:w, height:h, id, ratio, prompt_section: hint } = slot;
  // `prompt_section` is a resolvable pointer to a heading in imagegen-prompts.md
  // ("work-1 — Aether Objects"), so it repeats the slot id. The plate already
  // prints the id on its own line; showing the subject keeps both roles intact.
  const subject = hint.replace(new RegExp(`^${id}\\s*[—–-]\\s*`, 'i'), '');
  const cx = Math.round(w * (.28 + (index % 3) * .18));
  const cy = Math.round(h * (.30 + (index % 2) * .22));
  const r = Math.round(Math.min(w,h) * (.18 + index * .014));
  const lineX = Math.round(w * (.62 + (index%2)*.08));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A0A0B"/><stop offset=".6" stop-color="#14151B"/><stop offset="1" stop-color="#0B0E11"/></linearGradient>
    <radialGradient id="orb"><stop offset="0" stop-color="#7CFFCB" stop-opacity=".88"/><stop offset=".35" stop-color="#4D7CFE" stop-opacity=".52"/><stop offset="1" stop-color="#4D7CFE" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(20, Math.round(w*.025))}"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${r*2.4}" fill="url(#orb)" filter="url(#blur)" opacity=".7"/>
  <g fill="none" stroke="#FFFFFF" stroke-opacity=".16">
    <circle cx="${cx}" cy="${cy}" r="${r}"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(r*.64)}" stroke-dasharray="5 12"/>
    <path d="M ${lineX} 0 V ${h}"/>
    <path d="M 0 ${Math.round(h*.78)} H ${w}"/>
  </g>
  <g transform="translate(${Math.round(w*.53)} ${Math.round(h*.18)})">
    <rect width="${Math.round(w*.28)}" height="${Math.round(h*.48)}" rx="${Math.round(w*.018)}" fill="#FFFFFF" fill-opacity=".055" stroke="#FFFFFF" stroke-opacity=".14"/>
    <rect x="${Math.round(w*.025)}" y="${Math.round(h*.035)}" width="${Math.round(w*.23)}" height="${Math.round(h*.19)}" rx="${Math.round(w*.012)}" fill="#4D7CFE" fill-opacity=".16"/>
    <path d="M ${Math.round(w*.04)} ${Math.round(h*.32)} C ${Math.round(w*.09)} ${Math.round(h*.26)}, ${Math.round(w*.14)} ${Math.round(h*.42)}, ${Math.round(w*.22)} ${Math.round(h*.30)}" fill="none" stroke="#7CFFCB" stroke-width="2" stroke-opacity=".72"/>
  </g>
  <rect width="100%" height="100%" filter="url(#grain)" opacity=".055"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#F4F4F1">
    <text x="${Math.round(w*.045)}" y="${Math.round(h*.08)}" font-size="${Math.max(18,Math.round(w*.015))}" letter-spacing="3" opacity=".85">DESIGN STUDIO / ${id.toUpperCase()}</text>
    <text x="${Math.round(w*.045)}" y="${Math.round(h*.89)}" font-size="${Math.max(14,Math.round(w*.011))}" letter-spacing="2" opacity=".45">${ratio} · ${w}×${h} · ${subject.toUpperCase()}</text>
    <text x="${Math.round(w*.045)}" y="${Math.round(h*.94)}" font-size="${Math.max(12,Math.round(w*.009))}" letter-spacing="1.5" opacity=".28">PLACEHOLDER / REPLACE WITH GENERATED OR ART-DIRECTED IMAGE</text>
  </g>
</svg>`;
}

async function main() {
  const out = resolve(process.cwd(), process.argv[2] || './assets/');
  const manifest = JSON.parse(await readFile(resolve(ROOT,'assets/image-manifest.json'),'utf8')) as Manifest;
  await mkdir(out,{recursive:true});
  for (const [idx,slot] of manifest.slots.entries()) {
    await writeFile(resolve(out,slot.file), svg(slot,idx), 'utf8');
    console.log(`· ${slot.id} → ${resolve(out,slot.file)}`);
  }
}
main().catch(err=>{console.error(err);process.exit(1)});
