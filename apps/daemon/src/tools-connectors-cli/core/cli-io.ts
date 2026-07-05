/** @module core/cli-io
 * CLI option parsing, daemon URL/token resolution, and JSON I/O helpers shared by all subcommands.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MAX_GITHUB_CONTEXT_FILES, MAX_LOCAL_CONTEXT_FILES } from './types.js';
import type { JsonObject, ParsedOptions, ToolCliResult } from './types.js';

/**
 * Writes a value as a single JSON line to a writable stream (default: stdout).
 * @param stream — Destination stream; defaults to `process.stdout`.
 */
export function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

/**
 * Writes a JSON error object to stderr and returns an exit-code-1 result.
 * @param message — Human-readable error message.
 * @param details — Optional structured details attached to the error body.
 */
export function fail(message: string, details?: unknown): ToolCliResult {
  writeJson({ ok: false, error: { message, ...(details === undefined ? {} : { details }) } }, process.stderr);
  return { exitCode: 1 };
}

/**
 * Parses a raw argument slice into a `ParsedOptions` object, or returns `{ error }` on invalid input.
 * @param args — Argument array starting after the subcommand name (e.g. `process.argv.slice(2)`).
 * @returns A `ParsedOptions` object, or `{ error: string }` describing the first invalid argument.
 */
export function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    format: 'compact',
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--connector') {
      const value = rest[++index];
      if (!value) return { error: '--connector requires a connector id' };
      options.connectorId = value;
    } else if (arg === '--tool') {
      const value = rest[++index];
      if (!value) return { error: '--tool requires a tool name' };
      options.toolName = value;
    } else if (arg === '--input') {
      const value = rest[++index];
      if (!value) return { error: '--input requires a file path' };
      options.inputPath = value;
    } else if (arg === '--path') {
      const value = rest[++index];
      if (!value) return { error: '--path requires a local folder path' };
      options.localPath = value;
    } else if (arg === '--repo') {
      const value = rest[++index];
      if (!value) return { error: '--repo requires owner/repo or a GitHub repository URL' };
      options.repo = value;
    } else if (arg === '--ref') {
      const value = rest[++index];
      if (!value) return { error: '--ref requires a branch, tag, or commit' };
      options.ref = value;
    } else if (arg === '--output') {
      const value = rest[++index];
      if (!value) return { error: '--output requires a file path' };
      options.outputPath = value;
    } else if (arg === '--max-files') {
      const value = rest[++index];
      const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) return { error: '--max-files must be a positive integer' };
      options.maxFiles = Math.min(
        parsed,
        options.command === 'local-design-context' ? MAX_LOCAL_CONTEXT_FILES : MAX_GITHUB_CONTEXT_FILES,
      );
    } else if (arg === '--require-connector') {
      options.requireConnector = true;
    } else if (arg === '--reference-package') {
      options.referencePackage = true;
    } else if (arg === '--fail-on-warnings') {
      options.failOnWarnings = true;
    } else if (arg === '--format') {
      const value = rest[++index];
      if (value !== 'compact' && value !== 'json') return { error: '--format must be compact or json' };
      options.format = value;
    } else if (arg === '--use-case') {
      const value = rest[++index];
      if (value !== 'personal_daily_digest') return { error: '--use-case must be personal_daily_digest' };
      options.useCase = value;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      return { error: `unknown option: ${arg}` };
    }
  }

  return options;
}

/**
 * Reads and normalizes `OD_DAEMON_URL` into a `URL` object, stripping trailing slashes, search, and hash.
 * @returns A `URL`, or `{ error: string }` if the env var is absent or malformed.
 */
export function daemonUrl(): URL | { error: string } {
  const rawUrl = process.env.OD_DAEMON_URL;
  if (!rawUrl) return { error: 'OD_DAEMON_URL is required' };
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/\/+$/u, '');
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return { error: 'OD_DAEMON_URL must be a valid URL' };
  }
}

/**
 * Reads `OD_TOOL_TOKEN` from the environment.
 * @returns The token string, or `{ error: string }` if the env var is absent.
 */
export function toolToken(): string | { error: string } {
  const token = process.env.OD_TOOL_TOKEN;
  if (!token) return { error: 'OD_TOOL_TOKEN is required' };
  return token;
}

/**
 * Appends a relative pathname (and optional query string) to a base URL, deduplicating slashes.
 * @param baseUrl — The daemon base URL returned by `daemonUrl`.
 * @param pathname — Path segment to append, optionally including a `?query` portion.
 */
export function endpoint(baseUrl: URL, pathname: string): string {
  const url = new URL(baseUrl.toString());
  const [pathPart, searchPart] = pathname.split('?');
  url.pathname = `${url.pathname}${pathPart ?? ''}`.replace(/\/+/gu, '/');
  url.search = searchPart === undefined ? '' : `?${searchPart}`;
  return url.toString();
}

/** Reads a file from disk and parses it as JSON, throwing a descriptive error on parse failure. @internal */
async function readJsonFile(filePath: string): Promise<unknown> {
  const resolved = path.resolve(filePath);
  const text = await readFile(resolved, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in ${resolved}: ${message}`);
  }
}

/**
 * Reads a JSON file from disk and asserts that the top-level value is a plain object.
 * @param filePath — Path to the JSON file (resolved relative to cwd).
 * @returns The parsed object.
 */
export async function readJsonObject(filePath: string): Promise<JsonObject> {
  const value = await readJsonFile(filePath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path.resolve(filePath)} must contain a JSON object`);
  }
  return value as JsonObject;
}
