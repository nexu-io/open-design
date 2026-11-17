export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

/** Known research string option names whose following value must not be
 * treated as a subcommand. Matches RESEARCH_SEARCH_STRING_FLAGS in cli.ts. */
const RESEARCH_STRING_FLAGS = new Set([
  'query',
  'max-sources',
  'daemon-url',
]);

/** Split an `od research …` invocation into subcommand + remaining args,
 * skipping values of known string options so that flags before the subcommand
 * don't swallow it (e.g. `od research --max-sources 3 search --query design`). */
export function splitResearchSubcommand(args: string[]): ResearchSubcommandArgs {
  // Index of the first non-flag token that is NOT a string-flag value.
  let subIdx = -1;
  let sub = '';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined || a === null || a === '') continue;
    const name = a.slice(2).split('=')[0];
    if (a.startsWith('--')) {
      // Known string flag: consume its value as part of the flag, not a subcommand.
      if (name && RESEARCH_STRING_FLAGS.has(name) && !a.includes('=')) {
        i++; // skip the next token (the flag's value)
      }
      continue;
    }
    subIdx = i;
    sub = a;
    break;
  }
  if (subIdx < 0) return { sub: undefined, subArgs: args };

  return {
    sub,
    subArgs: [...args.slice(0, subIdx), ...args.slice(subIdx + 1)],
  };
}
