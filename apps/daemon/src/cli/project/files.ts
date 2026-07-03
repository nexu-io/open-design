// @ts-nocheck
/** @module cli/project/files
 * Implements the od files command dispatcher for project file operations (list, read, write, upload, delete, diff, versions, version-read, version-create, version-restore).
 * Exports mintCliImportToken for desktop-authenticated folder imports.
 * Collaborators: createUnifiedDiff from diff.ts; sidecar IPC for import token minting.
 */
import { exitWithStructuredError, parseFlags, positionalArgs, readPromptFromFlags, structuredHttpFailure } from '../core/index.js';
import { createUnifiedDiff } from './diff.js';
import { PROJECT_BOOLEAN_FLAGS, PROJECT_STRING_FLAGS, projectDaemonUrl } from './project.js';
import { requestJsonIpc } from '@open-design/sidecar';
import { SIDECAR_ENV, SIDECAR_MESSAGES } from '@open-design/sidecar-proto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * @internal Validates --source flag for file versions (ai|manual|restore).
 * Returns null if value is missing; exits 2 if unrecognized.
 * @param {any} raw - Raw flag value.
 * @returns {string|null} Normalized source or null.
 */
function parseProjectFileVersionSourceFlag(raw) {
  if (raw == null) return null;
  if (raw === 'ai' || raw === 'manual' || raw === 'restore') return raw;
  console.error(`Invalid --source "${String(raw)}". Expected one of: ai, manual, restore.`);
  process.exit(2);
}

/**
 * Main dispatcher for `od files` subcommands (list, read, write, upload, delete, diff, versions, version-read, version-create, version-restore).
 * Versions support optional --prompt/--prompt-file for captioning and --source provenance.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runFiles(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od files list   <projectId>                  List files in a project.
  od files read   <projectId> <relpath>        Stream file bytes to stdout.
  od files write  <projectId> <relpath> [< stdin]
                                               Write content from stdin.
  od files upload <projectId> <localpath> [--as <relpath>]
                                               Upload a local file.
  od files delete <projectId> <name>           Delete a project file.
  od files diff   <projectId> <relpathA> [<relpathB> | --against -]
                                               Print a unified diff.
  od files versions <projectId> <relpath>      List saved HTML versions.
  od files version-read <projectId> <relpath> <versionId>
                                               Stream one saved HTML version.
  od files version-create <projectId> <relpath>
                                               Save the current HTML as a version.
  od files version-restore <projectId> <relpath> <versionId>
                                               Restore a saved HTML as a new current version.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --prompt-file <path|->  Read a version prompt from file/stdin where supported.
  --source <ai|manual|restore>
                       Version provenance where supported.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od files list <projectId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const files = Array.isArray(data?.files) ? data.files : [];
      for (const f of files) console.log(`${f.size}\t${f.name ?? f.path}`);
      return;
    }
    case 'read': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files read <projectId> <relpath>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files/${rel.split('/').map(encodeURIComponent).join('/')}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const buf = Buffer.from(await resp.arrayBuffer());
      process.stdout.write(buf);
      return;
    }
    case 'upload': {
      const positional = rest.filter((a) => !a.startsWith('-')
        && a !== flags.as);
      const [id, localPath] = positional;
      if (!id || !localPath) {
        console.error('Usage: od files upload <projectId> <localpath> [--as <relpath>]');
        process.exit(2);
      }
      const buf = readFileSync(localPath);
      const desiredName = typeof flags.as === 'string' && flags.as.length > 0
        ? flags.as
        : basename(localPath);
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          name: desiredName,
          content: buf.toString('base64'),
          encoding: 'base64',
        }),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] uploaded ${data?.file?.name ?? desiredName}`);
      return;
    }
    case 'write': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files write <projectId> <relpath> [< stdin]');
        process.exit(2);
      }
      // Read stdin synchronously into a buffer.
      let chunks = [];
      try {
        const stdin = readFileSync(0);
        chunks = [stdin];
      } catch (err) {
        console.error(`stdin read failed: ${err.message ?? err}`);
        process.exit(1);
      }
      const body = Buffer.concat(chunks);
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          name: rel,
          content: body.toString('utf8'),
          encoding: 'utf8',
        }),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] wrote ${data?.file?.name ?? rel}`);
      return;
    }
    case 'delete': {
      const positional = rest.filter((a) => !a.startsWith('-'));
      const [id, name] = positional;
      if (!id || !name) {
        console.error('Usage: od files delete <projectId> <name>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!resp.ok) return structuredHttpFailure(resp);
      console.log(`[files] deleted ${name}`);
      return;
    }
    case 'diff': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, relA, relB] = positional;
      const against = typeof flags.against === 'string' ? flags.against : null;
      if (!id || !relA || (!relB && !against) || (relB && against)) {
        console.error('Usage: od files diff <projectId> <relpathA> [<relpathB> | --against -]');
        process.exit(2);
      }
      const left = await fetchProjectFileText(base, id, relA);
      const rightLabel = against ?? relB;
      const right = against === '-'
        ? await readStdinUtf8()
        : await fetchProjectFileText(base, id, rightLabel);
      const diff = createUnifiedDiff(`a/${relA}`, `b/${rightLabel}`, left, right);
      if (flags.json) return process.stdout.write(JSON.stringify({ diff }, null, 2) + '\n');
      process.stdout.write(diff);
      return;
    }
    case 'versions': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files versions <projectId> <relpath>');
        process.exit(2);
      }
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions`,
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      for (const version of versions) {
        const marker = version.current ? '*' : ' ';
        const prompt = typeof version.prompt === 'string' && version.prompt.trim()
          ? version.prompt.trim().replace(/\s+/g, ' ').slice(0, 96)
          : '-';
        const createdAt = Number.isFinite(Number(version.createdAt))
          ? new Date(Number(version.createdAt)).toISOString()
          : '-';
        console.log(`${marker}\tv${version.version ?? '-'}\t${version.source ?? '-'}\t${createdAt}\t${version.id ?? '-'}\t${prompt}`);
      }
      return;
    }
    case 'version-read': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel, versionId] = positional;
      if (!id || !rel || !versionId) {
        console.error('Usage: od files version-read <projectId> <relpath> <versionId>');
        process.exit(2);
      }
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions/${encodeURIComponent(versionId)}`,
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      process.stdout.write(String(data?.content ?? ''));
      return;
    }
    case 'version-create': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel] = positional;
      if (!id || !rel) {
        console.error('Usage: od files version-create <projectId> <relpath> [--prompt <text> | --prompt-file <path|->] [--label <text>] [--source <ai|manual|restore>]');
        process.exit(2);
      }
      const source = parseProjectFileVersionSourceFlag(flags.source);
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (prompt !== null) body.prompt = prompt;
      if (typeof flags.label === 'string' && flags.label.length > 0) body.label = flags.label;
      if (source) body.source = source;
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[files] saved ${rel} as version ${data?.version?.version ?? data?.version?.id ?? '-'}`);
      return;
    }
    case 'version-restore': {
      const positional = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const [id, rel, versionId] = positional;
      if (!id || !rel || !versionId) {
        console.error('Usage: od files version-restore <projectId> <relpath> <versionId> [--prompt <text> | --prompt-file <path|->]');
        process.exit(2);
      }
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (prompt !== null) body.prompt = prompt;
      const resp = await fetch(
        `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}/versions/${encodeURIComponent(versionId)}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      if (data?.versionWarning?.message) console.error(`[files] warning: ${data.versionWarning.message}`);
      console.log(`[files] restored ${rel} as version ${data?.version?.version ?? data?.version?.id ?? '-'}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od files ${sub}`);
      process.exit(2);
  }
}

/**
 * @internal URL-encodes each path segment independently, then joins them (preserves slashes in the final URL).
 * @param {string} rel - Relative path with forward slashes.
 * @returns {string} URL-safe path.
 */
function encodeProjectRelpath(rel) {
  return String(rel).split('/').map(encodeURIComponent).join('/');
}

/**
 * @internal Fetches file content from /api/projects/:id/files/:relpath and returns as UTF-8 string.
 * @async
 * @param {string} base - Daemon base URL.
 * @param {string} id - Project ID.
 * @param {string} rel - Relative file path.
 * @returns {Promise<string>} File content or exit on failure.
 */
async function fetchProjectFileText(base, id, rel) {
  const resp = await fetch(
    `${base}/api/projects/${encodeURIComponent(id)}/files/${encodeProjectRelpath(rel)}`,
  );
  if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf.toString('utf8');
}

/**
 * @internal Dynamically imports node:fs and reads stdin (fd 0) as UTF-8.
 * @async
 * @returns {Promise<string>} stdin content.
 */
async function readStdinUtf8() {
  const fs = await import('node:fs');
  return fs.readFileSync(0, 'utf8');
}

/**
 * Requests an import token via sidecar IPC (MINT_IMPORT_TOKEN message).
 * Returns null if sidecar IPC is unavailable or times out (800ms).
 * Used by `od project import`, `od project import-folder`, and `od run redesign` to enable desktop auth.
 * @async
 * @param {string} baseDir - Folder path for token request context.
 * @returns {Promise<string|null>} Import token or null.
 */
export async function mintCliImportToken(baseDir) {
  const socketPath = process.env[SIDECAR_ENV.IPC_PATH];
  if (typeof socketPath !== 'string' || socketPath.length === 0) return null;
  let result;
  try {
    result = await requestJsonIpc(
      socketPath,
      { type: SIDECAR_MESSAGES.MINT_IMPORT_TOKEN, input: { baseDir } },
      { timeoutMs: 800 },
    );
  } catch {
    return null;
  }
  if (result?.ok === true && typeof result.token === 'string' && result.token.length > 0) {
    return result.token;
  }
  if (result?.ok === false && result.code === 'DESKTOP_AUTH_PENDING') {
    exitWithStructuredError({
      code: 'desktop-auth-pending',
      message: result.message ?? 'desktop auth required but secret not yet registered',
      data: { retryable: result.retryable === true },
    });
  }
  return null;
}
