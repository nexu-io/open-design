import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/asset-manifest.json'), 'utf8'));
const outDir = path.resolve(process.cwd(), process.argv[2] || path.join(root, 'assets/placeholders'));
await fs.mkdir(outDir, { recursive: true });

const dims = {
  '16:10': [1600,1000], '16:9':[1600,900], '3:2':[1500,1000], '4:3':[1400,1050], '4:5':[1200,1500]
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

for (const a of manifest.assets) {
  const [w,h] = dims[a.ratio] || [1400,1000];
  const isOverlay = a.derivation === 'vector-overlay';
  const bg = isOverlay ? 'none' : (a.id.startsWith('interior') ? '#82968b' : a.id.startsWith('detail') ? '#c4a58c' : a.id.startsWith('preservation') || a.id.startsWith('structure') ? '#cdd8cd' : '#e5decc');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2"/><feColorMatrix values="0 0 0 0 .18 0 0 0 0 .15 0 0 0 0 .11 0 0 0 .16 0"/></filter>
    <pattern id="grid" width="52" height="52" patternUnits="userSpaceOnUse"><path d="M52 0H0V52" fill="none" stroke="#9d3a30" stroke-opacity=".17"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="${bg}"/>
  ${isOverlay ? '<rect width="100%" height="100%" fill="url(#grid)"/><path d="M80 80H260M80 80V260M1320 920h-180m180 0V740" stroke="#9d3a30" stroke-width="2" fill="none"/>' : '<rect width="100%" height="100%" filter="url(#grain)" opacity=".42"/><circle cx="72%" cy="42%" r="26%" fill="#505851" fill-opacity=".08"/><path d="M192 780 C480 420, 864 820, 1376 260" fill="none" stroke="#505851" stroke-opacity=".13" stroke-width="2"/>'}
  <g font-family="ui-monospace,monospace" fill="${isOverlay ? '#9d3a30' : '#505851'}">
    <text x="6%" y="10%" font-size="26" letter-spacing="3">${esc(a.id)}</text>
    <text x="6%" y="15%" font-size="15" opacity=".55">${esc(a.asset_class)} · ${esc(a.derivation)} · ${esc(a.ratio)}</text>
    <text x="6%" y="89%" font-size="15" opacity=".62">${esc(a.prompt)}</text>
  </g>
  </svg>`;
  await fs.writeFile(path.join(outDir, a.placeholder), svg);
  console.log(`placeholder: ${a.placeholder}`);
}
