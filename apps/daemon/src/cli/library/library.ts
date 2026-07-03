// @ts-nocheck
/** @module cli/library/library
 * Implements the od library/atoms/skills/craft/design-systems command dispatchers for asset management.
 * Library is the design asset registry (images, HTML, videos, fonts, text, etc.).
 * Atoms are first-party agent task primitives; skills/craft/design-systems are browsable registries.
 * Collaborators: parseDesignSystemRenameArgs from design-systems module; parseFlags, positionalArgs from core.
 */
import { DESIGN_SYSTEMS_USAGE, isDesignSystemsHelpArg } from '../../design-systems-cli-help.js';
import { parseDesignSystemRenameArgs } from '../../design-systems/index.js';
import { LIBRARY_BOOLEAN_FLAGS, LIBRARY_STRING_FLAGS, cliDaemonBaseUrl, libraryDaemonUrl, parseFlags, positionalArgs, structuredHttpFailure, surfaceFetchError } from '../core/index.js';
import { basename } from 'node:path';

/**
 * @internal Whitelist of string flags for asset/library operations (--kind, --tag, --source, --project, etc.).
 */
const LIBRARY_ASSET_STRING_FLAGS = new Set([
  'daemon-url', 'kind', 'tag', 'source', 'date', 'query', 'project', 'label', 'out', 'dir',
]);

/**
 * @internal Whitelist of boolean flags (--help, --json).
 */
const LIBRARY_ASSET_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

/**
 * Dispatcher for `od atoms` subcommands (list, show, info).
 * Atoms are first-party agent task blueprints (implemented + planned stages).
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runAtoms(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od atoms list             List first-party atoms (implemented + planned).
  od atoms show <id>        Print one atom's metadata.
  od atoms info <id>        Print metadata + the bundled SKILL.md body.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}/api/atoms`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const atoms = data?.atoms ?? [];
      for (const a of atoms) {
        console.log(`${a.id}\t${a.status}\t[${(a.taskKinds ?? []).join(', ')}]\t${a.label}`);
      }
      return;
    }
    case 'show': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od atoms show <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/atoms`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      const atom = (data?.atoms ?? []).find((a) => a.id === id);
      if (!atom) {
        console.error(`atom ${id} not found`);
        process.exit(65);
      }
      process.stdout.write(JSON.stringify(atom, null, 2) + '\n');
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od atoms info <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/atoms/${encodeURIComponent(id)}`);
      if (resp.status === 404) {
        console.error(`atom ${id} not found`);
        process.exit(65);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const atom = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(atom, null, 2) + '\n');
      console.log(`# ${atom.label} (${atom.id})`);
      console.log(`status:    ${atom.status}`);
      console.log(`taskKinds: ${(atom.taskKinds ?? []).join(', ')}`);
      console.log(`summary:   ${atom.description}`);
      if (typeof atom.skillBody === 'string' && atom.skillBody.length > 0) {
        console.log('');
        console.log('--- SKILL.md ---');
        console.log(atom.skillBody.trimEnd());
      } else {
        console.log('');
        console.log('(no bundled SKILL.md body found for this atom)');
      }
      return;
    }
    default:
      console.error(`unknown subcommand: od atoms ${sub}`);
      process.exit(2);
  }
}

/**
 * @internal Prints help for od library subcommands and options.
 */
function printLibraryHelp() {
  console.log(`Usage: od library <command> [options]

Commands:
  list                      List library assets. Filters: --kind --tag --source --date
  get <id>                  Print one asset (JSON).
  rm <id>                   Delete an asset.
  search <query>            Keyword search across captions / tags / titles.
  import <file|url>...      Import one or more local files / remote URLs into the library.
                            Restricted to design formats (images, fonts, text, HTML, JSON);
                            audio, video, and other binaries are rejected.
  apply <id>                Copy an asset into a project's design files. Requires --project.
  edit-as-page <id>         Turn a captured html asset into a new editable OD project (prints projectId).
  figma <id>                Export an html asset's OD Figma capture IR (clipper-captured pages).
  sync                      Pull design systems + agent-generated project artifacts into the Library.
  pair                      Mint a browser-extension pairing code.

Options:
  --json                    Machine-readable output.
  --daemon-url <url>        Override daemon URL (default: auto-discover).
  --kind <image|design-system|video|...>
                            Filter/declare asset kind.
  --tag <tag>               Filter by / attach a tag.
  --source <kind>           Filter by source (clipper|manual-upload|agent-task|design-system|generated).
  --date <YYYY-MM-DD>       Filter by archive date.
  --project <id>            Target project for apply.
  --dir <subdir>            Subdirectory inside the project for apply (default: library).
  --out <file>              Write the figma export to a file (default: stdout).`);
}

/**
 * Main dispatcher for `od library` subcommands (list, search, get, rm, import, apply, edit-as-page, figma, sync, pair).
 * Import accepts file paths or URLs; apply copies asset into project design files; sync pulls design systems and generated artifacts into Library.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runLibrary(args) {
  const sub = args.find((a) => !a.startsWith('-')) || '';
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    printLibraryHelp();
    process.exit(sub ? 0 : 2);
  }
  const idx = args.indexOf(sub);
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  let flags;
  try {
    flags = parseFlags(rest, {
      string: LIBRARY_ASSET_STRING_FLAGS,
      boolean: LIBRARY_ASSET_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const pos = positionalArgs(rest, LIBRARY_ASSET_STRING_FLAGS);
  const writeJson = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  try {
    switch (sub) {
      case 'list':
      case 'search': {
        const params = new URLSearchParams();
        const query = sub === 'search' ? flags.query || pos[0] : flags.query;
        if (query) params.set('q', query);
        if (flags.kind) params.set('kind', flags.kind);
        if (flags.tag) params.set('tag', flags.tag);
        if (flags.source) params.set('source', flags.source);
        if (flags.date) params.set('date', flags.date);
        if (flags.project) params.set('projectId', flags.project);
        const qs = params.toString();
        const resp = await fetch(`${base}/api/library/assets${qs ? `?${qs}` : ''}`);
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        for (const asset of data.assets ?? []) {
          const dims = asset.width && asset.height ? `${asset.width}x${asset.height}` : '';
          const label = asset.sourceTitle || asset.sourceUrl || asset.caption || '';
          console.log(`${asset.id}\t${asset.kind}\t${dims}\t${label}`);
        }
        return;
      }
      case 'get': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library get <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}`);
        if (!resp.ok) return structuredHttpFailure(resp);
        return writeJson(await resp.json());
      }
      case 'rm': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library rm <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        if (flags.json) return writeJson(await resp.json());
        console.log(`deleted ${id}`);
        return;
      }
      case 'import': {
        const sources = pos;
        if (!sources.length) {
          console.error('Usage: od library import <file|url> [<file|url> ...]');
          process.exit(2);
        }
        const { readFile } = await import('node:fs/promises');
        const nodePath = await import('node:path');
        const results = [];
        let failed = false;
        for (const src of sources) {
          const body = {};
          try {
            if (/^https?:\/\//i.test(src)) {
              body.url = src;
              body.sourceUrl = src;
            } else {
              const bytes = await readFile(src);
              // Empty mediatype → daemon sniffs the bytes for the real mime.
              body.dataUrl = `data:;base64,${bytes.toString('base64')}`;
              body.filename = nodePath.basename(src);
            }
          } catch (err) {
            failed = true;
            results.push({ source: src, ok: false, error: err?.message ?? String(err) });
            if (!flags.json) console.error(`${src}\terror\t${err?.message ?? err}`);
            continue;
          }
          if (flags.kind) body.kind = flags.kind;
          if (flags.tag) body.tags = [flags.tag];
          const resp = await fetch(`${base}/api/library/ingest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            failed = true;
            // The daemon rejects unsupported formats (415) and oversized files
            // (413); surface the reason per source instead of aborting the run.
            const detail = await resp.json().catch(() => null);
            const message = detail?.error?.message ?? `HTTP ${resp.status}`;
            results.push({ source: src, ok: false, status: resp.status, error: message });
            if (!flags.json) console.error(`${src}\trejected\t${message}`);
            continue;
          }
          const data = await resp.json();
          results.push({ source: src, ok: true, ...data });
          if (!flags.json) {
            console.log(`${data.asset.id}\t${data.deduped ? 'deduped' : 'imported'}\t${data.asset.kind}`);
          }
        }
        if (flags.json) writeJson(sources.length === 1 ? results[0] : results);
        if (failed) process.exit(1);
        return;
      }
      case 'apply': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library apply <id> --project <projectId> [--dir <subdir>]');
          process.exit(2);
        }
        if (!flags.project) {
          console.error('Usage: od library apply <id> --project <projectId> [--dir <subdir>]');
          process.exit(2);
        }
        const body = { projectId: flags.project };
        if (flags.dir) body.dir = flags.dir;
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`applied ${id} → ${data.relPath}`);
        return;
      }
      case 'edit-as-page': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library edit-as-page <id>');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/edit-as-page`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`created project ${data.projectId} → ${data.relPath}`);
        return;
      }
      case 'figma': {
        const id = pos[0];
        if (!id) {
          console.error('Usage: od library figma <id> [--out <file>]');
          process.exit(2);
        }
        const resp = await fetch(`${base}/api/library/assets/${encodeURIComponent(id)}/figma`);
        if (!resp.ok) return structuredHttpFailure(resp);
        const ir = await resp.text();
        if (flags.out) {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(flags.out, ir, 'utf8');
          if (flags.json) return writeJson({ ok: true, id, out: flags.out, bytes: Buffer.byteLength(ir) });
          console.log(`wrote ${flags.out}`);
          return;
        }
        process.stdout.write(ir.endsWith('\n') ? ir : ir + '\n');
        return;
      }
      case 'sync': {
        const resp = await fetch(`${base}/api/library/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(
          `Synced ${data.total} new (${data.designSystems} design systems, ${data.projectAssets} project assets; ${data.deduped} already indexed).`,
        );
        return;
      }
      case 'pair': {
        const resp = await fetch(`${base}/api/library/pair`, { method: 'POST' });
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`Pairing code: ${data.code}`);
        console.log('Enter this code in the OD Clipper extension popup within 5 minutes.');
        return;
      }
      default:
        console.error(`unknown subcommand: od library ${sub}`);
        printLibraryHelp();
        process.exit(2);
    }
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
}

/**
 * @internal Common handler for `od <name> list|show` where name is skills|craft|design-systems.
 * Queries /api/<name> or /api/design-systems depending on entity type.
 * @async
 * @param {string} name - Entity name (skills, craft, or design-systems).
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runLibraryList(name, args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od ${name} list           List ${name}.
  od ${name} show <id>      Print one entry.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const apiPath = name === 'design-systems' ? '/api/design-systems' : `/api/${name}`;
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}${apiPath}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const rows = data?.[name === 'design-systems' ? 'designSystems' : name] ?? [];
      for (const row of rows) {
        const label = row.title ?? row.name ?? row.id ?? row.label;
        console.log(`${row.id}\t${label}`);
      }
      return;
    }
    case 'show': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error(`Usage: od ${name} show <id>`);
        process.exit(2);
      }
      const resp = await fetch(`${base}${apiPath}/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    default:
      console.error(`unknown subcommand: od ${name} ${sub}`);
      process.exit(2);
  }
}

/**
 * Dispatcher for `od skills list|show` — lists and displays agent skills.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runSkills(args)        { return runLibraryList('skills', args); }

/**
 * Dispatcher for `od craft list|show` — lists and displays craft rule collections.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runCraft(args)         { return runLibraryList('craft', args); }

/**
 * Dispatcher for `od design-systems` subcommands (list, show, rename, download, import-local, import-github, import-shadcn, rebuild-token-contract).
 * Delegates to specialized handlers; defaults to list if no recognized subcommand.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runDesignSystems(args) {
  if (args[0] === 'rename') return runDesignSystemRename(args.slice(1));
  if (args[0] === 'download') return runDesignSystemDownload(args.slice(1));
  if (args[0] === 'import-local') return runDesignSystemImportLocal(args.slice(1));
  if (args[0] === 'import-github') return runDesignSystemImportGithub(args.slice(1));
  if (args[0] === 'import-shadcn') return runDesignSystemImportShadcn(args.slice(1));
  if (args[0] === 'rebuild-token-contract') return runDesignSystemTokenContractRebuild(args.slice(1));
  if (!args[0] || isDesignSystemsHelpArg(args[0])) {
    console.log(DESIGN_SYSTEMS_USAGE);
    process.exit(isDesignSystemsHelpArg(args[0]) ? 0 : 2);
  }
  return runLibraryList('design-systems', args);
}

// od design-systems download <id> [--out <path>] [--json] [--daemon-url <url>]
//
// Streams GET /api/design-systems/:id/archive — the same self-contained brand
// .zip (every system file plus a generated SKILLS.md usage guide) the web
// "Download brand" button produces — and writes it to disk. Only user design
// systems are downloadable; presets return 404.
/**
 * Downloads an editable design system as a self-contained .zip (all files + generated SKILLS.md guide).
 * Presets return 404; only user systems are downloadable.
 * @async
 * @param {Array<string>} args - Subcommand and arguments (id, optional --out path).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemDownload(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems download <id> [--out <path>] [--json] [--daemon-url <url>]

Downloads an editable design system as a shareable .zip (all files plus a
generated SKILLS.md usage guide).

  <id>                   Design system id (e.g. user:my-brand).
  --out <path>           Write the .zip here (defaults to the brand's name).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'out']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const id = positionalArgs(args, stringFlags)[0];
  if (!id) {
    console.error('Usage: od design-systems download <id> [--out <path>]');
    process.exit(2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(id)}/archive`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) {
    console.error(`downloadable design system not found: ${id}`);
    process.exit(4);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const buffer = Buffer.from(await resp.arrayBuffer());
  let out = typeof flags.out === 'string' ? flags.out : null;
  if (!out) {
    const cd = resp.headers.get('content-disposition') || '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="([^"]+)"/i.exec(cd);
    if (star && star[1]) {
      try { out = decodeURIComponent(star[1]); } catch { out = plain && plain[1] ? plain[1] : null; }
    } else if (plain && plain[1]) {
      out = plain[1];
    }
    if (!out) out = 'design-system.zip';
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out, buffer);
  if (flags.json) {
    return process.stdout.write(
      JSON.stringify({ ok: true, id, out, bytes: buffer.length }, null, 2) + '\n',
    );
  }
  console.log(`Downloaded ${id} -> ${out} (${buffer.length} bytes)`);
}

// od design-systems import-local <path> [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
//
// Imports a local app/design-system project through the same daemon endpoint as
// the Settings UI. The CLI resolves relative paths before sending the request
// because the daemon intentionally accepts only absolute host paths.
/**
 * Imports a local project directory as an editable design system via POST /api/design-systems/import/local.
 * Resolves relative paths to absolute before sending (daemon only accepts absolute paths).
 * @async
 * @param {Array<string>} args - Subcommand and arguments (path, optional flags).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemImportLocal(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-local <path> [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]
  od design-systems import-local --path <path> [--name <name>] [--json]

Imports a local project directory as an editable Open Design design system.

  <path>                 Local project directory to scan.
  --path <path>          Path alternative for scripts that prefer named flags.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'path', 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const localPath = typeof flags.path === 'string' ? flags.path : positionalArgs(args, stringFlags)[0];
  if (!localPath) {
    console.error('Usage: od design-systems import-local <path>');
    process.exit(2);
  }
  const pathModule = await import('node:path');
  const body = designSystemImportRequestBody(flags, {
    baseDir: pathModule.resolve(localPath),
  });
  return postDesignSystemImport(flags, '/api/design-systems/import/local', body);
}

// od design-systems import-github <url> [--branch <branch>] [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
/**
 * Imports a public GitHub repository URL as an editable design system.
 * Supports branch/tag/ref override via --branch flag.
 * @async
 * @param {Array<string>} args - Subcommand and arguments (URL, optional flags).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemImportGithub(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-github <url> [--branch <branch>] [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]
  od design-systems import-github --url <url> [--branch <branch>] [--json]

Imports a public GitHub repository as an editable Open Design design system.

  <url>                  Repository root URL, e.g. https://github.com/acme/design-kit.
  --url <url>            URL alternative for scripts that prefer named flags.
  --branch <branch>      Branch, tag, or ref to clone.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'url', 'branch', 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const url = typeof flags.url === 'string' ? flags.url : positionalArgs(args, stringFlags)[0];
  if (!url) {
    console.error('Usage: od design-systems import-github <url>');
    process.exit(2);
  }
  const body = designSystemImportRequestBody(flags, {
    url,
    ...(typeof flags.branch === 'string' ? { branch: flags.branch } : {}),
  });
  return postDesignSystemImport(flags, '/api/design-systems/import/github', body);
}

/**
 * @internal Builds import request body from flags (--name, --import-mode, --craft).
 * @param {object} flags - Parsed flags.
 * @param {object} baseBody - Base body object (baseDir or url).
 * @returns {object} Complete import request body.
 */
function designSystemImportRequestBody(flags, baseBody) {
  const craftApplies =
    typeof flags.craft === 'string'
      ? flags.craft.split(',').map((slug) => slug.trim().toLowerCase()).filter(Boolean)
      : undefined;
  return {
    ...baseBody,
    ...(typeof flags.name === 'string' ? { name: flags.name } : {}),
    ...(typeof flags['import-mode'] === 'string' ? { importMode: flags['import-mode'] } : {}),
    ...(craftApplies && craftApplies.length > 0 ? { craftApplies } : {}),
  };
}

/**
 * @internal POSTs import request to endpoint; handles responses and token-contract rebuilds.
 * @async
 * @param {object} flags - Parsed flags.
 * @param {string} endpoint - API endpoint path.
 * @param {object} body - Request body.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function postDesignSystemImport(flags, endpoint, body) {
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const imported = data.designSystem ?? data;
  console.log(`Imported ${imported.id ?? '(unknown id)'}${imported.title ? ` -> ${imported.title}` : ''}`);
  if (data.tokenContractRebuild?.job) {
    console.log(`Token contract rebuild queued: ${data.tokenContractRebuild.job.id}`);
  } else if (data.tokenContractRebuild?.decision?.reason) {
    console.log(`Token contract rebuild: ${data.tokenContractRebuild.decision.reason}`);
  }
}

// od design-systems rebuild-token-contract <id> [--force] [--json]
//
// Starts the same review-gated token contract rebuild job exposed in the web
// design-system detail view. Without --force the daemon only queues a job when
// source/token-contract.report.json recommends it.
/**
 * Queues a review-gated TOKEN_SCHEMA rebuild for an editable design system.
 * Without --force, rebuild only queues if daemon's quality report recommends it.
 * @async
 * @param {Array<string>} args - Subcommand and arguments (id, optional --force).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemTokenContractRebuild(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems rebuild-token-contract <id> [--force] [--json] [--daemon-url <url>]

Starts a review-gated TOKEN_SCHEMA token contract rebuild for an editable imported design system.

  <id>       Editable design-system id, e.g. user:acme-product.
  --force    Queue the review even when the quality report is already usable.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args, {
    string: LIBRARY_STRING_FLAGS,
    boolean: new Set([...LIBRARY_BOOLEAN_FLAGS, 'force']),
  });
  const id = positionalArgs(args, LIBRARY_STRING_FLAGS)[0];
  if (!id) {
    console.error('Usage: od design-systems rebuild-token-contract <id>');
    process.exit(2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(id)}/token-contract/rebuild-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: flags.force === true }),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  if (data.job) {
    console.log(`Token contract rebuild queued for ${id}: ${data.job.id}`);
    return;
  }
  const decision = data.decision;
  console.log(`Token contract rebuild not queued for ${id}: ${decision?.reason ?? 'no rebuild needed'}`);
}

// od design-systems import-shadcn <reference> [--name <name>]
//   [--import-mode <mode>] [--craft <slug,slug>] [--json] [--daemon-url <url>]
//
// Imports a shadcn registry item as an editable user design system via
// POST /api/design-systems/import/shadcn — the CLI mirror of the Settings →
// Design systems "shadcn" import source. <reference> is the shadcn CLI
// shorthand "<owner>/<repo>/<item>" (e.g. shadcn/ui/theme-zinc) or a direct
// https URL to a registry-item JSON document.
/**
 * Imports a shadcn registry item as an editable design system.
 * Reference is shadcn shorthand (owner/repo/item) or direct URL to registry-item JSON.
 * @async
 * @param {Array<string>} args - Subcommand and arguments (reference, optional flags).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemImportShadcn(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems import-shadcn <reference> [--name <name>] [--import-mode <mode>] [--craft <slugs>] [--json] [--daemon-url <url>]

Imports a shadcn registry item as an Open Design design system.

  <reference>            "<owner>/<repo>/<item>" (e.g. shadcn/ui/theme-zinc)
                         or an https URL to a registry-item JSON document.
  --name <name>          Display name override for the imported system.
  --import-mode <mode>   normalized | hybrid | verbatim (default hybrid).
  --craft <slugs>        Comma-separated craft sections to apply (e.g. color,type).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const stringFlags = new Set([...LIBRARY_STRING_FLAGS, 'name', 'import-mode', 'craft']);
  const flags = parseFlags(args, { string: stringFlags, boolean: LIBRARY_BOOLEAN_FLAGS });
  const reference = positionalArgs(args, stringFlags)[0];
  if (!reference) {
    console.error('Usage: od design-systems import-shadcn <reference>');
    process.exit(2);
  }
  const body = designSystemImportRequestBody(flags, { reference });
  return postDesignSystemImport(flags, '/api/design-systems/import/shadcn', body);
}

// od design-systems rename <id> --title <new-title> [--json]
// Renames an editable (user-created) design system via PATCH
// /api/design-systems/:id. Built-in systems are read-only and the daemon
// returns 404, surfaced here as a structured failure. Arg parsing lives in
// rename-args.ts so it can be unit-tested.
/**
 * @internal Helper for `od design-systems rename <id> --title <new-title>`.
 * Renames a user-created design system; built-in systems return 404.
 * Delegates arg parsing to parseDesignSystemRenameArgs for unit testing.
 * @async
 * @param {Array<string>} args - Subcommand arguments (id, flags).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runDesignSystemRename(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od design-systems rename <id> --title <new-title> [--json] [--daemon-url <url>]
  od design-systems rename <id> "<new title>" [--json]

Renames an editable (user-created) design system. Built-in systems are read-only.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const parsed = parseDesignSystemRenameArgs(args);
  if (!parsed) {
    console.error('Usage: od design-systems rename <id> --title <new-title>');
    process.exit(2);
  }
  const flags = parseFlags(args, {
    string: new Set([...LIBRARY_STRING_FLAGS, 'title']),
    boolean: LIBRARY_BOOLEAN_FLAGS,
  });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/design-systems/${encodeURIComponent(parsed.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: parsed.title }),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const renamed = data.designSystem ?? data;
  console.log(`Renamed ${parsed.id} -> ${renamed.title ?? parsed.title}`);
}
