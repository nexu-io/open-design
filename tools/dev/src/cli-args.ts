const CLI_COMMANDS = new Set(["start", "run", "status", "stop", "restart", "logs", "inspect", "check", "help"]);
const OPTIONS_WITH_VALUE = new Set([
  "--daemon-port",
  "--env-file",
  "--expr",
  "--namespace",
  "--path",
  "--selector",
  "--timeout",
  "--tools-dev-root",
  "--update-action",
  "--web-port",
]);

export function rewriteCliArgsForDefaultStart(args: readonly string[]): string[] {
  const firstPositionalIndex = firstPositionalArgIndex(args);
  const firstPositional = firstPositionalIndex >= 0 ? args[firstPositionalIndex] : undefined;
  if (isGlobalHelpRequest(args, firstPositional) || CLI_COMMANDS.has(firstPositional ?? "")) return [...args];

  const rewritten = [...args];
  rewritten.splice(firstPositionalIndex >= 0 ? firstPositionalIndex : 0, 0, "start");
  return rewritten;
}

function isGlobalHelpRequest(args: readonly string[], firstPositional: string | undefined): boolean {
  return firstPositional === undefined && args.some((arg) => arg === "--help" || arg === "-h");
}

function firstPositionalArgIndex(args: readonly string[]): number {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") return index + 1 < args.length ? index + 1 : -1;
    if (arg.startsWith("--") && arg.includes("=")) continue;
    if (OPTIONS_WITH_VALUE.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return index;
  }
  return -1;
}
