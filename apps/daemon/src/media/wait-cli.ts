import { parseFlags, type CliFlags } from '../cli-args.js';

const MEDIA_WAIT_STRING_FLAGS = new Set(['since', 'daemon-url']);
const MEDIA_WAIT_BOOLEAN_FLAGS = new Set(['help', 'h']);

export interface MediaWaitPollOptions {
  totalBudgetMs?: number;
}

export interface MediaWaitCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  pollUntilDoneOrBudget: (
    daemonUrl: string,
    taskId: string,
    since: number,
    options?: MediaWaitPollOptions,
  ) => Promise<void>;
  writeStderr: (text: string) => void;
  printHelp: () => void;
  exit: (code: number) => never;
}

export async function runMediaWait(
  rawArgs: readonly string[],
  deps: MediaWaitCliDeps,
): Promise<void> {
  const taskId = rawArgs.find((arg) => arg && !arg.startsWith('--'));
  if (!taskId) {
    deps.writeStderr('usage: od media wait <taskId> [--since <n>] [--daemon-url <url>]\n');
    deps.exit(2);
  }

  const flagsOnly = rawArgs.filter((arg) => arg !== taskId);
  let flags: CliFlags;
  try {
    flags = parseFlags(flagsOnly, {
      string: MEDIA_WAIT_STRING_FLAGS,
      boolean: MEDIA_WAIT_BOOLEAN_FLAGS,
    });
  } catch (error: unknown) {
    deps.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    deps.printHelp();
    deps.exit(2);
  }

  const daemonUrl = await deps.resolveDaemonUrl(flags);
  const since = Number.isFinite(Number(flags.since)) ? Number(flags.since) : 0;
  await deps.pollUntilDoneOrBudget(daemonUrl, taskId, since, { totalBudgetMs: 120_000 });
}
