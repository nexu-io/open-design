// @ts-nocheck
/**
 * @module cli/export/export
 */
import { buildExportCliRequestBody, buildExportCliResultEnvelope, resolveExportCliDeckMode } from '../../export-cli-request.js';
import { exportRoutePath } from '../../export-cli-routing.js';
import { cliDaemonBaseUrl, parseFlags, positionalArgs, structuredHttpFailure, surfaceFetchError } from '../core/index.js';
import { EXPORT_FORMATS, EXPORT_IMAGE_FORMATS } from '@open-design/contracts';

const EXPORT_STRING_FLAGS = new Set([
  'daemon-url', 'project', 'format', 'out', 'output', 'image-format', 'title', 'file',
]);

const EXPORT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'deck', 'page', 'no-deck']);
// EXPORT_FORMATS / EXPORT_IMAGE_FORMATS are the shared contract DTO (single
// source of truth for the web/daemon/CLI export surface), imported above.

function printExportHelp() {
  console.log(`Usage:
  od export <file> --project <id> --format <fmt> [options]

Programmatic export of an HTML/deck artifact to PDF, image, or PPTX. Runs
entirely from the rendered design (no model/agent calls). Rasterization uses
the desktop runtime's bundled Chromium, so a desktop/packaged runtime must be
reachable; otherwise the command reports that the renderer is unavailable.

Formats:  ${EXPORT_FORMATS.join(', ')}

Options:
  --project <id>           Project id (required)
  --format <fmt>           One of: ${EXPORT_FORMATS.join(' | ')} (required)
  --out <path>             Write the file here (defaults to the suggested name)
  --image-format <fmt>     png | jpeg (for --format image)
  --deck                   Treat the artifact as a multi-slide deck
  --page, --no-deck        Treat the artifact as a normal scrollable page
  --title <title>          Title used for metadata / default filename
  --json                   Print a machine-readable result envelope
  --daemon-url <url>       Override daemon URL

Examples:
  od export index.html --project p1 --format pdf --out page.pdf
  od export slide.html --project p1 --format image --image-format png --out slide.png
  od export deck.html --project p1 --format pptx --out deck.pptx`);
}

export async function runExport(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printExportHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  let flags;
  try {
    flags = parseFlags(args, { string: EXPORT_STRING_FLAGS, boolean: EXPORT_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const pos = positionalArgs(args, EXPORT_STRING_FLAGS);
  const file = flags.file || pos[0];
  const projectId = flags.project || process.env.OD_PROJECT_ID;
  const format = flags.format;
  if (!file || !projectId || !format) {
    printExportHelp();
    process.exit(2);
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    console.error(`invalid --format: ${format} (expected ${EXPORT_FORMATS.join(' | ')})`);
    process.exit(2);
  }
  if (flags['image-format'] && !(EXPORT_IMAGE_FORMATS as readonly string[]).includes(flags['image-format'])) {
    console.error(`invalid --image-format: ${flags['image-format']} (expected ${EXPORT_IMAGE_FORMATS.join(' | ')})`);
    process.exit(2);
  }
  if (flags['image-format'] && format !== 'image') {
    console.error('--image-format is only valid with --format image');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  // All three formats rasterize through the desktop screenshot renderer so the
  // CLI matches the UI exactly. In particular `pdf` uses `/export/pdf-image`
  // (one raster page per deck slide / per viewport for a page) — NOT the generic
  // `/export` vector `printToPDF` path, which drops CJK glyphs in the packaged
  // runtime and is the bug this feature exists to avoid.
  const exportPath = exportRoutePath(format);
  let deckMode;
  try {
    deckMode = resolveExportCliDeckMode({
      format,
      deck: flags.deck === true,
      page: flags.page === true,
      noDeck: flags['no-deck'] === true,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
  const requestBody = buildExportCliRequestBody({
    fileName: file,
    format,
    deck: deckMode,
    ...(format === 'image' && flags['image-format'] ? { imageFormat: flags['image-format'] } : {}),
    ...(flags.title ? { title: flags.title } : {}),
  });
  let resp;
  try {
    resp = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/${exportPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const buffer = Buffer.from(await resp.arrayBuffer());
  let out = flags.out || flags.output;
  if (!out) {
    const cd = resp.headers.get('content-disposition') || '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="([^"]+)"/i.exec(cd);
    if (star && star[1]) {
      try { out = decodeURIComponent(star[1]); } catch { out = plain && plain[1] ? plain[1] : null; }
    } else if (plain && plain[1]) {
      out = plain[1];
    }
    if (!out) {
      const ext = format === 'image'
        ? (flags['image-format'] === 'jpeg' ? 'jpg' : 'png')
        : format === 'pptx' ? 'pptx' : 'pdf';
      out = `artifact.${ext}`;
    }
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out, buffer);
  if (flags.json) {
    return process.stdout.write(
      JSON.stringify(buildExportCliResultEnvelope({ path: out, bytes: buffer.length, format }), null, 2) + '\n',
    );
  }
  console.log(`wrote ${out} (${buffer.length} bytes)`);
}
