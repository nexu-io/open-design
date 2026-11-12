export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

export function splitResearchSubcommand(args: string[]): ResearchSubcommandArgs {
  // The 'od research' command only supports one subcommand: 'search'.
  // We need to find 'search' as the first non-flag argument, skipping
  // flag values (which may look like non-flag arguments).
  
  // First, find the index of 'search'
  const searchIndex = args.indexOf('search');
  if (searchIndex === -1) {
    return { sub: undefined, subArgs: args };
  }

  // Check if there's any non-flag argument before 'search' that isn't
  // a value for a previous flag
  let lastWasFlag = false;
  for (let i = 0; i < searchIndex; i++) {
    const arg = args[i] ?? '';
    if (arg.startsWith('--')) {
      lastWasFlag = true;
    } else if (lastWasFlag) {
      lastWasFlag = false; // This arg is a value for the previous flag
    } else {
      // Found a non-flag argument before 'search' that's not a flag value
      return { sub: undefined, subArgs: args };
    }
  }

  // If we get here, 'search' is the first non-flag argument
  return {
    sub: 'search',
    subArgs: [...args.slice(0, searchIndex), ...args.slice(searchIndex + 1)],
  };
}
