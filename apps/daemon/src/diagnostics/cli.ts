import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFlags, type CliFlags } from '../cli-args.js';
import {
  DIAGNOSTICS_EXPORT_PATH,
  DIAGNOSTICS_FILENAME_PREFIX,
  diagnosticsFileName,
} from '@open-design/diagnostics';

const DIAGNOSTICS_STRING_FLAGS = new Set(['daemon-url', 'output']);
const DIAGNOSTICS_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

export interface DiagnosticsCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  fetch: typeof globalThis.fetch;
  exitWithStructuredError: (failure: { code: string; message: string }) => never;
  structuredHttpFailure: (response: Response) => Promise<never>;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  log: (text: string) => void;
  exit: (code: number) => never;
}

export function printDiagnosticsHelp(write: (text: string) => void = console.log): void {
  write(`Usage:
  od diagnostics export [<path>] [--output <path>] [--json] [--daemon-url <url>]

Bundles daemon/web/desktop logs, machine info, and recent crash reports
into a zip. The bundle is the same one Settings → About → Export
diagnostics produces.

  <path>                 Where to write the zip. Defaults to
                         ./open-design-diagnostics-<timestamp>.zip in the
                         current working directory. Alias: --output <path>.
  --json                 Print {path, sizeBytes} on stdout instead of a
                         human-readable summary. The file is still written
                         to <path>.
  --daemon-url <url>     Override the daemon HTTP base URL.`);
}

export async function runDiagnostics(
  args: readonly string[],
  deps: DiagnosticsCliDeps,
): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printDiagnosticsHelp();
    deps.exit(0);
  }
  if (sub !== 'export') {
    deps.writeStderr(`unknown subcommand: od diagnostics ${sub}\n`);
    deps.exit(2);
  }

  const flags = parseFlags([...args.slice(1)], {
    string: DIAGNOSTICS_STRING_FLAGS,
    boolean: DIAGNOSTICS_BOOLEAN_FLAGS,
  });
  const positional = args.slice(1).filter((arg) => !arg.startsWith('-'));
  const base = (await deps.resolveDaemonUrl(flags)).replace(/\/$/, '');
  const explicitOutput = typeof flags.output === 'string' && flags.output.length > 0
    ? flags.output
    : positional[0];
  const targetPath = path.resolve(
    explicitOutput ?? diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX),
  );

  let response: Response;
  try {
    response = await deps.fetch(`${base}${DIAGNOSTICS_EXPORT_PATH}`);
  } catch (error: unknown) {
    deps.exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  if (!response.ok) return deps.structuredHttpFailure(response);

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, buffer);

  if (flags.json === true) {
    deps.writeStdout(`${JSON.stringify({ path: targetPath, sizeBytes: buffer.length })}\n`);
    return;
  }
  deps.log(`Wrote diagnostics bundle to ${targetPath} (${buffer.length} bytes).`);
}
