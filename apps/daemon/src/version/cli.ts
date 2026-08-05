import { parseFlags, type CliFlags } from '../cli-args.js';

const VERSION_STRING_FLAGS = new Set(['daemon-url']);
const VERSION_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

export interface VersionCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  fetch: typeof globalThis.fetch;
  exitWithStructuredError: (failure: { code: string; message: string }) => never;
  structuredHttpFailure: (response: Response) => Promise<never>;
  writeStdout: (text: string) => void;
  log: (text: string) => void;
}

export async function runVersion(
  args: readonly string[],
  deps: VersionCliDeps,
): Promise<void> {
  const flags = parseFlags([...args], {
    string: VERSION_STRING_FLAGS,
    boolean: VERSION_BOOLEAN_FLAGS,
  });
  const base = (await deps.resolveDaemonUrl(flags)).replace(/\/$/, '');
  let response: Response;
  try {
    response = await deps.fetch(`${base}/api/version`);
  } catch (error: unknown) {
    deps.exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  if (!response.ok) return deps.structuredHttpFailure(response);

  const data: unknown = await response.json();
  if (flags.json === true) {
    deps.writeStdout(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  const version = typeof data === 'object' && data !== null && 'version' in data
    ? (typeof data.version === 'string'
      ? data.version
      : typeof data.version === 'object' && data.version !== null && 'version' in data.version
        ? data.version.version
        : JSON.stringify(data))
    : JSON.stringify(data);
  deps.log(typeof version === 'string' ? version : JSON.stringify(version));
}
