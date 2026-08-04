type ProviderFlags = {
  'daemon-url'?: string;
  help?: boolean;
  h?: boolean;
  json?: boolean;
};

interface ProviderCliDeps {
  parseFlags: (
    args: string[],
    options: { string: Set<string>; boolean: Set<string> },
  ) => ProviderFlags;
  daemonBaseUrl: (flags: ProviderFlags) => Promise<string>;
  exitWithStructuredError: (error: { code: string; message: string }) => void;
  structuredHttpFailure: (response: Response) => Promise<void>;
}

interface ProviderConfigResponse {
  available?: boolean;
  credentialSource?: string;
  protocol?: string;
  label?: string;
  kind?: string;
  displayHost?: string;
  defaultModel?: string;
  detail?: string;
}

const PROVIDER_STRING_FLAGS = new Set([
  'daemon-url',
]);
const PROVIDER_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'json',
]);

export async function runProviderCli(args: string[], deps: ProviderCliDeps): Promise<void> {
  const sub = args.find((arg) => !arg.startsWith('-')) || '';
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printProviderHelp();
    process.exit(sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  if (sub !== 'config') {
    console.error(`unknown subcommand: od provider ${sub}`);
    printProviderHelp();
    process.exit(2);
  }
  const index = args.indexOf(sub);
  const rest = [...args.slice(0, index), ...args.slice(index + 1)];
  let flags: ProviderFlags;
  try {
    flags = deps.parseFlags(rest, {
      string: PROVIDER_STRING_FLAGS,
      boolean: PROVIDER_BOOLEAN_FLAGS,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printProviderHelp();
    process.exit(2);
  }
  const base = await deps.daemonBaseUrl(flags);
  let response: Response;
  try {
    response = await fetch(`${base}/api/provider-orchestrator/config`);
  } catch (error) {
    deps.exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }
  if (!response.ok) {
    await deps.structuredHttpFailure(response);
    return;
  }
  const data = await response.json() as ProviderConfigResponse;
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[provider] ${data.available ? 'available' : 'unavailable'} (${data.kind ?? 'unknown'})`);
  console.log(`  source:   ${data.credentialSource ?? 'deployment'}`);
  console.log(`  protocol: ${data.protocol ?? 'openai'}`);
  console.log(`  label:    ${data.label ?? 'Provider orchestrator'}`);
  if (data.displayHost) console.log(`  host:     ${data.displayHost}`);
  if (data.defaultModel) console.log(`  model:    ${data.defaultModel}`);
  if (data.detail) console.log(`  detail:   ${data.detail}`);
}

function printProviderHelp(): void {
  console.log(`Usage:
  od provider config [--json] [--daemon-url <url>]

Inspects daemon-managed provider configuration. This mirrors the deployment
provider status endpoint: it reports whether a deployment provider is available,
which protocol it fronts, its display label/host, and the default model.
Provider credentials are never printed.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit the raw redacted JSON response.`);
}
