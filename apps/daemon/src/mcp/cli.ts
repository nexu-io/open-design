import { parseFlags, type CliFlags } from '../cli-args.js';

const MCP_STRING_FLAGS = new Set(['daemon-url']);
const MCP_BOOLEAN_FLAGS = new Set(['help', 'h']);

export interface McpCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  runMcpStdio: (input: { daemonUrl: string }) => Promise<void>;
  writeStderr: (text: string) => void;
  printHelp: () => void;
  exit: (code: number) => never;
}

export async function runMcp(args: readonly string[], deps: McpCliDeps): Promise<void> {
  let flags: CliFlags;
  try {
    flags = parseFlags(args, {
      string: MCP_STRING_FLAGS,
      boolean: MCP_BOOLEAN_FLAGS,
    });
  } catch (error: unknown) {
    deps.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    deps.printHelp();
    deps.exit(2);
  }

  if (flags.help || flags.h) {
    deps.printHelp();
    return;
  }

  const daemonUrl = await deps.resolveDaemonUrl(flags);
  await deps.runMcpStdio({ daemonUrl });
}
