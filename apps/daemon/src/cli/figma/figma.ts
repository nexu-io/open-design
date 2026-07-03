// @ts-nocheck
/** @module cli/figma/figma
 * Implements `od figma import` CLI command for offline and URL-based Figma design import.
 * Decodes .fig files (offline) or runs OAuth migration scenario; optionally starts build run.
 */
import { cliDaemonUrl, parseFlags, readPromptFromFlags, structuredHttpFailure } from '../core/index.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Whitelist of string flags for `od figma` commands. */
const FIGMA_STRING_FLAGS = new Set([
  'daemon-url', 'project', 'file', 'figma-url', 'notes', 'prompt', 'prompt-file',
]);

/** Whitelist of boolean flags for `od figma` commands. */
const FIGMA_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json', 'build',
]);

/** @internal Prints usage for `od figma import`. */
function printFigmaUsage() {
  console.log(`Usage:
  od figma import --project <id> --file <path.fig> [--notes "<text>"]
                  [--build] [--prompt "<text>" | --prompt-file <path|->] [--json]
  od figma import --project <id> --figma-url <url> [--notes "<text>"] [--json]

Imports a Figma design into a project. A .fig file is decoded fully offline
(no Figma account); a Figma URL runs through the od-figma-migration scenario
(OAuth). Either way it stages a figma/ snapshot the agent reshapes into a
webpage.

Flags:
  --project <id>       Target project id (required).
  --file <path.fig>    Local .fig to decode offline.
  --figma-url <url>    Figma file URL (https://figma.com/(file|design)/<key>).
  --notes "<text>"     Design brief folded into the reshape prompt.
  --build              After import, start a run that builds the webpage.
  --prompt / --prompt-file   Override the build prompt (file or - for stdin).
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
}

/**
 * Entry point for `od figma import` subcommand.
 * Routes to offline .fig decode or URL-based OAuth migration scenario.
 * Optionally starts a build run to reshape the snapshot into a webpage.
 */
export async function runFigma(args) {
  const sub = args.find((a) => !a.startsWith('-'));
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printFigmaUsage();
    process.exit(sub ? 0 : 2);
  }
  if (sub !== 'import') {
    console.error(`unknown subcommand: od figma ${sub}`);
    printFigmaUsage();
    process.exit(2);
  }
  const idx = args.indexOf(sub);
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  const flags = parseFlags(rest, { string: FIGMA_STRING_FLAGS, boolean: FIGMA_BOOLEAN_FLAGS });
  const base = (await cliDaemonUrl(flags)).replace(/\/$/, '');

  if (!flags.project) {
    console.error('--project <id> is required');
    process.exit(2);
  }
  const file = flags.file;
  const figmaUrl = flags['figma-url'];
  if (!file && !figmaUrl) {
    console.error('one of --file <path.fig> or --figma-url <url> is required');
    process.exit(2);
  }

  // Figma URL → the existing migration scenario (OAuth lives in the run
  // pipeline). Start it through the same /api/runs path `od run start` uses.
  if (figmaUrl && !file) {
    const runBody = {
      projectId: flags.project,
      pluginId: 'od-figma-migration',
      pluginInputs: { figmaUrl, ...(flags.notes ? { notes: flags.notes } : {}) },
    };
    const runResp = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(runBody),
    });
    const runData = await runResp.json().catch(() => ({}));
    if (!runResp.ok) {
      console.error(`POST /api/runs failed: ${runResp.status} ${JSON.stringify(runData)}`);
      process.exit(1);
    }
    if (flags.json) return process.stdout.write(JSON.stringify(runData, null, 2) + '\n');
    console.log(`[figma] migration run started ${runData.runId}`);
    return;
  }

  // Offline .fig path → multipart upload to the import endpoint.
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(file));
  if (flags.notes) form.append('notes', String(flags.notes));
  const resp = await fetch(`${base}/api/projects/${encodeURIComponent(flags.project)}/figma/import`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();

  if (flags.json && !flags.build) {
    return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
  const inv = data.inventory ?? {};
  if (!flags.json) {
    console.log(`[figma] imported "${data.label}" → ${data.snapshotDir}/`);
    console.log(`  ${inv.decoded ? 'decoded' : 'assets-only'}: ${inv.nodeCount} nodes, ${inv.pageCount} pages, ${inv.frameCount} frames, ${inv.componentCount} components`);
    console.log(`  ${(inv.colors ?? []).length} colors, ${(inv.fonts ?? []).length} fonts, ${inv.assetCount} assets${inv.hasThumbnail ? ', + preview' : ''}`);
    for (const w of inv.warnings ?? []) console.log(`  ! ${w}`);
  }

  if (flags.build) {
    const override = await readPromptFromFlags(flags);
    const message = override || data.suggestedPrompt;
    const runResp = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: flags.project, message }),
    });
    const runData = await runResp.json().catch(() => ({}));
    if (!runResp.ok) {
      console.error(`build run failed: ${runResp.status} ${JSON.stringify(runData)}`);
      process.exit(1);
    }
    if (flags.json) return process.stdout.write(JSON.stringify({ ...data, build: runData }, null, 2) + '\n');
    console.log(`[figma] build run started ${runData.runId}`);
  }
}
