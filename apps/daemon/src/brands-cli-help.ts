// Help surface for `od brand`. Kept pure and separate from cli.ts so a test can
// assert the advertised subcommands without spawning the CLI or stubbing
// process.exit / console.log. Mirrors design-systems-cli-help.ts.

export const BRAND_USAGE = `Usage:
  od brand list [--json]               List extracted brands (id, name, domain, status).
  od brand extract <url> [--json]      Start an agent-driven brand extraction. Reserves the
  od brand create <url> [--json]       brand and a backing project with the site open in a
                                       browser tab; open it to run the extraction agent.
                                       --prompt-file <path|-> reads the URL from a file or stdin.
  od brand preview <id> [--json]       Re-render brand.html from the project's current
                                       brand.json so the kit page fills in live during
                                       extraction. --project <projectId> overrides the project.
  od brand finalize <id> [--json]      Register the agent's extracted kit (brand.json in the
                                       backing project) as a design system; marks it ready.
                                       --project <projectId> overrides the backing project.
  od brand get <id> [--json]           Print one brand's full detail (meta + brand + guide).
  od brand delete <id> [--json]        Remove a brand and its registered design system.

Output:
  Plain text by default; --json prints raw JSON for any subcommand.
  extract prints "<id>\\t<projectId>" to stdout; finalize prints "<id>\\t<name>".

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.`;

// `help`, `--help`, and `-h` all route to the usage text above.
export function isBrandHelpArg(arg: string | undefined): boolean {
  return arg === 'help' || arg === '--help' || arg === '-h';
}
