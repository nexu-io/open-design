// Pure argument parser for `od design-systems rename <id> --title <new>`.
// Kept out of cli.ts (a top-level dispatch script that runs on import) so it
// can be unit-tested directly, mirroring research/cli-args.ts.
//
// Accepts the new name either as a `--title <value>` / `--title=<value>` flag
// or as the trailing positional(s) after the id (so `rename <id> "New name"`
// works). String flags that take a separate value (`--daemon-url <url>`, etc.)
// have that value skipped so it is never mistaken for the id or title.

export interface DesignSystemRenameArgs {
  id: string;
  title: string;
}

const STRING_FLAGS_WITH_VALUE = new Set(['daemon-url', 'query', 'tag', 'title']);

export function parseDesignSystemRenameArgs(args: string[]): DesignSystemRenameArgs | null {
  let flagTitle: string | undefined;
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined;
      if (key === 'title') {
        flagTitle = inlineValue ?? args[++i];
      } else if (inlineValue === undefined && STRING_FLAGS_WITH_VALUE.has(key)) {
        i++; // consume the separate flag value so it is not read as a positional
      }
      continue;
    }
    if (arg.startsWith('-')) continue; // short flag, no positional
    positionals.push(arg);
  }
  const id = positionals[0];
  const title = (flagTitle ?? positionals.slice(1).join(' ') ?? '').trim();
  if (!id || !title) return null;
  return { id, title };
}
