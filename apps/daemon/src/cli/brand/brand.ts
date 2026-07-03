// @ts-nocheck
/**
 * @module cli/brand/brand
 */
import { BRAND_USAGE, isBrandHelpArg } from '../../brands-cli-help.js';
import { cliDaemonBaseUrl, parseFlags, positionalArgs, readPromptFromFlags, structuredHttpFailure, surfaceFetchError } from '../core/index.js';

// `od brand …` mirrors the Brands library + New Brand modal. Same surface,
// same /api/brands store. The CLI form is the embeddability contract: an
// external agent (hermes-agent, openclaw, scripted job) can extract, list,
// inspect, and remove brands headlessly without rendering the web UI.
// Hoisted next to the other dispatch-touched flag sets because runBrand is
// reachable through the top-of-file SUBCOMMAND_MAP dispatch, which runs during
// module evaluation — a const declared further down would still be in TDZ.
const BRAND_STRING_FLAGS = new Set([
  'daemon-url', 'prompt-file', 'project', 'locale',
  'html-file', 'css-file', 'base-url',
]);

const BRAND_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json',
]);

// Derive a short domain for list output from a brand's source URL.
function brandDomainForCli(sourceUrl) {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) return '-';
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`);
    return u.hostname.replace(/^www\./, '') || '-';
  } catch {
    return sourceUrl;
  }
}

function formatBrandRow(summary) {
  const meta = summary?.meta ?? {};
  const name = summary?.brand?.name || meta.id || '-';
  return [
    meta.id ?? '-',
    name,
    brandDomainForCli(meta.sourceUrl),
    meta.status ?? '-',
  ].join('\t');
}

export async function runBrand(args) {
  if (args.length === 0 || isBrandHelpArg(args[0])
      || args.includes('--help') || args.includes('-h')) {
    console.log(BRAND_USAGE);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':     return runBrandList(rest);
    case 'create':   return runBrandCreate(rest);
    case 'extract':  return runBrandCreate(rest);
    case 'continue': return runBrandContinue(rest);
    case 'preview':  return runBrandPreview(rest);
    case 'finalize': return runBrandFinalize(rest);
    case 'extract-from-html': return runBrandExtractFromHtml(rest);
    case 'get':      return runBrandGet(rest);
    case 'show':     return runBrandGet(rest);
    case 'delete':   return runBrandDelete(rest);
    case 'remove':   return runBrandDelete(rest);
    default:
      console.error(`unknown subcommand: od brand ${sub}`);
      console.log(BRAND_USAGE);
      process.exit(2);
  }
}

async function runBrandList(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const brands = Array.isArray(data?.brands) ? data.brands : [];
  if (brands.length === 0) {
    console.log('No brands yet. Extract one with: od brand create <url>');
    return;
  }
  console.log('# id\tname\tdomain\tstatus');
  for (const summary of brands) console.log(formatBrandRow(summary));
}

async function runBrandCreate(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const positional = positionalArgs(rest, BRAND_STRING_FLAGS);
  // The URL may arrive as a positional, or — for parity with other long-input
  // subcommands — via --prompt-file <path|-> (a file or stdin). The positional
  // wins when both are present.
  let url = positional[0];
  if (!url) {
    const fromFile = await readPromptFromFlags(flags);
    if (typeof fromFile === 'string') url = fromFile.trim();
  }
  if (!url) {
    console.error('Usage: od brand create <url> [--json]\n' +
      '       od brand create --prompt-file <path|-> [--json]');
    process.exit(2);
  }

  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        url,
        ...(typeof flags.locale === 'string' && flags.locale.trim()
          ? { locale: flags.locale.trim() }
          : {}),
      }),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) {
    return structuredHttpFailure(resp);
  }

  // Extraction is agent-driven: this kickoff reserves the brand + a backing
  // project with the target site open in a browser tab and a seeded prompt.
  // The agent then runs the chain (measure → synthesize → `od brand finalize`).
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  process.stderr.write(
    '[brand] extraction project created — open it to run the agent, ' +
    `then it self-finalizes with: od brand finalize ${data?.id ?? ''}\n`,
  );
  // Clean stdout result: "<id>\t<projectId>" so jq / cut / xargs can chain.
  console.log(`${data?.id ?? ''}\t${data?.projectId ?? ''}`);
}

async function runBrandFinalize(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand finalize <id> [--project <projectId>] [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const body = {};
  if (typeof flags.project === 'string' && flags.project.trim()) body.projectId = flags.project.trim();
  if (typeof flags.locale === 'string' && flags.locale.trim()) body.locale = flags.locale.trim();
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/finalize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  const name = data?.brand?.name ?? data?.id ?? id;
  console.log(`${data?.id ?? id}\t${name}`);
  if (data?.designSystemId) process.stderr.write(`[brand] registered design system ${data.designSystemId}\n`);
}

async function runBrandContinue(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand continue <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/continue-extraction`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  console.log([
    data?.id ?? id,
    data?.status ?? '-',
    data?.projectId ?? '',
    data?.conversationId ?? '',
  ].join('\t'));
}

// Read a flag value as file content (or stdin when the value is "-"). Returns
// null when the flag is unset. Mirrors readPromptFromFlags' file/stdin handling
// but for an arbitrary flag name (--html-file / --css-file).
async function readFileFlagOrStdin(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value === '-') {
    return await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(value, 'utf8');
}

// od brand extract-from-html <id> --html-file <path|-> [--css-file <path>]
//   [--base-url <url>] [--json]
// Re-runs extraction against pre-captured rendered HTML (e.g. a page an external
// agent already loaded past an anti-bot wall), mirroring the UI's browser-assist
// confirm path so the capability is reachable from the CLI too.
async function runBrandExtractFromHtml(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand extract-from-html <id> --html-file <path|-> '
      + '[--css-file <path>] [--base-url <url>] [--json]');
    process.exit(2);
  }
  let html;
  try {
    html = await readFileFlagOrStdin(flags['html-file']);
  } catch (err) {
    console.error(`could not read --html-file: ${err.message}`);
    process.exit(2);
  }
  if (!html || !html.trim()) {
    console.error('--html-file <path|-> is required (the rendered page HTML)');
    process.exit(2);
  }
  let css = '';
  if (typeof flags['css-file'] === 'string' && flags['css-file'].length > 0) {
    try {
      css = (await readFileFlagOrStdin(flags['css-file'])) ?? '';
    } catch (err) {
      console.error(`could not read --css-file: ${err.message}`);
      process.exit(2);
    }
  }
  const body = { html };
  if (css.trim()) body.css = css;
  if (typeof flags['base-url'] === 'string' && flags['base-url'].trim()) {
    body.baseUrl = flags['base-url'].trim();
  }

  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/extract-from-html`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  const name = data?.brand?.name ?? data?.id ?? id;
  console.log(`${data?.id ?? id}\t${name}`);
  if (data?.designSystemId) {
    process.stderr.write(`[brand] registered design system ${data.designSystemId}\n`);
  }
}

async function runBrandPreview(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand preview <id> [--project <projectId>] [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const body = {};
  if (typeof flags.project === 'string' && flags.project.trim()) body.projectId = flags.project.trim();
  if (typeof flags.locale === 'string' && flags.locale.trim()) body.locale = flags.locale.trim();
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...data }, null, 2) + '\n');
    return;
  }
  // Clean stdout result: "<id>\t<file>" so the agent can confirm the path.
  console.log(`${data?.id ?? id}\t${data?.file ?? 'brand.html'}`);
}

async function runBrandGet(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand get <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`brand not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const meta = data?.meta ?? {};
  const brand = data?.brand ?? null;
  console.log(`id\t${meta.id ?? id}`);
  console.log(`name\t${brand?.name ?? '-'}`);
  console.log(`domain\t${brandDomainForCli(meta.sourceUrl)}`);
  console.log(`status\t${meta.status ?? '-'}`);
  if (meta.designSystemId) console.log(`designSystem\t${meta.designSystemId}`);
  if (meta.projectId) console.log(`project\t${meta.projectId}`);
  if (Array.isArray(meta.systemFiles) && meta.systemFiles.length > 0) {
    console.log(`files\t${meta.systemFiles.join(' ')}`);
  }
  if (brand?.tagline) console.log(`tagline\t${brand.tagline}`);
  if (Array.isArray(brand?.colors) && brand.colors.length > 0) {
    console.log(`colors\t${brand.colors.map((c) => c.hex).join(' ')}`);
  }
  if (meta.error) console.log(`error\t${meta.error}`);
}

async function runBrandDelete(rest) {
  let flags;
  try {
    flags = parseFlags(rest, { string: BRAND_STRING_FLAGS, boolean: BRAND_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const id = positionalArgs(rest, BRAND_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od brand delete <id> [--json]');
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/brands/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json().catch(() => ({ ok: true }));
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[brand] deleted ${id}`);
}
