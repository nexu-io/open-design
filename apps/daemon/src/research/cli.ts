import { parseFlags, type CliFlags } from '../cli-args.js';
import { splitResearchSubcommand } from './cli-args.js';

const RESEARCH_SEARCH_STRING_FLAGS = new Set(['query', 'max-sources', 'daemon-url']);
const RESEARCH_SEARCH_BOOLEAN_FLAGS = new Set(['help', 'h']);

export interface ResearchCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  fetch: typeof globalThis.fetch;
  surfaceFetchError: (error: unknown, daemonUrl: string) => void;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  exit: (code: number) => never;
}

export function printResearchHelp(write: (text: string) => void = console.log): void {
  write(`Usage:
  od research search --query <text> [--max-sources 5] [--daemon-url <url>]

Runs Tavily-backed shallow research through the local Open Design daemon.
Output is JSON only on stdout:
  { "query": "...", "summary": "...", "sources": [...], "provider": "tavily", "depth": "shallow", "fetchedAt": 0 }

Flags:
  --query        Required search query.
  --max-sources  Optional source cap. Defaults to 5, clamped to Tavily's max.
  --daemon-url   Local daemon URL. Defaults to OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456.`);
}

export async function runResearch(args: readonly string[], deps: ResearchCliDeps): Promise<void> {
  const { sub, subArgs } = splitResearchSubcommand([...args]);
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printResearchHelp();
    deps.exit(sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  if (sub !== 'search') {
    deps.writeStderr(`unknown subcommand: od research ${sub}\n`);
    printResearchHelp();
    deps.exit(2);
  }

  let flags: CliFlags;
  try {
    flags = parseFlags(subArgs, {
      string: RESEARCH_SEARCH_STRING_FLAGS,
      boolean: RESEARCH_SEARCH_BOOLEAN_FLAGS,
    });
  } catch (error: unknown) {
    deps.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    printResearchHelp();
    deps.exit(2);
  }

  const query = typeof flags.query === 'string' ? flags.query.trim() : '';
  if (!query) {
    deps.writeStderr('--query required\n');
    deps.exit(2);
  }

  const daemonUrl = await deps.resolveDaemonUrl(flags);
  const maxSources = flags['max-sources'] == null ? undefined : Number(flags['max-sources']);
  let response: Response;
  try {
    response = await deps.fetch(`${daemonUrl.replace(/\/$/, '')}/api/research/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        ...(Number.isFinite(maxSources) ? { maxSources } : {}),
      }),
    });
  } catch (error: unknown) {
    deps.surfaceFetchError(error, daemonUrl);
    deps.exit(3);
  }
  if (!response.ok) {
    const text = await response.text();
    deps.writeStderr(`daemon ${response.status}: ${text}\n`);
    deps.exit(4);
  }
  deps.writeStdout(`${await response.text()}\n`);
}
