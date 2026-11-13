export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

/**
 * String flags whose value is consumed positionally (`--flag value`), so the
 * value must not be mistaken for the subcommand during discovery.
 */
const STRING_FLAGS_WITH_POSITIONAL_VALUE = new Set([
  'query',
  'max-sources',
  'daemon-url',
]);

export function splitResearchSubcommand(
  args: string[],
  stringFlags: ReadonlySet<string> = STRING_FLAGS_WITH_POSITIONAL_VALUE,
): ResearchSubcommandArgs {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a === '--') {
      // Everything after `--` is a positional value, never a subcommand.
      return { sub: undefined, subArgs: args };
    }
    if (a.startsWith('--')) {
      const body = a.slice(2);
      // Equals form (`--flag=value`) consumes no separate value.
      if (
        !body.includes('=') &&
        stringFlags.has(body) &&
        i + 1 < args.length
      ) {
        // The next arg is this flag's value; skip it.
        i++;
      }
      continue;
    }
    // Only 'search' is a valid subcommand for 'od research'
    if (a === 'search') {
      return { sub: 'search', subArgs: [...args.slice(0, i), ...args.slice(i + 1)] };
    }
    // Any other non-flag argument is not a valid subcommand
    return { sub: undefined, subArgs: args };
  }
  return { sub: undefined, subArgs: args };
}
