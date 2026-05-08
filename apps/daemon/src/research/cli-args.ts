export interface ResearchSubcommandArgs {
  sub: string | undefined;
  subArgs: string[];
}

export function splitResearchSubcommand(args: string[]): ResearchSubcommandArgs {
  const sub = args.find((a) => a && !a.startsWith('--'));
  if (!sub) return { sub: undefined, subArgs: args };

  const idx = args.indexOf(sub);
  return {
    sub,
    subArgs: [...args.slice(0, idx), ...args.slice(idx + 1)],
  };
}
