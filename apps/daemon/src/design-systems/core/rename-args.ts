/** @module rename-args
 * Pure argument parser for `od design-systems rename <id> --title <new>`.
 * Kept out of cli.ts so it can be unit-tested directly; mirrors the pattern in research/cli-args.ts.
 * Accepts the title as `--title <value>`, `--title=<value>`, or trailing positionals after the id.
 */

export interface DesignSystemRenameArgs {
  id: string;
  title: string;
}

const STRING_FLAGS_WITH_VALUE = new Set(['daemon-url', 'query', 'tag', 'title']);

// A separate flag value must be a real token, not the next flag. Without this
// guard, `--title --json` would read "--json" as the title and rename the
// system to a flag name. A leading dash means the user must use the
// `--title=<value>` form for a title that genuinely starts with a dash.
function isFlagValue(token: string | undefined): token is string {
  return token !== undefined && !token.startsWith('-');
}

/**
 * Parses `od design-systems rename <id> --title <new>` arguments. Accepts title as `--title <value>`, `--title=<value>`, or as trailing positionals; returns null if id or title is missing.
 */
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
        if (inlineValue !== undefined) {
          flagTitle = inlineValue;
        } else if (isFlagValue(args[i + 1])) {
          flagTitle = args[++i];
        }
        // else: `--title` with no real value -> leave it unset so the missing
        // title fails usage validation below instead of swallowing a flag.
      } else if (inlineValue === undefined && STRING_FLAGS_WITH_VALUE.has(key) && isFlagValue(args[i + 1])) {
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
