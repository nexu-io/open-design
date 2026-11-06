#!/usr/bin/env -S npx -y tsx
/**
 * open-design-landing — gpt-image-2 generator (fal.ai backend).
 *
 * Generates the 16 collage assets defined in `assets/image-manifest.json`
 * by composing per-slot prompts (style anchor + brand variables +
 * per-slot composition) and calling fal.ai's `openai/gpt-image-2`
 * synchronous endpoint. Downloads each result to the `--out` directory.
 *
 * Requires `FAL_KEY` in the environment. If it is missing, the script
 * prints the prompts it would have sent so an operator can route them
 * through the `/gpt-image-fal` skill manually, or set the key and re-run.
 *
 * Usage:
 *   FAL_KEY=... npx tsx scripts/imagegen.ts <inputs.json> [--out=assets/] [--only=hero,cta]
 *
 * Cost note: 16 images × ~$0.025 each ≈ $0.40 per full run at high
 * quality. Re-running is idempotent — slots whose target file already
 * exists are skipped unless `--force` is passed.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorialCollageInputs } from '../schema';

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
interface Manifest { slots: ManifestSlot[] }

/* ------------------------------------------------------------------ *
 * prompt constants (mirror assets/imagegen-prompts.md verbatim)
 * ------------------------------------------------------------------ */

const STYLE_ANCHOR = `Use case: ads-marketing

Asset type: editorial website hero / creative studio landing page visual

Primary request: Generate a refined editorial web page composition in the
same visual language as a high-end creative AI research studio.

Style/medium: sophisticated digital collage, modern Swiss editorial layout,
Bauhaus geometric composition, classical plaster sculpture fragments,
brutalist/minimal architecture, art-direction website mockup, premium
agency aesthetic.

Scene/backdrop: warm off-white handmade paper background with subtle
grain, faint vertical folds, scanned paper fibers, lightly aged print
texture, thin drafting lines and registration marks.

Subject: a surreal collage combining a cropped classical plaster head or
face fragment, abstract architectural blocks, archways or stairs, sky
cutouts, one small human figure, a delicate tree or botanical element,
and geometric color planes.

Composition/framing: wide 16:9 web page layout, strong asymmetrical
grid, generous negative space, large typography area on the left or
top-left, collage focal object on the right or center-right, precise
alignment, thin divider lines, small UI navigation details.

Lighting/mood: soft diffused daylight, museum-like calm, intelligent,
restrained, tactile, poetic, premium, research-driven.

Color palette: warm ivory, stone beige, soft concrete gray, deep black
text, muted charcoal, washed coral-red accent, occasional mustard-yellow
accent, pale sky blue only inside small sky/image cutouts.

Materials/textures: matte plaster, limestone, travertine, concrete, rough
torn paper edges, halftone print grain, translucent vellum-like overlays,
fine grid paper, dotted matrix patterns.

Typography: large clean grotesk sans-serif for main headline, elegant
high-contrast italic serif for emphasized words, tiny uppercase coral
labels, compact UI microcopy. Text must be crisp, readable, and spelled
exactly as provided.

Graphic details: thin hairline circles, partial arcs, crosshair marks,
small black dots, dotted grids, fine coordinate lines, numbered
annotations, small arrow buttons, simple pill buttons, minimal logo mark.

Constraints: preserve a high-end editorial web design feel; keep spacing
elegant and uncluttered; no cartoon style; no neon colors; no glossy 3D;
no busy gradients; no generic stock-photo look.

Avoid: distorted typography, misspelled text, extra random words, heavy
shadows, childish illustration, cyberpunk, saturated purple/blue palette,
plastic materials, overly decorative UI cards, cluttered composition,
low-resolution textures, watermarks.`;

const PER_SLOT: Record<string, string> = {
  hero: `Composition/framing: left half is intentionally empty/quiet to allow real
HTML headline overlay; right half holds a tall surreal collage of a
cropped classical plaster head with the top sliced open, sky/architecture
cutouts visible inside the head, a delicate young tree growing through
the composition, a coral sun disk behind, a mustard accent ring at the
base, hairline coordinate marks and dotted matrices around it, a small
human figure standing for scale in the lower-left of the image. Page
type: hero landing.`,
  about: `Composition: a surreal museum-vitrine arrangement of a partial plaster
profile head facing right, with an open archway carved through the
torso, sky cutout inside the arch, a tree seedling growing out of the
shoulder, and a coral half-circle behind the head. Tiny dotted hairlines
trace contours. Strong negative space top-left for a side-note overlay.
Page type: about / manifesto plate.`,
  capabilities: `Composition: a Bauhaus-grid stack of architectural fragments — a coral
arch on the left, a beige concrete column center, a mustard small disc
upper-right, a delicate tree mid-frame, a small classical hand fragment
holding a pencil bottom-center. Crosshair and circular hairlines
overlay. Page type: capabilities matrix.`,
  'method-1': `Composition: a magnifying glass over a small architectural map. Coral
accent disc behind. One numbered annotation tag '01 · Detect'.
Page type: method tile.`,
  'method-2': `Composition: a clipboard with a tiny questionnaire and a coral pen,
on the warm paper ground. Mustard sticker corner. Annotation '02 ·
Discover'. Page type: method tile.`,
  'method-3': `Composition: a compass + ruler + color swatch fan arranged like an
architect's drafting kit. Coral accent on the swatch. Annotation
'03 · Direct'. Page type: method tile.`,
  'method-4': `Composition: a printer's tray with stacked paper sheets exiting,
mustard ribbon tag. Annotation '04 · Deliver'. Page type: method tile.`,
  'lab-1': `Portrait composition: a stack of folded magazine spreads, slight
perspective, coral spine, mustard tab. Page type: lab card.`,
  'lab-2': `Portrait composition: a film strip + a synthetic eye + a soundwave
hairline. Coral arc behind. Page type: lab card.`,
  'lab-3': `Portrait composition: a typewriter with prompt cards in the carriage,
coral platen knob. Page type: lab card.`,
  'lab-4': `Portrait composition: five small dotted gauges arranged in a circle
(5-dim critique), one filled coral. Page type: lab card.`,
  'lab-5': `Portrait composition: a glass dome / cloche over a tiny sandbox
cityscape, mustard sun behind. Page type: lab card.`,
  'work-1': `Portrait composition: an oversized open magazine spread on a desk,
coral spine, mustard tab. Slight perspective. Page type: work card.`,
  'work-2': `Portrait composition: a concrete dashboard slab, a coral graph bar
rising, a small classical bust beside it for scale. Page type: work card.`,
  testimonial: `Composition: a classical plaster bust facing 3/4 left, slightly cropped,
with a small sky cutout where the eye would be, a thin coral arc around
the back of the head, mustard dot at the chin. Quiet background, lots of
negative space upper right. Page type: testimonial portrait.`,
  cta: `Composition: a closing-plate collage — a mustard sun behind a single
coral arch on the right, a delicate tree growing through the arch, a
small human figure in the lower-left foreground reading a folded
broadsheet, hairline coordinate ladder up the left edge, and a small
"FIN." dotted seal in the upper-right. Page type: closing CTA plate.`,
};

/* ------------------------------------------------------------------ *
 * prompt builder
 * ------------------------------------------------------------------ */

function brandVarsBlock(inputs: EditorialCollageInputs): string {
  // Pull the brand-shaped strings the model should bias toward.
  const navText = inputs.nav.slice(0, 5).map((n) => `"${n.label}"`).join(', ');
  const eyebrow = `${inputs.hero.label} ${inputs.hero.ix}`;
  const headline = inputs.hero.headline.map((s) => s.text).join('');
  const italic = inputs.hero.headline.filter((s) => s.em).map((s) => `"${s.text}"`).join(', ');
  const body = inputs.hero.lead.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '');
  return `Brand/logo text:        "${inputs.brand.name}"
Navigation text:        ${navText}
Eyebrow label:          "${eyebrow}"
Main headline:          "${headline}"
Italic emphasis words:  ${italic}
Body copy:              "${body}"
Primary button:         "${inputs.hero.primary.label}"
Secondary button:       "${inputs.hero.secondary.label}"
Footer/micro labels:    "${inputs.brand.location}", "${inputs.brand.coordinates}"`;
}

export function promptForSlot(slot: ManifestSlot, inputs: EditorialCollageInputs): string {
  const override = inputs.imagery.prompts?.[slot.id];
  const composition = override ?? PER_SLOT[slot.id] ?? `Page type: ${slot.id} plate.`;
  return [STYLE_ANCHOR, brandVarsBlock(inputs), composition].join('\n\n');
}

/* ------------------------------------------------------------------ *
 * fal.ai client (raw fetch — no npm dependency)
 * ------------------------------------------------------------------ */

interface FalImageResult {
  images: Array<{ url: string; width?: number; height?: number; content_type?: string }>;
}

async function callFalGptImage(
  prompt: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<Uint8Array> {
  // fal.ai exposes both queue (async) and run (sync) endpoints. Use sync
  // for simpler scripting; per-image latency is ~25-45s.
  const endpoint = 'https://fal.run/openai/gpt-image-2';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      num_images: 1,
      quality: 'high',
      output_format: 'png',
      background: 'opaque',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable>');
    throw new Error(`fal.run/openai/gpt-image-2 ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as FalImageResult;
  const url = json.images?.[0]?.url;
  if (!url) throw new Error('fal.ai response missing images[0].url');
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`download ${url} failed: ${dl.status}`);
  const buf = await dl.arrayBuffer();
  return new Uint8Array(buf);
}

/* ------------------------------------------------------------------ *
 * top-level
 * ------------------------------------------------------------------ */

interface CliArgs {
  inputsPath: string;
  outDir: string;
  only?: Set<string>;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const inputsPath = argv[2];
  if (!inputsPath || inputsPath.startsWith('--')) {
    throw new Error('Usage: imagegen.ts <inputs.json> [--out=assets/] [--only=hero,cta] [--force]');
  }
  let outDir = './assets/';
  let only: Set<string> | undefined;
  let force = false;
  for (const arg of argv.slice(3)) {
    if (arg.startsWith('--out=')) outDir = arg.slice('--out='.length);
    else if (arg.startsWith('--only=')) only = new Set(arg.slice('--only='.length).split(','));
    else if (arg === '--force') force = true;
    else throw new Error(`unknown arg: ${arg}`);
  }
  return {
    inputsPath: isAbsolute(inputsPath) ? inputsPath : resolve(process.cwd(), inputsPath),
    outDir: isAbsolute(outDir) ? outDir : resolve(process.cwd(), outDir),
    only,
    force,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 256;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { inputsPath, outDir, only, force } = parseArgs(process.argv);
  const apiKey = process.env.FAL_KEY ?? '';
  const dryRun = !apiKey;

  const inputs = JSON.parse(await readFile(inputsPath, 'utf8')) as EditorialCollageInputs;
  const manifestPath = resolve(SKILL_ROOT, 'assets', 'image-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  await mkdir(outDir, { recursive: true });

  const targets = manifest.slots.filter((s) => !only || only.has(s.id));
  if (dryRun) {
    console.log(`FAL_KEY not set — dry run. Printing prompts for ${targets.length} slot(s).\n`);
  } else {
    console.log(`Generating ${targets.length} slot(s) → ${outDir}`);
  }

  for (const slot of targets) {
    const target = resolve(outDir, slot.file);
    if (!force && (await fileExists(target))) {
      console.log(`· ${slot.id} — skip (exists)`);
      continue;
    }

    const prompt = promptForSlot(slot, inputs);
    if (dryRun) {
      console.log(`\n=== ${slot.id} (${slot.width}×${slot.height}) → ${slot.file} ===`);
      console.log(prompt);
      console.log(`=== end ${slot.id} ===\n`);
      continue;
    }

    process.stdout.write(`· ${slot.id} (${slot.width}×${slot.height}) … `);
    try {
      const png = await callFalGptImage(prompt, slot.width, slot.height, apiKey);
      await writeFile(target, png);
      console.log(`ok (${(png.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`fail — ${msg}`);
    }
  }

  if (dryRun) {
    console.log(`\nNext: set FAL_KEY in env and re-run to generate, or paste each prompt block into /gpt-image-fal manually.`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
