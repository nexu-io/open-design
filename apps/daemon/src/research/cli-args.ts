export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

export const RESEARCH_SEARCH_STRING_FLAGS = new Set([
  'query',
  'max-sources',
  'daemon-url',
]);

export function splitResearchSubcommand(args: string[]): ResearchSubcommandArgs {
  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      if (RESEARCH_SEARCH_STRING_FLAGS.has(arg.slice(2))) idx++;
      continue;
    }
    return {
      sub: arg,
      subArgs: [...args.slice(0, idx), ...args.slice(idx + 1)],
    };
  }
  return { sub: undefined, subArgs: args };
}
