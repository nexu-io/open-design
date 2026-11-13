import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputPath = path.resolve(process.cwd(), process.argv[2] || path.join(root, 'inputs.example.json'));
const inputs = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/asset-manifest.json'), 'utf8'));
const promptDoc = await fs.readFile(path.join(root, 'assets/imagegen-prompts.md'), 'utf8');

const documented = inputs.subject.facts.filter(f => f.status === 'documented').map(f => `- ${f.text}`).join('\n');
const dna = Object.entries(inputs.visual_system.dna).map(([k,v]) => `- ${k}: ${v}`).join('\n');
const overrides = inputs.imagery.prompts || {};

function promptFor(asset) {
  return `${promptDoc}\n\nSUBJECT\n${inputs.subject.name_zh} / ${inputs.subject.name_en}\nPeriod: ${inputs.subject.period}\nLocation: ${inputs.subject.location}\nStructural type: ${inputs.subject.structural_type}\n\nDOCUMENTED FACTS ONLY\n${documented || '- none supplied'}\n\nSUBJECT DNA\n${dna}\n\nSLOT\n${overrides[asset.id] || asset.prompt}\nResponsive focus: desktop ${asset.responsive_focus.desktop.join(',')} / mobile ${asset.responsive_focus.mobile.join(',')}\n\nOUTPUT DISCIPLINE\nNo text, no labels, no logo. Preserve architectural plausibility. If this is a scene master, it becomes the camera truth for derived depth/masks.`;
}

const args = process.argv.slice(3);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const execute = args.includes('--execute');
if (execute && args.includes('--dry-run')) throw new Error('Choose --execute or --dry-run');
const model = option('--model');
const filesDir = option('--files-dir');
const project = option('--project') || process.env.OD_PROJECT_ID;
if (execute && (!model || !filesDir || !project)) throw new Error('--execute requires --model, --project (or OD_PROJECT_ID), and --files-dir (the local project files directory)');
const used = new Set(inputs.chapters.flatMap(c => c.asset_ids));
const targets = manifest.assets.filter(a => used.has(a.id) && a.derivation === 'source');
const selected = option('--slot');
if (selected && !targets.some(a => a.id === selected)) throw new Error(`Unknown source slot: ${selected}`);
const outputInputs = path.join(path.dirname(inputPath), 'inputs.generated.json');
const checkpoint = JSON.parse(JSON.stringify(inputs));
try {
  const previous = JSON.parse(await fs.readFile(outputInputs, 'utf8'));
  if (previous.subject.name_zh === inputs.subject.name_zh) checkpoint.imagery.provided_assets = { ...previous.imagery.provided_assets, ...inputs.imagery.provided_assets };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
checkpoint.imagery.strategy = 'generate';
checkpoint.imagery.provided_assets ||= {};
function cli(args, prompt = '') {
  return new Promise((resolve, reject) => {
    const command = process.env.OD_BIN ? (process.env.OD_NODE_BIN || process.execPath) : 'od';
    const prefix = process.env.OD_BIN ? [process.env.OD_BIN] : [];
    const child = spawn(command, [...prefix, 'media', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 && code !== 2) return reject(new Error(`od media exited ${code}; no automatic resubmission`));
      try { resolve({ code, data: JSON.parse(stdout.trim().split('\n').at(-1)) }); }
      catch { reject(new Error('Invalid media JSON response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}
for (const asset of targets.filter(a => !selected || a.id === selected)) {
  const prompt = `${promptFor(asset)}\nFrame: ${asset.ratio}. Leave ${Math.round(asset.overscan * 100)}% overscan for camera motion. This is an interpretive image, not historical photographic evidence.`;
  if (!execute) { console.log(JSON.stringify({ id: asset.id, ratio: asset.ratio, prompt })); continue; }
  try { await fs.access(path.join(path.dirname(inputPath), `pending-${asset.id}.json`)); throw new Error(`Pending job exists for ${asset.id}; resume with od media wait and map its returned file before removing the pending record.`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prior = checkpoint.imagery.provided_assets[asset.id];
  if (prior) { await fs.access(path.resolve(path.dirname(inputPath), prior)); console.log(`reuse: ${asset.id}`); continue; }
  // Use the established CLI/API boundary so run authorization and provider policy remain intact.
  const aspect = asset.ratio === '4:5' ? '3:4' : asset.ratio === '16:10' ? '16:9' : asset.ratio === '3:2' ? '4:3' : asset.ratio;
  let result = await cli(['generate', '--project', project, '--surface', 'image', '--model', model, '--aspect', aspect, '--prompt-file', '-'], prompt);
  if (result.data.taskId) {
    const taskId = result.data.taskId;
    // Store the handoff before polling. A timeout must never silently submit another paid job.
    const pending = path.join(path.dirname(inputPath), `pending-${asset.id}.json`);
    await fs.writeFile(pending, JSON.stringify(result.data, null, 2));
    for (let attempt = 0; attempt < 30; attempt++) {
      result = await cli(['wait', taskId, '--since', String(result.data.nextSince || 0)]);
      await fs.writeFile(pending, JSON.stringify({ taskId, ...result.data }, null, 2));
      if (result.code === 0 && result.data.file) break;
      if (result.code !== 2) throw new Error(`Unexpected wait state; see ${pending}`);
    }
    if (!result.data.file) throw new Error(`Generation still pending. Resume od media wait using ${pending}; do not resubmit.`);

  }
  const name = result.data.file?.name;
  if (!name) throw new Error(`No output file for ${asset.id}`);
  const source = path.resolve(filesDir, name);
  const rel = path.relative(path.resolve(filesDir), source);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Media result escaped files directory');
  await fs.access(source);
  checkpoint.imagery.provided_assets[asset.id] = path.relative(path.dirname(inputPath), source);
  await fs.writeFile(outputInputs, JSON.stringify(checkpoint, null, 2) + '\n');
  await fs.rm(path.join(path.dirname(inputPath), `pending-${asset.id}.json`), { force: true });
  console.log(`generated: ${asset.id} → ${name}`);
}
console.log(execute ? `Asset mappings saved to ${outputInputs}. Compose when all required slots are ready.` : 'Dry run only. Use --execute --model <configured-id> --project <id> --files-dir <local-project-files> to generate.');
