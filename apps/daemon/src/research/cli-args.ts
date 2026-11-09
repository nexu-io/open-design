export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

const RESEARCH_SEARCH_STRING_OPTIONS = new Set(['--query', '--max-sources', '--daemon-url']);

export function splitResearchSubcommand(args: string[]): ResearchSubcommandArgs {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (!a) { i++; continue; }
    if (a.startsWith('--')) {
      // Skip the value for known string options so they aren't mistaken for the subcommand.
      if (RESEARCH_SEARCH_STRING_OPTIONS.has(a) && i + 1 < args.length) {
        i += 2;
        continue;
      }
      // Boolean flags consume no value — just skip the flag itself.
      i++;
      continue;
    }
    // First non-flag token is the subcommand.
    const idx = i;
    return {
      sub: a,
      subArgs: [...args.slice(0, idx), ...args.slice(idx + 1)],
    };
  }
  return { sub: undefined, subArgs: args };
}
