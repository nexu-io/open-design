import { constants } from 'node:fs';
import { lstat, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveDaemonUrl } from './daemon-url.js';
import { GROUNDED_PPTX_LIMITS } from './pptx-grounded/office-kit-adapter.js';

const USAGE = `Usage:
  od pptx import <project> <file> [--daemon-url <url>] [--json]
  od pptx analyze <project> [--daemon-url <url>] [--json]
  od pptx apply <project> --operations <file> --expected-revision <id> [--daemon-url <url>] [--json]
  od pptx preview <project> --revision <id> --slide <index> --output <png> [--daemon-url <url>] [--json]
  od pptx export <project> --output <file> [--revision <id>] [--daemon-url <url>] [--json]`;

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name === 'json' || name === 'help') {
      flags[name] = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    flags[name] = value;
    index += 1;
  }
  return { positionals, flags };
}

async function responseJson(response: Response): Promise<unknown> {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'error' in value
        ? String((value as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value;
}

async function readImportFileSafely(file: string): Promise<Uint8Array> {
  if (!constants.O_NOFOLLOW) {
    throw new Error('symlink-safe PPTX imports are unsupported on this platform');
  }
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('pptx import requires a non-symlink regular .pptx file');
    }
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error('pptx import requires a regular .pptx file');
    if (before.size > GROUNDED_PPTX_LIMITS.maxCompressedBytes) {
      throw new Error('PPTX compressed size exceeds limit');
    }
    const namedBefore = await lstat(file);
    if (namedBefore.isSymbolicLink() || namedBefore.dev !== before.dev || namedBefore.ino !== before.ino) {
      throw new Error('pptx import file changed during read');
    }
    const bytes = new Uint8Array(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const namedAfter = await lstat(file);
    if (offset !== before.size || after.dev !== before.dev || after.ino !== before.ino ||
        after.size !== before.size || after.size > GROUNDED_PPTX_LIMITS.maxCompressedBytes ||
        namedAfter.isSymbolicLink() || namedAfter.dev !== before.dev || namedAfter.ino !== before.ino) {
      throw new Error('pptx import file changed during read');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function runGroundedPptxCli(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.flags.help || parsed.positionals.length === 0) {
    console.log(USAGE);
    return;
  }
  const [command, projectId, file] = parsed.positionals;
  if (!projectId) throw new Error(`${command ?? 'pptx'} requires a project id`);
  const base = await resolveDaemonUrl({
    flagUrl: typeof parsed.flags['daemon-url'] === 'string' ? parsed.flags['daemon-url'] : null,
  });
  const root = `${base}/api/projects/${encodeURIComponent(projectId)}/pptx`;
  let result: unknown;

  if (command === 'import') {
    if (!file) throw new Error('pptx import requires a .pptx file');
    const bytes = await readImportFileSafely(file);
    const form = new FormData();
    form.append(
      'file',
      new Blob([Uint8Array.from(bytes).buffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
      path.basename(file),
    );
    result = await responseJson(await fetch(`${root}/import`, { method: 'POST', body: form }));
  } else if (command === 'analyze') {
    result = await responseJson(await fetch(root));
  } else if (command === 'apply') {
    const operationsFile = parsed.flags.operations;
    const expectedRevisionId = parsed.flags['expected-revision'];
    if (typeof operationsFile !== 'string' || typeof expectedRevisionId !== 'string') {
      throw new Error('pptx apply requires --operations and --expected-revision');
    }
    const mutations = JSON.parse(await readFile(operationsFile, 'utf8')) as unknown;
    result = await responseJson(
      await fetch(`${root}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevisionId, mutations }),
      }),
    );
  } else if (command === 'preview') {
    const output = parsed.flags.output;
    const revisionId = parsed.flags.revision;
    const slideValue = parsed.flags.slide;
    if (typeof output !== 'string' || typeof revisionId !== 'string' || typeof slideValue !== 'string') {
      throw new Error('pptx preview requires --revision, --slide, and --output');
    }
    const slideIndex = Number(slideValue);
    if (!Number.isInteger(slideIndex) || slideIndex < 0) throw new Error('pptx preview --slide must be a non-negative integer');
    const response = await fetch(`${root}/revisions/${encodeURIComponent(revisionId)}/slides/${slideIndex}/preview`);
    if (!response.ok) await responseJson(response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(output, bytes);
    result = { output, revisionId, slideIndex, size: bytes.byteLength };
  } else if (command === 'export') {
    const output = parsed.flags.output;
    if (typeof output !== 'string') throw new Error('pptx export requires --output');
    let revisionId =
      typeof parsed.flags.revision === 'string' ? parsed.flags.revision : undefined;
    if (revisionId === undefined) {
      const current = (await responseJson(await fetch(root))) as {
        manifest?: { currentRevisionId?: unknown };
      };
      const currentRevisionId = current.manifest?.currentRevisionId;
      if (typeof currentRevisionId === 'string') revisionId = currentRevisionId;
    }
    if (typeof revisionId !== 'string') throw new Error('daemon returned no current PPTX revision');
    const response = await fetch(`${root}/revisions/${encodeURIComponent(revisionId)}/download`);
    if (!response.ok) await responseJson(response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(output, bytes);
    result = { output, revisionId, size: bytes.byteLength };
  } else {
    throw new Error(`unknown pptx command: ${command}\n${USAGE}`);
  }

  if (parsed.flags.json) console.log(JSON.stringify(result));
  else console.log(command === 'export' ? `PPTX exported to ${(result as { output: string }).output}` : JSON.stringify(result, null, 2));
}
