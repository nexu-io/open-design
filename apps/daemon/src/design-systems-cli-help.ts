// Help surface for `od design-systems`. Kept pure and separate from cli.ts so a
// test can assert the advertised subcommands without spawning the CLI or
// stubbing process.exit / console.log.

export const DESIGN_SYSTEMS_USAGE = `Usage:
  od design-systems list                       List design systems.
  od design-systems show <id>                  Print one entry.
  od design-systems rename <id> --title <new>  Rename an editable design system.
  od design-systems import-shadcn <reference>  Import a shadcn registry item.`;

// `help`, `--help`, and `-h` all route to the usage text above. Without the
// flag forms, `od design-systems --help` falls through to the generic library
// list, which only advertises `list` and `show` and never mentions `rename`.
export function isDesignSystemsHelpArg(arg: string | undefined): boolean {
  return arg === 'help' || arg === '--help' || arg === '-h';
}
