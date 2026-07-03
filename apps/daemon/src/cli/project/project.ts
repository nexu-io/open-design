// @ts-nocheck
/**
 * @module cli/project/project
 */
import { runProjectHandoff } from '../../handoff-cli.js';
import { RECOVERABLE_EXIT_CODES, cliDaemonUrl, exitWithStructuredError, parseFlags, positionalArgs, readPromptFromFlags, structuredHttpFailure, surfaceFetchError } from '../core/index.js';
import { normalizeChatSessionModeFlag } from './chat.js';
import { mintCliImportToken } from './files.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const PROJECT_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'skill', 'design-system', 'plugin', 'metadata-json',
  'pending-prompt', 'project', 'conversation', 'message', 'prompt',
  'prompt-file', 'path', 'dir', 'as',
  'agent', 'model', 'snapshot-id', 'inputs', 'grant-caps', 'editor',
  'title', 'label', 'against', 'seed-from', 'fork-after', 'mode',
  'source',
]);

export const PROJECT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'follow']);
// `od templates …` mirrors NewProjectPanel / ExamplesTab. Same surface,
// same /api/templates store. The CLI form is the embeddability contract:
// external agents (hermes-agent, openclaw, ...) can snapshot, list, or
// remove user-saved project templates without going through the web UI.

export async function projectDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

function safeReadJsonFile(p) {
  try {
    if (p === '-') return JSON.parse(readFileSync(0, 'utf8'));
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function collectCliPositionals(argv, stringFlags = new Set()) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--') {
      out.push(...argv.slice(i + 1));
      break;
    }
    if (typeof value === 'string' && value.startsWith('--')) {
      const eq = value.indexOf('=');
      const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
      if (eq < 0 && stringFlags.has(key)) i++;
      continue;
    }
    out.push(value);
  }
  return out;
}

export async function resolveFolderPathForCli(rawPath) {
  const path = await import('node:path');
  const os = await import('node:os');
  const raw = typeof rawPath === 'string' && rawPath.trim().length > 0
    ? rawPath.trim()
    : (process.env.INIT_CWD || process.cwd());
  const expanded = raw === '~'
    ? os.homedir()
    : raw.startsWith(`~${path.sep}`)
      ? path.join(os.homedir(), raw.slice(2))
      : raw;
  return path.resolve(expanded);
}

export async function basenameForCli(folderPath) {
  const path = await import('node:path');
  return path.basename(folderPath) || 'Imported project';
}

export async function postJsonToDaemon(base, route, body, headers = {}) {
  let resp;
  try {
    resp = await fetch(`${base}${route}`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body:    JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errCode = data?.error?.code;
    if (errCode && errCode in RECOVERABLE_EXIT_CODES) {
      return exitWithStructuredError({
        code:    errCode,
        message: data.error.message ?? `HTTP ${resp.status}`,
        data:    data.error.data,
      });
    }
    console.error(`POST ${route} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  return data;
}

export async function postImportFolderToDaemon(base, body, baseDir) {
  const headers = {};
  const importToken = await mintCliImportToken(baseDir);
  if (importToken != null) {
    headers['x-od-desktop-import-token'] = importToken;
  }
  return postJsonToDaemon(base, '/api/import/folder', body, headers);
}

export async function runProject(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od project create [--name "<title>"] [--skill <id>] [--design-system <id>]
                    [--plugin <id>] [--inputs <json>] [--metadata-json <path|->]
                    [--mode design|chat|plan]
  od project create-design-system <id> [--name "<title>"]
                    [--prompt "<text>" | --prompt-file <path|->] [--json]
                    Duplicate a project as a design-system workspace and seed
                    the design-system generation prompt.
  od project duplicate <id> [--name "<title>"] [--json]
                    Duplicate a project and copy its Design Files.
  od project import <baseDir> [--name "<title>"]
  od project import-folder <path> [--name "<title>"] [--skill <id>]
                    [--design-system <id>] [--json]
  od project list                         List projects.
  od project info <id>                    Print one project.
  od project delete <id>                  Delete a project.
  od project editors                      List locally-installed editors that
                                          can open a project (hand-off targets).
  od project open-in <id> --editor <slug> Open the project's working directory
                                          in the chosen editor (cursor, zed,
                                          vscode, finder, terminal, …).
  od project handoff <id> --conversation <id> --api-key <key> --model <model>
                    [--base-url <url>] [--max-tokens <n>]
                    Synthesize a resume-conversation handoff prompt.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  // Handoff owns its own flag parsing, daemon-URL resolution, and
  // structured fail() output. Dispatch it before the generic project
  // parser below so a malformed `od project handoff` invocation
  // (`--unknown`, `--max-tokens` with no value) hits handoff-cli's
  // machine-readable fail() path instead of throwing out of parseFlags.
  if (sub === 'handoff') {
    const { exitCode } = await runProjectHandoff(rest);
    if (exitCode !== 0) process.exit(exitCode);
    return;
  }
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}/api/projects`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const projects = data?.projects ?? [];
      if (projects.length === 0) {
        console.log('No projects. Create one with `od project create --name "..."`.');
        return;
      }
      for (const p of projects) console.log(`${p.id}\t${p.name}\t${p.skillId ?? '-'}`);
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project info <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'create': {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      const name = typeof flags.name === 'string' && flags.name.length > 0
        ? flags.name
        : 'Untitled project';
      const body = {
        id,
        name,
        skillId:        flags.skill ?? null,
        designSystemId: flags['design-system'] ?? null,
      };
      const conversationMode = normalizeChatSessionModeFlag(flags.mode);
      if (conversationMode) body.conversationMode = conversationMode;
      if (flags['pending-prompt']) body.pendingPrompt = flags['pending-prompt'];
      if (flags['metadata-json']) {
        const mj = safeReadJsonFile(flags['metadata-json']);
        if (mj && typeof mj === 'object') body.metadata = mj;
      }
      if (flags.plugin) body.pluginId = flags.plugin;
      if (flags.inputs) {
        try { body.pluginInputs = JSON.parse(flags.inputs); } catch (err) {
          console.error(`--inputs must be valid JSON: ${err.message}`);
          process.exit(2);
        }
      }
      if (flags['grant-caps']) {
        body.grantCaps = String(flags['grant-caps']).split(',').map((c) => c.trim()).filter(Boolean);
      }
      const resp = await fetch(`${base}/api/projects`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409 && data?.error?.code === 'capabilities-required') {
          return exitWithStructuredError({
            code:    'capabilities-required',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        console.error(`POST /api/projects failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] created ${data.project?.id ?? id} (conversation ${data.conversationId})`);
      return;
    }
    case 'create-design-system': {
      const sourceProjectId = positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!sourceProjectId) {
        console.error('Usage: od project create-design-system <id> [--name "<title>"] [--prompt-file <path|->] [--json]');
        process.exit(2);
      }
      const prompt = await readPromptFromFlags(flags);
      const body = {};
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      if (typeof prompt === 'string' && prompt.trim().length > 0) body.pendingPrompt = prompt;
      const data = await postJsonToDaemon(
        base,
        `/api/projects/${encodeURIComponent(sourceProjectId)}/design-system-copy`,
        body,
      );
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(
        `[project] created design system project ${data.project?.id ?? '-'} from ${sourceProjectId} `
        + `(design system ${data.designSystemId ?? '-'}, conversation ${data.conversationId ?? '-'})`,
      );
      return;
    }
    case 'duplicate': {
      const sourceProjectId = positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!sourceProjectId) {
        console.error('Usage: od project duplicate <id> [--name "<title>"] [--json]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      const data = await postJsonToDaemon(
        base,
        `/api/projects/${encodeURIComponent(sourceProjectId)}/duplicate`,
        body,
      );
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(
        `[project] duplicated ${sourceProjectId} as ${data.project?.id ?? '-'} `
        + `(conversation ${data.conversationId ?? '-'})`,
      );
      return;
    }
    case 'import': {
      const [baseDir] = positionalArgs(rest, PROJECT_STRING_FLAGS);
      const importBaseDir = typeof baseDir === 'string' ? baseDir.trim() : '';
      if (!importBaseDir) {
        console.error('Usage: od project import <baseDir> [--name "<title>"]');
        process.exit(2);
      }
      const body = { baseDir: importBaseDir };
      if (typeof flags.name === 'string' && flags.name.length > 0) body.name = flags.name;
      if (typeof flags.skill === 'string' && flags.skill.length > 0) body.skillId = flags.skill;
      if (typeof flags['design-system'] === 'string' && flags['design-system'].length > 0) {
        body.designSystemId = flags['design-system'];
      }
      const headers = { 'content-type': 'application/json' };
      const importToken = await mintCliImportToken(importBaseDir);
      if (importToken != null) {
        headers['x-od-desktop-import-token'] = importToken;
      }
      const resp = await fetch(`${base}/api/import/folder`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] imported ${data.project?.id ?? '-'} (conversation ${data.conversationId ?? '-'})`);
      return;
    }
    case 'import-folder': {
      const parts = collectCliPositionals(rest, PROJECT_STRING_FLAGS);
      const folderArg = flags.path ?? flags.dir ?? parts[0];
      if (!folderArg) {
        console.error('Usage: od project import-folder <path> [--skill <id>] [--design-system <id>]');
        process.exit(2);
      }
      const folderPath = await resolveFolderPathForCli(folderArg);
      const body = {
        baseDir:        folderPath,
        name:           typeof flags.name === 'string' && flags.name.length > 0
          ? flags.name
          : await basenameForCli(folderPath),
        skillId:        flags.skill ?? null,
        designSystemId: flags['design-system'] ?? null,
      };
      const data = await postImportFolderToDaemon(base, body, folderPath);
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] imported ${data.project?.id ?? '-'} from ${folderPath} (conversation ${data.conversationId ?? '-'})`);
      return;
    }
    case 'delete': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project delete <id>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      console.log(`[project] deleted ${id}`);
      return;
    }
    case 'editors': {
      const resp = await fetch(`${base}/api/editors`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const editors = data?.editors ?? [];
      for (const ed of editors) {
        const status = ed.available ? 'available' : 'missing';
        console.log(`${ed.id}\t${ed.label}\t${status}`);
      }
      return;
    }
    case 'open-in': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od project open-in <id> --editor <slug>');
        process.exit(2);
      }
      const editor = typeof flags.editor === 'string' ? flags.editor : '';
      if (!editor) {
        console.error('--editor <slug> is required. Run `od project editors` to list options.');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/open-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editorId: editor }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (flags.json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
        else console.error(`POST /api/projects/${id}/open-in failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      console.log(`[project] opened ${id} in ${editor} (${data.path ?? ''})`);
      return;
    }
    default:
      console.error(`unknown subcommand: od project ${sub}`);
      process.exit(2);
  }
}
