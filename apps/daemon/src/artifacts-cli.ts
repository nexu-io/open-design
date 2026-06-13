import { readFile } from 'node:fs/promises';
import { postCreateArtifactRequest } from './artifact-create.js';
import { resolveDaemonUrl } from './daemon-url.js';
import { resolveProjectArg, withActiveEcho } from './mcp.js';

type JsonObject = Record<string, unknown>;

interface ArtifactCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  project?: string;
  name?: string;
  inputPath?: string;
  manifestPath?: string;
  daemonUrl?: string;
  encoding: 'utf8' | 'base64';
  help: boolean;
}

const USAGE = `Usage:
  od artifacts create --name <path> --input <file> [--project <id-or-name>] [--manifest artifact.json] [--encoding utf8|base64] [--daemon-url <url>]

Creates one normal Open Design project artifact entry file through the local daemon.
When --project is omitted, the active Open Design project is used.
Existing target paths are rejected.
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, details?: unknown, status?: number): ArtifactCliResult {
  writeJson(
    {
      ok: false,
      ...(status === undefined ? {} : { status }),
      error: { message, ...(details === undefined ? {} : { details }) },
    },
    process.stderr,
  );
  return { exitCode: 1 };
}

function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    encoding: 'utf8',
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--project') {
      const value = rest[++index];
      if (!value) return { error: '--project requires a value' };
      options.project = value;
    } else if (arg === '--name') {
      const value = rest[++index];
      if (!value) return { error: '--name requires a path' };
      options.name = value;
    } else if (arg === '--input') {
      const value = rest[++index];
      if (!value) return { error: '--input requires a file path' };
      options.inputPath = value;
    } else if (arg === '--manifest') {
      const value = rest[++index];
      if (!value) return { error: '--manifest requires a file path' };
      options.manifestPath = value;
    } else if (arg === '--daemon-url') {
      const value = rest[++index];
      if (!value) return { error: '--daemon-url requires a URL' };
      options.daemonUrl = value;
    } else if (arg === '--encoding') {
      const value = rest[++index];
      if (value !== 'utf8' && value !== 'base64') return { error: '--encoding must be utf8 or base64' };
      options.encoding = value;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      return { error: `unknown option: ${arg}` };
    }
  }

  return options;
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  const text = await readFile(filePath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in ${filePath}: ${message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return value as JsonObject;
}

export async function runArtifactsCli(args: string[]): Promise<ArtifactCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }
  if (options.command !== 'create') return fail(`unknown artifacts command: ${options.command}`);
  if (!options.name) return fail('create requires --name <path>');
  if (!options.inputPath) return fail('create requires --input <file>');

  try {
    const daemonUrl = await resolveDaemonUrl(
      options.daemonUrl === undefined ? {} : { flagUrl: options.daemonUrl },
    );
    const { id, resolved, active } = await resolveProjectArg(daemonUrl, options.project);
    const fileBuffer = await readFile(options.inputPath);
    const content = options.encoding === 'base64' ? fileBuffer.toString('base64') : fileBuffer.toString('utf8');
    const artifactManifest = options.manifestPath === undefined
      ? undefined
      : await readJsonObject(options.manifestPath);
    const response = await postCreateArtifactRequest({
      baseUrl: daemonUrl,
      projectId: id,
      input: {
        name: options.name,
        content,
        encoding: options.encoding,
        ...(artifactManifest === undefined ? {} : { artifactManifest }),
      },
    });
    const payload = response && typeof response === 'object' && !Array.isArray(response)
      ? (response as JsonObject)
      : { result: response };
    writeJson({ ok: true, ...withActiveEcho(payload, active, resolved) });
    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error && typeof error === 'object' && 'details' in error
      ? (error as { details?: unknown }).details
      : undefined;
    const status = error && typeof error === 'object' && 'status' in error
      ? (error as { status?: number }).status
      : undefined;
    return fail(message, details, status);
  }
}
