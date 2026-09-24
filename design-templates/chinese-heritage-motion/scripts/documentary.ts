import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputPath = path.resolve(process.cwd(), process.argv[2] || path.join(root, 'inputs.example.json'));
const inputs = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const sources = inputs.imagery.documentary_sources || [];

if (!sources.length) {
  console.error('No documentary_sources supplied. Add explicit source/licensing metadata to inputs.json.');
  process.exitCode = 2;
} else {
  for (const s of sources) {
    const status = s.license_status === 'verified' ? 'OK' : 'REVIEW';
    console.log(`${status} ${s.asset_id}`);
    console.log(`  source: ${s.source_url}`);
    console.log(`  author: ${s.author || 'unknown'}`);
    console.log(`  license: ${s.license || 'unknown'} (${s.license_status})`);
    if (s.license_url) console.log(`  license url: ${s.license_url}`);
  }
  if (sources.some(s => s.license_status !== 'verified')) {
    console.error('\nAt least one documentary source is not license-verified; do not treat it as cleared for publication.');
    process.exitCode = 3;
  }
}
